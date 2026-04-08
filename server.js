const crypto = require('crypto');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const { RoomManager } = require('./rooms');
const { ROOM_STATES } = require('./room');
const { MESSAGE_TYPES, validate } = require('./messages');
const { getRandomPrompt, getCategories } = require('./prompts');

const PORT = process.env.PORT || 3000;
const ROUND_DURATION_MS = 90_000;
const ROOM_CLEANUP_MS = 10 * 60 * 1000;

const app = express();
app.use(express.static('client'));
app.get('/health', (req, res) => res.json({ ok: true }));

const server = app.listen(PORT, () => {
    console.log(`Scribble Party listening on port ${PORT}`);
});

const wss = new WebSocketServer({ server, maxPayload: 512 * 1024 });
const manager = new RoomManager();

// Per-connection context: { playerId, roomCode }
const connContext = new WeakMap();

// ----- helpers -----

function send(ws, type, payload = {}) {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type, payload }));
}

function sendError(ws, code, message) {
    send(ws, MESSAGE_TYPES.ERROR, { code, message });
}

function broadcast(room, type, payload) {
    for (const player of room.players.values()) {
        if (player.ws && player.ws.readyState === WebSocket.OPEN) {
            send(player.ws, type, payload);
        }
    }
}

function broadcastSnapshot(room, extraPayload = {}) {
    for (const player of room.players.values()) {
        if (player.ws && player.ws.readyState === WebSocket.OPEN) {
            send(player.ws, MESSAGE_TYPES.ROOM_JOINED, {
                code: room.code,
                playerId: player.id,
                state: room.getSnapshot(),
                ...extraPayload,
            });
        }
    }
}

function scheduleRoundTimer(room) {
    if (room.roundTimer) clearTimeout(room.roundTimer);
    room.roundTimer = setTimeout(() => {
        if (room.state === ROOM_STATES.ROUND_ACTIVE) {
            try {
                room.forceReveal();
                sendRevealBroadcast(room);
            } catch (err) {
                console.error('forceReveal failed:', err);
            }
        }
    }, ROUND_DURATION_MS);
}

function sendRevealBroadcast(room) {
    const playerStrokesThisRound = {};
    for (const [playerId] of room.players) {
        playerStrokesThisRound[playerId] = room.getNewStrokesForRound(playerId, room.currentRound);
    }
    broadcast(room, MESSAGE_TYPES.ROUND_REVEALED, {
        round: room.currentRound,
        prompt: room.currentPrompt,
        playerStrokesThisRound,
    });
}

// ----- connection handling -----

wss.on('connection', (ws) => {
    ws.on('message', (data) => {
        let msg;
        try {
            msg = JSON.parse(data);
        } catch {
            return sendError(ws, 'INVALID_PAYLOAD', 'Not JSON');
        }
        const { type, payload } = msg || {};
        if (!type) return sendError(ws, 'INVALID_PAYLOAD', 'Missing type');
        const [ok, err] = validate(type, payload || {});
        if (!ok) return sendError(ws, 'INVALID_PAYLOAD', err);
        try {
            handleMessage(ws, type, payload || {});
        } catch (e) {
            console.error(`Error handling ${type}:`, e);
            sendError(ws, 'INTERNAL_ERROR', e.message);
        }
    });

    ws.on('close', () => {
        const ctx = connContext.get(ws);
        if (!ctx) return;
        const room = manager.getRoom(ctx.roomCode);
        if (!room) return;
        room.markDisconnected(ctx.playerId);
        const anyConnected = Array.from(room.players.values()).some((p) => p.isConnected);
        if (!anyConnected) {
            room.abandonedSince = Date.now();
        }
        broadcast(room, MESSAGE_TYPES.PLAYER_LEFT, { playerId: ctx.playerId });
    });

    ws.on('error', (err) => console.error('WebSocket error:', err));
});

