(function () {
    const STORAGE_KEY = 'scribble-party-playerId';

    const state = {
        // Connection
        connected: false,
        // Identity
        playerId: localStorage.getItem(STORAGE_KEY) || null,
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

    const listeners = new Set();

    function get() { return state; }

    function set(patch) {
        Object.assign(state, patch);
        if (patch.playerId !== undefined && patch.playerId) {
            localStorage.setItem(STORAGE_KEY, patch.playerId);
        }
        for (const cb of listeners) cb(state);
    }

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

    function subscribe(cb) {
        listeners.add(cb);
        return () => listeners.delete(cb);
    }

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

    window.AppState = { get, set, applySnapshot, subscribe, reset };
})();
