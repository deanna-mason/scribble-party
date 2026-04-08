const { test } = require('node:test');
const assert = require('node:assert');
const { RoomManager } = require('../rooms');

test('createRoom returns a new room with a 4-letter code', () => {
    const mgr = new RoomManager();
    const room = mgr.createRoom('host-1', 'Mom');
    assert.match(room.code, /^[A-Z]{4}$/);
    assert.strictEqual(room.hostId, 'host-1');
    assert.strictEqual(room.players.size, 1);
});

test('createRoom codes are unique across multiple calls', () => {
    const mgr = new RoomManager();
    const codes = new Set();
    for (let i = 0; i < 50; i++) {
        const r = mgr.createRoom(`h-${i}`, `P${i}`);
        codes.add(r.code);
    }
    assert.strictEqual(codes.size, 50);
});

test('getRoom returns the room by code', () => {
    const mgr = new RoomManager();
    const room = mgr.createRoom('host-1', 'Mom');
    assert.strictEqual(mgr.getRoom(room.code), room);
});

test('getRoom returns undefined for unknown code', () => {
    const mgr = new RoomManager();
    assert.strictEqual(mgr.getRoom('ZZZZ'), undefined);
});

test('deleteRoom removes a room', () => {
    const mgr = new RoomManager();
    const room = mgr.createRoom('host-1', 'Mom');
    mgr.deleteRoom(room.code);
    assert.strictEqual(mgr.getRoom(room.code), undefined);
});

test('cleanupAbandoned removes rooms with all players disconnected for > threshold', () => {
    const mgr = new RoomManager();
    const room = mgr.createRoom('host-1', 'Mom');
    room.markDisconnected('host-1');
    room.abandonedSince = Date.now() - 11 * 60 * 1000; // 11 minutes ago
    mgr.cleanupAbandoned(10 * 60 * 1000);
    assert.strictEqual(mgr.getRoom(room.code), undefined);
});

test('cleanupAbandoned preserves rooms with any connected player', () => {
    const mgr = new RoomManager();
    const room = mgr.createRoom('host-1', 'Mom');
    room.abandonedSince = Date.now() - 11 * 60 * 1000;
    mgr.cleanupAbandoned(10 * 60 * 1000);
    assert.strictEqual(mgr.getRoom(room.code), room);
});
