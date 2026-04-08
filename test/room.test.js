const { test } = require('node:test');
const assert = require('node:assert');
const { Room, ROOM_STATES } = require('../room');

function mkRoom() {
    return new Room('WXYZ', 'host-1');
}

test('Room constructor initializes LOBBY state with host as player', () => {
    const r = new Room('WXYZ', 'host-1', 'Mom');
    assert.strictEqual(r.code, 'WXYZ');
    assert.strictEqual(r.state, ROOM_STATES.LOBBY);
    assert.strictEqual(r.hostId, 'host-1');
    assert.strictEqual(r.players.size, 1);
    assert.strictEqual(r.players.get('host-1').name, 'Mom');
});

test('addPlayer adds a player to the lobby', () => {
    const r = new Room('WXYZ', 'host-1', 'Mom');
    r.addPlayer('p-2', 'Lily');
    assert.strictEqual(r.players.size, 2);
    assert.strictEqual(r.players.get('p-2').name, 'Lily');
    assert.strictEqual(r.players.get('p-2').isReady, false);
    assert.strictEqual(r.players.get('p-2').isConnected, true);
});

test('addPlayer rejects duplicate name', () => {
    const r = new Room('WXYZ', 'host-1', 'Mom');
    assert.throws(
        () => r.addPlayer('p-2', 'Mom'),
        /name/i
    );
});

test('addPlayer rejects when room is full (8 players)', () => {
    const r = new Room('WXYZ', 'host-1', 'P0');
    for (let i = 1; i < 8; i++) r.addPlayer(`p-${i}`, `P${i}`);
    assert.strictEqual(r.players.size, 8);
    assert.throws(() => r.addPlayer('p-9', 'P9'), /full/i);
});

test('removePlayer removes player from LOBBY', () => {
    const r = new Room('WXYZ', 'host-1', 'Mom');
    r.addPlayer('p-2', 'Lily');
    r.removePlayer('p-2');
    assert.strictEqual(r.players.size, 1);
});

test('setReady updates player ready state', () => {
    const r = new Room('WXYZ', 'host-1', 'Mom');
    r.addPlayer('p-2', 'Lily');
    r.setReady('p-2', true);
    assert.strictEqual(r.players.get('p-2').isReady, true);
    r.setReady('p-2', false);
    assert.strictEqual(r.players.get('p-2').isReady, false);
});

test('setReady throws on unknown player', () => {
    const r = mkRoom();
    r.addPlayer('host-1', 'Mom');
    assert.throws(() => r.setReady('nobody', true), /player/i);
});
