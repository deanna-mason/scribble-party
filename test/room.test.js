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

test('startGame requires at least 2 players', () => {
    const r = new Room('WXYZ', 'host-1', 'Mom');
    assert.throws(() => r.startGame('host-1'), /players/i);
});

test('startGame requires caller to be host', () => {
    const r = new Room('WXYZ', 'host-1', 'Mom');
    r.addPlayer('p-2', 'Lily');
    assert.throws(() => r.startGame('p-2'), /host/i);
});

test('startGame transitions to CALLER_CHOOSING and sets turn order', () => {
    const r = new Room('WXYZ', 'host-1', 'Mom');
    r.addPlayer('p-2', 'Lily');
    r.addPlayer('p-3', 'Jack');
    r.startGame('host-1');
    assert.strictEqual(r.state, ROOM_STATES.CALLER_CHOOSING);
    assert.strictEqual(r.turnOrder.length, 3);
    assert.strictEqual(r.currentCallerIdx, 0);
    assert.strictEqual(r.currentRound, 1);
});

test('startGame fails outside LOBBY state', () => {
    const r = new Room('WXYZ', 'host-1', 'Mom');
    r.addPlayer('p-2', 'Lily');
    r.startGame('host-1');
    assert.throws(() => r.startGame('host-1'), /state/i);
});

test('setPrompt requires caller to be current caller', () => {
    const r = new Room('WXYZ', 'host-1', 'Mom');
    r.addPlayer('p-2', 'Lily');
    r.startGame('host-1');
    const caller = r.turnOrder[r.currentCallerIdx];
    const other = r.turnOrder.find((id) => id !== caller);
    assert.throws(() => r.setPrompt(other, 'fish tail'), /caller/i);
});

test('setPrompt transitions to ROUND_ACTIVE and sets prompt', () => {
    const r = new Room('WXYZ', 'host-1', 'Mom');
    r.addPlayer('p-2', 'Lily');
    r.startGame('host-1');
    const caller = r.turnOrder[r.currentCallerIdx];
    r.setPrompt(caller, 'fish tail');
    assert.strictEqual(r.state, ROOM_STATES.ROUND_ACTIVE);
    assert.strictEqual(r.currentPrompt, 'fish tail');
    assert.ok(r.roundEndsAt > Date.now());
    assert.strictEqual(r.promptHistory.length, 1);
    assert.strictEqual(r.promptHistory[0].prompt, 'fish tail');
});

function startedRoom(playerCount = 3) {
    const r = new Room('WXYZ', 'host-1', 'P0');
    for (let i = 1; i < playerCount; i++) r.addPlayer(`p-${i}`, `P${i}`);
    r.startGame('host-1');
    const caller = r.getCurrentCallerId();
    r.setPrompt(caller, 'fish tail');
    return r;
}

test('submitRound records strokes and marks player submitted', () => {
    const r = startedRoom(3);
    const strokes = [{ round: 1, tool: 'pen', color: '#000', size: 3, points: [{x: 0.1, y: 0.2}] }];
    r.submitRound('host-1', strokes);
    assert.deepStrictEqual(r.playerStrokes.get('host-1'), strokes);
    assert.ok(r.submittedThisRound.has('host-1'));
});

test('submitRound does not transition until all have submitted', () => {
    const r = startedRoom(3);
    r.submitRound('host-1', []);
    r.submitRound('p-1', []);
    assert.strictEqual(r.state, ROOM_STATES.ROUND_ACTIVE);
});

test('submitRound transitions to REVEAL when all have submitted', () => {
    const r = startedRoom(3);
    r.submitRound('host-1', []);
    r.submitRound('p-1', []);
    r.submitRound('p-2', []);
    assert.strictEqual(r.state, ROOM_STATES.REVEAL);
});

test('submitRound ignores second submission from same player', () => {
    const r = startedRoom(2);
    r.submitRound('host-1', [{ round: 1, tool: 'pen', color: '#000', size: 3, points: [] }]);
    // Second submission should be a no-op
    r.submitRound('host-1', []);
    assert.strictEqual(r.playerStrokes.get('host-1').length, 1);
});

test('submitRound throws if not in ROUND_ACTIVE state', () => {
    const r = new Room('WXYZ', 'host-1', 'Mom');
    r.addPlayer('p-2', 'Lily');
    assert.throws(() => r.submitRound('host-1', []), /state/i);
});

test('forceReveal transitions to REVEAL even with partial submissions', () => {
    const r = startedRoom(3);
    r.submitRound('host-1', []);
    r.forceReveal();
    assert.strictEqual(r.state, ROOM_STATES.REVEAL);
});

