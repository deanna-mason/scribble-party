# Scribble Party Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first real-time multiplayer drawing game where 2–8 players build one persistent cumulative drawing across many prompt rounds, ending on consensus vote.

**Architecture:** Single Node.js process (Express + `ws`) serves the static client and hosts an in-memory `RoomManager` of `Room` state machines. Client is vanilla HTML/CSS/JS with Canvas 2D API, native WebSocket, and zero libraries. Strokes are vector-based with normalized coordinates, cumulative per player across rounds, transmitted on submit and replayed on reveal.

**Tech Stack:** Node.js 20+, Express 5, `ws` library, Canvas 2D API, Pointer Events API, Node built-in test runner (`node --test`). Deployed to Render.com.

**Spec reference:** `docs/superpowers/specs/2026-04-08-scribble-party-design.md`

---

## File Structure

**Project root:**
- `package.json` — dependencies, start script, Node version
- `.gitignore` — `node_modules`, `.DS_Store`, `.env`
- `.nvmrc` — Node version pin
- `server.js` — Express setup, `ws` wiring, message dispatch
- `rooms.js` — `RoomManager` class (create, lookup, cleanup)
- `room.js` — `Room` class with full state machine
- `messages.js` — message type constants + hand-rolled validator
- `prompts.js` — loads `prompts.json`, exposes `getRandomPrompt`
- `prompts.json` — curated prompt list grouped by category

**Server tests:**
- `test/messages.test.js`
- `test/prompts.test.js`
- `test/room.test.js`
- `test/rooms.test.js`

**Client (served from `client/`):**
- `client/index.html` — single page, screens as sections toggled by CSS class
- `client/styles.css` — all styles, mobile-first, custom properties
- `client/socket.js` — WebSocket wrapper (connect, send, dispatch, reconnect)
- `client/state.js` — client game state + subscribe/notify emitter
- `client/drawing.js` — Canvas 2D controller (pointer, render, eraser, replay)
- `client/ui.js` — DOM updates per state transition
- `client/app.js` — entry point, wires modules together

---

## Phase A — Project setup

### Task 1: Project bootstrap

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.nvmrc`

- [ ] **Step 1: Initialize git repository**

Run: `git init`

Expected: `Initialized empty Git repository…`

- [ ] **Step 2: Create `.gitignore`**

Write `.gitignore`:

```
node_modules/
.DS_Store
.env
*.log
```

- [ ] **Step 3: Create `.nvmrc`**

Write `.nvmrc`:

```
20
```

- [ ] **Step 4: Create `package.json`**

Write `package.json`:

```json
{
  "name": "scribble-party",
  "version": "1.0.0",
  "description": "Real-time multiplayer collaborative drawing game",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "test": "node --test test/"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "express": "^5.0.0",
    "ws": "^8.18.0"
  }
}
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`

Expected: `node_modules/` created, no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore .nvmrc
git commit -m "chore: project bootstrap with express and ws"
```

---

### Task 2: Minimal server serving static client

**Files:**
- Create: `server.js`
- Create: `client/index.html`

- [ ] **Step 1: Create a minimal client landing page**

Write `client/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>Scribble Party</title>
</head>
<body>
    <h1>Scribble Party</h1>
    <p>Loading...</p>
</body>
</html>
```

- [ ] **Step 2: Create minimal server**

Write `server.js`:

```js
const express = require('express');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.static('client'));

const server = app.listen(PORT, () => {
    console.log(`Scribble Party listening on port ${PORT}`);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    console.log('Client connected');
    ws.on('close', () => console.log('Client disconnected'));
    ws.on('error', (err) => console.error('WebSocket error:', err));
});
```

- [ ] **Step 3: Start the server and verify**

Run: `node server.js`

Expected console output: `Scribble Party listening on port 3000`

Open `http://localhost:3000` in a browser. You should see "Scribble Party / Loading..." text.

Stop the server with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add server.js client/index.html
git commit -m "feat: minimal server and static client landing"
```

---

## Phase B — Server pure logic (TDD)

### Task 3: Message types and validator (TDD)

**Files:**
- Create: `messages.js`
- Create: `test/messages.test.js`

- [ ] **Step 1: Write the failing test**

Write `test/messages.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`

Expected: FAIL with "Cannot find module '../messages'"

- [ ] **Step 3: Implement `messages.js`**

Write `messages.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add messages.js test/messages.test.js
git commit -m "feat: message types and validator with tests"
```

---

### Task 4: Prompts loader (TDD)

**Files:**
- Create: `prompts.json`
- Create: `prompts.js`
- Create: `test/prompts.test.js`

- [ ] **Step 1: Create a starter `prompts.json`**

Write `prompts.json`. Expand these lists to 30–50 per category later; start with enough to exercise tests:

```json
{
  "body_parts": [
    "fish tail", "mustache", "eyebrow", "third eye", "claw", "wing",
    "horn", "antenna", "elephant trunk", "lizard tongue", "peg leg",
    "bird beak", "dragon scales", "robot arm", "extra finger"
  ],
  "accessories": [
    "top hat", "monocle", "cape", "backpack", "bow tie", "sunglasses",
    "crown", "necklace", "belt", "scarf", "tiara", "watch",
    "mittens", "boots", "baseball cap"
  ],
  "creatures": [
    "dragon", "alien", "robot", "mermaid", "unicorn", "yeti",
    "sea monster", "ghost", "vampire bat", "tiny dinosaur",
    "fairy", "phoenix", "octopus", "kraken", "goblin"
  ],
  "silly": [
    "spaghetti hair", "pizza shoes", "rainbow fart", "cheese necklace",
    "pickle ears", "donut halo", "taco hands", "ice cream nose",
    "bubblegum beard", "popcorn eyebrows", "waffle wings",
    "marshmallow teeth", "candy cane legs", "jelly bean eyes", "cupcake hat"
  ],
  "nature": [
    "flower", "tree branch", "lightning bolt", "cloud", "sun",
    "rainbow", "snowflake", "puddle", "mushroom", "acorn",
    "seashell", "starfish", "butterfly", "ladybug", "leaf"
  ],
  "objects": [
    "ice cream cone", "umbrella", "balloon", "guitar", "rocket ship",
    "treasure chest", "magnifying glass", "bucket", "spoon",
    "alarm clock", "telescope", "sandwich", "cupcake", "key", "map"
  ]
}
```

- [ ] **Step 2: Write the failing test**

Write `test/prompts.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { getRandomPrompt, getCategories } = require('../prompts');

test('getCategories returns a non-empty array of strings', () => {
    const cats = getCategories();
    assert.ok(Array.isArray(cats));
    assert.ok(cats.length > 0);
    for (const c of cats) assert.strictEqual(typeof c, 'string');
});

test('getRandomPrompt with no args returns {text, category}', () => {
    const result = getRandomPrompt();
    assert.strictEqual(typeof result.text, 'string');
    assert.strictEqual(typeof result.category, 'string');
    assert.ok(result.text.length > 0);
});

test('getRandomPrompt honors category filter', () => {
    const result = getRandomPrompt('silly');
    assert.strictEqual(result.category, 'silly');
});

test('getRandomPrompt excludes already-used prompts', () => {
    const categories = getCategories();
    const allPrompts = [];
    // Collect all prompts
    for (let i = 0; i < 1000; i++) {
        allPrompts.push(getRandomPrompt().text);
    }
    const unique = new Set(allPrompts);
    // Exclude all but one unique prompt and verify the last one comes back
    const remaining = Array.from(unique).slice(0, unique.size - 1);
    const last = Array.from(unique)[unique.size - 1];
    for (let i = 0; i < 100; i++) {
        const result = getRandomPrompt(null, remaining);
        assert.strictEqual(result.text, last);
    }
});

test('getRandomPrompt with unknown category returns null', () => {
    const result = getRandomPrompt('zzz-unknown');
    assert.strictEqual(result, null);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`

Expected: FAIL with "Cannot find module '../prompts'"

- [ ] **Step 4: Implement `prompts.js`**

Write `prompts.js`:

```js
const path = require('path');
const fs = require('fs');

const DATA = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'prompts.json'), 'utf8')
);

function getCategories() {
    return Object.keys(DATA);
}

function getRandomPrompt(category = null, excluded = []) {
    let pool;
    if (category) {
        if (!DATA[category]) return null;
        pool = DATA[category].map((text) => ({ text, category }));
    } else {
        pool = [];
        for (const [cat, items] of Object.entries(DATA)) {
            for (const text of items) pool.push({ text, category: cat });
        }
    }
    const excludedSet = new Set(excluded);
    const filtered = pool.filter((p) => !excludedSet.has(p.text));
    if (filtered.length === 0) return null;
    return filtered[Math.floor(Math.random() * filtered.length)];
}

module.exports = { getRandomPrompt, getCategories };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`

Expected: all prompts tests PASS.

- [ ] **Step 6: Commit**

```bash
git add prompts.json prompts.js test/prompts.test.js
git commit -m "feat: prompts loader with category and exclusion filters"
```

---

### Task 5: Room class — player management and ready state (TDD)

**Files:**
- Create: `room.js`
- Create: `test/room.test.js`

- [ ] **Step 1: Write the failing tests for construction and player management**

Write `test/room.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`

Expected: FAIL with "Cannot find module '../room'"

- [ ] **Step 3: Implement the Room class skeleton**

Write `room.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`

Expected: all room tests in this group PASS.

- [ ] **Step 5: Commit**

```bash
git add room.js test/room.test.js
git commit -m "feat: Room class with player management and ready state"
```

---

### Task 6: Room — start game, set prompt, round active (TDD)

**Files:**
- Modify: `room.js`
- Modify: `test/room.test.js`

- [ ] **Step 1: Append failing tests for start/prompt/round transitions**

Append to `test/room.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`

Expected: FAIL because `startGame` and `setPrompt` don't exist.

- [ ] **Step 3: Add `startGame` and `setPrompt` to the Room class**

In `room.js`, add these methods to the `Room` class (before the closing brace):

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`

Expected: new tests PASS, previous tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add room.js test/room.test.js
git commit -m "feat: Room startGame and setPrompt transitions"
```

---

### Task 7: Room — submit round, reveal, next round rotation (TDD)

**Files:**
- Modify: `room.js`
- Modify: `test/room.test.js`

- [ ] **Step 1: Append failing tests**

Append to `test/room.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`

Expected: FAIL — the new methods don't exist.

- [ ] **Step 3: Add the methods to Room**

Add to `room.js` inside the Room class:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`

Expected: all Room tests PASS.

- [ ] **Step 5: Commit**

```bash
git add room.js test/room.test.js
git commit -m "feat: Room submit/reveal/nextRound rotation"
```

---

### Task 8: Room — done voting, game over, new game (TDD)

**Files:**
- Modify: `room.js`
- Modify: `test/room.test.js`

- [ ] **Step 1: Append failing tests**

Append to `test/room.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`

Expected: FAIL — methods don't exist.

- [ ] **Step 3: Add done voting and new game methods**

