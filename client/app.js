//This uses an IIFE (Immediately Invoked Function Expression). All the code is wrapped in a function that is called immediately. 
// This keeps variables inside of it private. Particularly, refresh, onMessage and init could clash with other variables if they were global.
(function () {
    //Reads current app state and updates UI to match. Called after any state change or new message from the server.
    //Notes that it will show the room state, but only re-render lobby or caller screens since other screens have functions that get called and update them more specifically.
    function refresh() {
        const st = AppState.get();
        UI.showScreen(st.roomState);
        if (st.roomState === 'LOBBY') UI.renderLobby();
        else if (st.roomState === 'CALLER_CHOOSING') UI.renderCaller();
    }

    //This handles all messages coming from the server.
    function onMessage(type, payload) {
        const st = AppState.get();
        switch (type) {
            case 'room_created':
            case 'room_joined':
                AppState.set({ playerId: payload.playerId }); //saves the playerID
                AppState.applySnapshot(payload.state); //updates all app state to match the server
                refresh();
                if (payload.isReconnect) {
                    const snap = payload.state;
                    if (snap.state === 'ROUND_ACTIVE') {
                        UI.showScreen('ROUND_ACTIVE');
                        UI.enterRound();
                    } else if (snap.state === 'REVEAL') {
                        const playerStrokesThisRound = {};
                        for (const [pid, strokes] of Object.entries(snap.playerStrokes || {})) {
                            playerStrokesThisRound[pid] = strokes.filter((s) => s.round === snap.currentRound);
                        }
                        UI.showScreen('REVEAL');
                        UI.enterReveal({
                            round: snap.currentRound,
                            prompt: snap.currentPrompt,
                            playerStrokesThisRound,
                        });
                    } else if (snap.state === 'GAME_OVER') {
                        UI.showScreen('GAME_OVER');
                        UI.enterGallery({
                            finalGallery: snap.playerStrokes,
                            promptHistory: snap.promptHistory,
                        });
                    }
                    UI.showToast('Reconnected');
                }
                break;
            case 'player_joined':  //adds new player to the list of players in the app state.
                AppState.set({ players: [...st.players.filter((p) => p.id !== payload.player.id), { ...payload.player, isReady: false, isDoneVoting: false, isConnected: true }] });
                refresh();
                break;
            case 'player_left':
                AppState.set({ players: st.players.map((p) => p.id === payload.playerId ? { ...p, isConnected: false } : p) });
                refresh();
                break;
            case 'player_ready_changed':
                AppState.set({ players: st.players.map((p) => p.id === payload.playerId ? { ...p, isReady: payload.ready } : p) });
                refresh();
                break;
            case 'game_started':  //updates app state to match the server and moves to the caller choosing screen.
                AppState.set({
                    roomState: 'CALLER_CHOOSING',
                    turnOrder: payload.turnOrder,
                    currentCallerIdx: payload.currentCallerIdx,
                    currentRound: payload.currentRound,
                });
                refresh();
                break;
            case 'caller_choosing':
                AppState.set({
                    roomState: 'CALLER_CHOOSING',
                    currentCallerIdx: typeof payload.callerIdx === 'number'
                        ? payload.callerIdx
                        : st.currentCallerIdx,
                    currentRound: typeof payload.round === 'number'
                        ? payload.round
                        : st.currentRound,
                    randomSuggestion: null,  //resets random suggestion when caller is choosing
                });
                refresh();
                break;
            case 'random_prompt_suggestion':
                AppState.set({ randomSuggestion: payload });
                refresh();
                break;
            case 'round_started':
                AppState.set({
                    roomState: 'ROUND_ACTIVE',
                    currentRound: payload.round,
                    currentPrompt: payload.prompt,
                    roundEndsAt: payload.endsAt,
                    submitted: new Set(),
                });
                UI.showScreen('ROUND_ACTIVE');
                UI.enterRound();
                break;
            case 'player_submitted': {
                const s = st.submitted || new Set();
                s.add(payload.playerId);
                AppState.set({ submitted: s });
                UI.renderMiniStatus();  //shows who is done drawing in the corner of the screen
                break;
            }
            case 'round_revealed':
                UI.leaveRound();
                UI.showScreen('REVEAL');
                UI.enterReveal(payload);
                break;
            case 'reaction_received':
                UI.showReactionOn(payload.targetPlayerId, payload.emoji);
                break;
            case 'done_vote_changed': {
                const updatedPlayers = st.players.map((p) =>
                    p.id === payload.playerId ? { ...p, isDoneVoting: payload.done } : p
                );
                AppState.set({ players: updatedPlayers });
                UI.renderDoneButton();
                break;
            }
            case 'game_ended':
                AppState.set({ roomState: 'GAME_OVER' });
                UI.showScreen('GAME_OVER');
                UI.enterGallery(payload);
                break;
            case 'new_game_started':
                AppState.applySnapshot(payload.state);
                refresh();
                break;
            case 'error':
                UI.showToast(payload.message || 'Something went wrong');
                break;
            default:
                break;
        }
    }

    //Initializes each screen's event listeners and sets up the Websocket connection and message handler.
    function init() {
        UI.initLanding();
        UI.initLobby();
        UI.initCaller();
        UI.initRound();
        UI.initReveal();
        UI.initGallery();
        const EVENTS = [
            'room_created', 'room_joined', 'player_joined', 'player_left',
            'player_ready_changed', 'game_started', 'caller_choosing',
            'random_prompt_suggestion', 'round_started', 'player_submitted',
            'round_revealed', 'reaction_received', 'done_vote_changed',
            'game_ended', 'new_game_started',
            'error',
        ];
        for (const type of EVENTS) {
            Socket.on(type, (p) => onMessage(type, p));
        }
        Socket.on('__open__', () => {
            const st = AppState.get();
            if (st.roomCode && st.playerId) {
                const me = st.players.find((p) => p.id === st.playerId);
                if (me) {
                    Socket.send('join_room', { code: st.roomCode, name: me.name, playerId: st.playerId });
                }
            }
        });
        Socket.on('__close__', () => UI.showToast('Connection lost. Reconnecting…'));  //shows a message if the connection is lost and tries to reconnect.
        fetch('/categories').then((r) => r.json()).then((data) => {
            AppState.set({ categories: data.categories }); //fetches the list of drawing prompt categories. This is http instead of websocket because it's a one-time thing.
        });
        Socket.connect();
        UI.showScreen('LANDING');  //starts on the landing screen.
    }

    document.addEventListener('DOMContentLoaded', init);  //calls init once the page has loaded.
})();