test('nextRound rotates caller and returns to CALLER_CHOOSING', () => {
    const r = startedRoom(3);
    r.submitRound('host-1', []);
    r.submitRound('p-1', []);
    r.submitRound('p-2', []);
    const firstCaller = r.turnOrder[0];
    r.nextRound();
    assert.strictEqual(r.state, ROOM_STATES.CALLER_CHOOSING);
    assert.strictEqual(r.currentCallerIdx, 1);
    assert.strictEqual(r.currentRound, 2);
    assert.notStrictEqual(r.getCurrentCallerId(), firstCaller);
});

test('nextRound wraps caller back to first player', () => {
    const r = startedRoom(2);
    // Round 1: host calls, both submit
    r.submitRound('host-1', []);
    r.submitRound('p-1', []);
    r.nextRound();
    // Round 2: p-1 calls
    assert.strictEqual(r.getCurrentCallerId(), 'p-1');
    r.setPrompt('p-1', 'mustache');
    r.submitRound('host-1', []);
    r.submitRound('p-1', []);
    r.nextRound();
    // Round 3: back to host
    assert.strictEqual(r.getCurrentCallerId(), 'host-1');
    assert.strictEqual(r.currentRound, 3);
});

test('getNewStrokesForRound returns only strokes from the given round', () => {
    const r = startedRoom(2);
    r.submitRound('host-1', [
        { round: 1, tool: 'pen', color: '#000', size: 3, points: [] },
    ]);
    r.submitRound('p-1', []);
    r.nextRound();
    r.setPrompt('p-1', 'mustache');
    r.submitRound('host-1', [
        { round: 1, tool: 'pen', color: '#000', size: 3, points: [] },
        { round: 2, tool: 'pen', color: '#f00', size: 3, points: [] },
    ]);
    r.submitRound('p-1', []);
    const newStrokes = r.getNewStrokesForRound('host-1', 2);
    assert.strictEqual(newStrokes.length, 1);
    assert.strictEqual(newStrokes[0].round, 2);
});

test('toggleDoneVoting updates player done state', () => {
    const r = startedRoom(2);
    r.submitRound('host-1', []);
    r.submitRound('p-1', []);
    // Now in REVEAL
    r.toggleDoneVoting('host-1', true);
    assert.strictEqual(r.players.get('host-1').isDoneVoting, true);
});

test('toggleDoneVoting does not transition while any player has not voted', () => {
    const r = startedRoom(2);
    r.submitRound('host-1', []);
    r.submitRound('p-1', []);
    r.toggleDoneVoting('host-1', true);
    assert.strictEqual(r.state, ROOM_STATES.REVEAL);
});

test('toggleDoneVoting transitions to GAME_OVER when all voted', () => {
    const r = startedRoom(2);
    r.submitRound('host-1', []);
    r.submitRound('p-1', []);
    r.toggleDoneVoting('host-1', true);
    r.toggleDoneVoting('p-1', true);
    assert.strictEqual(r.state, ROOM_STATES.GAME_OVER);
});

test('toggleDoneVoting can be undone before consensus', () => {
    const r = startedRoom(2);
    r.submitRound('host-1', []);
    r.submitRound('p-1', []);
    r.toggleDoneVoting('host-1', true);
    r.toggleDoneVoting('host-1', false);
    r.toggleDoneVoting('p-1', true);
    assert.strictEqual(r.state, ROOM_STATES.REVEAL);
});

test('getDoneVoters returns list of playerIds who voted done', () => {
    const r = startedRoom(3);
    r.submitRound('host-1', []);
    r.submitRound('p-1', []);
    r.submitRound('p-2', []);
    r.toggleDoneVoting('host-1', true);
    r.toggleDoneVoting('p-2', true);
    const voters = r.getDoneVoters();
    assert.deepStrictEqual(voters.sort(), ['host-1', 'p-2'].sort());
});

test('newGame resets state back to LOBBY with same players', () => {
    const r = startedRoom(2);
    r.submitRound('host-1', [{ round: 1, tool: 'pen', color: '#000', size: 3, points: [] }]);
    r.submitRound('p-1', []);
    r.toggleDoneVoting('host-1', true);
    r.toggleDoneVoting('p-1', true);
    // Now in GAME_OVER
    r.newGame('p-1');
    assert.strictEqual(r.state, ROOM_STATES.LOBBY);
    assert.strictEqual(r.hostId, 'p-1');
    assert.strictEqual(r.players.size, 2);
    assert.strictEqual(r.currentRound, 0);
    assert.strictEqual(r.playerStrokes.get('host-1').length, 0);
    assert.strictEqual(r.players.get('host-1').isReady, false);
    assert.strictEqual(r.players.get('host-1').isDoneVoting, false);
});

test('newGame throws outside GAME_OVER state', () => {
    const r = startedRoom(2);
    assert.throws(() => r.newGame('host-1'), /state/i);
});