Add to `room.js` inside the Room class:

```js
    toggleDoneVoting(playerId, done) {
        const player = this.players.get(playerId);
        if (!player) throw new Error('Unknown player');
        player.isDoneVoting = done;
        const allDone = Array.from(this.players.values()).every((p) => p.isDoneVoting);
        if (allDone) {
            this.state = ROOM_STATES.GAME_OVER;
        }
    }

    getDoneVoters() {
        return Array.from(this.players.values())
            .filter((p) => p.isDoneVoting)
            .map((p) => p.id);
    }

    newGame(newHostId) {
        if (this.state !== ROOM_STATES.GAME_OVER) {
            throw new Error(`Cannot start new game from state ${this.state}`);
        }
        if (!this.players.has(newHostId)) {
            throw new Error('Unknown player');
        }
        this.state = ROOM_STATES.LOBBY;
        this.hostId = newHostId;
        this.turnOrder = [];
        this.currentCallerIdx = 0;
        this.currentRound = 0;
        this.currentPrompt = null;
        this.roundEndsAt = null;
        this.submittedThisRound.clear();
        this.promptHistory = [];
        for (const player of this.players.values()) {
            player.isReady = false;
            player.isDoneVoting = false;
        }
        for (const id of this.playerStrokes.keys()) {
            this.playerStrokes.set(id, []);
        }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`

Expected: all Room tests PASS.

- [ ] **Step 5: Commit**

```bash
git add room.js test/room.test.js
git commit -m "feat: Room done voting and new game reset"
```

---

### Task 9: Room — snapshot and reconnect support (TDD)

**Files:**
- Modify: `room.js`
- Modify: `test/room.test.js`

- [ ] **Step 1: Append failing tests**

Append to `test/room.test.js`:

```js
test('getSnapshot returns full room state for sync', () => {
    const r = new Room('WXYZ', 'host-1', 'Mom');
    r.addPlayer('p-2', 'Lily');
    const snap = r.getSnapshot();
    assert.strictEqual(snap.code, 'WXYZ');
    assert.strictEqual(snap.state, ROOM_STATES.LOBBY);
    assert.strictEqual(snap.hostId, 'host-1');
    assert.strictEqual(snap.players.length, 2);
    assert.ok(Array.isArray(snap.turnOrder));
    assert.ok(typeof snap.playerStrokes === 'object');
    assert.ok(Array.isArray(snap.promptHistory));
});

test('getSnapshot players do not include WebSocket reference', () => {
    const r = new Room('WXYZ', 'host-1', 'Mom');
    r.players.get('host-1').ws = { foo: 'bar' };
    const snap = r.getSnapshot();
    assert.strictEqual(snap.players[0].ws, undefined);
});

test('markDisconnected sets isConnected=false but keeps player in room', () => {
    const r = new Room('WXYZ', 'host-1', 'Mom');
    r.addPlayer('p-2', 'Lily');
    r.markDisconnected('p-2');
    assert.strictEqual(r.players.size, 2);
    assert.strictEqual(r.players.get('p-2').isConnected, false);
});

test('revivePlayer restores connection on reconnect', () => {
    const r = new Room('WXYZ', 'host-1', 'Mom');
    r.addPlayer('p-2', 'Lily');
    r.markDisconnected('p-2');
    const ok = r.revivePlayer('p-2');
    assert.strictEqual(ok, true);
    assert.strictEqual(r.players.get('p-2').isConnected, true);
});

test('revivePlayer returns false for unknown playerId', () => {
    const r = new Room('WXYZ', 'host-1', 'Mom');
    assert.strictEqual(r.revivePlayer('ghost'), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`

Expected: FAIL — methods don't exist.

- [ ] **Step 3: Add snapshot and reconnect methods**

Add to `room.js` inside the Room class:

```js
    getSnapshot() {
        return {
            code: this.code,
            state: this.state,
            hostId: this.hostId,
            players: Array.from(this.players.values()).map((p) => ({
                id: p.id,
                name: p.name,
                isReady: p.isReady,
                isDoneVoting: p.isDoneVoting,
                isConnected: p.isConnected,
            })),
            turnOrder: [...this.turnOrder],
            currentCallerIdx: this.currentCallerIdx,
            currentRound: this.currentRound,
            currentPrompt: this.currentPrompt,
            roundEndsAt: this.roundEndsAt,
            playerStrokes: Object.fromEntries(this.playerStrokes),
            promptHistory: [...this.promptHistory],
        };
    }

    markDisconnected(playerId) {
        const player = this.players.get(playerId);
        if (!player) return;
        player.isConnected = false;
    }

    revivePlayer(playerId) {
        const player = this.players.get(playerId);
        if (!player) return false;
        player.isConnected = true;
        return true;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`

Expected: all Room tests PASS.

- [ ] **Step 5: Commit**

```bash
git add room.js test/room.test.js
git commit -m "feat: Room snapshot and reconnect support"
```

---

### Task 10: RoomManager — create, lookup, cleanup (TDD)

**Files:**
- Create: `rooms.js`
- Create: `test/rooms.test.js`

- [ ] **Step 1: Write the failing test**

Write `test/rooms.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`

Expected: FAIL — `rooms.js` does not exist.

- [ ] **Step 3: Implement RoomManager**

Write `rooms.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`

Expected: all RoomManager tests PASS.

- [ ] **Step 5: Commit**

```bash
git add rooms.js test/rooms.test.js
git commit -m "feat: RoomManager with unique code generation and cleanup"
```

---

## Phase C — Server integration

### Task 11: Server message dispatch and broadcast

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Rewrite server.js with full message handling**

Replace `server.js` with:

```js
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
```

- [ ] **Step 2: Run unit tests to ensure nothing regressed**

Run: `npm test`

