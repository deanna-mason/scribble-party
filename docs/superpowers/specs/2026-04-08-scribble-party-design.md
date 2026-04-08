# Scribble Party — Design Document

**Date:** 2026-04-08
**Author:** Deanna Mason
**Course:** 6100 MultiTier App Development
**Status:** Approved, ready for implementation plan

> Working title. The project is a real-time multiplayer collaborative drawing game for 2–8 players, built as the WebSocket assignment. The name is a placeholder and can be changed.

---

## 1. Overview

Scribble Party is a real-time multiplayer drawing game for 2–8 players on their own devices. One player at a time calls out a prompt ("fish tail!", "lightning bolt!", "spaghetti hair!") and everyone draws that item on their own canvas during a 90-second round. Critically, **each player's canvas persists across all rounds** — every prompt is another *addition* to the same drawing. After 10 rounds a player might have a spaghetti-haired lightning-bolt-wielding ice-cream-man with a fish tail. The game ends when every player has toggled "I'm done", and the finale is a gallery showing each player's complete cumulative masterpiece.

### Goals

- Build a real-time multi-user experience that clearly demonstrates the value of bi-directional WebSocket communication.
- Create something that two or more siblings can actually play together and enjoy.
- Satisfy every requirement of the WebSocket assignment.
- Stay within realistic scope so the project can be finished, deployed, and polished.

### Non-goals (v1)

- User accounts or persistent history across sessions
- Voting, scoring, or any competitive/win mechanic
- In-game chat
- Mid-game new joins (lobby locks when host clicks Start)
- Drawing tools beyond pen + eraser + 6 colors + 3 sizes
- Undo
- LLM integration (dropped in favor of a hardcoded, curated prompt list)

### Stretch goals (flagged, not required for v1)

- **Live canvas previews** — thumbnail streams of every player's canvas during drawing
- **Save/export** a drawing as a PNG from the gallery
- **Sound effects** (tick, whoosh, pop)
- **Prompt history visible** during gameplay so players remember what they've drawn so far

---

## 2. Assignment requirements mapping

| Requirement | How Scribble Party satisfies it |
|---|---|
| Real-time, interactive multi-user experience | 2–8 players in a room, every state change broadcasts instantly |
| WebSocket protocol, bi-directional | Every gameplay event flows over WebSockets, client ↔ server |
| `ws` library on the server | Used directly, per the in-class starter |
| Native `WebSocket` API on client | Used directly, no wrappers |
| Mobile-friendly | Mobile-first design; all layouts target phones first |
| Meaningful experience | A family drawing game with genuine replay value |
| Professional, valid HTML/CSS | Hand-written, semantic HTML, clean CSS with custom properties |
| No third-party JS/CSS libraries | Zero dependencies in the client; server uses only `express` and `ws` |
| Postman testing | WebSocket protocol exercised via Postman's WebSocket client |
| Deployment | Render.com Web Service, serves both API and client |

---

## 3. User flow (happy path)

1. **Host creates a room.** Opens the app, taps **Create Room**, enters a display name, gets a 4-letter room code (e.g. `WXYZ`).
2. **Players join.** Others open the app, tap **Join Room**, enter the code and their display name. Every new joiner appears live in the lobby on all devices.
3. **Lobby phase.** Everyone taps **I'm Ready**. The host can see all names and ready states in real time. No auto-start, no pressure — the host waits until everyone is present and ready.
4. **Host starts the game.** The button goes green once all present players are ready. Tapping it transitions every device to the first round simultaneously. The room locks; no new players can join.
5. **Round loop:**
   - Current caller (by rotation) sees a prompt picker: type your own, or tap "🎲 Surprise me" for a random pick from the hardcoded list (optionally filtered by category).
   - Caller confirms → prompt broadcasts to all devices; 90-second countdown starts on every device simultaneously.
   - Every player (including the caller) draws on their persistent canvas. This round's strokes are tagged with the current round number.
   - Any player can tap **Submit** when done. Round auto-ends when all players have submitted OR when the timer expires.
   - **Reveal.** All canvases appear on all devices at once. The new current-round strokes replay on top of each player's existing cumulative drawing as a smooth animation.
   - **Reactions.** Any player can tap emoji reactions on any drawing; they fly in live for everyone.
   - Caller rotates to the next player in the fixed turn order. No one calls a second prompt until every player has called at least once.