function handleMessage(ws, type, payload) {
    const T = MESSAGE_TYPES;
    switch (type) {
        case T.CREATE_ROOM: return handleCreateRoom(ws, payload);
        case T.JOIN_ROOM: return handleJoinRoom(ws, payload);
        case T.SET_READY: return handleSetReady(ws, payload);
        case T.START_GAME: return handleStartGame(ws, payload);
        case T.REQUEST_RANDOM_PROMPT: return handleRequestRandom(ws, payload);
        case T.SET_PROMPT: return handleSetPrompt(ws, payload);
        case T.SUBMIT_ROUND: return handleSubmitRound(ws, payload);
        case T.NEXT_ROUND: return handleNextRound(ws);
        case T.TOGGLE_DONE_VOTING: return handleToggleDone(ws, payload);
        case T.SEND_REACTION: return handleReaction(ws, payload);
        case T.NEW_GAME: return handleNewGame(ws);
        case T.LEAVE_ROOM: return handleLeaveRoom(ws);
        default: return sendError(ws, 'INVALID_PAYLOAD', `Unknown type ${type}`);
    }
}

function handleCreateRoom(ws, { name }) {
    const playerId = crypto.randomUUID();
    let room;
    try {
        room = manager.createRoom(playerId, name);
    } catch (e) {
        return sendError(ws, 'INTERNAL_ERROR', e.message);
    }
    room.players.get(playerId).ws = ws;
    connContext.set(ws, { playerId, roomCode: room.code });
    send(ws, MESSAGE_TYPES.ROOM_CREATED, {
        code: room.code,
        playerId,
        state: room.getSnapshot(),
    });
}

function handleJoinRoom(ws, { code, name, playerId }) {
    const room = manager.getRoom(code);
    if (!room) return sendError(ws, 'ROOM_NOT_FOUND', 'No room with that code');

    // Reconnect path
    if (playerId && room.players.has(playerId)) {
        room.revivePlayer(playerId);
        room.players.get(playerId).ws = ws;
        connContext.set(ws, { playerId, roomCode: room.code });
        send(ws, MESSAGE_TYPES.ROOM_JOINED, {
            code: room.code,
            playerId,
            state: room.getSnapshot(),
            isReconnect: true,
        });
        broadcast(room, MESSAGE_TYPES.PLAYER_JOINED, {
            player: { id: playerId, name: room.players.get(playerId).name },
            isReconnect: true,
        });
        return;
    }

    // Fresh join — only allowed in LOBBY
    if (room.state !== ROOM_STATES.LOBBY) {
        return sendError(ws, 'GAME_LOCKED', 'Game already in progress');
    }
    const newPlayerId = crypto.randomUUID();
    try {
        room.addPlayer(newPlayerId, name);
    } catch (e) {
        if (/full/i.test(e.message)) return sendError(ws, 'ROOM_FULL', e.message);
        if (/name/i.test(e.message)) return sendError(ws, 'NAME_TAKEN', e.message);
        throw e;
    }
    room.players.get(newPlayerId).ws = ws;
    connContext.set(ws, { playerId: newPlayerId, roomCode: room.code });
    send(ws, MESSAGE_TYPES.ROOM_JOINED, {
        code: room.code,
        playerId: newPlayerId,
        state: room.getSnapshot(),
        isReconnect: false,
    });
    broadcast(room, MESSAGE_TYPES.PLAYER_JOINED, {
        player: { id: newPlayerId, name },
        isReconnect: false,
    });
}

function handleSetReady(ws, { ready }) {
    const ctx = connContext.get(ws);
    if (!ctx) return;
    const room = manager.getRoom(ctx.roomCode);
    if (!room) return;
    room.setReady(ctx.playerId, ready);
    broadcast(room, MESSAGE_TYPES.PLAYER_READY_CHANGED, {
        playerId: ctx.playerId,
        ready,
    });
}

function handleStartGame(ws) {
    const ctx = connContext.get(ws);
    if (!ctx) return;
    const room = manager.getRoom(ctx.roomCode);
    if (!room) return;
    try {
        room.startGame(ctx.playerId);
    } catch (e) {
        return sendError(ws, 'INVALID_STATE', e.message);
    }
    broadcast(room, MESSAGE_TYPES.GAME_STARTED, {
        turnOrder: room.turnOrder,
        currentCallerIdx: room.currentCallerIdx,
        currentRound: room.currentRound,
    });
    broadcast(room, MESSAGE_TYPES.CALLER_CHOOSING, { callerId: room.getCurrentCallerId() });
}

function handleRequestRandom(ws, { category }) {
    const ctx = connContext.get(ws);
    if (!ctx) return;
    const room = manager.getRoom(ctx.roomCode);
    if (!room) return;
    if (ctx.playerId !== room.getCurrentCallerId()) {
        return sendError(ws, 'NOT_CALLER', 'Only the caller can request a prompt');
    }
    const used = room.promptHistory.map((p) => p.prompt);
    const result = getRandomPrompt(category || null, used);
    if (!result) return sendError(ws, 'INVALID_PAYLOAD', 'No prompt available for that category');
    send(ws, MESSAGE_TYPES.RANDOM_PROMPT_SUGGESTION, result);
}