Expected: all prior tests still PASS. (New server.js isn't covered by unit tests; it will be verified end-to-end.)

- [ ] **Step 3: Smoke-test the server starts**

Run: `node server.js`

Expected: `Scribble Party listening on port 3000` and no crash.

Stop with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: server message dispatch, broadcast, and room lifecycle"
```

---

## Phase D — Client foundation

### Task 12: Client socket wrapper

**Files:**
- Create: `client/socket.js`

- [ ] **Step 1: Create the socket wrapper**

Write `client/socket.js`:

```js
(function () {
    const listeners = new Map(); // type → [callback, ...]
    let socket = null;
    let backoff = 500;
    let intentionalClose = false;

    function wsUrl() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${location.host}`;
    }

    function connect() {
        intentionalClose = false;
        socket = new WebSocket(wsUrl());
        socket.addEventListener('open', () => {
            backoff = 500;
            emit('__open__', {});
        });
        socket.addEventListener('message', (event) => {
            let msg;
            try { msg = JSON.parse(event.data); } catch { return; }
            if (msg && msg.type) emit(msg.type, msg.payload || {});
        });
        socket.addEventListener('close', () => {
            emit('__close__', {});
            if (!intentionalClose) {
                setTimeout(connect, backoff);
                backoff = Math.min(backoff * 2, 10_000);
            }
        });
        socket.addEventListener('error', (err) => {
            console.error('Socket error', err);
        });
    }

    function send(type, payload = {}) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            console.warn('Socket not open, dropping message', type);
            return;
        }
        socket.send(JSON.stringify({ type, payload }));
    }

    function on(type, callback) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(callback);
    }

    function emit(type, payload) {
        const list = listeners.get(type) || [];
        for (const cb of list) cb(payload);
    }

    function disconnect() {
        intentionalClose = true;
        if (socket) socket.close();
    }

    window.Socket = { connect, send, on, disconnect };
})();
```

- [ ] **Step 2: Commit**

```bash
git add client/socket.js
git commit -m "feat: client WebSocket wrapper with auto-reconnect"
```

---

### Task 13: Client state store

**Files:**
- Create: `client/state.js`

- [ ] **Step 1: Create the state store**

Write `client/state.js`:

```js
(function () {
    const STORAGE_KEY = 'scribble-party-playerId';

    const state = {
        // Connection
        connected: false,
        // Identity
        playerId: localStorage.getItem(STORAGE_KEY) || null,
        // Room
        roomCode: null,
        roomState: 'LANDING', // LANDING | LOBBY | CALLER_CHOOSING | ROUND_ACTIVE | REVEAL | GAME_OVER
        hostId: null,
        players: [], // {id, name, isReady, isDoneVoting, isConnected}
        turnOrder: [],
        currentCallerIdx: 0,
        currentRound: 0,
        currentPrompt: null,
        roundEndsAt: null,
        playerStrokes: {}, // playerId → Stroke[]
        promptHistory: [],
        // Local-only
        randomSuggestion: null, // {text, category} when caller requested one
        haveSeenDoneHelper: false,
    };

    const listeners = new Set();

    function get() { return state; }

    function set(patch) {
        Object.assign(state, patch);
        if (patch.playerId !== undefined && patch.playerId) {
            localStorage.setItem(STORAGE_KEY, patch.playerId);
        }
        for (const cb of listeners) cb(state);
    }

    function applySnapshot(snapshot) {
        set({
            roomCode: snapshot.code,
            roomState: snapshot.state,
            hostId: snapshot.hostId,
            players: snapshot.players,
            turnOrder: snapshot.turnOrder,
            currentCallerIdx: snapshot.currentCallerIdx,
            currentRound: snapshot.currentRound,
            currentPrompt: snapshot.currentPrompt,
            roundEndsAt: snapshot.roundEndsAt,
            playerStrokes: snapshot.playerStrokes,
            promptHistory: snapshot.promptHistory,
        });
    }

    function subscribe(cb) {
        listeners.add(cb);
        return () => listeners.delete(cb);
    }

    function reset() {
        set({
            roomCode: null,
            roomState: 'LANDING',
            hostId: null,
            players: [],
            turnOrder: [],
            currentCallerIdx: 0,
            currentRound: 0,
            currentPrompt: null,
            roundEndsAt: null,
            playerStrokes: {},
            promptHistory: [],
            randomSuggestion: null,
            haveSeenDoneHelper: false,
        });
    }

    window.AppState = { get, set, applySnapshot, subscribe, reset };
})();
```

- [ ] **Step 2: Commit**

```bash
git add client/state.js
git commit -m "feat: client state store with persistence of playerId"
```

---

### Task 14: Client HTML skeleton with all screens

**Files:**
- Modify: `client/index.html`

- [ ] **Step 1: Replace index.html with the full screen skeleton**

Write `client/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>Scribble Party</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div id="toast-container" aria-live="polite"></div>

    <!-- Landing -->
    <section id="screen-landing" class="screen is-active">
        <div class="landing-card">
            <h1 class="landing-title">✏️ Scribble Party</h1>
            <p class="landing-sub">Draw silly things with your friends!</p>
            <button id="btn-show-create" class="btn btn-primary">Create New Room</button>
            <button id="btn-show-join" class="btn btn-secondary">Join a Room</button>
            <form id="form-create" class="inline-form hidden" autocomplete="off">
                <input id="input-create-name" type="text" placeholder="Your name" maxlength="16" required>
                <button type="submit" class="btn btn-primary">Create</button>
            </form>
            <form id="form-join" class="inline-form hidden" autocomplete="off">
                <input id="input-join-code" type="text" placeholder="Room code" maxlength="4" required style="text-transform:uppercase">
                <input id="input-join-name" type="text" placeholder="Your name" maxlength="16" required>
                <button type="submit" class="btn btn-primary">Join</button>
            </form>
        </div>
    </section>

    <!-- Lobby -->
    <section id="screen-lobby" class="screen">
        <header class="app-header">
            <button id="btn-leave-lobby" class="btn-link">← Leave</button>
        </header>
        <div class="lobby-card">
            <div class="room-code-block">
                <div class="room-code-label">Room code</div>
                <button id="btn-copy-code" class="room-code" title="Tap to copy">WXYZ</button>
                <div class="room-code-hint">Tap to copy</div>
            </div>
            <h2 class="lobby-section-title">Players <span id="lobby-count">(0/8)</span></h2>
            <ul id="lobby-players" class="player-list"></ul>
            <div class="lobby-actions">
                <button id="btn-ready" class="btn btn-secondary">I'm Ready</button>
                <button id="btn-start-game" class="btn btn-primary" disabled>Start Game</button>
            </div>
        </div>
    </section>

    <!-- Caller choosing -->
    <section id="screen-caller" class="screen">
        <header class="app-header">
            <div class="round-label">Round <span id="caller-round">1</span></div>
        </header>
        <div id="caller-view-me" class="caller-card hidden">
            <h2>Your turn!</h2>
            <p>Pick a prompt for everyone</p>
            <input id="input-prompt-text" type="text" placeholder="Type anything..." maxlength="40">
            <div class="caller-or">— or —</div>
            <div class="caller-random-row">
                <select id="select-category">
                    <option value="">Any category</option>
                </select>
                <button id="btn-random-prompt" class="btn btn-secondary">🎲 Surprise me</button>
            </div>
            <div id="random-suggestion" class="random-suggestion hidden">
                <div id="random-suggestion-text"></div>
                <button id="btn-use-suggestion" class="btn btn-primary">Use this</button>
            </div>
            <button id="btn-confirm-prompt" class="btn btn-primary" disabled>Confirm</button>
        </div>
        <div id="caller-view-wait" class="caller-wait hidden">
            <p><span id="caller-wait-name">Someone</span> is picking a prompt...</p>
            <div class="spinner">⏳</div>
        </div>
    </section>

    <!-- Drawing round -->
    <section id="screen-round" class="screen">
        <header class="round-header">
            <div class="round-label">Round <span id="round-number">1</span></div>
            <div class="round-timer" id="round-timer">1:30</div>
        </header>
        <div class="round-prompt" id="round-prompt">"fish tail"</div>
        <div class="canvas-wrap">
            <canvas id="draw-canvas"></canvas>
        </div>
        <div class="toolbar">
            <div class="toolbar-group">
                <button class="tool-btn is-active" data-tool="pen" aria-label="Pen">✏️</button>
                <button class="tool-btn" data-tool="eraser" aria-label="Eraser">🧹</button>
            </div>
            <div class="toolbar-group" id="color-swatches"></div>
            <div class="toolbar-group" id="size-buttons">
                <button class="size-btn is-active" data-size="3" aria-label="Small"><span class="size-dot small"></span></button>
                <button class="size-btn" data-size="6" aria-label="Medium"><span class="size-dot medium"></span></button>
                <button class="size-btn" data-size="10" aria-label="Large"><span class="size-dot large"></span></button>
            </div>
        </div>
        <div class="mini-status" id="mini-status"></div>
        <button id="btn-submit-round" class="btn btn-primary btn-full">Submit</button>
    </section>

    <!-- Reveal -->
    <section id="screen-reveal" class="screen">
        <header class="app-header">
            <div class="reveal-title">Round <span id="reveal-round">1</span> Reveal</div>
            <div class="reveal-prompt" id="reveal-prompt">"fish tail"</div>
        </header>
        <div class="reveal-grid" id="reveal-grid"></div>
        <div class="reaction-bar" id="reaction-bar">
            <button class="emoji-btn" data-emoji="🎉">🎉</button>
            <button class="emoji-btn" data-emoji="😂">😂</button>
            <button class="emoji-btn" data-emoji="🔥">🔥</button>
            <button class="emoji-btn" data-emoji="❤️">❤️</button>
            <button class="emoji-btn" data-emoji="😱">😱</button>
        </div>
        <div class="reveal-actions">
            <button id="btn-next-round" class="btn btn-primary">Next Round →</button>
            <div class="done-block">
                <button id="btn-toggle-done" class="btn btn-secondary btn-done">🏁 I'm done <span class="done-state">○</span></button>
                <div class="done-helper" id="done-helper">Game ends when everyone taps this</div>
            </div>
        </div>
    </section>

    <!-- Gallery -->
    <section id="screen-gallery" class="screen">
        <header class="app-header">
            <h1>Our Masterpieces</h1>
        </header>
        <div class="prompt-history">
            <div class="prompt-history-label">All the prompts:</div>
            <div id="prompt-history-list"></div>
        </div>
        <div id="gallery-list" class="gallery-list"></div>
        <div class="gallery-actions">
            <button id="btn-new-game" class="btn btn-primary">New Game</button>
            <button id="btn-leave-gallery" class="btn btn-secondary">Leave</button>
        </div>
    </section>

    <script src="socket.js"></script>
    <script src="state.js"></script>
    <script src="drawing.js"></script>
    <script src="ui.js"></script>
    <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add client/index.html
git commit -m "feat: client HTML skeleton with all screens"
```

---

### Task 15: Client base styles

**Files:**
- Create: `client/styles.css`

- [ ] **Step 1: Create the base stylesheet**

Write `client/styles.css`:

```css
/* ===== Variables ===== */
:root {
    --bg: #faf6f0;
    --surface: #ffffff;
    --ink: #1a1a2e;
    --primary: #ff6b6b;
    --accent: #4ecdc4;
    --muted: #8d8d9c;
    --border: #e8e3dc;
    --success: #7fb069;
    --warning: #f4a261;
    --radius-sm: 6px;
    --radius-md: 12px;
    --radius-lg: 20px;
    --space-xs: 4px;
    --space-sm: 8px;
    --space-md: 16px;
    --space-lg: 24px;
    --space-xl: 32px;
    --font-ui: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
}

/* ===== Reset ===== */
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body {
    font-family: var(--font-ui);
    font-size: 1rem;
    background: var(--bg);
    color: var(--ink);
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
}
button { font: inherit; cursor: pointer; border: none; background: none; color: inherit; }
input, select { font: inherit; }

/* ===== Screens ===== */
.screen { display: none; min-height: 100vh; padding: var(--space-md); }
.screen.is-active { display: flex; flex-direction: column; }
.hidden { display: none !important; }

/* ===== Buttons ===== */
.btn {
    min-height: 48px;
    padding: var(--space-md) var(--space-lg);
    border-radius: var(--radius-md);
    font-weight: 600;
    font-size: 1rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.1s, background 0.2s;
}
.btn:active { transform: scale(0.97); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary {
    background: var(--primary);
    color: white;
}
.btn-primary:not(:disabled):hover { background: #e85454; }
.btn-secondary {
    background: var(--surface);
    color: var(--ink);
    border: 2px solid var(--border);
}
.btn-secondary.is-active { border-color: var(--primary); color: var(--primary); }
.btn-full { width: 100%; }
.btn-link {
    color: var(--muted);
    padding: var(--space-sm);
    font-weight: 500;
}

/* ===== Landing ===== */
#screen-landing { justify-content: center; align-items: center; }
.landing-card {
    width: 100%;
    max-width: 380px;
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    text-align: center;
}
.landing-title { font-size: 2.5rem; margin-bottom: var(--space-xs); }
.landing-sub { color: var(--muted); margin-bottom: var(--space-lg); }
.inline-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    margin-top: var(--space-md);
}
.inline-form input {
    min-height: 48px;
    padding: var(--space-md);
    border: 2px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
}
.inline-form input:focus {
    outline: none;
    border-color: var(--primary);
}

/* ===== Toasts ===== */
#toast-container {
    position: fixed;
    top: var(--space-md);
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    pointer-events: none;
}
.toast {
    background: var(--warning);
    color: white;
    padding: var(--space-md) var(--space-lg);
    border-radius: var(--radius-md);
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    font-weight: 500;
    pointer-events: auto;
    max-width: 90vw;
}
```

- [ ] **Step 2: Smoke-test in browser**

Run: `node server.js`

Open `http://localhost:3000`. You should see "Scribble Party" title with two buttons. Inline forms hidden by default.

Stop the server.

- [ ] **Step 3: Commit**

```bash
git add client/styles.css
git commit -m "feat: base stylesheet with landing screen styles"
```

---

### Task 16: Client UI module — screen switcher and landing flow

**Files:**
- Create: `client/ui.js`
- Create: `client/app.js`

- [ ] **Step 1: Create ui.js**

Write `client/ui.js`:

```js
(function () {
    const SCREEN_MAP = {
        LANDING: 'screen-landing',
        LOBBY: 'screen-lobby',
        CALLER_CHOOSING: 'screen-caller',
        ROUND_ACTIVE: 'screen-round',
        REVEAL: 'screen-reveal',
        GAME_OVER: 'screen-gallery',
    };

    function showScreen(name) {
        const id = SCREEN_MAP[name];
        if (!id) return;
        document.querySelectorAll('.screen').forEach((el) => {
            el.classList.toggle('is-active', el.id === id);
        });
    }

    function showToast(message, durationMs = 3500) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), durationMs);
    }

    // ---- Landing ----
    function initLanding() {
        document.getElementById('btn-show-create').addEventListener('click', () => {
            document.getElementById('form-create').classList.remove('hidden');
            document.getElementById('form-join').classList.add('hidden');
        });
        document.getElementById('btn-show-join').addEventListener('click', () => {
            document.getElementById('form-join').classList.remove('hidden');
            document.getElementById('form-create').classList.add('hidden');
        });
        document.getElementById('form-create').addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('input-create-name').value.trim();
            if (!name) return;
            Socket.send('create_room', { name });
        });
        document.getElementById('form-join').addEventListener('submit', (e) => {
            e.preventDefault();
            const code = document.getElementById('input-join-code').value.trim().toUpperCase();
            const name = document.getElementById('input-join-name').value.trim();
            if (!code || !name) return;
            const savedId = AppState.get().playerId;
            Socket.send('join_room', { code, name, playerId: savedId });
        });
    }

    window.UI = { showScreen, showToast, initLanding };
})();
```

- [ ] **Step 2: Create app.js wiring**

Write `client/app.js`:

```js
(function () {
    function onMessage(type, payload) {
        switch (type) {
            case 'room_created':
            case 'room_joined':
                AppState.set({ playerId: payload.playerId });
                AppState.applySnapshot(payload.state);
                UI.showScreen(payload.state.state);
                if (payload.isReconnect) UI.showToast('Reconnected');
                break;
            case 'error':
                UI.showToast(payload.message || 'Something went wrong');
                break;
            default:
                break;
        }
    }

    function init() {
        UI.initLanding();
        Socket.on('room_created', (p) => onMessage('room_created', p));
        Socket.on('room_joined', (p) => onMessage('room_joined', p));
        Socket.on('error', (p) => onMessage('error', p));
        Socket.on('__close__', () => UI.showToast('Connection lost. Reconnecting…'));
        Socket.connect();
        UI.showScreen('LANDING');
    }

    document.addEventListener('DOMContentLoaded', init);
})();
```

- [ ] **Step 3: Smoke test create and join**

Run: `node server.js` in one terminal.

Open two browser tabs to `http://localhost:3000`. In tab 1, click **Create New Room**, enter "Mom", submit. It should transition to a blank lobby screen (we haven't styled lobby yet). Server console shows "Client connected".

In tab 2, click **Join a Room**, enter the code from tab 1 (visible in server console or via `room_created` message in DevTools → Network → WS), enter "Lily". Tab 2 should also transition to a blank lobby.

Stop the server.

- [ ] **Step 4: Commit**

```bash
git add client/ui.js client/app.js
git commit -m "feat: client UI module with landing and screen switching"
```

---

## Phase E — Client screens

### Task 17: Lobby screen

**Files:**
- Modify: `client/ui.js`
- Modify: `client/app.js`
- Modify: `client/styles.css`

- [ ] **Step 1: Add lobby styles**

Append to `client/styles.css`:

```css
/* ===== App header ===== */
.app-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: var(--space-md);
}

/* ===== Lobby ===== */
.lobby-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    max-width: 480px;
    width: 100%;
    margin: 0 auto;
}
.room-code-block {
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
    text-align: center;
}
.room-code-label { font-size: 0.9rem; color: var(--muted); margin-bottom: var(--space-sm); }
.room-code {
    font-size: 3rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    color: var(--primary);
    padding: var(--space-sm);
}
.room-code-hint { font-size: 0.85rem; color: var(--muted); margin-top: var(--space-xs); }
.lobby-section-title { font-size: 1.1rem; }
.player-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
}
.player-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-md);
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius-md);
}
.player-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--muted);
}
.player-dot.is-connected { background: var(--success); }
.player-name { flex: 1; font-weight: 600; }
.player-badge { font-size: 0.9rem; color: var(--muted); }
.player-ready { font-size: 1.1rem; color: var(--success); }
.player-ready.not-ready { color: var(--muted); }
.lobby-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
}
```

- [ ] **Step 2: Add lobby rendering to ui.js**

Append inside the ui.js IIFE (before the `window.UI = ...` line):

```js
    // ---- Lobby ----
    function initLobby() {
        document.getElementById('btn-copy-code').addEventListener('click', async () => {
            const code = AppState.get().roomCode;
            if (!code) return;
            try {
                await navigator.clipboard.writeText(code);
                showToast('Copied!');
            } catch {
                showToast(`Code: ${code}`);
            }
        });
        document.getElementById('btn-ready').addEventListener('click', () => {
            const me = AppState.get().players.find((p) => p.id === AppState.get().playerId);
            if (!me) return;
            Socket.send('set_ready', { ready: !me.isReady });
        });
        document.getElementById('btn-start-game').addEventListener('click', () => {
            Socket.send('start_game', {});
        });
        document.getElementById('btn-leave-lobby').addEventListener('click', () => {
            if (!confirm('Leave the room?')) return;
            Socket.send('leave_room', {});
            AppState.reset();
            showScreen('LANDING');
        });
    }

    function renderLobby() {
        const st = AppState.get();
        const codeEl = document.getElementById('btn-copy-code');
        if (codeEl) codeEl.textContent = st.roomCode || '----';
        document.getElementById('lobby-count').textContent = `(${st.players.length}/8)`;
        const ul = document.getElementById('lobby-players');
        ul.innerHTML = '';
        for (const p of st.players) {
            const li = document.createElement('li');
            li.className = 'player-item';
            const readyIcon = p.isReady ? '✓' : '○';
            const readyClass = p.isReady ? '' : ' not-ready';
            const hostBadge = p.id === st.hostId ? '<span class="player-badge">👑 host</span>' : '';
            li.innerHTML = `
                <span class="player-dot ${p.isConnected ? 'is-connected' : ''}"></span>
                <span class="player-name">${escapeHtml(p.name)}</span>
                ${hostBadge}
                <span class="player-ready${readyClass}">${readyIcon}</span>
            `;
            ul.appendChild(li);
        }
        const me = st.players.find((p) => p.id === st.playerId);
        const btnReady = document.getElementById('btn-ready');
        if (me) {
            btnReady.textContent = me.isReady ? '✓ Ready' : "I'm Ready";
            btnReady.classList.toggle('is-active', me.isReady);
        }
        const btnStart = document.getElementById('btn-start-game');
        const isHost = st.playerId === st.hostId;
        const canStart = isHost && st.players.length >= 2;
        btnStart.style.display = isHost ? '' : 'none';
        btnStart.disabled = !canStart;
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }
```

Also update the export line at the bottom of the file to include the new functions:

```js
    window.UI = { showScreen, showToast, initLanding, initLobby, renderLobby };
```

- [ ] **Step 3: Wire lobby updates in app.js**

Replace the contents of `client/app.js`:

```js
(function () {
    function refresh() {
        const st = AppState.get();
        UI.showScreen(st.roomState);
        UI.renderLobby();
    }

    function onMessage(type, payload) {
        const st = AppState.get();
        switch (type) {
            case 'room_created':
            case 'room_joined':
                AppState.set({ playerId: payload.playerId });
                AppState.applySnapshot(payload.state);
                refresh();
                if (payload.isReconnect) UI.showToast('Reconnected');
                break;
            case 'player_joined':
                AppState.set({ players: [...st.players.filter((p) => p.id !== payload.player.id), { ...payload.player, isReady: false, isDoneVoting: false, isConnected: true }] });
                refresh();
                break;
            case 'player_left':
                AppState.set({ players: st.players.map((p) => p.id === payload.playerId ? { ...p, isConnected: false } : p) });
                refresh();
                break;
            case 'player_ready_changed':
                AppState.set({ players: st.players.map((p) => p.id === payload.playerId ? { ...p, isReady: payload.ready } : p) });
                refresh();
                break;
            case 'error':
                UI.showToast(payload.message || 'Something went wrong');
                break;
            default:
                break;
        }
    }

    function init() {
        UI.initLanding();
        UI.initLobby();
        const EVENTS = [
            'room_created', 'room_joined', 'player_joined', 'player_left',
            'player_ready_changed', 'error',
        ];
        for (const type of EVENTS) {
            Socket.on(type, (p) => onMessage(type, p));
        }
        Socket.on('__close__', () => UI.showToast('Connection lost. Reconnecting…'));
        Socket.connect();
        UI.showScreen('LANDING');
    }

    document.addEventListener('DOMContentLoaded', init);
})();
```

- [ ] **Step 4: Manual smoke test**

Run: `node server.js`

In two tabs:
1. Tab 1 creates room as "Mom" — sees lobby with her name and 👑 host badge
2. Tab 2 joins using the code as "Lily" — both tabs update to show both players
3. Tab 2 clicks I'm Ready — tab 1 sees ✓ next to Lily
4. Tab 1 clicks I'm Ready — both show both ready
5. Tab 1's Start Game button becomes enabled. Tab 2 does not have the button
6. Click Start Game — both tabs stop in "caller-choosing" (still unstyled, just blank for now)

Stop server.

- [ ] **Step 5: Commit**

```bash
git add client/ui.js client/app.js client/styles.css
git commit -m "feat: lobby screen with players, ready, and start game"
```

---

### Task 18: Caller-choosing screen

**Files:**
- Modify: `client/ui.js`
- Modify: `client/app.js`
- Modify: `client/styles.css`

- [ ] **Step 1: Add caller screen styles**

Append to `client/styles.css`:

```css
/* ===== Caller ===== */
#screen-caller { justify-content: center; align-items: center; }
.caller-card {
    max-width: 420px;
    width: 100%;
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    text-align: center;
}
.caller-card h2 { color: var(--primary); }
.caller-card input[type="text"] {
    min-height: 48px;
    padding: var(--space-md);
    border: 2px solid var(--border);
    border-radius: var(--radius-md);
    text-align: center;
    font-size: 1.1rem;
}
.caller-or { color: var(--muted); font-size: 0.9rem; }
.caller-random-row {
    display: flex;
    gap: var(--space-sm);
    align-items: center;
}
.caller-random-row select {
    flex: 1;
    min-height: 48px;
    padding: var(--space-sm) var(--space-md);
    border: 2px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
}
.random-suggestion {
    background: var(--bg);
    border: 2px dashed var(--accent);
    border-radius: var(--radius-md);
    padding: var(--space-md);
}
#random-suggestion-text { font-size: 1.4rem; font-weight: 700; margin-bottom: var(--space-sm); }
.caller-wait {
    text-align: center;
    padding: var(--space-xl);
}
.caller-wait .spinner { font-size: 3rem; margin-top: var(--space-md); }
.round-label { font-weight: 700; color: var(--primary); }
```

- [ ] **Step 2: Add caller rendering to ui.js**

Append inside the ui.js IIFE:

```js
    // ---- Caller ----
    function initCaller() {
        const promptInput = document.getElementById('input-prompt-text');
        const confirmBtn = document.getElementById('btn-confirm-prompt');
        const useBtn = document.getElementById('btn-use-suggestion');
        const randomBtn = document.getElementById('btn-random-prompt');

        promptInput.addEventListener('input', () => {
            confirmBtn.disabled = promptInput.value.trim().length === 0;
        });
        confirmBtn.addEventListener('click', () => {
            const text = promptInput.value.trim();
            if (!text) return;
            Socket.send('set_prompt', { text });
        });
        randomBtn.addEventListener('click', () => {
            const category = document.getElementById('select-category').value || undefined;
            Socket.send('request_random_prompt', { category });
        });
        useBtn.addEventListener('click', () => {
            const st = AppState.get();
            if (!st.randomSuggestion) return;
            Socket.send('set_prompt', { text: st.randomSuggestion.text });
        });
    }

    function renderCaller() {
        const st = AppState.get();
        document.getElementById('caller-round').textContent = st.currentRound || 1;
        const callerId = st.turnOrder[st.currentCallerIdx];
        const amCaller = callerId === st.playerId;
        document.getElementById('caller-view-me').classList.toggle('hidden', !amCaller);
        document.getElementById('caller-view-wait').classList.toggle('hidden', amCaller);
        if (amCaller) {
            // Populate categories if not already done
            const select = document.getElementById('select-category');
            if (select.options.length === 1 && st.categories) {
                for (const c of st.categories) {
                    const opt = document.createElement('option');
                    opt.value = c;
                    opt.textContent = c.replace(/_/g, ' ');
                    select.appendChild(opt);
                }
            }
            const sugg = st.randomSuggestion;
            const box = document.getElementById('random-suggestion');
            const text = document.getElementById('random-suggestion-text');
            if (sugg) {
                box.classList.remove('hidden');
                text.textContent = `"${sugg.text}"`;
            } else {
                box.classList.add('hidden');
            }
            document.getElementById('input-prompt-text').value = '';
            document.getElementById('btn-confirm-prompt').disabled = true;
        } else {
            const caller = st.players.find((p) => p.id === callerId);
            document.getElementById('caller-wait-name').textContent = caller ? caller.name : 'Someone';
        }
    }
```

Update the UI export line:

```js
    window.UI = { showScreen, showToast, initLanding, initLobby, renderLobby, initCaller, renderCaller };
```

- [ ] **Step 3: Update app.js for caller events**

In `client/app.js`, modify `init()` to call `UI.initCaller()` and add handlers for the caller events. Replace the `init()` function and `onMessage` switch with:

```js
    function refresh() {
        const st = AppState.get();
        UI.showScreen(st.roomState);
        if (st.roomState === 'LOBBY') UI.renderLobby();
        else if (st.roomState === 'CALLER_CHOOSING') UI.renderCaller();
    }

    function onMessage(type, payload) {
        const st = AppState.get();
        switch (type) {
            case 'room_created':
            case 'room_joined':
                AppState.set({ playerId: payload.playerId });
                AppState.applySnapshot(payload.state);
                refresh();
                if (payload.isReconnect) UI.showToast('Reconnected');
                break;
            case 'player_joined':
                AppState.set({ players: [...st.players.filter((p) => p.id !== payload.player.id), { ...payload.player, isReady: false, isDoneVoting: false, isConnected: true }] });
                refresh();
                break;
            case 'player_left':
                AppState.set({ players: st.players.map((p) => p.id === payload.playerId ? { ...p, isConnected: false } : p) });
                refresh();
                break;
            case 'player_ready_changed':
                AppState.set({ players: st.players.map((p) => p.id === payload.playerId ? { ...p, isReady: payload.ready } : p) });
                refresh();
                break;
            case 'game_started':
                AppState.set({
                    roomState: 'CALLER_CHOOSING',
                    turnOrder: payload.turnOrder,
                    currentCallerIdx: payload.currentCallerIdx,
                    currentRound: payload.currentRound,
                });
                refresh();
                break;
            case 'caller_choosing':
                AppState.set({ roomState: 'CALLER_CHOOSING', randomSuggestion: null });
                refresh();
                break;
            case 'random_prompt_suggestion':
                AppState.set({ randomSuggestion: payload });
                refresh();
                break;
            case 'error':
                UI.showToast(payload.message || 'Something went wrong');
                break;
            default:
                break;
        }
    }

    function init() {
        UI.initLanding();
        UI.initLobby();
        UI.initCaller();
        const EVENTS = [
            'room_created', 'room_joined', 'player_joined', 'player_left',
            'player_ready_changed', 'game_started', 'caller_choosing',
            'random_prompt_suggestion', 'error',
        ];
        for (const type of EVENTS) {
            Socket.on(type, (p) => onMessage(type, p));
        }
        Socket.on('__close__', () => UI.showToast('Connection lost. Reconnecting…'));
        Socket.connect();
        UI.showScreen('LANDING');
    }
```

- [ ] **Step 4: Add categories endpoint to server**

We need to expose categories so the caller screen can populate the dropdown. Add this to `server.js` after the static-file line:

```js
app.get('/categories', (req, res) => res.json({ categories: getCategories() }));
```

And add this to the client state init. Append to `init()` in `client/app.js` (before `Socket.connect()`):

```js
        fetch('/categories').then((r) => r.json()).then((data) => {
            AppState.set({ categories: data.categories });
        });
```

- [ ] **Step 5: Manual smoke test**

Run: `node server.js`

In two tabs, create room + join, both ready, host starts game. Tab 1 (host, who is also the first caller) should show the prompt picker. Tab 2 should show "Mom is picking a prompt..." waiting view. Type "fish tail" in tab 1 and click Confirm — no screen transition yet because we haven't built the drawing screen. Server console should log no errors.

Stop server.

- [ ] **Step 6: Commit**

```bash
git add server.js client/ui.js client/app.js client/styles.css
git commit -m "feat: caller-choosing screen with random prompt requests"
```

---

## Phase F — Drawing engine

### Task 19: Canvas setup and pointer capture

**Files:**
- Create: `client/drawing.js`

- [ ] **Step 1: Create drawing.js scaffold**

Write `client/drawing.js`:

```js
(function () {
    const COLORS = ['#1a1a2e', '#e63946', '#3d85c6', '#52b788', '#f4a261', '#9d4edd'];
    const SIZES = [3, 6, 10];

    let canvas = null;
    let ctx = null;
    let cssWidth = 0;
    let cssHeight = 0;
    let currentTool = 'pen';
    let currentColor = COLORS[0];
    let currentSize = SIZES[1];
    let currentRound = 1;
    // playerStrokes for the local player. Server holds the canonical copy.
    let strokes = [];
    let currentStroke = null;
    let listeners = { onStrokeChange: () => {} };

    function init(canvasEl) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        canvas.style.touchAction = 'none';
        resize();
        attachListeners();
        window.addEventListener('resize', resize);
    }

    function resize() {
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        cssWidth = rect.width;
        cssHeight = rect.height;
        const ratio = window.devicePixelRatio || 1;
        canvas.width = cssWidth * ratio;
        canvas.height = cssHeight * ratio;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        rerender();
    }

    function attachListeners() {
        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointercancel', onPointerUp);
        canvas.addEventListener('pointerleave', onPointerUp);
    }

    function normalizedPoint(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / rect.width,
            y: (e.clientY - rect.top) / rect.height,
        };
    }

    function onPointerDown(e) {
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        const point = normalizedPoint(e);
        if (currentTool === 'eraser') {
            eraseAt(point);
            currentStroke = { _eraser: true };
            return;
        }
        currentStroke = {
            round: currentRound,
            tool: 'pen',
            color: currentColor,
            size: currentSize,
            points: [point],
        };
        drawPoint(point);
    }

    function onPointerMove(e) {
        if (!currentStroke) return;
        const point = normalizedPoint(e);
        if (currentStroke._eraser) {
            eraseAt(point);
            return;
        }
        const last = currentStroke.points[currentStroke.points.length - 1];
        const dx = (point.x - last.x) * cssWidth;
        const dy = (point.y - last.y) * cssHeight;
        if (Math.hypot(dx, dy) < 2) return; // 2px decimation
        currentStroke.points.push(point);
        drawSegment(last, point);
    }

    function onPointerUp() {
        if (!currentStroke) return;
        if (!currentStroke._eraser && currentStroke.points.length > 0) {
            strokes.push(currentStroke);
            listeners.onStrokeChange(strokes);
        }
        currentStroke = null;
    }

    function drawPoint(p) {
        ctx.fillStyle = currentColor;
        ctx.beginPath();
        ctx.arc(p.x * cssWidth, p.y * cssHeight, currentSize / 2, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawSegment(a, b) {
        ctx.strokeStyle = currentStroke.color;
        ctx.lineWidth = currentStroke.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x * cssWidth, a.y * cssHeight);
        ctx.lineTo(b.x * cssWidth, b.y * cssHeight);
        ctx.stroke();
    }

    // ----- rendering API used by other modules -----

    function setTool(tool) { currentTool = tool; }
    function setColor(color) { currentColor = color; }
    function setSize(size) { currentSize = size; }
    function setRound(round) { currentRound = round; }
    function setStrokes(newStrokes) {
        strokes = newStrokes.slice();
        rerender();
    }
    function getStrokes() { return strokes.slice(); }
    function clearCurrentRound() {
        strokes = strokes.filter((s) => s.round !== currentRound);
        rerender();
    }
    function onChange(cb) { listeners.onStrokeChange = cb; }

    function rerender() {
        if (!ctx) return;
        ctx.clearRect(0, 0, cssWidth, cssHeight);
        for (const stroke of strokes) {
            renderStroke(stroke);
        }
    }

    function renderStroke(stroke) {
        if (!stroke.points || stroke.points.length === 0) return;
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        const p = stroke.points;
        ctx.moveTo(p[0].x * cssWidth, p[0].y * cssHeight);
        if (p.length === 1) {
            ctx.lineTo(p[0].x * cssWidth + 0.1, p[0].y * cssHeight + 0.1);
        } else {
            for (let i = 1; i < p.length - 1; i++) {
                const midX = (p[i].x + p[i + 1].x) / 2 * cssWidth;
                const midY = (p[i].y + p[i + 1].y) / 2 * cssHeight;
                ctx.quadraticCurveTo(p[i].x * cssWidth, p[i].y * cssHeight, midX, midY);
            }
            const lastP = p[p.length - 1];
            ctx.lineTo(lastP.x * cssWidth, lastP.y * cssHeight);
        }
        ctx.stroke();
    }

    function eraseAt(point) {
        const hitRadius = (currentSize * 2) / cssWidth;
        const before = strokes.length;
        strokes = strokes.filter((s) => {
            if (s.round !== currentRound) return true;
            return !strokeIntersectsPoint(s, point, hitRadius);
        });
        if (strokes.length !== before) {
            rerender();
            listeners.onStrokeChange(strokes);
        }
    }

    function strokeIntersectsPoint(stroke, point, radius) {
        const r2 = radius * radius;
        const pts = stroke.points;
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            const dx = p.x - point.x;
            const dy = p.y - point.y;
            if (dx * dx + dy * dy < r2) return true;
            if (i > 0) {
                const q = pts[i - 1];
                const d = distSegSq(point, q, p);
                if (d < r2) return true;
            }
        }
        return false;
    }

    function distSegSq(p, a, b) {
        const ax = b.x - a.x;
        const ay = b.y - a.y;
        const px = p.x - a.x;
        const py = p.y - a.y;
        const len2 = ax * ax + ay * ay;
        if (len2 === 0) return px * px + py * py;
        let t = (px * ax + py * ay) / len2;
        t = Math.max(0, Math.min(1, t));
        const dx = px - t * ax;
        const dy = py - t * ay;
        return dx * dx + dy * dy;
    }

    // Replay strokes with animation on a given canvas element.
    // Returns a promise that resolves when done.
    function replayOn(targetCanvas, replayStrokes, baseStrokes) {
        return new Promise((resolve) => {
            const targetCtx = targetCanvas.getContext('2d');
            const rect = targetCanvas.getBoundingClientRect();
            const w = rect.width;
            const h = rect.height;
            const ratio = window.devicePixelRatio || 1;
            targetCanvas.width = w * ratio;
            targetCanvas.height = h * ratio;
            targetCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
            targetCtx.clearRect(0, 0, w, h);
            // Draw base (previous rounds) instantly
            for (const s of baseStrokes) drawStrokeOn(targetCtx, s, w, h);
            // Animate replay strokes
            let si = 0, pi = 0;
            function step() {
                if (si >= replayStrokes.length) return resolve();
                const stroke = replayStrokes[si];
                if (pi >= stroke.points.length - 1) {
                    si++;
                    pi = 0;
                    requestAnimationFrame(step);
                    return;
                }
                // Draw a few segments per frame for speed
                for (let k = 0; k < 3 && pi < stroke.points.length - 1; k++) {
                    drawSegmentOn(targetCtx, stroke, pi, w, h);
                    pi++;
                }
                requestAnimationFrame(step);
            }
            step();
        });
    }

    function drawStrokeOn(targetCtx, stroke, w, h) {
        if (!stroke.points || stroke.points.length === 0) return;
        targetCtx.strokeStyle = stroke.color;
        targetCtx.lineWidth = stroke.size;
        targetCtx.lineCap = 'round';
        targetCtx.lineJoin = 'round';
        targetCtx.beginPath();
        const p = stroke.points;
        targetCtx.moveTo(p[0].x * w, p[0].y * h);
        if (p.length === 1) {
            targetCtx.lineTo(p[0].x * w + 0.1, p[0].y * h + 0.1);
        } else {
            for (let i = 1; i < p.length - 1; i++) {
                const midX = (p[i].x + p[i + 1].x) / 2 * w;
                const midY = (p[i].y + p[i + 1].y) / 2 * h;
                targetCtx.quadraticCurveTo(p[i].x * w, p[i].y * h, midX, midY);
            }
            const lastP = p[p.length - 1];
            targetCtx.lineTo(lastP.x * w, lastP.y * h);
        }
        targetCtx.stroke();
    }

    function drawSegmentOn(targetCtx, stroke, i, w, h) {
        const a = stroke.points[i];
        const b = stroke.points[i + 1];
        targetCtx.strokeStyle = stroke.color;
        targetCtx.lineWidth = stroke.size;
        targetCtx.lineCap = 'round';
        targetCtx.lineJoin = 'round';
        targetCtx.beginPath();
        targetCtx.moveTo(a.x * w, a.y * h);
        targetCtx.lineTo(b.x * w, b.y * h);
        targetCtx.stroke();
    }

    window.Drawing = {
        COLORS, SIZES, init, resize, setTool, setColor, setSize, setRound,
        setStrokes, getStrokes, clearCurrentRound, onChange, rerender,
        replayOn, drawStrokeOn,
    };
})();
```

- [ ] **Step 2: Commit**

```bash
git add client/drawing.js
git commit -m "feat: canvas drawing engine with pointer, eraser, and replay"
```

---

### Task 20: Round screen with toolbar, timer, and submit

**Files:**
- Modify: `client/ui.js`
- Modify: `client/app.js`
- Modify: `client/styles.css`

- [ ] **Step 1: Add round screen styles**

Append to `client/styles.css`:

```css
/* ===== Round (drawing) ===== */
#screen-round { padding: var(--space-sm); gap: var(--space-sm); }
.round-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-xs) var(--space-sm);
}
.round-timer {
    font-size: 1.5rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
}
.round-timer.is-warning { color: var(--warning); }
.round-timer.is-critical { color: var(--primary); animation: pulse 0.6s infinite; }
@keyframes pulse { 50% { opacity: 0.4; } }
.round-prompt {
    text-align: center;
    font-size: 1.8rem;
    font-weight: 700;
    padding: var(--space-sm);
    background: var(--surface);
    border-radius: var(--radius-md);
}
.canvas-wrap {
    flex: 1;
    min-height: 0;
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius-md);
    overflow: hidden;
    position: relative;
}
#draw-canvas {
    width: 100%;
    height: 100%;
    display: block;
}
.toolbar {
    display: flex;
    gap: var(--space-sm);
    align-items: center;
    padding: var(--space-xs);
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius-md);
    flex-wrap: wrap;
    justify-content: center;
}
.toolbar-group {
    display: flex;
    gap: var(--space-xs);
    align-items: center;
}
.toolbar-group + .toolbar-group {
    border-left: 1px solid var(--border);
    padding-left: var(--space-sm);
}
.tool-btn, .size-btn, .color-swatch {
    width: 44px;
    height: 44px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid transparent;
}
.tool-btn { font-size: 1.3rem; background: var(--bg); }
.tool-btn.is-active { border-color: var(--primary); background: white; }
.color-swatch.is-active { border-color: var(--ink); transform: scale(1.08); }
.size-dot { background: var(--ink); border-radius: 50%; display: block; }
.size-dot.small  { width: 6px;  height: 6px; }
.size-dot.medium { width: 12px; height: 12px; }
.size-dot.large  { width: 18px; height: 18px; }
.size-btn.is-active { border-color: var(--primary); }

.mini-status {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    justify-content: center;
    font-size: 0.85rem;
    color: var(--muted);
}
.mini-status .mini-player.submitted { color: var(--success); font-weight: 700; }
```

- [ ] **Step 2: Add round rendering to ui.js**

Append inside the ui.js IIFE:

```js
    // ---- Round (drawing) ----
    let timerInterval = null;
    let wakeLock = null;

    function initRound() {
        // Color swatches
        const swatchHolder = document.getElementById('color-swatches');
        for (const color of Drawing.COLORS) {
            const btn = document.createElement('button');
            btn.className = 'color-swatch';
            btn.dataset.color = color;
            btn.style.background = color;
            btn.setAttribute('aria-label', `Color ${color}`);
            if (color === Drawing.COLORS[0]) btn.classList.add('is-active');
            btn.addEventListener('click', () => {
                Drawing.setColor(color);
                document.querySelectorAll('.color-swatch').forEach((el) => {
                    el.classList.toggle('is-active', el.dataset.color === color);
                });
            });
            swatchHolder.appendChild(btn);
        }
        // Tool buttons
        document.querySelectorAll('.tool-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const tool = btn.dataset.tool;
                Drawing.setTool(tool);
                document.querySelectorAll('.tool-btn').forEach((b) => {
                    b.classList.toggle('is-active', b === btn);
                });
            });
        });
        // Size buttons
        document.querySelectorAll('.size-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const size = parseInt(btn.dataset.size, 10);
                Drawing.setSize(size);
                document.querySelectorAll('.size-btn').forEach((b) => {
                    b.classList.toggle('is-active', b === btn);
                });
            });
        });
        // Submit button
        document.getElementById('btn-submit-round').addEventListener('click', () => {
            const strokes = Drawing.getStrokes();
            Socket.send('submit_round', { strokes });
            document.getElementById('btn-submit-round').disabled = true;
        });
        // Canvas init
        Drawing.init(document.getElementById('draw-canvas'));
    }

    async function enterRound() {
        const st = AppState.get();
        document.getElementById('round-number').textContent = st.currentRound;
        document.getElementById('round-prompt').textContent = `"${st.currentPrompt}"`;
        Drawing.setRound(st.currentRound);
        // Load cumulative strokes for me from state
        const myStrokes = (st.playerStrokes[st.playerId] || []).slice();
        Drawing.setStrokes(myStrokes);
        document.getElementById('btn-submit-round').disabled = false;
        // Force a canvas resize after the layout settles
        setTimeout(() => Drawing.resize(), 50);
        // Start timer
        startTimer(st.roundEndsAt);
        // Wake lock
        try {
            if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
        } catch { /* ignore */ }
        renderMiniStatus();
    }

    function leaveRound() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        if (wakeLock && wakeLock.release) {
            wakeLock.release().catch(() => {});
            wakeLock = null;
        }
    }

    function startTimer(endsAt) {
        const el = document.getElementById('round-timer');
        if (timerInterval) clearInterval(timerInterval);
        function tick() {
            const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
            const m = Math.floor(remaining / 60);
            const s = remaining % 60;
            el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
            el.classList.toggle('is-warning', remaining <= 10 && remaining > 5);
            el.classList.toggle('is-critical', remaining <= 5);
            if (remaining === 0 && timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
        }
        tick();
        timerInterval = setInterval(tick, 250);
    }

    function renderMiniStatus() {
        const st = AppState.get();
        const holder = document.getElementById('mini-status');
        holder.innerHTML = '';
        for (const p of st.players) {
            const span = document.createElement('span');
            span.className = 'mini-player';
            if (st.submitted && st.submitted.has(p.id)) span.classList.add('submitted');
            span.textContent = `${p.name}${st.submitted && st.submitted.has(p.id) ? ' ✓' : ''}`;
            holder.appendChild(span);
        }
    }
```

Update the UI export to include the new functions:

```js
    window.UI = {
        showScreen, showToast, initLanding, initLobby, renderLobby,
        initCaller, renderCaller, initRound, enterRound, leaveRound, renderMiniStatus,
    };
```

- [ ] **Step 3: Wire round state in app.js**

Update the `onMessage` function in `client/app.js` to handle `round_started`, `player_submitted`, and to call `enterRound`/`leaveRound` on transitions. Replace the full `onMessage`:

```js
    function onMessage(type, payload) {
        const st = AppState.get();
        switch (type) {
            case 'room_created':
            case 'room_joined':
                AppState.set({ playerId: payload.playerId });
                AppState.applySnapshot(payload.state);
                refresh();
                if (payload.isReconnect) UI.showToast('Reconnected');
                break;
            case 'player_joined':
                AppState.set({ players: [...st.players.filter((p) => p.id !== payload.player.id), { ...payload.player, isReady: false, isDoneVoting: false, isConnected: true }] });
                refresh();
                break;
            case 'player_left':
                AppState.set({ players: st.players.map((p) => p.id === payload.playerId ? { ...p, isConnected: false } : p) });
                refresh();
                break;
            case 'player_ready_changed':
                AppState.set({ players: st.players.map((p) => p.id === payload.playerId ? { ...p, isReady: payload.ready } : p) });
                refresh();
                break;
            case 'game_started':
                AppState.set({
                    roomState: 'CALLER_CHOOSING',
                    turnOrder: payload.turnOrder,
                    currentCallerIdx: payload.currentCallerIdx,
                    currentRound: payload.currentRound,
                });
                refresh();
                break;
            case 'caller_choosing':
                AppState.set({ roomState: 'CALLER_CHOOSING', randomSuggestion: null });
                refresh();
                break;
            case 'random_prompt_suggestion':
                AppState.set({ randomSuggestion: payload });
                refresh();
                break;
            case 'round_started':
                AppState.set({
                    roomState: 'ROUND_ACTIVE',
                    currentRound: payload.round,
                    currentPrompt: payload.prompt,
                    roundEndsAt: payload.endsAt,
                    submitted: new Set(),
                });
                UI.showScreen('ROUND_ACTIVE');
                UI.enterRound();
                break;
            case 'player_submitted': {
                const s = st.submitted || new Set();
                s.add(payload.playerId);
                AppState.set({ submitted: s });
                UI.renderMiniStatus();
                break;
            }
            case 'error':
                UI.showToast(payload.message || 'Something went wrong');
                break;
            default:
                break;
        }
    }
```

Also update `init()` to call `UI.initRound()` and register the new events:

```js
    function init() {
        UI.initLanding();
        UI.initLobby();
        UI.initCaller();
        UI.initRound();
        const EVENTS = [
            'room_created', 'room_joined', 'player_joined', 'player_left',
            'player_ready_changed', 'game_started', 'caller_choosing',
            'random_prompt_suggestion', 'round_started', 'player_submitted',
            'error',
        ];
        for (const type of EVENTS) {
            Socket.on(type, (p) => onMessage(type, p));
        }
        Socket.on('__close__', () => UI.showToast('Connection lost. Reconnecting…'));
        fetch('/categories').then((r) => r.json()).then((data) => {
            AppState.set({ categories: data.categories });
        });
        Socket.connect();
        UI.showScreen('LANDING');
    }
```

- [ ] **Step 4: Manual smoke test**

Run: `node server.js`

In two tabs create+join, ready both, start game. Tab 1 (host = first caller) types "fish tail" and confirms. Both tabs transition to the drawing screen with the timer ticking down. Draw on both canvases. Click Submit on both. (Reveal screen won't look right yet.) Server console should show all messages flowing.

Stop server.

- [ ] **Step 5: Commit**

```bash
git add client/ui.js client/app.js client/styles.css
git commit -m "feat: drawing round screen with timer, toolbar, and submit"
```

---

### Task 21: Reveal screen with replay animation and reactions

**Files:**
- Modify: `client/ui.js`
- Modify: `client/app.js`
- Modify: `client/styles.css`

- [ ] **Step 1: Add reveal styles**

Append to `client/styles.css`:

```css
/* ===== Reveal ===== */
.reveal-title { font-weight: 700; font-size: 1.2rem; }
.reveal-prompt { color: var(--primary); font-weight: 700; margin-top: var(--space-xs); }
.reveal-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-sm);
    flex: 1;
    min-height: 0;
    padding: var(--space-sm) 0;
}
.reveal-cell {
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius-md);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
}
.reveal-cell-name {
    font-size: 0.85rem;
    font-weight: 600;
    padding: var(--space-xs) var(--space-sm);
    background: var(--bg);
    border-bottom: 1px solid var(--border);
}
.reveal-cell canvas {
    flex: 1;
    width: 100%;
    display: block;
}
.reveal-reactions {
    position: absolute;
    bottom: var(--space-sm);
    left: var(--space-sm);
    display: flex;
    gap: 2px;
    flex-wrap: wrap;
    max-width: 80%;
    pointer-events: none;
}
.reaction-bar {
    display: flex;
    justify-content: center;
    gap: var(--space-sm);
    padding: var(--space-sm);
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius-md);
}
.emoji-btn {
    width: 48px;
    height: 48px;
    font-size: 1.5rem;
    border-radius: var(--radius-sm);
    background: var(--bg);
}
.reveal-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    margin-top: var(--space-sm);
}
.done-block { text-align: center; }
.btn-done.is-done {
    background: var(--success);
    color: white;
    border-color: var(--success);
}
.done-helper { color: var(--muted); font-size: 0.8rem; margin-top: var(--space-xs); }
.reaction-fly {
    position: absolute;
    font-size: 1.5rem;
    pointer-events: none;
    animation: fly 1.2s ease-out forwards;
}
@keyframes fly {
    0% { opacity: 0; transform: translate(0, 20px) scale(0.6); }
    20% { opacity: 1; transform: translate(0, 0) scale(1.2); }
    100% { opacity: 0; transform: translate(0, -40px) scale(1); }
}
```

- [ ] **Step 2: Add reveal rendering to ui.js**

Append inside the ui.js IIFE:

```js
    // ---- Reveal ----
    let selectedReactionTarget = null;

    function initReveal() {
        document.querySelectorAll('.emoji-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const emoji = btn.dataset.emoji;
                if (!selectedReactionTarget) {
                    showToast('Tap a drawing first, then pick an emoji');
                    return;
                }
                Socket.send('send_reaction', {
                    targetPlayerId: selectedReactionTarget,
                    emoji,
                });
            });
        });
        document.getElementById('btn-next-round').addEventListener('click', () => {
            Socket.send('next_round', {});
        });
        document.getElementById('btn-toggle-done').addEventListener('click', handleDoneToggle);
    }

    function handleDoneToggle() {
        const st = AppState.get();
        const me = st.players.find((p) => p.id === st.playerId);
        if (!me) return;
        const nextDone = !me.isDoneVoting;
        if (nextDone && !st.haveSeenDoneHelper) {
            AppState.set({ haveSeenDoneHelper: true });
        }
        Socket.send('toggle_done_voting', { done: nextDone });
    }

    async function enterReveal(revealPayload) {
        const st = AppState.get();
        document.getElementById('reveal-round').textContent = revealPayload.round;
        document.getElementById('reveal-prompt').textContent = `"${revealPayload.prompt}"`;
        const grid = document.getElementById('reveal-grid');
        grid.innerHTML = '';
        selectedReactionTarget = null;

        const cells = [];
        for (const p of st.players) {
            const cell = document.createElement('div');
            cell.className = 'reveal-cell';
            cell.dataset.playerId = p.id;
            const name = document.createElement('div');
            name.className = 'reveal-cell-name';
            name.textContent = p.name;
            const canvas = document.createElement('canvas');
            const reactionsHolder = document.createElement('div');
            reactionsHolder.className = 'reveal-reactions';
            reactionsHolder.dataset.playerId = p.id;
            cell.appendChild(name);
            cell.appendChild(canvas);
            cell.appendChild(reactionsHolder);
            cell.addEventListener('click', () => {
                selectedReactionTarget = p.id;
                document.querySelectorAll('.reveal-cell').forEach((c) => {
                    c.style.outline = c === cell ? `3px solid var(--accent)` : 'none';
                });
            });
            grid.appendChild(cell);
            cells.push({ canvas, playerId: p.id });
        }

        // Wait one frame so cells have layout
        await new Promise((r) => requestAnimationFrame(r));
        // Replay strokes on each cell
        await Promise.all(cells.map(({ canvas, playerId }) => {
            const base = (st.playerStrokes[playerId] || []).filter((s) => s.round < revealPayload.round);
            const replay = revealPayload.playerStrokesThisRound[playerId] || [];
            return Drawing.replayOn(canvas, replay, base);
        }));

        // Merge new strokes into AppState.playerStrokes.
        // For self, pull directly from Drawing (source of truth for our own canvas)
        // to avoid duplicating strokes we already have locally.
        const updated = { ...st.playerStrokes };
        for (const [pid, newStrokes] of Object.entries(revealPayload.playerStrokesThisRound)) {
            if (pid === st.playerId) {
                updated[pid] = Drawing.getStrokes();
            } else {
                updated[pid] = (updated[pid] || []).concat(newStrokes);
            }
        }
        AppState.set({ playerStrokes: updated, roomState: 'REVEAL' });
        renderDoneButton();
    }

    function showReactionOn(playerId, emoji) {
        const holder = document.querySelector(`.reveal-reactions[data-player-id="${playerId}"]`);
        if (!holder) return;
        const el = document.createElement('div');
        el.className = 'reaction-fly';
        el.textContent = emoji;
        const cell = holder.parentElement;
        const rect = cell.getBoundingClientRect();
        el.style.left = `${Math.random() * (rect.width - 40)}px`;
        el.style.bottom = '0';
        el.style.position = 'absolute';
        cell.appendChild(el);
        setTimeout(() => el.remove(), 1200);
    }

    function renderDoneButton() {
        const st = AppState.get();
        const me = st.players.find((p) => p.id === st.playerId);
        if (!me) return;
        const btn = document.getElementById('btn-toggle-done');
        const helper = document.getElementById('done-helper');
        const doneCount = st.players.filter((p) => p.isDoneVoting).length;
        const needed = st.players.length - doneCount;
        if (me.isDoneVoting) {
            btn.classList.add('is-done');
            btn.innerHTML = `✓ You're done`;
            helper.textContent = needed > 0 ? `Waiting for ${needed} more` : 'All done!';
        } else {
            btn.classList.remove('is-done');
            btn.innerHTML = `🏁 I'm done <span class="done-state">○</span>`;
            helper.textContent = 'Game ends when everyone taps this';
        }
    }
```

Update the UI export:

```js
    window.UI = {
        showScreen, showToast, initLanding, initLobby, renderLobby,
        initCaller, renderCaller, initRound, enterRound, leaveRound, renderMiniStatus,
        initReveal, enterReveal, showReactionOn, renderDoneButton,
    };
```

- [ ] **Step 3: Handle reveal messages in app.js**

Add to the `onMessage` switch in `client/app.js`:

```js
            case 'round_revealed':
                UI.leaveRound();
                UI.showScreen('REVEAL');
                UI.enterReveal(payload);
                break;
            case 'reaction_received':
                UI.showReactionOn(payload.targetPlayerId, payload.emoji);
                break;
            case 'done_vote_changed': {
                const updatedPlayers = st.players.map((p) =>
                    p.id === payload.playerId ? { ...p, isDoneVoting: payload.done } : p
                );
                AppState.set({ players: updatedPlayers });
                UI.renderDoneButton();
                break;
            }
```

Update the `init()` function to call `UI.initReveal()` and add the new events to the subscription list:

```js
    function init() {
        UI.initLanding();
        UI.initLobby();
        UI.initCaller();
        UI.initRound();
        UI.initReveal();
        const EVENTS = [
            'room_created', 'room_joined', 'player_joined', 'player_left',
            'player_ready_changed', 'game_started', 'caller_choosing',
            'random_prompt_suggestion', 'round_started', 'player_submitted',
            'round_revealed', 'reaction_received', 'done_vote_changed',
            'error',
        ];
        for (const type of EVENTS) {
            Socket.on(type, (p) => onMessage(type, p));
        }
        Socket.on('__close__', () => UI.showToast('Connection lost. Reconnecting…'));
        fetch('/categories').then((r) => r.json()).then((data) => {
            AppState.set({ categories: data.categories });
        });
        Socket.connect();
        UI.showScreen('LANDING');
    }
```

- [ ] **Step 4: Manual smoke test**

Run: `node server.js`

In two tabs, play through a round. After both submit, the reveal screen should show both canvases with the stroke replay animation. Tap a drawing (outline turns teal), then tap an emoji — the emoji should appear flying up on both tabs. Click Next Round — should return to caller-choosing with rotated caller.

Stop server.

- [ ] **Step 5: Commit**

```bash
git add client/ui.js client/app.js client/styles.css
git commit -m "feat: reveal screen with stroke replay, reactions, and done toggle"
```

---

### Task 22: Gallery screen and game-over handling

**Files:**
- Modify: `client/ui.js`
- Modify: `client/app.js`
- Modify: `client/styles.css`

- [ ] **Step 1: Add gallery styles**

Append to `client/styles.css`:

```css
/* ===== Gallery ===== */
#screen-gallery { overflow-y: auto; }
.prompt-history {
    padding: var(--space-md);
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-md);
}
.prompt-history-label {
    font-size: 0.85rem;
    color: var(--muted);
    margin-bottom: var(--space-xs);
}
#prompt-history-list {
    font-weight: 600;
    line-height: 1.5;
}
.gallery-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
}
.gallery-card {
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
}
.gallery-card-name {
    padding: var(--space-sm) var(--space-md);
    font-weight: 700;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
}
.gallery-card canvas {
    display: block;
    width: 100%;
    aspect-ratio: 3 / 4;
    background: white;
}
.gallery-actions {
    display: flex;
    gap: var(--space-sm);
    margin-top: var(--space-lg);
    padding-bottom: var(--space-lg);
}
.gallery-actions .btn { flex: 1; }
```

- [ ] **Step 2: Add gallery rendering to ui.js**

Append inside the ui.js IIFE:

```js
    // ---- Gallery ----
    function initGallery() {
        document.getElementById('btn-new-game').addEventListener('click', () => {
            Socket.send('new_game', {});
        });
        document.getElementById('btn-leave-gallery').addEventListener('click', () => {
            Socket.send('leave_room', {});
            AppState.reset();
            showScreen('LANDING');
        });
    }

    function enterGallery(payload) {
        const st = AppState.get();
        // Prompt history
        const historyHolder = document.getElementById('prompt-history-list');
        historyHolder.textContent = payload.promptHistory
            .map((p) => `"${p.prompt}"`)
            .join(' → ');
        // Drawings
        const list = document.getElementById('gallery-list');
        list.innerHTML = '';
        const cells = [];
        for (const p of st.players) {
            const card = document.createElement('div');
            card.className = 'gallery-card';
            const nameEl = document.createElement('div');
            nameEl.className = 'gallery-card-name';
            nameEl.textContent = p.name;
            const canvas = document.createElement('canvas');
            card.appendChild(nameEl);
            card.appendChild(canvas);
            list.appendChild(card);
            cells.push({ canvas, playerId: p.id });
        }
        // Wait for layout
        requestAnimationFrame(() => {
            for (const { canvas, playerId } of cells) {
                const strokes = payload.finalGallery[playerId] || [];
                renderFullGallery(canvas, strokes);
            }
        });
    }

    function renderFullGallery(canvas, strokes) {
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;
        const ratio = window.devicePixelRatio || 1;
        canvas.width = w * ratio;
        canvas.height = h * ratio;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, w, h);
        for (const s of strokes) {
            Drawing.drawStrokeOn(ctx, s, w, h);
        }
    }
