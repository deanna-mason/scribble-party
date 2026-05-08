//IMPORTS and CONSTANTS:
const crypto = require('crypto'); //node module used for building unique player IDs
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');

//these are my local modules:
const { RoomManager } = require('./rooms');
const { ROOM_STATES } = require('./room');
const { MESSAGE_TYPES, validate } = require('./messages');
const { getRandomPrompt, getCategories } = require('./prompts');

const PORT = process.env.PORT || 3000; //Uses the set variable when it's on Render, but default to 3000 otherwise.
const ROUND_DURATION_MS = 90_000; //90 seconds per drawing round
const ROUND_GRACE_MS = 3_000; //Creates a 3 second server side grace period to receive laggy client submissions before the reveal.
const ROOM_CLEANUP_MS = 10 * 60 * 1000; //If everyone leaves a room, it will get deleted after 10 minutes.

//EXPRESS and WEBSOCKET SETUP:
const app = express();
app.use(express.static('client'));
app.get('/health', (req, res) => res.json({ ok: true })); //Checks if the server is responding to requests.
app.get('/categories', (req, res) => res.json({ categories: getCategories() })); //Endpoint for fetching drawing prompt categories.

const server = app.listen(PORT, () => {
    console.log(`Scribble Party listening on port ${PORT}`);
});

const wss = new WebSocketServer({ server, maxPayload: 512 * 1024 }); //Prevents a client from sending a huge message.
const manager = new RoomManager(); //Creates the object that holds all of the game rooms.

// Each WebSocket connection gets mapped to the playerID and roomCode so that you know who is where. This helps with cleanup later too.
const connContext = new WeakMap();


//HELPER FUNCTIONS:
//checks if the connection is still open and sends a JSON message to them with type and payload fields.
function send(ws, type, payload = {}) {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type, payload }));
}

//Sends an error message that the client can use to show the user.
function sendError(ws, code, message) {
    send(ws, MESSAGE_TYPES.ERROR, { code, message });
}

//Broadcasts messages to everyone in the room like the new drawing prompt, or a submitted drawing.
function broadcast(room, type, payload) {
    for (const player of room.players.values()) {
        if (player.ws && player.ws.readyState === WebSocket.OPEN) {
            send(player.ws, type, payload);
        }
    }
}

//Sets the timer for the round and forces the reveal after the grace period. 
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
    }, ROUND_DURATION_MS + ROUND_GRACE_MS);
}

//Collects the drawing data from each player and sends it to everyone in the room when the round is done.
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

// CONNECTION HANDLING:
//Incoming messages go through this pipeline.
wss.on('connection', (ws) => {
    ws.on('message', (data) => {
        let msg;
        try {
            msg = JSON.parse(data); //parse the JSON message
        } catch {
            return sendError(ws, 'INVALID_PAYLOAD', 'Not JSON'); //reject if it's not valid
        }
        const { type, payload } = msg || {};
        if (!type) return sendError(ws, 'INVALID_PAYLOAD', 'Missing type'); //validate fields in the message
        const [ok, err] = validate(type, payload || {});
        if (!ok) return sendError(ws, 'INVALID_PAYLOAD', err);
        try {
            handleMessage(ws, type, payload || {}); //if valid, handleMessage will send it to the correct function based on type.
        } catch (e) {
            console.error(`Error handling ${type}:`, e);
            sendError(ws, 'INTERNAL_ERROR', e.message);
        }
    });

    //This handles when a player disconnects unexpectedly.
    ws.on('close', () => {
        const ctx = connContext.get(ws); //find the player and room based on the connection
        if (!ctx) return;
        const room = manager.getRoom(ctx.roomCode); //if the room still exists, mark them as disconnected but don't remove them yet in case they reconnect.
        if (!room) return;
        room.markDisconnected(ctx.playerId);
        const anyConnected = Array.from(room.players.values()).some((p) => p.isConnected);
        if (!anyConnected) {
            room.abandonedSince = Date.now(); //log the time when the room became empty so that it can get cleaned up later (set at 10 minutes).
        }
        broadcast(room, MESSAGE_TYPES.PLAYER_LEFT, { playerId: ctx.playerId }); //tell everyone in the room that the player left.
    });

    ws.on('error', (err) => console.error('WebSocket error:', err));
});

//This function sends messages to the correct handler function based on the type field.
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
        case T.NEXT_ROUND: return handleNextRound(ws); //there's no playload since it's just clicking a button to move to the next round. "Move on" is implicit in the type, so there's no additional message.
        case T.TOGGLE_DONE_VOTING: return handleToggleDone(ws, payload);
        case T.SEND_REACTION: return handleReaction(ws, payload);
        case T.NEW_GAME: return handleNewGame(ws);
        case T.LEAVE_ROOM: return handleLeaveRoom(ws);
        default: return sendError(ws, 'INVALID_PAYLOAD', `Unknown type ${type}`);
    }
}

