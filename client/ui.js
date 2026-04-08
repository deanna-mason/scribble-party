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

    window.UI = { showScreen, showToast, initLanding, initLobby, renderLobby, initCaller, renderCaller };
})();