function handleSetPrompt(ws, { text }) {
    const ctx = connContext.get(ws);
    if (!ctx) return;
    const room = manager.getRoom(ctx.roomCode);
    if (!room) return;
    try {
        room.setPrompt(ctx.playerId, text);
    } catch (e) {
        if (/caller/i.test(e.message)) return sendError(ws, 'NOT_CALLER', e.message);
        return sendError(ws, 'INVALID_STATE', e.message);
    }
    scheduleRoundTimer(room);
    broadcast(room, MESSAGE_TYPES.ROUND_STARTED, {
        round: room.currentRound,
        callerId: ctx.playerId,
        prompt: text,
        endsAt: room.roundEndsAt,
    });
}

function handleSubmitRound(ws, { strokes }) {
    const ctx = connContext.get(ws);
    if (!ctx) return;
    const room = manager.getRoom(ctx.roomCode);
    if (!room) return;
    const wasActive = room.state === ROOM_STATES.ROUND_ACTIVE;
    try {
        room.submitRound(ctx.playerId, strokes);
    } catch (e) {
        return sendError(ws, 'INVALID_STATE', e.message);
    }
    broadcast(room, MESSAGE_TYPES.PLAYER_SUBMITTED, { playerId: ctx.playerId });
    if (wasActive && room.state === ROOM_STATES.REVEAL) {
        sendRevealBroadcast(room);
    }
}

function handleNextRound(ws) {
    const ctx = connContext.get(ws);
    if (!ctx) return;
    const room = manager.getRoom(ctx.roomCode);
    if (!room) return;
    try {
        room.nextRound();
    } catch (e) {
        return sendError(ws, 'INVALID_STATE', e.message);
    }
    broadcast(room, MESSAGE_TYPES.CALLER_CHOOSING, { callerId: room.getCurrentCallerId() });
}

function handleToggleDone(ws, { done }) {
    const ctx = connContext.get(ws);
    if (!ctx) return;
    const room = manager.getRoom(ctx.roomCode);
    if (!room) return;
    room.toggleDoneVoting(ctx.playerId, done);
    broadcast(room, MESSAGE_TYPES.DONE_VOTE_CHANGED, {
        playerId: ctx.playerId,
        done,
        doneVoters: room.getDoneVoters(),
        totalPlayers: room.players.size,
        allDone: room.state === ROOM_STATES.GAME_OVER,
    });
    if (room.state === ROOM_STATES.GAME_OVER) {
        broadcast(room, MESSAGE_TYPES.GAME_ENDED, {
            finalGallery: Object.fromEntries(room.playerStrokes),
            promptHistory: room.promptHistory,
        });
    }
}

function handleReaction(ws, { targetPlayerId, emoji }) {
    const ctx = connContext.get(ws);
    if (!ctx) return;
    const room = manager.getRoom(ctx.roomCode);
    if (!room) return;
    broadcast(room, MESSAGE_TYPES.REACTION_RECEIVED, {
        fromPlayerId: ctx.playerId,
        targetPlayerId,
        emoji,
    });
}

function handleNewGame(ws) {
    const ctx = connContext.get(ws);
    if (!ctx) return;
    const room = manager.getRoom(ctx.roomCode);
    if (!room) return;
    try {
        room.newGame(ctx.playerId);
    } catch (e) {
        return sendError(ws, 'INVALID_STATE', e.message);
    }
    broadcast(room, MESSAGE_TYPES.NEW_GAME_STARTED, {
        state: room.getSnapshot(),
    });
}

function handleLeaveRoom(ws) {
    const ctx = connContext.get(ws);
    if (!ctx) return;
    const room = manager.getRoom(ctx.roomCode);
    if (!room) return;
    room.removePlayer(ctx.playerId);
    connContext.delete(ws);
    broadcast(room, MESSAGE_TYPES.PLAYER_LEFT, { playerId: ctx.playerId });
    if (room.players.size === 0) {
        manager.deleteRoom(room.code);
    }
}

// Periodic cleanup of abandoned rooms
setInterval(() => manager.cleanupAbandoned(ROOM_CLEANUP_MS), 60_000);
