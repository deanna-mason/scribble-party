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
        document.getElementById('btn-submit-round').disabled = false;
        // Wait for the screen transition + layout before sizing the canvas.
        // Without this, the canvas has 0x0 dimensions because it was hidden
        // at page load and the layout hasn't settled yet immediately after
        // showScreen() toggled its visibility.
        await new Promise((r) => requestAnimationFrame(r));
        await new Promise((r) => requestAnimationFrame(r));
        Drawing.resize();
        // Now load cumulative strokes — rerender uses the freshly sized canvas.
        const myStrokes = (st.playerStrokes[st.playerId] || []).slice();
        Drawing.setStrokes(myStrokes);
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

    window.UI = {
        showScreen, showToast, initLanding, initLobby, renderLobby,
        initCaller, renderCaller, initRound, enterRound, leaveRound, renderMiniStatus,
        initReveal, enterReveal, showReactionOn, renderDoneButton,
        initGallery, enterGallery,
    };
})();
