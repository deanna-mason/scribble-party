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
}

module.exports = { Room, ROOM_STATES };