```

Update the UI export:

```js
    window.UI = {
        showScreen, showToast, initLanding, initLobby, renderLobby,
        initCaller, renderCaller, initRound, enterRound, leaveRound, renderMiniStatus,
        initReveal, enterReveal, showReactionOn, renderDoneButton,
        initGallery, enterGallery,
    };
```

- [ ] **Step 3: Handle game_ended and new_game_started in app.js**

Add to `onMessage`:

```js
            case 'game_ended':
                AppState.set({ roomState: 'GAME_OVER' });
                UI.showScreen('GAME_OVER');
                UI.enterGallery(payload);
                break;
            case 'new_game_started':
                AppState.applySnapshot(payload.state);
                refresh();
                break;
```

Add `UI.initGallery()` to `init()`:

```js
        UI.initGallery();
```

And add `'game_ended'` and `'new_game_started'` to the EVENTS array.

- [ ] **Step 4: Manual smoke test**

Run: `node server.js`

Play a full game: lobby → start → round 1 → reveal → next round → round 2 → reveal → both toggle "I'm done" → gallery appears with both players' cumulative drawings and the prompt history. Click New Game — returns to lobby.

Stop server.

- [ ] **Step 5: Commit**

```bash
git add client/ui.js client/app.js client/styles.css
git commit -m "feat: gallery screen and new game transition"
```

---

## Phase G — Deployment

### Task 23: Update refresh logic and full manual smoke test

**Files:**
- Modify: `client/app.js`

- [ ] **Step 1: Make sure refresh handles all states**

Replace the `refresh()` function in `client/app.js`:

```js
    function refresh() {
        const st = AppState.get();
        UI.showScreen(st.roomState);
        if (st.roomState === 'LOBBY') UI.renderLobby();
        else if (st.roomState === 'CALLER_CHOOSING') UI.renderCaller();
    }
