//This uses the same IIFE pattern as server.js to keep variables private. This holds all the client-side state information.

(function () {
    const STORAGE_KEY = 'scribble-party-playerId';

    const state = {
        // Connection
        connected: false,
        // Identity
        playerId: localStorage.getItem(STORAGE_KEY) || null, //this allows player to reconnect with the same identity if they get disconnected.
        // Room
        roomCode: null,
        roomState: 'LANDING', // LANDING | LOBBY | CALLER_CHOOSING | ROUND_ACTIVE | REVEAL | GAME_OVER
        hostId: null,
        players: [], // {id, name, isReady, isDoneVoting, isConnected}
        turnOrder: [],
        currentCallerIdx: 0,
        currentRound: 0,
        currentPrompt: null,
        roundEndsAt: null,
        playerStrokes: {}, // playerId → Stroke[]
        promptHistory: [],
        // Local-only
        randomSuggestion: null, // {text, category} when caller requested one
        haveSeenDoneHelper: false,
    };

    function get() { return state; }

    function set(patch) {
        Object.assign(state, patch);
        if (patch.playerId !== undefined && patch.playerId) {
            localStorage.setItem(STORAGE_KEY, patch.playerId);
        }
    }

    //takes a full room snapshot from the server and applies it all at once. Used when joining, reconnecting, or a new game start. Full room replacement.
    function applySnapshot(snapshot) {
        set({
            roomCode: snapshot.code,
            roomState: snapshot.state,
            hostId: snapshot.hostId,
            players: snapshot.players,
            turnOrder: snapshot.turnOrder,
            currentCallerIdx: snapshot.currentCallerIdx,
            currentRound: snapshot.currentRound,
            currentPrompt: snapshot.currentPrompt,
            roundEndsAt: snapshot.roundEndsAt,
            playerStrokes: snapshot.playerStrokes,
            promptHistory: snapshot.promptHistory,
        });
    }

    //keeps your identity but resets all room-related state. This is called when you leave a room or start a new game.
    function reset() {
        set({
            roomCode: null,
            roomState: 'LANDING',
            hostId: null,
            players: [],
            turnOrder: [],
            currentCallerIdx: 0,
            currentRound: 0,
            currentPrompt: null,
            roundEndsAt: null,
            playerStrokes: {},
            promptHistory: [],
            randomSuggestion: null,
            haveSeenDoneHelper: false,
        });
    }

    window.AppState = { get, set, applySnapshot, reset };
})();
