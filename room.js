const ROOM_STATES = Object.freeze({
    LOBBY: 'LOBBY',
    CALLER_CHOOSING: 'CALLER_CHOOSING',
    ROUND_ACTIVE: 'ROUND_ACTIVE',
    REVEAL: 'REVEAL',
    GAME_OVER: 'GAME_OVER',
});

const MAX_PLAYERS = 8;

class Room {
    constructor(code, hostId, hostName) {
        this.code = code;
        this.state = ROOM_STATES.LOBBY;
        this.hostId = hostId;
        this.players = new Map();
        this.turnOrder = [];
        this.currentCallerIdx = 0;
        this.currentRound = 0;
        this.currentPrompt = null;
        this.roundEndsAt = null;
        this.submittedThisRound = new Set();
        this.playerStrokes = new Map();
        this.promptHistory = [];
        this.roundTimer = null;
        if (hostId && hostName) {
            this.addPlayer(hostId, hostName);
        }
    }

    addPlayer(playerId, name) {
        if (this.players.size >= MAX_PLAYERS) {
            throw new Error('Room is full');
        }
        for (const p of this.players.values()) {
            if (p.name === name) throw new Error('Name already taken in this room');
        }
        this.players.set(playerId, {
            id: playerId,
            name,
            isReady: false,
            isDoneVoting: false,
            isConnected: true,
            joinedAt: Date.now(),
        });
        this.playerStrokes.set(playerId, []);
    }

    removePlayer(playerId) {
        this.players.delete(playerId);
        this.playerStrokes.delete(playerId);
    }

    setReady(playerId, ready) {
        const player = this.players.get(playerId);
        if (!player) throw new Error('Unknown player');
        player.isReady = ready;
    }

    startGame(callerId) {
        if (this.state !== ROOM_STATES.LOBBY) {
            throw new Error(`Cannot start game from state ${this.state}`);
        }
        if (callerId !== this.hostId) {
            throw new Error('Only the host can start the game');
        }
        if (this.players.size < 2) {
            throw new Error('At least 2 players required');
        }
        this.turnOrder = Array.from(this.players.keys()).sort((a, b) => {
            return this.players.get(a).joinedAt - this.players.get(b).joinedAt;
        });
        this.currentCallerIdx = 0;
        this.currentRound = 1;
        this.state = ROOM_STATES.CALLER_CHOOSING;
    }

    getCurrentCallerId() {
        return this.turnOrder[this.currentCallerIdx];
    }

    setPrompt(callerId, text) {
        if (this.state !== ROOM_STATES.CALLER_CHOOSING) {
            throw new Error(`Cannot set prompt from state ${this.state}`);
        }
        if (callerId !== this.getCurrentCallerId()) {
            throw new Error('Only the current caller can set the prompt');
        }
        this.currentPrompt = text;
        this.roundEndsAt = Date.now() + 90_000;
        this.submittedThisRound.clear();
        this.state = ROOM_STATES.ROUND_ACTIVE;
        this.promptHistory.push({
            round: this.currentRound,
            caller: callerId,
            prompt: text,
        });
    }

    submitRound(playerId, strokes) {
        if (this.state !== ROOM_STATES.ROUND_ACTIVE) {
            throw new Error(`Cannot submit from state ${this.state}`);
        }
        if (!this.players.has(playerId)) {
            throw new Error('Unknown player');
        }
        if (this.submittedThisRound.has(playerId)) {
            return; // ignore double-submits
        }
        // Replace player's cumulative strokes with what the client sent.
        // The client is authoritative for its own canvas content.
        this.playerStrokes.set(playerId, strokes);
        this.submittedThisRound.add(playerId);
        const allSubmitted = Array.from(this.players.keys()).every((id) =>
            this.submittedThisRound.has(id)
        );
        if (allSubmitted) {
            this._transitionToReveal();
        }
    }

    forceReveal() {
        if (this.state !== ROOM_STATES.ROUND_ACTIVE) {
            throw new Error(`Cannot force reveal from state ${this.state}`);
        }
        this._transitionToReveal();
    }

    _transitionToReveal() {
        if (this.roundTimer) {
            clearTimeout(this.roundTimer);
            this.roundTimer = null;
        }
        this.state = ROOM_STATES.REVEAL;
        this.roundEndsAt = null;
    }

    nextRound() {
        if (this.state !== ROOM_STATES.REVEAL) {
            throw new Error(`Cannot advance from state ${this.state}`);
        }
        this.currentCallerIdx = (this.currentCallerIdx + 1) % this.turnOrder.length;
        this.currentRound += 1;
        this.currentPrompt = null;
        this.submittedThisRound.clear();
        this.state = ROOM_STATES.CALLER_CHOOSING;
    }

    getNewStrokesForRound(playerId, round) {
        const all = this.playerStrokes.get(playerId) || [];
        return all.filter((s) => s.round === round);
    }
}

module.exports = { Room, ROOM_STATES };
