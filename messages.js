const MESSAGE_TYPES = Object.freeze({
    // Client → server
    CREATE_ROOM: 'create_room',
    JOIN_ROOM: 'join_room',
    SET_READY: 'set_ready',
    START_GAME: 'start_game',
    REQUEST_RANDOM_PROMPT: 'request_random_prompt',
    SET_PROMPT: 'set_prompt',
    SUBMIT_ROUND: 'submit_round',
    TOGGLE_DONE_VOTING: 'toggle_done_voting',
    SEND_REACTION: 'send_reaction',
    NEXT_ROUND: 'next_round',
    NEW_GAME: 'new_game',
    LEAVE_ROOM: 'leave_room',
    // Server → client
    ROOM_CREATED: 'room_created',
    ROOM_JOINED: 'room_joined',
    PLAYER_JOINED: 'player_joined',
    PLAYER_LEFT: 'player_left',
    PLAYER_READY_CHANGED: 'player_ready_changed',
    GAME_STARTED: 'game_started',
    CALLER_CHOOSING: 'caller_choosing',
    RANDOM_PROMPT_SUGGESTION: 'random_prompt_suggestion',
    ROUND_STARTED: 'round_started',
    PLAYER_SUBMITTED: 'player_submitted',
    ROUND_REVEALED: 'round_revealed',
    DONE_VOTE_CHANGED: 'done_vote_changed',
    REACTION_RECEIVED: 'reaction_received',
    GAME_ENDED: 'game_ended',
    NEW_GAME_STARTED: 'new_game_started',
    ERROR: 'error',
});

// Schema is a map of field name → expected type.
// Use "array" for arrays; use "optional:string" for optional strings.
const SCHEMAS = {
    create_room: { name: 'string' },
    join_room: { code: 'string', name: 'string', playerId: 'optional:string' },
    set_ready: { ready: 'boolean' },
    start_game: {},
    request_random_prompt: { category: 'optional:string' },
    set_prompt: { text: 'string' },
    submit_round: { strokes: 'array' },
    toggle_done_voting: { done: 'boolean' },
    send_reaction: { targetPlayerId: 'string', emoji: 'string' },
    next_round: {},
    new_game: {},
    leave_room: {},
};

function validate(type, payload) {
    const schema = SCHEMAS[type];
    if (!schema) return [false, `unknown message type: ${type}`];
    if (!payload || typeof payload !== 'object') {
        return [false, 'payload must be an object'];
    }
    for (const [field, expected] of Object.entries(schema)) {
        const optional = expected.startsWith('optional:');
        const type = optional ? expected.slice('optional:'.length) : expected;
        const value = payload[field];
        if (value === undefined || value === null) {
            if (optional) continue;
            return [false, `missing field: ${field}`];
        }
        if (type === 'array') {
            if (!Array.isArray(value)) return [false, `field ${field} must be an array`];
        } else if (typeof value !== type) {
            return [false, `field ${field} must be ${type}`];
        }
    }
    return [true, null];
}

module.exports = { MESSAGE_TYPES, validate };
