const { test } = require('node:test');
const assert = require('node:assert');
const { MESSAGE_TYPES, validate } = require('../messages');

test('MESSAGE_TYPES contains all client and server types', () => {
    assert.ok(MESSAGE_TYPES.CREATE_ROOM);
    assert.ok(MESSAGE_TYPES.JOIN_ROOM);
    assert.ok(MESSAGE_TYPES.SET_READY);
    assert.ok(MESSAGE_TYPES.START_GAME);
    assert.ok(MESSAGE_TYPES.SET_PROMPT);
    assert.ok(MESSAGE_TYPES.REQUEST_RANDOM_PROMPT);
    assert.ok(MESSAGE_TYPES.SUBMIT_ROUND);
    assert.ok(MESSAGE_TYPES.TOGGLE_DONE_VOTING);
    assert.ok(MESSAGE_TYPES.SEND_REACTION);
    assert.ok(MESSAGE_TYPES.NEXT_ROUND);
    assert.ok(MESSAGE_TYPES.NEW_GAME);
    assert.ok(MESSAGE_TYPES.LEAVE_ROOM);
});

test('validate returns [true] for a valid create_room payload', () => {
    const [ok, err] = validate('create_room', { name: 'Mom' });
    assert.strictEqual(ok, true);
    assert.strictEqual(err, null);
});

test('validate returns [false, error] for missing fields', () => {
    const [ok, err] = validate('create_room', {});
    assert.strictEqual(ok, false);
    assert.match(err, /name/);
});

test('validate returns [false, error] for wrong type', () => {
    const [ok, err] = validate('join_room', { code: 1234, name: 'Mom' });
    assert.strictEqual(ok, false);
    assert.match(err, /code/);
});

test('validate returns [false, error] for unknown message type', () => {
    const [ok, err] = validate('nope', {});
    assert.strictEqual(ok, false);
    assert.match(err, /unknown/i);
});

test('validate accepts submit_round with strokes array', () => {
    const [ok] = validate('submit_round', { strokes: [] });
    assert.strictEqual(ok, true);
});

test('validate rejects submit_round with non-array strokes', () => {
    const [ok, err] = validate('submit_round', { strokes: 'nope' });
    assert.strictEqual(ok, false);
    assert.match(err, /strokes/);
});
