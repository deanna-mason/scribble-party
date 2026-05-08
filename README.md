# Scribble Party

A real-time multiplayer collaborative drawing game for 2–8 players, played together on phones in the same room.

One player at a time calls out a prompt — *"fish tail!"*, *"lightning bolt!"*, *"spaghetti hair!"* — and everyone draws that thing on their own canvas during a 90-second round. The twist: **each player's canvas persists across every round**, so every prompt is another *addition* to the same drawing. After 10 rounds you might have a spaghetti-haired, lightning-bolt-wielding ice-cream-man with a fish tail. The game ends when every player taps "I'm done", and the finale is a gallery showing each player's complete cumulative masterpiece.

Built as the WebSocket assignment for *6100 MultiTier App Development*.

**Live demo:** <https://scribbleparty.onrender.com/>

## Overview

- **2–8 players** join a room with a 4-letter code
- **Cumulative canvases** — drawings build up across rounds, never reset
- **Server-authoritative game state** — turn rotation, timers, vote tallies, prompt confirmation all live on the server
- **Mobile-first** — designed for phones in portrait, with wake lock so screens don't sleep mid-draw
- **Zero client-side libraries** — vanilla JS, Canvas 2D API, Pointer Events, and CSS
- **Two server dependencies only** — Express for static files, `ws` for WebSockets

## Features

- Real-time lobby with live ready toggles
- Caller rotation across the fixed turn order — everyone calls a prompt at least once before anyone calls a second
- ~200 hand-curated, kid-friendly prompts grouped by category, plus typed custom prompts
- 90-second round timer synced across every device
- Submit-early or wait-for-timer round endings
- Reveal screen with stroke replay animation on top of each player's existing cumulative drawing
- Live emoji reactions during reveal
- Consensus-based ending — game ends only when *every* player has toggled "I'm done"
- Final gallery of every player's complete drawing plus the full prompt history
- Reconnect support — if a player drops and rejoins, full game state is restored from the server snapshot
- Pen, eraser, six colors, three brush sizes
- Eraser is stroke-deletion (not pixel paint), and past-round strokes are immune — what you finished stays finished

## Tech Stack

**Server**
- Node.js (≥20)
- Express 5 (static file serving)
- `ws` (WebSocket server)
- In-memory game state (`Map<roomCode, Room>`)

**Client**
- Vanilla JavaScript (no frameworks, no build step)
- HTML5 Canvas 2D API
- Pointer Events API (unified mouse / touch / stylus)
- CSS custom properties, mobile-first
- Native `WebSocket` API

**Deployment**
- Render.com Web Service (free tier)

## Getting Started

**Requirements:** Node.js 20+

```bash
npm install
npm start
```

Open <http://localhost:3000> on two or more devices on the same network (or two browser tabs) and create/join a room.

## How to Play

1. **Host creates a room.** A 4-letter code appears.
2. **Players join** by entering the code and a display name.
3. **Everyone taps "I'm Ready"** in the lobby. The Start button turns green when all present players are ready.
4. **The round loop runs:**
   - The current caller picks a prompt (typed or 🎲 random)
   - 90-second countdown starts on every device simultaneously
   - All players draw on their persistent canvas
   - Round ends when all submit OR when the timer expires
   - Reveal animates the new strokes on top of each player's cumulative drawing
   - Players can react with emojis live
   - Caller rotates to the next player
5. **Any player can tap "I'm done"** on the reveal screen at any time. When everyone has toggled it, the game ends.
6. **The final gallery** shows every player's complete drawing and the full prompt history. Tap **New Game** to play again with the same room.

## Architecture

A single Node.js process runs both HTTP (for the static client) and the WebSocket server on the same port.

```
┌─────────────────────┐       WebSocket       ┌────────────────────────────┐
│   Browser (phone)   │ ◄────────────────────►│  Node.js server            │
│   - index.html      │  JSON messages        │  - Express (static files)  │
│   - app.js          │                       │  - ws (WebSocket server)   │
│   - Canvas 2D API   │                       │  - Room/Game state (Map)   │
└─────────────────────┘                       │  - prompts.json            │
                                              └────────────────────────────┘
```

**Server-side state machine** — five states per room: `LOBBY → CALLER_CHOOSING → ROUND_ACTIVE → REVEAL → GAME_OVER`. The server owns every transition; clients send intent and receive snapshots.

**Authority boundaries**
- *Server-authoritative:* room existence, player membership, turn order, state transitions, round timer, prompt confirmation, done-vote tally
- *Client-authoritative:* its own stroke data, ready/done intent, reaction selection
- *Every message is validated server-side* — invalid payloads return an `error` message; the server never crashes or silently drops

**Drawing model** — strokes are stored as normalized 0.0–1.0 floats relative to canvas dimensions, so a drawing made on a 360×480 phone replays correctly on a 720×960 tablet. `quadraticCurveTo` midpoint smoothing makes lines look natural. Eraser is implemented as stroke-deletion with a past-rounds-immune filter.

For the full design (message protocol tables, data model, edge cases, accessibility notes), see [`docs/superpowers/specs/2026-04-08-scribble-party-design.md`](docs/superpowers/specs/2026-04-08-scribble-party-design.md).

## Project Structure

```
scribble party/
├── server.js          # Express + ws wiring, message dispatch
├── rooms.js           # RoomManager: create, lookup, cleanup
├── room.js            # Room class: state machine, turn rotation, broadcast
├── messages.js        # Message type constants and payload validators
├── prompts.js         # Loads prompts.json, exposes getRandomPrompt()
├── prompts.json       # Hand-curated prompt list grouped by category
├── client/
│   ├── index.html     # Single page, screens toggled by CSS class
│   ├── styles.css     # Mobile-first, hand-written
│   ├── socket.js      # WebSocket wrapper with auto-reconnect
│   ├── state.js       # Client game state + tiny event emitter
│   ├── drawing.js     # Canvas 2D controller: capture, render, replay
│   ├── ui.js          # DOM updates per state transition
│   └── app.js         # Entry point
├── test/              # node --test suites for server-side modules
├── docs/              # Design spec and implementation plan
└── package.json
```

## Deployment

Live at **<https://scribbleparty.onrender.com/>**, deployed on Render.com as a Web Service (free tier).

To deploy your own:

1. Push to a GitHub repo
2. Connect Render to the repo
3. Build command: `npm install`
4. Start command: `node server.js`
5. Set Node version to 20 (`.nvmrc` already does this)

The client auto-detects environment, so no hardcoded URLs:

```js
const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const socket = new WebSocket(`${protocol}//${location.host}`);
```

Free-tier note: services spin down after 15 minutes of inactivity, so the first request after sleep takes ~30 seconds to wake.

## Testing

```bash
npm test
```

Runs the Node built-in test runner (`node --test`) over the `test/` directory. Coverage focuses on the server-side state machine: room creation, player joins, turn rotation, round end conditions, done-vote consensus, and rejection of invalid state transitions.

The protocol is also exercised end-to-end through Postman's WebSocket request client — including known-good gameplay sequences, every error code, out-of-state transitions, and the reconnect flow.

UI, canvas rendering, and pointer capture are verified manually via a documented smoke test (see the design doc, section 10.1).

## Demo

A demo video is available on request.

## Course

Built for *6100 MultiTier App Development*, Winter 2026.