6. **Ending.** Any player can tap **"I'm done"** on the reveal screen at any time. When every player has toggled it on simultaneously, the game ends. Helper text next to the button explains the consensus rule.
7. **Final gallery.** Every player's complete cumulative drawing is shown, scrollable, along with the full sequence of prompts the game covered. Players can tap **New Game** to restart with the same room/players or **Leave** to exit.

---

## 4. Architecture

### 4.1 Overall shape

Single Node.js process running both HTTP (for the static client) and WebSockets on the same port, mirroring the in-class starter. State lives in a `Map<roomCode, Room>` in memory and is lost on restart — acceptable for an ephemeral party game.

```
┌─────────────────────┐       WebSocket       ┌────────────────────────────┐
│   Browser (phone)   │ ◄────────────────────►│  Node.js server            │
│   - index.html      │  JSON messages         │  - Express (static files)  │
│   - app.js          │                        │  - ws (WebSocket server)   │
│   - Canvas 2D API   │                        │  - Room/Game state (Map)   │
└─────────────────────┘                        │  - prompts.json            │
                                               └────────────────────────────┘
```

### 4.2 Server modules

| File | Responsibility |
|---|---|
| `server.js` | Express app, static file serving, `ws` server wiring, message dispatch |
| `rooms.js` | `RoomManager`: create, lookup, cleanup. Owns `Map<code, Room>` |
| `room.js` | `Room` class: game state, state machine, turn rotation, done-vote tally, per-room broadcast |
| `messages.js` | Message type constants + hand-rolled payload validator |
| `prompts.js` | Loads `prompts.json`, exposes `getRandomPrompt(category?)` |
| `prompts.json` | Hardcoded prompt list grouped by category |

Keeping `Room` in its own file is the biggest clarity improvement over the starter — the state machine deserves a dedicated home.

### 4.3 Client modules

| File | Responsibility |
|---|---|
| `index.html` | Single page; screens toggled by CSS class (lobby/room/round/reveal/gallery) |
| `styles.css` | Mobile-first, hand-written, CSS custom properties for theming |
| `socket.js` | WebSocket wrapper: connect, send, dispatch, auto-reconnect with exponential backoff |
| `state.js` | Client game state + tiny subscribe/notify event emitter |
| `drawing.js` | Canvas 2D controller: pointer capture, stroke rendering, eraser, replay |
| `ui.js` | DOM updates per state transition |
| `app.js` | Entry point, wires modules together |

### 4.4 Server state machine

Five states per room, server-authoritative:

```
LOBBY ──host_starts──► CALLER_CHOOSING ──prompt_set──► ROUND_ACTIVE
                              ▲                              │
                              │                   all_submitted_or_timer
                              │                              ▼
                     next_caller◄──reveal_done──── REVEAL
                                                             │
                                                       all_done_voted
                                                             ▼
                                                          GAME_OVER
```

- **LOBBY** — players joining, toggling ready. Host starts → transition.
- **CALLER_CHOOSING** — caller picks a prompt (typed or random). Others see "Sam is choosing…". Prompt confirmed → transition.
- **ROUND_ACTIVE** — 90-second timer. All players draw on their persistent canvases. Any player submits early; round ends when all submitted OR timer expires.
- **REVEAL** — Server broadcasts each player's *new* current-round strokes. Clients replay them on top of their stored copy of that player's cumulative canvas. Reactions fly in live. Auto-advances after 15 seconds, or advances on **Next Round** tap.
- **GAME_OVER** — Triggered when all players have toggled `isDoneVoting = true`. Gallery of complete cumulative drawings. **New Game** returns the room to LOBBY.

### 4.5 Data model