```

This is already correct; the other screens are driven by explicit `enter*` calls on transition events.

- [ ] **Step 2: Run the full smoke-test checklist from the spec**

Run: `node server.js`

Open two browser windows side by side. Walk through:

1. Tab 1 creates room as "Mom" — code shown, lobby appears
2. Tab 2 joins with the code as "Lily" — both lobbies show both players
3. Tab 1 and 2 tap Ready — both show ✓
4. Tab 1 clicks Start Game — both transition to caller choosing
5. Tab 1 (caller) types "fish tail", clicks Confirm — both go to drawing with 90s timer
6. Both draw something, both hit Submit — both transition to reveal with replay
7. Tap Lily's drawing on tab 1, tap 🎉 — emoji flies on both tabs
8. Tab 1 clicks Next Round — tab 2 becomes caller (was caller_choosing)
9. Tab 2 types "lightning bolt", confirms — both draw again, this round's strokes accumulate on top of round 1
10. Both submit, reveal shows full cumulative drawings
11. Both tap "I'm done" — game ends, gallery appears with both cumulative drawings and prompt history
12. Tab 1 clicks New Game — both return to lobby

Verify no errors in either browser's DevTools console or the server terminal.

Stop server.

- [ ] **Step 3: Commit any stray fixes**

If you found bugs during smoke testing, fix them and commit. Otherwise:

```bash
git commit --allow-empty -m "test: full smoke test passes"
```

---

### Task 24: Deployment preparation

**Files:**
- Modify: `package.json`
- Create: `README.md`

- [ ] **Step 1: Verify package.json has correct start script and engines**

Ensure `package.json` contains:

```json
{
  "name": "scribble-party",
  "version": "1.0.0",
  "description": "Real-time multiplayer collaborative drawing game",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "test": "node --test test/"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "express": "^5.0.0",
    "ws": "^8.18.0"
  }
}
```

- [ ] **Step 2: Create a minimal README**

Write `README.md`:

```markdown
# Scribble Party