//HANDLER FUNCTIONS:
//Generally, these look up player context, look up the room, call the correct function on the room object, and broadcast the result to all players.
function handleCreateRoom(ws, { name }) {
    const playerId = crypto.randomUUID(); //creates a unique ID for the player.
    let room;
    try {
        room = manager.createRoom(playerId, name);  //creates a room and makes the player the host.
    } catch (e) {
        return sendError(ws, 'INTERNAL_ERROR', e.message);
    }
    room.players.get(playerId).ws = ws; //stores the WebSocket connection on the player object so we can send messages to them later.
    connContext.set(ws, { playerId, roomCode: room.code });
    send(ws, MESSAGE_TYPES.ROOM_CREATED, { //lets the creator know the room was created.
        code: room.code,
        playerId,
        state: room.getSnapshot(),
    });
}

function handleJoinRoom(ws, { code, name, playerId }) {
    const room = manager.getRoom(code); //looks up the room based on the code they entered.
    if (!room) return sendError(ws, 'ROOM_NOT_FOUND', 'No room with that code');

    // Reconnect a player who disconnected.
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

    // New player joining for the first time through the lobby.
    if (room.state !== ROOM_STATES.LOBBY) {
        return sendError(ws, 'GAME_LOCKED', 'Game already in progress');
    }
    const newPlayerId = crypto.randomUUID(); //generate a new unique ID for the player.
    try {
        room.addPlayer(newPlayerId, name); //try to add the player to the room.
    } catch (e) {
        if (/full/i.test(e.message)) return sendError(ws, 'ROOM_FULL', e.message);
        if (/name/i.test(e.message)) return sendError(ws, 'NAME_TAKEN', e.message);
        throw e;
    }
    room.players.get(newPlayerId).ws = ws; //store the WebSocket connection on the player object for later use.
    connContext.set(ws, { playerId: newPlayerId, roomCode: room.code }); //store the player and room context so we know who and where they are for messages and cleanup.
    send(ws, MESSAGE_TYPES.ROOM_JOINED, { //send the current room state to the new player so their client can sync up.
        code: room.code,
        playerId: newPlayerId,
        state: room.getSnapshot(),
        isReconnect: false,
    });
    broadcast(room, MESSAGE_TYPES.PLAYER_JOINED, { //tell everyone else in the room that a new player joined.
        player: { id: newPlayerId, name },
        isReconnect: false,
    });
}

//Updates everyone when the player clicks the ready button in the lobby. The game can start when everyone is ready.
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

//Starts the game when the host clicks the start button. This locks the lobby and moves everyone into the first round.
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
    broadcast(room, MESSAGE_TYPES.CALLER_CHOOSING, {
        callerId: room.getCurrentCallerId(),
        callerIdx: room.currentCallerIdx,
        round: room.currentRound,
    });
}

//This gets called when a player requests a random drawing prompt.
function handleRequestRandom(ws, { category }) {
    const ctx = connContext.get(ws);
    if (!ctx) return;
    const room = manager.getRoom(ctx.roomCode);
    if (!room) return;
    if (ctx.playerId !== room.getCurrentCallerId()) {
        return sendError(ws, 'NOT_CALLER', 'Only the caller can request a prompt');
    }
    const used = room.promptHistory.map((p) => p.prompt); //avoids giving prompts that have already been used in the game.
    const result = getRandomPrompt(category || null, used); //fetches a random prompt from the list based on the category they choose.
    if (!result) return sendError(ws, 'INVALID_PAYLOAD', 'No prompt available for that category');
    send(ws, MESSAGE_TYPES.RANDOM_PROMPT_SUGGESTION, result);
}

//Once the player sets the drawing prompt, this lets everyone know and begins the round.
function handleSetPrompt(ws, { text }) {
    const ctx = connContext.get(ws);
    if (!ctx) return;
    const room = manager.getRoom(ctx.roomCode);
    if (!room) return;
    try {
        room.setPrompt(ctx.playerId, text);
    } catch (e) {
        if (/caller/i.test(e.message)) return sendError(ws, 'NOT_CALLER', e.message); //only the caller can set the prompt. Note that the 'i' makes it case insensitive.
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

//Lets everyone in the room know that a player has submitted their drawing. It also ends the round if everyone is done. 
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
    if (wasActive && room.state === ROOM_STATES.REVEAL) { //if the round just ended with this submission, then everyone gets the reveal at the same time.
        sendRevealBroadcast(room);
    }
}

//Starts the next round when a player clicks the button after the reveal. This will move to a new round with the next player's prompt selection.
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
    broadcast(room, MESSAGE_TYPES.CALLER_CHOOSING, {
        callerId: room.getCurrentCallerId(),
        callerIdx: room.currentCallerIdx,
        round: room.currentRound,
    });
}

//When a player clicks that they're done playing, it lets people know and once everyone is done, will end the game after that round is revealed.
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

//This sends reactions to eachother's drawings after reveals.
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

//This starts a new game with the same players after the current game ends. 
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

//This handles a player leaving the room on purpose by clicking the leave button. 
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

// This deletes rooms that have been empty for more than 10 minutes. It runs every minute to check for any rooms that need to be cleaned up.
setInterval(() => manager.cleanupAbandoned(ROOM_CLEANUP_MS), 60_000);