```js
// Server memory
rooms: Map<code, Room>

class Room {
  code               // "WXYZ"
  state              // "LOBBY" | "CALLER_CHOOSING" | "ROUND_ACTIVE" | "REVEAL" | "GAME_OVER"
  hostId             // playerId of the original creator
  players            // Map<playerId, Player>
  turnOrder          // [playerId, ...] — frozen when game starts
  currentCallerIdx   // index into turnOrder
  currentRound       // integer, starts at 1 on first round
  currentPrompt      // string or null
  roundEndsAt        // ms since epoch, or null
  submittedThisRound // Set<playerId>
  playerStrokes      // Map<playerId, Stroke[]>  — cumulative across all rounds
  promptHistory      // [{ round, caller, prompt }, ...]
}

class Player {
  id                 // uuid
  ws                 // WebSocket (not serialized)
  name               // display name
  isReady            // lobby state
  isDoneVoting       // "I'm done" toggle
  isConnected        // for reconnect handling
  joinedAt           // timestamp, for turn order
}

// Stroke (shared shape, client ↔ server)
{
  round: 3,
  tool: "pen" | "eraser",
  color: "#ff0000",
  size: 6,
  points: [{x: 0.42, y: 0.18}, ...]   // normalized 0.0–1.0 floats
}
```

### 4.6 Deployment target

**Render.com Web Service (free tier).** Supports Node + WebSockets out of the box. Push to GitHub, connect Render, it runs `npm install && node server.js`. Free tier spins down after 15 minutes of inactivity — first request after sleep takes ~30 seconds to wake. Acceptable for class demo; mention in writeup.

---

## 5. Message protocol

Every message is JSON: `{ type: "...", payload: { ... } }`.

### 5.1 Client → Server

| Type | Payload | Sent when |
|---|---|---|
| `create_room` | `{ name }` | Host clicks Create Room |
| `join_room` | `{ code, name, playerId? }` | Player enters code + name; optional `playerId` for reconnect |
| `set_ready` | `{ ready: bool }` | Player toggles ready in lobby |
| `start_game` | `{}` | Host clicks Start Game |
| `request_random_prompt` | `{ category? }` | Caller taps Surprise Me |
| `set_prompt` | `{ text }` | Caller confirms a prompt |
| `submit_round` | `{ strokes: [Stroke, ...] }` | Player submits their new current-round strokes |
| `toggle_done_voting` | `{ done: bool }` | Player toggles I'm Done |
| `send_reaction` | `{ targetPlayerId, emoji }` | Player taps an emoji on someone's drawing |
| `next_round` | `{}` | Any player taps Next Round during reveal |
| `new_game` | `{}` | Any player taps New Game on gallery |
| `leave_room` | `{}` | Player explicitly quits |

### 5.2 Server → Client

| Type | Payload | Sent when |
|---|---|---|
| `room_created` | `{ code, playerId, state }` | Response to `create_room` |
| `room_joined` | `{ code, playerId, state, isReconnect: bool }` | Response to `join_room` with full state snapshot |
| `player_joined` | `{ player, isReconnect: bool }` | New player (or reconnect) enters |
| `player_left` | `{ playerId }` | Player disconnects or leaves |
| `player_ready_changed` | `{ playerId, ready }` | Ready toggled |
| `game_started` | `{ turnOrder, currentCallerIdx, currentRound }` | Host starts game |
| `caller_choosing` | `{ callerId }` | Transition to CALLER_CHOOSING |
| `random_prompt_suggestion` | `{ text, category }` | Response to `request_random_prompt` (caller only) |
| `round_started` | `{ round, callerId, prompt, endsAt }` | Prompt confirmed, ROUND_ACTIVE begins |
| `player_submitted` | `{ playerId }` | Player submits early |
| `round_revealed` | `{ round, prompt, playerStrokesThisRound: { [playerId]: [Stroke] } }` | Round ends, only new strokes |
| `done_vote_changed` | `{ playerId, done, doneVoters: [id], totalPlayers, allDone: bool }` | Done toggle updated |
| `reaction_received` | `{ fromPlayerId, targetPlayerId, emoji }` | Reaction broadcast |
| `game_ended` | `{ finalGallery: { [playerId]: [Stroke] }, promptHistory }` | All players voted done |
| `new_game_started` | `{ state }` | New Game transitions room back to LOBBY |
| `error` | `{ code, message }` | Validation failure or rejected action |

### 5.3 State snapshot object

Sent with `room_joined` and as needed for recovery. A late-joiner (or reconnect) receives this to rehydrate the full UI without replaying events:

```js
{
  code: "WXYZ",
  state: "LOBBY" | "CALLER_CHOOSING" | "ROUND_ACTIVE" | "REVEAL" | "GAME_OVER",
  hostId: "...",
  players: [{ id, name, isReady, isDoneVoting, isConnected }],
  turnOrder: [playerId, ...],
  currentCallerIdx: 0,
  currentRound: 0,
  currentPrompt: null,
  roundEndsAt: null,
  playerStrokes: { [playerId]: [Stroke] },
  promptHistory: [{ round, caller, prompt }]
}
```

### 5.4 Authority boundaries

- **Server-authoritative:** room existence, player membership, turn order, state transitions, round timer, prompt confirmation, done-vote tally.
- **Client-authoritative:** its own stroke data, local ready/done intent, reaction selection.
- **Every message is validated server-side:** is the sender in this room? Is the room in the right state? Is the sender the caller when they need to be? Failures return an `error` message; the server never crashes or silently drops.

### 5.5 Error codes

| Code | Meaning |
|---|---|
| `ROOM_NOT_FOUND` | Bad code |
| `ROOM_FULL` | 8 players already |
| `GAME_LOCKED` | Join attempted after game started (non-reconnect) |
| `INVALID_STATE` | Action not allowed in current room state |
| `NOT_CALLER` | Non-caller tried caller-only action |
| `INVALID_PAYLOAD` | Failed schema validation |
| `NAME_TAKEN` | Display name already used in the room |

---

## 6. Drawing engine

### 6.1 Canvas setup

Each player has one `<canvas>` that fills available vertical space. Internal resolution uses `devicePixelRatio` for crisp strokes on retina:

```js
const ratio = window.devicePixelRatio || 1;
canvas.width = cssWidth * ratio;
canvas.height = cssHeight * ratio;
ctx.scale(ratio, ratio);
```

`touch-action: none;` on the canvas prevents phone scroll/zoom from hijacking drawing gestures.

### 6.2 Normalized coordinates

Strokes are stored as **0.0–1.0 floats** relative to canvas dimensions, not pixels. A stroke captured on a 360×480 phone looks correct when replayed on a 720×960 tablet.

```js
// Capture
const rect = canvas.getBoundingClientRect();
const normX = (event.clientX - rect.left) / rect.width;
const normY = (event.clientY - rect.top) / rect.height;

// Render
const x = stroke.points[i].x * canvasCssWidth;
const y = stroke.points[i].y * canvasCssHeight;
```

### 6.3 Pointer events

Unified mouse + touch + stylus via the **Pointer Events API**:

```js
canvas.addEventListener('pointerdown', startStroke);
canvas.addEventListener('pointermove', continueStroke);
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);
```

### 6.4 Stroke capture & rendering

A stroke accumulates on pointer events:

```js
// pointerdown
currentStroke = { round, tool, color, size, points: [{x, y}] };

// pointermove (with 2-pixel decimation to keep arrays small)
if (distance(last, now) >= 2) {
  currentStroke.points.push({x, y});
  renderLastSegment();
}

// pointerup
playerStrokes.push(currentStroke);
currentStroke = null;
```

Rendering uses `quadraticCurveTo` midpoint smoothing for natural-looking lines:

```js
ctx.lineCap = 'round';
ctx.lineJoin = 'round';
ctx.beginPath();
ctx.moveTo(p[0].x * w, p[0].y * h);
for (let i = 1; i < p.length - 1; i++) {
  const midX = (p[i].x + p[i+1].x) / 2 * w;
  const midY = (p[i].y + p[i+1].y) / 2 * h;
  ctx.quadraticCurveTo(p[i].x * w, p[i].y * h, midX, midY);
}
ctx.stroke();
```

### 6.5 Eraser

Stroke-deletion, not pixel-painting. On drag, for each point on the eraser path, any current-round stroke with a line segment within `size` pixels is deleted and the canvas re-renders:

```js
function eraseAt(point) {
  const hitRadius = eraserSize / canvasCssWidth;
  playerStrokes = playerStrokes.filter(stroke => {
    if (stroke.round !== currentRound) return true;  // past rounds immune
    return !strokeIntersectsPoint(stroke, point, hitRadius);
  });
  rerender();
}
```

**Past rounds are immune** at the geometry level — the `stroke.round !== currentRound` filter guarantees the immutability promise we made to players.