Real-time multiplayer collaborative drawing game for 2–8 players. Built with Express, `ws`, and vanilla JS Canvas. Deployed to Render.

## Running locally

```bash
npm install
npm start
```

Open <http://localhost:3000>.

## Running tests

```bash
npm test
```

## Deployment

See `docs/superpowers/specs/2026-04-08-scribble-party-design.md` section 11 for Render deployment steps.
```

- [ ] **Step 3: Commit**

```bash
git add package.json README.md
git commit -m "chore: README and deployment-ready package.json"
```

---

### Task 25: Deploy to Render

**Files:** none

- [ ] **Step 1: Create a GitHub repository**

Create a new repo on GitHub (e.g. `scribble-party`), then:

```bash
git remote add origin https://github.com/<your-username>/scribble-party.git
git branch -M main
git push -u origin main
```

- [ ] **Step 2: Create a Render Web Service**

1. Go to <https://dashboard.render.com/>
2. Click **New +** → **Web Service**
3. Connect the GitHub repo
4. Settings:
   - **Name:** `scribble-party`
   - **Region:** closest to you
   - **Branch:** `main`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free
5. Click **Create Web Service**

Wait for the first deploy to complete. Render will give you a URL like `https://scribble-party.onrender.com`.

- [ ] **Step 3: Smoke-test the deployed app**

