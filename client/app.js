(function () {
    function refresh() {
        const st = AppState.get();
        UI.showScreen(st.roomState);
        if (st.roomState === 'LOBBY') UI.renderLobby();
        else if (st.roomState === 'CALLER_CHOOSING') UI.renderCaller();
    }

    function onMessage(type, payload) {
        const st = AppState.get();
        switch (type) {
            case 'room_created':
            case 'room_joined':
                AppState.set({ playerId: payload.playerId });
                AppState.applySnapshot(payload.state);
                refresh();
                if (payload.isReconnect) UI.showToast('Reconnected');
                break;
            case 'player_joined':
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
            case 'game_started':
                AppState.set({
                    roomState: 'CALLER_CHOOSING',
                    turnOrder: payload.turnOrder,
                    currentCallerIdx: payload.currentCallerIdx,
                    currentRound: payload.currentRound,
                });
                refresh();
                break;
            case 'caller_choosing':
                AppState.set({ roomState: 'CALLER_CHOOSING', randomSuggestion: null });
                refresh();
                break;
            case 'random_prompt_suggestion':
                AppState.set({ randomSuggestion: payload });
                refresh();
                break;
            case 'error':
                UI.showToast(payload.message || 'Something went wrong');
                break;
            default:
                break;
        }
    }

    function init() {
        UI.initLanding();
        UI.initLobby();
        UI.initCaller();
        const EVENTS = [
            'room_created', 'room_joined', 'player_joined', 'player_left',
            'player_ready_changed', 'game_started', 'caller_choosing',
            'random_prompt_suggestion', 'error',
        ];
        for (const type of EVENTS) {
            Socket.on(type, (p) => onMessage(type, p));
        }
        Socket.on('__close__', () => UI.showToast('Connection lost. Reconnecting…'));
        fetch('/categories').then((r) => r.json()).then((data) => {
            AppState.set({ categories: data.categories });
        });
        Socket.connect();
        UI.showScreen('LANDING');
    }

    document.addEventListener('DOMContentLoaded', init);
})();