### 6.6 Reveal replay animation

On reveal, for each player's drawing:
1. Canvas already shows previous-rounds strokes (clients have been accumulating them).
2. New current-round strokes animate on, point by point, via `requestAnimationFrame`.
3. All 8 player canvases animate simultaneously on every device.

```js
function replayStrokes(canvas, strokes, onDone) {
  let si = 0, pi = 0;
  function step() {
    if (si >= strokes.length) return onDone();
    const s = strokes[si];
    if (pi < s.points.length) { drawSegment(canvas, s, pi); pi++; }
    else { si++; pi = 0; }
    requestAnimationFrame(step);
  }
  step();
}
```

### 6.7 Performance sanity check

Per game, upper-bound estimate:

- ~50 strokes per player per round × 10 rounds × 8 players = 4000 total strokes
- ~30 points per stroke = 120,000 points total
- ~2 MB of state per game
- ~192 KB per reveal, batched as one message

Negligible for modern phones and Render. No dirty-rect optimization needed.

### 6.8 Libraries used

Zero. Canvas 2D, Pointer Events, `requestAnimationFrame` are all native browser APIs. Fully compliant with "no third-party JavaScript or CSS libraries."

---

## 7. UI/UX and mobile layout

### 7.1 Design principles

- Mobile-first, portrait 375px baseline
- Tap targets ≥44×44 px
- One primary action per screen
- System fonts only (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`)
- CSS custom properties for theming
- WCAG AA contrast throughout
- Color is never the only signal (icons accompany state indicators)
- Zero CSS/JS libraries

### 7.2 Color palette

**UI:**
```
--bg:           #faf6f0   (warm cream)
--surface:      #ffffff
--ink:          #1a1a2e   (soft near-black)
--primary:      #ff6b6b   (coral — main actions)
--accent:       #4ecdc4   (teal — highlights)
--muted:        #8d8d9c
--border:       #e8e3dc
--success:      #7fb069
--warning:      #f4a261
```

**Drawing colors** (6 options):
`#1a1a2e` (black), `#e63946` (red), `#3d85c6` (blue), `#52b788` (green), `#f4a261` (yellow), `#9d4edd` (purple)

### 7.3 Screens

| Screen | Purpose |
|---|---|
| **Landing** | Create or Join, inline name/code entry |
| **Lobby** | Prominent room code, live player list, ready toggles, host Start button |
| **Caller Choosing** | Caller: prompt picker (type + random + category). Others: passive "X is choosing…" |
| **Drawing Round** | Prompt banner, live timer, canvas, toolbar (pen/eraser/colors/sizes), mini player status strip, Submit button |
| **Reveal** | 2×N grid of player drawings replaying; emoji reaction row; Next Round; I'm Done toggle |
| **Gallery** | All final cumulative drawings, prompt history, New Game / Leave buttons |

See Section 7.4 for detailed layouts.

### 7.4 Screen layouts (abbreviated)

**Drawing round** — the primary screen:

```
┌─────────────────────────┐
│  Round 3 • ⏱ 1:27       │
├─────────────────────────┤
│  "fish tail"            │
├─────────────────────────┤
│                         │
│     [ Canvas area ]     │
│    (fills available)    │
│                         │
├─────────────────────────┤
│ ✏️ 🧹 │ ⚫🔴🔵🟢🟡🟣 │ ●●● │
├─────────────────────────┤
│ 👀 Mom Lily✓ Jack Maya  │
├─────────────────────────┤
│     [   Submit   ]      │
└─────────────────────────┘
```

**Reveal**:

```
┌─────────────────────────┐
│  Round 3 Reveal         │
│  "fish tail"            │
├─────────────────────────┤
│  ┌────┐ ┌────┐          │
│  │Mom │ │Lily│          │
│  │    │ │    │          │
│  │🎉❤️│ │    │          │
│  └────┘ └────┘          │
│  ┌────┐ ┌────┐          │
│  │Jack│ │Maya│          │
│  │    │ │    │          │
│  └────┘ └────┘          │
├─────────────────────────┤
│ 🎉 😂 🔥 ❤️ 😱          │
├─────────────────────────┤
│  [ Next Round → ]       │
│                         │
│   🏁 I'm done  ○        │
│   Game ends when        │
│   everyone taps this    │
└─────────────────────────┘
```

### 7.5 The "I'm done" UX

Before tapping:
```
   🏁 I'm done  ○
   Game ends when everyone taps this
```

After tapping:
```
   ✓ You're done
   Waiting for 2 more
```

- Helper caption always visible before the tap (educates)
- Button transforms after the tap (confirms the vote registered)
- Live count updates as others toggle
- Tapping again un-votes, no confirmation needed
- No modal, no persistent across-screen strip — the reveal screen is the only place this lives

### 7.6 Wake lock

On the drawing screen, request a screen wake lock so phones don't sleep mid-draw:

```js
if ('wakeLock' in navigator) {
  navigator.wakeLock.request('screen');
}
```

Fails silently on unsupported browsers. One line, high UX value.

### 7.7 Accessibility

- `rem`-based font sizing respects browser/OS size preferences
- All buttons are real `<button>` elements with meaningful labels
- Drawing color swatches have `aria-label`s for screen readers
- State indicators use icons *and* color
- Contrast ratios meet WCAG AA throughout

---

## 8. Prompt list

A single `prompts.json` file on the server, grouped by category:

```json
{
  "body_parts": ["fish tail", "mustache", "eyebrow", "third eye", "claw", "wing", ...],
  "accessories": ["top hat", "monocle", "cape", "backpack", "bow tie", ...],
  "creatures": ["dragon", "alien", "robot", "mermaid", "unicorn", ...],
  "silly": ["spaghetti hair", "pizza shoes", "rainbow fart", "cheese necklace", ...],
  "nature": ["flower", "tree branch", "lightning bolt", "cloud", "sun", ...],
  "objects": ["ice cream cone", "umbrella", "balloon", "guitar", ...]
}
```

Target: ~30-50 prompts per category, ~200 total. Curated for kids — nothing scary, nothing inappropriate, all drawable by a 6-year-old. Can use an offline LLM (Claude or ChatGPT in a chat window) to generate the initial list, then hand-curate.

When a caller taps "🎲 Surprise me":
- With no category: pick a random category first, then a random prompt from it
- With a category: pick a random prompt from that category
- Never repeat the same prompt twice in one game (server tracks `promptHistory`)

---

## 9. Error handling & edge cases

### 9.1 Philosophy

- **Server never crashes.** Every message handler wrapped in try/catch. Unknown types logged and ignored.
- **Client always gives feedback.** Error messages show as dismissible toasts; connection drops show a "Reconnecting…" banner.
- **Validation is fail-fast.** Bad payloads return `INVALID_PAYLOAD` immediately.

### 9.2 Edge cases and resolutions

| Scenario | Handling |
|---|---|
| Host disconnects mid-game | Game continues normally — `hostId` only matters in LOBBY for the Start button. On game end, **any** player can tap New Game from the gallery; whoever taps becomes the host of the next game. |
| All players disconnect | Room marked abandoned. Server waits 10 minutes, then garbage-collects. Reconnect within the window restores the room. |
| Caller disconnects during their turn | 30-second grace period. If they return, they resume. If not, caller role advances to next in rotation with a broadcast: "Jack got disconnected, moving on." |
| Player disconnects mid-drawing | Their strokes so far are preserved. Reconnect (via `playerId` in localStorage) restores full state from server snapshot. |
| Player submits empty drawing | Allowed. Their canvas doesn't change that round. Reveal shows no new strokes for them. |
| Player submits after timer expires | Server ignores. Client sees no effect; reveal proceeds. |
| Room code collision | Server retries random code generation, max 10 attempts. |
| Invalid client message | Dropped. Server replies with `INVALID_PAYLOAD` error. Never crashes. |
| Oversized strokes payload | `ws` max message size enforced at ~500 KB; exceeding messages are rejected. |
| Canvas resize (rotation, orientation) | Canvas reinitializes at new dimensions; strokes re-render from normalized coordinates and look correct. |
| Browser back button | `beforeunload` prompt: "Are you sure you want to leave?" |

### 9.3 Reconnect flow

On client load, `playerId` is read from `localStorage`. On `join_room`, the client sends this ID. Server checks: if the room exists *and* contains a disconnected player with this ID, the existing player is revived instead of creating a new one. The full state snapshot is sent back in `room_joined` with `isReconnect: true`.

```js
// client
const playerId = localStorage.getItem('scribble-party-playerId');
socket.send({ type: 'join_room', payload: { code, name, playerId } });

// server
const existing = room.players.get(playerId);
if (existing && !existing.isConnected) {
  existing.ws = ws;
  existing.isConnected = true;
  sendSnapshot(ws, { isReconnect: true });
} else {
  // normal new join
}
```

---

## 10. Testing

### 10.1 Manual smoke test (primary)

Run before every deploy:

1. Create a room — code appears
2. Join from a second browser — both lobbies update
3. Both ready — host sees both ready
4. Host starts — transition to round 1
5. Caller picks prompt — both transition to drawing
6. Both draw — both see their own strokes
7. Both submit — reveal appears with animations
8. React with emojis — appears on both screens
9. Next round — rotation advances correctly
10. Toggle I'm done on both — game ends, gallery shows
11. Disconnect one browser, reconnect — state preserved
12. Close host browser — second player continues playing

### 10.2 Postman WebSocket testing

Postman's WebSocket request client (supported since 2021) is used to exercise the protocol directly. Build a small collection of "known-good" sequences:

- Create room → join room → set ready → start game → choose prompt → submit → reveal
- Invalid payloads to trigger each error code
- Out-of-state transitions (e.g., `set_prompt` during LOBBY)
- Reconnect flow with stored `playerId`

This satisfies the assignment's Postman requirement.

### 10.3 State machine tests (optional, scoped)

Node's built-in `node --test` runner for the `Room` class only, no external test library:

- `join adds player`
- `game_started sets turn order`
- `caller rotation advances correctly`
- `round ends when all submitted`
- `round ends when timer fires`
- `game ends when all done_voted`
- `invalid state transitions are rejected`

~100 lines of tests. Skip if time is tight.

### 10.4 What is not tested automatically

Canvas rendering, pointer capture, replay animation, and UI are verified manually. They don't benefit from unit testing at this scale.

---

## 11. Deployment

**Platform:** Render.com Web Service (free tier)

**Steps:**
1. Push project to a new GitHub repo
2. Connect Render to the repo
3. Build command: `npm install`
4. Start command: `node server.js`
5. Set `NODE_VERSION` to 20 (via `.nvmrc` or env var)
6. Deploy

**Client-side URL handling:**

```js
const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const socket = new WebSocket(`${protocol}//${location.host}`);
```

This auto-detects environment: `ws://localhost:3000` locally, `wss://scribble-party.onrender.com` deployed. No hardcoded URLs.

**Free tier caveats:**

- Spins down after 15 minutes of inactivity; first request after sleep takes ~30 seconds
- Acceptable for class demo; note in writeup
- Upgrade to $7/mo paid plan for the final week if spin-down causes demo issues

**Required files:**

- `.gitignore` — `node_modules`, `.env`, `.DS_Store`
- `package.json` — `{"start": "node server.js", "engines": {"node": ">=20"}, "dependencies": {"express", "ws"}}`

---

## 12. Open questions (not blockers)

1. **Reaction persistence** — do reactions from reveal screens persist into the final gallery? Default: no, reactions are ephemeral. Easy to change later.
2. **Gallery PNG export** — save-as-PNG button for each gallery drawing. Tempting, deferred to stretch.
3. **Dark mode** — not in v1.
4. **Sound effects** — deferred to stretch; adds no protocol changes.
5. **Project name** — "Scribble Party" is a placeholder; can be renamed without affecting the design.

---

## 13. Summary

Scribble Party is a mobile-first, real-time multiplayer drawing game where 2–8 players each build a single cumulative drawing across many rounds of themed prompts. It uses WebSockets for every piece of shared state — lobby, turn rotation, prompt broadcast, timer sync, submission tracking, reveal, reactions, and done-voting consensus. The drawing layer uses vector strokes with normalized coordinates so drawings replay smoothly across devices. The architecture is intentionally small — two server dependencies, zero client libraries, in-memory state — which keeps the scope tight and the deployment story clean.

The final deliverable is a Render-hosted web application that a family can pull up on their phones, gather in the lobby, and play as long as they're having fun.