Open `https://scribble-party.onrender.com` in two browser windows (or two phones). Play a full game end-to-end as in Task 23 step 2.

If the first connection takes 20–30 seconds to wake up, that's the free-tier cold start — expected.

- [ ] **Step 4: Commit any final tweaks**

If you needed any changes (e.g. a PORT variable tweak), commit and push them:

```bash
git add .
git commit -m "fix: deployment adjustments"
git push
```

---

### Task 26: Postman WebSocket test collection

**Files:** (stored in Postman, not in repo)

- [ ] **Step 1: Create a new WebSocket request in Postman**

1. Open Postman
2. Click **New** → **WebSocket Request**
3. Enter URL: `wss://scribble-party.onrender.com` (or `ws://localhost:3000` for local)
4. Click **Connect**

- [ ] **Step 2: Test the happy path**

Send these messages in order, verifying the response after each:

```json
{"type":"create_room","payload":{"name":"Tester"}}
```

Expected: `room_created` response with `code`, `playerId`, and snapshot.

```json
{"type":"set_ready","payload":{"ready":true}}
```

Expected: `player_ready_changed` broadcast.

Open a second WebSocket tab and join:

```json
{"type":"join_room","payload":{"code":"<CODE>","name":"Tester2"}}
```

Expected: `room_joined` response.

