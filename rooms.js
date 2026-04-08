const { Room } = require('./room');

function randomCode() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += letters[Math.floor(Math.random() * letters.length)];
    }
    return code;
}

class RoomManager {
    constructor() {
        this.rooms = new Map();
    }

    createRoom(hostId, hostName) {
        let code;
        for (let attempt = 0; attempt < 10; attempt++) {
            const candidate = randomCode();
            if (!this.rooms.has(candidate)) {
                code = candidate;
                break;
            }
        }
        if (!code) throw new Error('Failed to generate unique room code');
        const room = new Room(code, hostId, hostName);
        this.rooms.set(code, room);
        return room;
    }

    getRoom(code) {
        return this.rooms.get(code);
    }

    deleteRoom(code) {
        this.rooms.delete(code);
    }

    cleanupAbandoned(thresholdMs) {
        const now = Date.now();
        for (const [code, room] of this.rooms.entries()) {
            const allDisconnected = Array.from(room.players.values())
                .every((p) => !p.isConnected);
            if (allDisconnected && room.abandonedSince && (now - room.abandonedSince) > thresholdMs) {
                this.rooms.delete(code);
            }
        }
    }
}

module.exports = { RoomManager };
