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
        // If the canvas has no layout yet (e.g. its screen is still display:none
        // at page load), bail out rather than zero out a potentially working canvas.
        if (rect.width === 0 || rect.height === 0) return;
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
        // Safety: if the canvas wasn't laid out when init/resize ran, pick up
        // real dimensions now before we try to draw anything.
        if (cssWidth === 0 || cssHeight === 0) resize();
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