Continue through `start_game`, `set_prompt`, `submit_round`, etc. to exercise the full protocol.

- [ ] **Step 3: Test validation failures**

Send malformed payloads and verify `error` responses:

```json
{"type":"create_room","payload":{}}
```

Expected: `error` with code `INVALID_PAYLOAD` and message mentioning `name`.

```json
{"type":"join_room","payload":{"code":"ZZZZ","name":"x"}}
```

Expected: `error` with code `ROOM_NOT_FOUND`.

- [ ] **Step 4: Save the collection**

Save all these requests as a Postman collection named "Scribble Party Protocol". Export the collection JSON for your project writeup.

---

## Self-review pass

After completing all tasks above, verify:

- [ ] All unit tests pass (`npm test`)
- [ ] Full smoke test from Task 23 step 2 runs cleanly with no console errors
- [ ] Deployed URL works on both a phone and a laptop
- [ ] Room code copy-to-clipboard works
- [ ] Timer syncs across clients (both show the same count-down)
- [ ] Stroke replay animation plays on reveal
- [ ] Reactions appear on both clients in real time
- [ ] Cumulative drawings persist correctly across rounds (erasing in round 3 doesn't touch round 1 strokes)
- [ ] "I'm done" button transforms correctly and shows live count
- [ ] Final gallery shows each player's full cumulative drawing
- [ ] New Game returns to lobby with cleared state
- [ ] Mobile-friendly: everything works on a phone held in portrait mode
- [ ] No third-party JavaScript or CSS libraries used in `client/`
- [ ] Server dependencies are only `express` and `ws`

If anything fails, return to the relevant task and fix.

---

## What is NOT in this plan (by design)

- **Live canvas previews** (stretch goal) — architecture supports it via incremental stroke streaming; add a new message type `canvas_preview` and throttle outgoing strokes during `ROUND_ACTIVE`
- **PNG export from gallery** — `canvas.toDataURL('image/png')` on each gallery card, download via `<a download>`
- **Sound effects** — add an `<audio>` element and play on state transitions
- **Dark mode** — add a `prefers-color-scheme` media query to `:root` CSS variables

These are explicitly out of scope for v1 per the design spec. Do not add them until v1 is fully working and deployed.
