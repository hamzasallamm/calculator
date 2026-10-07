// Visual effects, extras and easter eggs.
// This file never touches script.js state: it only watches #expression / #answer
// and clicks the existing keypad buttons, so the calculator logic stays untouched.
(() => {
    "use strict";

    const root = document.documentElement;
    const calc = document.querySelector(".calculator");
    const tilt = document.querySelector(".tilt");
    const display = document.querySelector(".display");
    const answerEl = document.querySelector("#answer");
    const exprEl = document.querySelector("#expression");
    const pad = document.querySelector(".buttons");
    const padButtons = Array.from(pad.querySelectorAll("button"));
    const keyMap = new Map(padButtons.map((b) => [b.textContent, b]));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const ease = (t) => t * t * (3 - 2 * t);

    function centerOf(el) {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, rect: r };
    }

    const classTimers = new WeakMap();
    function replayClass(el, cls, ms) {
        el.classList.remove(cls);
        void el.offsetWidth;
        el.classList.add(cls);
        const timers = classTimers.get(el) || {};
        clearTimeout(timers[cls]);
        timers[cls] = setTimeout(() => el.classList.remove(cls), ms);
        classTimers.set(el, timers);
    }

    // ---------- Saved state ----------

    const STORE_KEY = "nova-calculator";
    const state = (() => {
        const fallback = { theme: "aurora", sound: false, secrets: [], history: [] };
        try {
            const saved = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
            return {
                theme: typeof saved.theme === "string" ? saved.theme : fallback.theme,
                sound: saved.sound === true,
                secrets: Array.isArray(saved.secrets) ? saved.secrets : [],
                history: Array.isArray(saved.history) ? saved.history : [],
            };
        } catch {
            return fallback;
        }
    })();

    function save() {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(state));
        } catch {
            // Storage unavailable (private mode etc.) - everything still works, just not remembered.
        }
    }

    // ---------- Toasts ----------

    const toastLayer = document.querySelector(".toasts");

    function toast({ icon = "✨", title, text = "", badge = "", tone = "", duration = 4000 }) {
        const el = document.createElement("div");
        el.className = `toast ${tone}`.trim();

        const iconEl = document.createElement("span");
        iconEl.className = "toast-icon";
        iconEl.textContent = icon;

        const body = document.createElement("div");
        body.className = "toast-body";
        if (badge) {
            const badgeEl = document.createElement("span");
            badgeEl.className = "toast-badge";
            badgeEl.textContent = badge;
            body.append(badgeEl);
        }
        const titleEl = document.createElement("span");
        titleEl.className = "toast-title";
        titleEl.textContent = title;
        body.append(titleEl);
        if (text) {
            const textEl = document.createElement("span");
            textEl.className = "toast-text";
            textEl.textContent = text;
            body.append(textEl);
        }

        el.append(iconEl, body);
        toastLayer.append(el);
        while (toastLayer.children.length > 3) toastLayer.firstElementChild.remove();

        setTimeout(() => {
            el.classList.add("leaving");
            setTimeout(() => el.remove(), 400);
        }, duration);
    }

    // ---------- Sound (off by default; digits play a pentatonic melody) ----------

    const sound = (() => {
        const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
        let ctx = null;

        function audio() {
            if (!ctx) {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return null;
                ctx = new AudioCtx();
            }
            if (ctx.state === "suspended") ctx.resume();
            return ctx;
        }

        function tone(freq, { type = "sine", dur = 0.18, gain = 0.08, delay = 0, slide = 0 } = {}) {
            const c = audio();
            if (!c) return;
            const t = c.currentTime + delay;
            const osc = c.createOscillator();
            const amp = c.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, t);
            if (slide) osc.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
            amp.gain.setValueAtTime(0.0001, t);
            amp.gain.exponentialRampToValueAtTime(gain, t + 0.01);
            amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            osc.connect(amp).connect(c.destination);
            osc.start(t);
            osc.stop(t + dur + 0.05);
        }

        const note = (step) => 392 * 2 ** (step / 12);

        function play(kind, label) {
            if (!state.sound) return;
            switch (kind) {
                case "digit":
                    tone(note(SCALE[Number(label)]));
                    break;
                case "dot":
                    tone(1568, { dur: 0.06, gain: 0.04 });
                    break;
                case "op":
                    tone(note(-5), { type: "triangle", dur: 0.14, gain: 0.07 });
                    break;
                case "equals":
                    [0, 4, 7, 12].forEach((s, i) => tone(note(s), { delay: i * 0.05, dur: 0.32, gain: 0.06 }));
                    break;
                case "clear":
                    tone(note(7), { type: "triangle", dur: 0.22, gain: 0.06, slide: 0.5 });
                    break;
                case "error":
                    tone(130, { type: "sawtooth", dur: 0.4, gain: 0.05, slide: 0.5 });
                    break;
                case "secret":
                    [12, 16, 19, 24, 28].forEach((s, i) => tone(note(s), { delay: i * 0.07, dur: 0.45, gain: 0.05 }));
                    break;
                case "theme":
                    tone(note(12), { dur: 0.25, gain: 0.05 });
                    tone(note(19), { delay: 0.06, dur: 0.3, gain: 0.04 });
                    break;
            }
        }

        return { play };
    })();

    // ---------- Sky: background (#sky) and foreground (#fx) canvases ----------

    const sky = (() => {
        const back = document.getElementById("sky");
        const front = document.getElementById("fx");
        const bctx = back.getContext("2d");
        const fctx = front.getContext("2d");
        const GLYPHS = Array.from("0123456789π√∑∞∫Δθφ±×÷=%");
        const MATRIX = Array.from("アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789");
        const motion = reducedMotion ? 0.3 : 1;

        const ENVELOPES = {
            default: (p) => (p < 0.15 ? ease(p / 0.15) : p > 0.8 ? ease((1 - p) / 0.2) : 1),
            warp: (p) => ease(p < 0.5 ? p * 2 : (1 - p) * 2),
            void: (p) => (p < 0.7 ? ease(p / 0.7) : ease((1 - p) / 0.3)),
        };

        let W = 0;
        let H = 0;
        let stars = [];
        let glyphs = [];
        let columns = [];
        let backParticles = [];
        let frontParticles = [];
        let rings = [];
        let shooters = [];
        let hue1 = 258;
        let hue2 = 335;
        let px = 0, py = 0, tpx = 0, tpy = 0;
        let fieldAlpha = 0;
        let moon = false;
        let effect = null;
        let wishHandler = () => {};
        let nextShooter = performance.now() + rand(4000, 8000);
        let last = performance.now();
        let frame = 0;

        function makeStar() {
            return {
                x: Math.random() * W,
                y: Math.random() * H,
                z: rand(0.15, 1),
                r: rand(0.3, 1.3),
                tw: rand(0, Math.PI * 2),
                ts: rand(0.01, 0.05),
                gone: false,
            };
        }

        function makeGlyph(y) {
            const z = rand(0.25, 1);
            const vx = rand(-0.04, 0.04);
            const vy = -rand(0.06, 0.22) * z;
            return {
                x: Math.random() * W, y, z,
                ch: pick(GLYPHS), base: null,
                size: 12 + z * 26,
                rot: rand(-0.5, 0.5), vr: rand(-0.003, 0.003),
                vx, vy, bvx: vx, bvy: vy,
                gone: false,
            };
        }

        function seed() {
            const area = W * H;
            stars = Array.from({ length: Math.min(280, Math.round(area / 5000)) }, makeStar);
            glyphs = Array.from({ length: Math.min(40, Math.round(area / 34000) + 10) }, () => makeGlyph(Math.random() * H));
            fieldAlpha = 0;
        }

        function resize() {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const prevArea = W * H;
            W = window.innerWidth;
            H = window.innerHeight;
            for (const [canvas, ctx] of [[back, bctx], [front, fctx]]) {
                canvas.width = Math.round(W * dpr);
                canvas.height = Math.round(H * dpr);
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            }
            if (!prevArea || Math.abs(W * H - prevArea) / prevArea > 0.25) {
                seed();
            } else {
                for (const o of [...stars, ...glyphs]) {
                    if (o.x > W) o.x = Math.random() * W;
                    if (o.y > H) o.y = Math.random() * H;
                }
            }
        }

        function readHues() {
            const cs = getComputedStyle(root);
            const a = parseFloat(cs.getPropertyValue("--h1"));
            const b = parseFloat(cs.getPropertyValue("--h2"));
            if (!Number.isNaN(a)) hue1 = a;
            if (!Number.isNaN(b)) hue2 = b;
        }

        // Spiral an object toward (cx, cy); marks it gone once it crosses the event horizon.
        function suck(o, cx, cy, k, dt) {
            let d = Math.hypot(o.x - cx, o.y - cy);
            let a = Math.atan2(o.y - cy, o.x - cx);
            a += (k * 12 * dt) / (d + 80);
            d = d * (1 - 0.02 * k * dt) - 1.4 * k * dt;
            if (d < 14) {
                o.gone = true;
                return;
            }
            o.x = cx + Math.cos(a) * d;
            o.y = cy + Math.sin(a) * d;
        }

        function drawStars(dt, k) {
            const type = effect?.type;
            const cx = effect ? effect.x : W / 2;
            const cy = effect ? effect.y : H / 2;
            bctx.lineCap = "round";
            for (const s of stars) {
                if (s.gone) continue;
                s.tw += s.ts * dt;

                if (type === "warp" && k > 0.02) {
                    const dx = s.x - cx;
                    const dy = s.y - cy;
                    const d = Math.hypot(dx, dy) || 1;
                    const speed = k * (1 + d * 0.05) * s.z * 2.4 * dt;
                    s.x += (dx / d) * speed;
                    s.y += (dy / d) * speed;
                    if (s.x < -60 || s.x > W + 60 || s.y < -60 || s.y > H + 60) {
                        const a = rand(0, Math.PI * 2);
                        const r = rand(10, 140);
                        s.x = cx + Math.cos(a) * r;
                        s.y = cy + Math.sin(a) * r;
                    }
                    const len = speed * 7;
                    bctx.strokeStyle = `hsla(${hue1}, 80%, 92%, ${0.25 + 0.75 * s.z})`;
                    bctx.lineWidth = s.r * 1.5;
                    bctx.beginPath();
                    bctx.moveTo(s.x, s.y);
                    bctx.lineTo(s.x - (dx / d) * len, s.y - (dy / d) * len);
                    bctx.stroke();
                    continue;
                }

                if (type === "void" && k > 0) {
                    suck(s, cx, cy, k, dt);
                    if (s.gone) continue;
                }

                const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(s.tw));
                bctx.globalAlpha = twinkle * (0.25 + 0.75 * s.z) * fieldAlpha;
                bctx.fillStyle = s.z > 0.8 ? `hsl(${hue1}, 100%, 92%)` : "#fff";
                bctx.beginPath();
                bctx.arc(s.x + px * 22 * s.z, s.y + py * 22 * s.z, s.r, 0, Math.PI * 2);
                bctx.fill();
            }
            bctx.globalAlpha = 1;
        }

        function drawGlyphs(dt, now, k) {
            const type = effect?.type;
            const visibility = type === "matrix" ? 1 - k : type === "warp" ? 1 - k * 0.8 : 1;
            const boost = type === "pi" ? 1 + k * 2 : 1;
            bctx.textAlign = "center";
            bctx.textBaseline = "middle";

            glyphs.forEach((g, i) => {
                if (g.gone) return;

                let size = g.size;
                if (type === "pi") {
                    const ring = i % 2;
                    const R = effect.radius + ring * 70;
                    size = 24 + ring * 6;
                    const dir = ring === 1 ? -1 : 1;
                    const a = (i / glyphs.length) * Math.PI * 2 + dir * (now - effect.start) * 0.0005;
                    const tx = effect.x + Math.cos(a) * R;
                    const ty = effect.y + Math.sin(a) * R * 0.92;
                    g.x += (tx - g.x) * 0.07 * dt;
                    g.y += (ty - g.y) * 0.07 * dt;
                    g.rot += (0 - g.rot) * 0.1 * dt;
                    g.ch = "π";
                } else {
                    if (type === "void" && k > 0) {
                        suck(g, effect.x, effect.y, k, dt);
                        if (g.gone) return;
                    }
                    g.vx += (g.bvx - g.vx) * 0.02 * dt;
                    g.vy += (g.bvy - g.vy) * 0.02 * dt;
                    g.x += g.vx * dt * motion;
                    g.y += g.vy * dt * motion;
                    g.rot += g.vr * dt * motion;
                    if (g.y < -50 || g.y > H + 120) Object.assign(g, makeGlyph(H + 40));
                    if (g.x < -60) g.x = W + 50;
                    else if (g.x > W + 60) g.x = -50;
                }

                bctx.save();
                bctx.translate(g.x + px * 40 * g.z, g.y + py * 40 * g.z);
                bctx.rotate(g.rot);
                bctx.font = `300 ${size}px Outfit, system-ui, sans-serif`;
                const depth = type === "pi" ? 0.8 : g.z;
                const alpha = Math.min(0.7, (0.04 + depth * 0.14) * visibility * fieldAlpha * boost);
                bctx.fillStyle = `hsla(${hue1 + (g.z - 0.5) * 50}, 90%, 78%, ${alpha})`;
                bctx.fillText(g.ch, 0, 0);
                bctx.restore();
            });
        }

        function drawMatrix(dt, k) {
            const size = 16;
            if (!columns.length) {
                for (let x = size / 2; x < W; x += size + 2) {
                    columns.push({
                        x,
                        y: rand(-H, 0),
                        speed: rand(2.5, 7),
                        len: Math.floor(rand(8, 26)),
                        chars: Array.from({ length: 26 }, () => pick(MATRIX)),
                    });
                }
            }
            bctx.font = `${size}px "JetBrains Mono", ui-monospace, monospace`;
            bctx.textAlign = "center";
            for (const c of columns) {
                c.y += c.speed * dt;
                if (Math.random() < 0.06) c.chars[Math.floor(Math.random() * c.chars.length)] = pick(MATRIX);
                for (let i = 0; i < c.len; i++) {
                    const y = c.y - i * size;
                    if (y < -size || y > H + size) continue;
                    bctx.fillStyle = i === 0
                        ? `rgba(220, 255, 230, ${0.95 * k})`
                        : `hsla(135, 100%, 55%, ${(1 - i / c.len) * 0.55 * k})`;
                    bctx.fillText(c.chars[i], c.x, y);
                }
                if (c.y - c.len * size > H) {
                    c.y = rand(-200, 0);
                    c.speed = rand(2.5, 7);
                }
            }
        }

        function drawVoid(now, k) {
            const { x, y } = effect;
            const shade = bctx.createRadialGradient(x, y, 0, x, y, Math.max(W, H) * 0.75);
            shade.addColorStop(0, `rgba(0, 0, 0, ${0.92 * k})`);
            shade.addColorStop(0.45, `rgba(0, 0, 0, ${0.55 * k})`);
            shade.addColorStop(1, "rgba(0, 0, 0, 0)");
            bctx.fillStyle = shade;
            bctx.fillRect(0, 0, W, H);

            // Tilted accretion disk
            bctx.save();
            bctx.translate(x, y);
            bctx.scale(1, 0.36);
            bctx.lineCap = "round";
            for (let i = 0; i < 40; i++) {
                const r = 190 + i * 7;
                const start = now * 0.0025 * (320 / r) + i * 1.7;
                bctx.strokeStyle = `hsla(${(i % 2 ? hue1 : hue2) + i * 2}, 100%, ${62 + (i % 3) * 8}%, ${k * (0.55 - i / 90)})`;
                bctx.lineWidth = 2.5 - i / 25;
                bctx.beginPath();
                bctx.arc(0, 0, r, start, start + 0.7 + (i % 5) * 0.35);
                bctx.stroke();
            }
            bctx.restore();
        }

        function spawnAura(dt) {
            const r = effect.rect;
            const count = Math.round(7 * dt);
            for (let i = 0; i < count; i++) {
                const side = Math.random();
                const t = Math.random();
                let x;
                let y;
                if (side < 0.4) {
                    x = r.left + t * r.width;
                    y = r.top + rand(-4, 12);
                } else if (side < 0.7) {
                    x = r.left + rand(-8, 6);
                    y = r.top + t * r.height;
                } else {
                    x = r.right + rand(-6, 8);
                    y = r.top + t * r.height;
                }
                backParticles.push({
                    kind: "spark", x, y,
                    vx: rand(-0.5, 0.5), vy: -rand(1.5, 5),
                    life: 1, decay: rand(0.012, 0.025),
                    size: rand(2, 5), hue: rand(38, 56), light: 60,
                });
            }
        }

        function maybeSpawnShooter(now) {
            if (now < nextShooter) return;
            nextShooter = now + rand(7000, 15000);
            if (effect || document.hidden) return;
            const fromLeft = Math.random() < 0.5;
            const angle = rand(0.25, 0.6);
            const speed = rand(4.5, 6.5) * (reducedMotion ? 0.6 : 1);
            shooters.push({
                x: fromLeft ? rand(-40, W * 0.5) : rand(W * 0.5, W + 40),
                y: rand(-30, H * 0.35),
                vx: Math.cos(angle) * speed * (fromLeft ? 1 : -1),
                vy: Math.sin(angle) * speed,
                trail: 170,
            });
        }

        function shooterTail(s) {
            const sp = Math.hypot(s.vx, s.vy);
            return { x: s.x - (s.vx / sp) * s.trail, y: s.y - (s.vy / sp) * s.trail };
        }

        function drawShooters(dt) {
            for (let i = shooters.length - 1; i >= 0; i--) {
                const s = shooters[i];
                s.x += s.vx * dt;
                s.y += s.vy * dt;
                if (s.x < -250 || s.x > W + 250 || s.y > H + 250) {
                    shooters.splice(i, 1);
                    continue;
                }
                const tail = shooterTail(s);
                const grad = bctx.createLinearGradient(s.x, s.y, tail.x, tail.y);
                grad.addColorStop(0, "rgba(255, 255, 255, 0.95)");
                grad.addColorStop(0.3, `hsla(${hue1}, 100%, 80%, 0.5)`);
                grad.addColorStop(1, "rgba(255, 255, 255, 0)");
                bctx.strokeStyle = grad;
                bctx.lineWidth = 2;
                bctx.lineCap = "round";
                bctx.beginPath();
                bctx.moveTo(s.x, s.y);
                bctx.lineTo(tail.x, tail.y);
                bctx.stroke();
                bctx.fillStyle = `hsla(${hue1}, 100%, 85%, 0.25)`;
                bctx.beginPath();
                bctx.arc(s.x, s.y, 8, 0, Math.PI * 2);
                bctx.fill();
                bctx.fillStyle = "#fff";
                bctx.beginPath();
                bctx.arc(s.x, s.y, 2.2, 0, Math.PI * 2);
                bctx.fill();
            }
        }

        function tryCatchStar(x, y) {
            for (let i = 0; i < shooters.length; i++) {
                const s = shooters[i];
                const tail = shooterTail(s);
                const vx = s.x - tail.x;
                const vy = s.y - tail.y;
                const t = clamp(((x - tail.x) * vx + (y - tail.y) * vy) / (vx * vx + vy * vy), 0, 1);
                const dist = Math.hypot(x - (tail.x + vx * t), y - (tail.y + vy * t));
                if (dist < 36) {
                    shooters.splice(i, 1);
                    burst(s.x, s.y, { count: 70, spread: 8 });
                    wishHandler(s.x, s.y);
                    return true;
                }
            }
            return false;
        }

        function drawRings(dt) {
            for (let i = rings.length - 1; i >= 0; i--) {
                const r = rings[i];
                r.r += (r.max - r.r) * 0.03 * dt + 1.5 * dt;
                r.life -= 0.016 * dt;
                if (r.life <= 0) {
                    rings.splice(i, 1);
                    continue;
                }
                bctx.strokeStyle = `hsla(${hue1}, 95%, 72%, ${r.life * 0.4})`;
                bctx.lineWidth = 1 + r.life * 2.5;
                bctx.beginPath();
                bctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
                bctx.stroke();
            }
        }

        function drawMoon() {
            const R = Math.min(40, W * 0.05 + 16);
            const x = W * 0.84 + px * 12;
            const y = H * 0.16 + py * 12;
            const glow = bctx.createRadialGradient(x, y, R * 0.8, x, y, R * 4.5);
            glow.addColorStop(0, "rgba(255, 244, 214, 0.22)");
            glow.addColorStop(1, "rgba(255, 244, 214, 0)");
            bctx.fillStyle = glow;
            bctx.beginPath();
            bctx.arc(x, y, R * 4.5, 0, Math.PI * 2);
            bctx.fill();

            const body = bctx.createRadialGradient(x - R * 0.35, y - R * 0.35, R * 0.1, x, y, R);
            body.addColorStop(0, "#fffbea");
            body.addColorStop(1, "#d6cfb8");
            bctx.fillStyle = body;
            bctx.beginPath();
            bctx.arc(x, y, R, 0, Math.PI * 2);
            bctx.fill();

            bctx.fillStyle = "rgba(140, 130, 110, 0.22)";
            for (const [cx, cy, cr] of [[-0.3, -0.1, 0.22], [0.28, 0.22, 0.16], [0.05, -0.42, 0.1], [-0.12, 0.4, 0.12]]) {
                bctx.beginPath();
                bctx.arc(x + cx * R, y + cy * R, cr * R, 0, Math.PI * 2);
                bctx.fill();
            }
        }

        function drawParticles(ctx, list, dt) {
            for (let i = list.length - 1; i >= 0; i--) {
                const p = list[i];
                p.life -= p.decay * dt;
                if (p.life <= 0 || p.y > H + 80) {
                    list.splice(i, 1);
                    continue;
                }
                p.vy += (p.gravity || 0) * dt;
                if (p.drag) {
                    p.vx *= p.drag;
                    p.vy *= p.drag;
                }
                p.x += p.vx * dt;
                p.y += p.vy * dt;

                if (p.kind === "spark") {
                    ctx.globalCompositeOperation = "lighter";
                    ctx.globalAlpha = p.life;
                    ctx.fillStyle = `hsla(${p.hue}, 100%, ${p.light}%, 0.3)`;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size * 2.6, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = `hsl(${p.hue}, 100%, 88%)`;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, Math.max(0.4, p.size * 0.7 * p.life), 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalCompositeOperation = "source-over";
                } else if (p.kind === "confetti") {
                    p.rot += p.vr * dt;
                    p.vx += Math.sin(p.rot) * 0.04 * dt;
                    ctx.globalAlpha = Math.min(1, p.life * 3);
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.rot);
                    ctx.scale(1, Math.cos(p.rot * 1.7));
                    ctx.fillStyle = `hsl(${p.hue}, 95%, 62%)`;
                    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                    ctx.restore();
                } else if (p.kind === "coin") {
                    p.rot += p.vr * dt;
                    const rx = Math.max(1, Math.abs(Math.cos(p.rot)) * p.r);
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = "#ffcf3f";
                    ctx.strokeStyle = "#b9800f";
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.ellipse(p.x, p.y, rx, p.r, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                    ctx.fillStyle = "rgba(255, 246, 190, 0.8)";
                    ctx.beginPath();
                    ctx.ellipse(p.x - rx * 0.25, p.y - p.r * 0.3, rx * 0.35, p.r * 0.3, 0, 0, Math.PI * 2);
                    ctx.fill();
                } else if (p.kind === "text") {
                    p.size += 0.15 * dt;
                    ctx.globalAlpha = p.life * 0.85;
                    ctx.font = `400 ${p.size}px Outfit, system-ui, sans-serif`;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillStyle = `hsl(${hue1}, 95%, 82%)`;
                    ctx.fillText(p.ch, p.x, p.y);
                }
            }
            ctx.globalAlpha = 1;
        }

        function tick(now) {
            const dt = Math.min(3, (now - last) / 16.667);
            last = now;
            frame++;
            if (frame % 3 === 0) readHues();
            px += (tpx - px) * 0.04 * dt;
            py += (tpy - py) * 0.04 * dt;
            fieldAlpha = Math.min(1, fieldAlpha + 0.012 * dt);

            let k = 0;
            if (effect) {
                const p = (now - effect.start) / effect.duration;
                if (p >= 1) endEffect();
                else k = effect.envelope(p);
            }

            bctx.clearRect(0, 0, W, H);
            fctx.clearRect(0, 0, W, H);

            if (moon) drawMoon();
            drawStars(dt, k);
            drawGlyphs(dt, now, k);
            if (effect?.type === "matrix") drawMatrix(dt, k);
            if (effect?.type === "void") drawVoid(now, k);
            if (effect?.type === "aura") spawnAura(dt);
            maybeSpawnShooter(now);
            drawShooters(dt);
            drawRings(dt);
            drawParticles(bctx, backParticles, dt);
            drawParticles(fctx, frontParticles, dt);

            requestAnimationFrame(tick);
        }

        function startEffect(type, duration) {
            if (effect) endEffect();
            const c = centerOf(tilt);
            effect = {
                type,
                duration,
                start: performance.now(),
                x: type === "warp" ? W / 2 : c.x,
                y: type === "warp" ? H / 2 : c.y,
                rect: c.rect,
                radius: Math.max(c.w, c.h) / 2 + 20,
                envelope: ENVELOPES[type] || ENVELOPES.default,
            };
            if (type === "pi") glyphs.forEach((g) => { g.base = g.ch; });
        }

        function endEffect() {
            const e = effect;
            effect = null;
            if (!e) return;
            if (e.type === "warp" || e.type === "void") seed();
            if (e.type === "matrix") columns = [];
            if (e.type === "pi") {
                for (const g of glyphs) {
                    if (g.base) g.ch = g.base;
                    const a = Math.atan2(g.y - e.y, g.x - e.x);
                    const s = rand(2, 5);
                    g.vx = Math.cos(a) * s;
                    g.vy = Math.sin(a) * s;
                }
            }
        }

        function burst(x, y, { count = 40, spread = 6, hue = null, layer = "front" } = {}) {
            const list = layer === "front" ? frontParticles : backParticles;
            for (let i = 0; i < count; i++) {
                const a = rand(0, Math.PI * 2);
                const s = rand(1, spread);
                list.push({
                    kind: "spark", x, y,
                    vx: Math.cos(a) * s, vy: Math.sin(a) * s,
                    drag: 0.95, gravity: 0.03,
                    life: 1, decay: rand(0.015, 0.03),
                    size: rand(1.5, 3.5),
                    hue: hue ?? (Math.random() < 0.5 ? hue1 : hue2), light: 70,
                });
            }
        }

        function confetti({ x = W / 2, y = H + 10, count = 140, rainbow = true } = {}) {
            for (let i = 0; i < count; i++) {
                const a = rand(-Math.PI * 0.78, -Math.PI * 0.22);
                const s = rand(8, 18);
                frontParticles.push({
                    kind: "confetti", x, y,
                    vx: Math.cos(a) * s, vy: Math.sin(a) * s,
                    gravity: 0.2, drag: 0.985,
                    life: 1, decay: rand(0.004, 0.008),
                    w: rand(6, 11), h: rand(3, 6),
                    rot: rand(0, Math.PI * 2), vr: rand(-0.2, 0.2),
                    hue: rainbow ? rand(0, 360) : Math.random() < 0.5 ? hue1 : hue2,
                });
            }
        }

        function coins(count = 110) {
            for (let i = 0; i < count; i++) {
                frontParticles.push({
                    kind: "coin",
                    x: rand(0, W), y: rand(-H * 0.8, -20),
                    vx: rand(-0.8, 0.8), vy: rand(2, 5),
                    gravity: 0.12, drag: 0.995,
                    life: 1, decay: 0.002,
                    rot: rand(0, Math.PI * 2), vr: rand(0.06, 0.2),
                    r: rand(7, 13),
                });
            }
        }

        resize();
        window.addEventListener("resize", resize);
        requestAnimationFrame(tick);

        return {
            pointer(nx, ny) {
                tpx = nx * 2 - 1;
                tpy = ny * 2 - 1;
            },
            ring(x, y) {
                rings.push({ x, y, r: 160, max: Math.max(W, H) * 0.8, life: 1 });
            },
            release(x, y, ch) {
                frontParticles.push({
                    kind: "text", ch, x, y: y - 8,
                    vx: rand(-0.3, 0.3), vy: -2.4, drag: 0.95,
                    life: 1, decay: 0.03, size: 20,
                });
            },
            burst,
            confetti,
            coins,
            startEffect,
            tryCatchStar,
            setMoon(on) {
                moon = on;
            },
            onWish(fn) {
                wishHandler = fn;
            },
        };
    })();

    // ---------- Display: prettify, number formatting, auto-fit ----------

    const PRETTY = { "*": "×", "/": "÷", "-": "−", "+": "+" };
    let answerRaw = "";

    function prettify(text) {
        return text
            .replace(/([\d.])\s*([+\-*/])\s*/g, (_, d, op) => `${d} ${PRETTY[op]} `)
            .replace(/[*/-]/g, (op) => PRETTY[op]);
    }

    function unprettify(text) {
        return text.replace(/\s/g, "").replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
    }

    function formatNumber(raw) {
        if (!/^-?\d+(\.\d+)?$/.test(raw)) return raw;
        const [int, dec] = raw.split(".");
        const sign = int.startsWith("-") ? "−" : "";
        const grouped = int.replace("-", "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        return sign + grouped + (dec ? `.${dec}` : "");
    }

    function fitText(el, chars) {
        const len = el.textContent.length;
        el.style.setProperty("--fit", Math.max(0.36, Math.min(1, chars / Math.max(len, 1))).toFixed(3));
    }

    const exprObserver = new MutationObserver(() => {
        const raw = exprEl.textContent;
        const pretty = prettify(raw);
        if (pretty !== raw) exprEl.textContent = pretty;
        exprObserver.takeRecords();
        fitText(exprEl, 11);
        if (!answerRaw && raw === "0.7734") hello();
    });
    exprObserver.observe(exprEl, { childList: true, characterData: true, subtree: true });

    const answerObserver = new MutationObserver(() => {
        handleAnswer(answerEl.textContent);
        answerObserver.takeRecords();
    });
    answerObserver.observe(answerEl, { childList: true, characterData: true, subtree: true });

    function handleAnswer(raw) {
        answerEl.classList.remove("is-error");
        if (raw === "") {
            answerRaw = "";
            return;
        }

        if (!Number.isFinite(Number(raw))) {
            answerRaw = "";
            answerEl.classList.add("is-error");
            replayClass(answerEl, "pop", 600);
            replayClass(display, "fx-shake", 500);
            sound.play("error");
            if (/zero/i.test(raw)) eventHorizon();
            return;
        }

        answerRaw = raw;
        const pretty = formatNumber(raw);
        if (pretty !== raw) answerEl.textContent = pretty;
        fitText(answerEl, 10);
        replayClass(answerEl, "pop", 650);
        const c = centerOf(tilt);
        sky.ring(c.x, c.y);
        recordHistory(exprEl.textContent, raw);
        checkEggs(raw);
    }

    display.addEventListener("click", () => {
        const text = answerRaw || unprettify(exprEl.textContent);
        if (text) copyText(text);
    });

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            toast({ icon: "📋", title: "Copied to clipboard", text, duration: 2200 });
        } catch {
            toast({ icon: "⚠️", title: "Couldn't copy", text: "Your browser blocked clipboard access." });
        }
    }

    // ---------- Keypad feel: spotlight, ripple, floating glyphs, sound ----------

    let replaying = false;

    function kindOf(label) {
        if (/^\d$/.test(label)) return "digit";
        if (label === ".") return "dot";
        if (label === "=") return "equals";
        if (label === "C") return "clear";
        return "op";
    }

    pad.addEventListener("pointermove", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;
        const r = btn.getBoundingClientRect();
        btn.style.setProperty("--mx", `${e.clientX - r.left}px`);
        btn.style.setProperty("--my", `${e.clientY - r.top}px`);
    });

    pad.addEventListener("pointerdown", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;
        const r = btn.getBoundingClientRect();
        btn.style.setProperty("--rx", `${e.clientX - r.left}px`);
        btn.style.setProperty("--ry", `${e.clientY - r.top}px`);
        replayClass(btn, "rippling", 700);
    });

    // Bubbles up after script.js's own click handler has already run.
    pad.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn || replaying) return;
        const label = btn.textContent;
        sound.play(kindOf(label), label);
        if (label !== "C") {
            const r = btn.getBoundingClientRect();
            sky.release(r.left + r.width / 2, r.top + r.height / 2, btn.dataset.symbol || label);
        }
    });

    function flash(btn) {
        btn.style.setProperty("--rx", "50%");
        btn.style.setProperty("--ry", "50%");
        replayClass(btn, "is-pressed", 130);
        replayClass(btn, "rippling", 700);
    }

    // ---------- Keyboard support ----------

    const KEY_ALIASES = { Enter: "=", Escape: "C", Delete: "C", c: "C", x: "*", X: "*", ",": "." };
    const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
    let konamiPos = 0;

    function trackKonami(key) {
        const k = key.length === 1 ? key.toLowerCase() : key;
        if (k === KONAMI[konamiPos]) {
            konamiPos++;
        } else if (k === "ArrowUp") {
            konamiPos = konamiPos === 2 ? 2 : 1;
        } else {
            konamiPos = 0;
        }
        if (konamiPos === KONAMI.length) {
            konamiPos = 0;
            togglePartyMode();
        }
    }

    window.addEventListener("keydown", (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        trackKonami(e.key);
        if (document.querySelector("dialog[open]")) return;
        const btn = keyMap.get(KEY_ALIASES[e.key] ?? e.key);
        if (!btn) return;
        e.preventDefault();
        btn.click();
        flash(btn);
    });

    // ---------- 3D tilt + parallax ----------

    window.addEventListener("pointermove", (e) => {
        sky.pointer(e.clientX / window.innerWidth, e.clientY / window.innerHeight);
    });

    if (finePointer && !reducedMotion) {
        let pending = null;
        window.addEventListener("pointermove", (e) => {
            const first = !pending;
            pending = e;
            if (!first) return;
            requestAnimationFrame(() => {
                const r = tilt.getBoundingClientRect();
                const nx = clamp((pending.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2), -1, 1);
                const ny = clamp((pending.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2), -1, 1);
                calc.style.setProperty("--ry", `${nx * 7}deg`);
                calc.style.setProperty("--rx", `${-ny * 7}deg`);
                calc.style.setProperty("--gx", `${((pending.clientX - r.left) / r.width) * 100}%`);
                calc.style.setProperty("--gy", `${((pending.clientY - r.top) / r.height) * 100}%`);
                pending = null;
            });
        });
        root.addEventListener("mouseleave", () => {
            calc.style.setProperty("--rx", "0deg");
            calc.style.setProperty("--ry", "0deg");
        });
    }

    // ---------- Themes ----------

    const themeDots = Array.from(document.querySelectorAll(".theme-dot"));
    const goldDot = themeDots.find((d) => d.dataset.theme === "gold");

    function applyTheme(name) {
        const dot = themeDots.find((d) => d.dataset.theme === name && !d.hidden) || themeDots[0];
        root.dataset.theme = dot.dataset.theme;
        themeDots.forEach((d) => d.setAttribute("aria-pressed", String(d === dot)));
        state.theme = dot.dataset.theme;
        save();
    }

    themeDots.forEach((dot) => {
        dot.addEventListener("click", () => {
            if (root.dataset.theme === dot.dataset.theme) return;
            applyTheme(dot.dataset.theme);
            sound.play("theme");
            const r = dot.getBoundingClientRect();
            sky.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 24, spread: 4 });
        });
    });

    // ---------- Sound toggle ----------

    const soundBtn = document.getElementById("sound-btn");

    function syncSound() {
        soundBtn.setAttribute("aria-pressed", String(state.sound));
        soundBtn.title = state.sound ? "Sound on: every digit is a note" : "Sound off";
    }

    soundBtn.addEventListener("click", () => {
        state.sound = !state.sound;
        save();
        syncSound();
        if (state.sound) {
            sound.play("theme");
            toast({ icon: "🎹", title: "Sound on", text: "Every digit is a note. Try typing 1 2 3 5 3 2 1.", duration: 3200 });
        }
    });

    // ---------- History ----------

    const historyPanel = document.getElementById("history-panel");
    const historyList = document.getElementById("history-list");
    const historyEmpty = document.getElementById("history-empty");
    const historyClear = document.getElementById("history-clear");

    function recordHistory(expr, result) {
        if (!expr) return;
        state.history.unshift({ expr, result });
        state.history = state.history.slice(0, 40);
        save();
        renderHistory();
    }

    function renderHistory() {
        historyEmpty.hidden = state.history.length > 0;
        historyClear.hidden = state.history.length === 0;
        historyList.replaceChildren(...state.history.map((item, i) => {
            const li = document.createElement("li");
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "history-item";
            btn.style.animationDelay = `${Math.min(i, 12) * 30}ms`;
            const expr = document.createElement("span");
            expr.className = "h-expr";
            expr.textContent = item.expr;
            const result = document.createElement("span");
            result.className = "h-result";
            result.textContent = `= ${formatNumber(String(item.result))}`;
            btn.append(expr, result);
            btn.addEventListener("click", () => useResult(String(item.result)));
            li.append(btn);
            return li;
        }));
    }

    // Re-enters a past result by pressing the real keypad buttons.
    function useResult(raw) {
        if (!/^\d+(\.\d+)?$/.test(raw)) {
            copyText(raw);
            return;
        }
        replaying = true;
        keyMap.get("C").click();
        for (const ch of raw) keyMap.get(ch)?.click();
        replaying = false;
        historyPanel.close();
        replayClass(display, "fx-flash", 500);
    }

    document.getElementById("history-btn").addEventListener("click", () => {
        renderHistory();
        historyPanel.showModal();
    });

    historyClear.addEventListener("click", () => {
        state.history = [];
        save();
        renderHistory();
    });

    // ---------- Dialog plumbing ----------

    document.querySelectorAll("dialog").forEach((dialog) => {
        dialog.addEventListener("click", (e) => {
            if (e.target === dialog || e.target.closest("[data-close]")) dialog.close();
        });
    });

    // ---------- Secrets ----------

    const SECRETS = [
        { id: "deep-thought", icon: "🌌", name: "Deep Thought", hint: "Calculate the Answer to the Ultimate Question.", found: "42: Life, the Universe, and Everything." },
        { id: "event-horizon", icon: "🕳️", name: "Event Horizon", hint: "Do the one thing math forbids.", found: "You divided by zero and opened a black hole." },
        { id: "hello", icon: "👋", name: "hELLO", hint: "Old calculator trick: 0.7734, read upside down.", found: "The oldest calculator joke in the book." },
        { id: "leet", icon: "💻", name: "Access Granted", hint: "Only elite hackers get this number.", found: "1337 unlocks hacker mode." },
        { id: "over-9000", icon: "💥", name: "It's Over 9000", hint: "What does the scouter say about his power level?", found: "9001. There's no way that can be right!" },
        { id: "jackpot", icon: "🎰", name: "Jackpot", hint: "Lucky number, three in a row.", found: "777 makes it rain." },
        { id: "pi", icon: "🥧", name: "As Easy As π", hint: "355 divided by 113 is suspiciously round.", found: "π, correct to six decimal places." },
        { id: "not-found", icon: "👾", name: "Not Found", hint: "The web's most famous error code.", found: "404: answer not found (it was right there)." },
        { id: "quick-maths", icon: "🧢", name: "Quick Maths", hint: "Two plus two is…", found: "…four, minus one, that's three. Quick maths." },
        { id: "konami", icon: "🎮", name: "Up Up Down Down", hint: "↑ ↑ ↓ ↓ ← → ← → … you know the rest.", found: "Party mode. Enter the code again to turn it off." },
        { id: "wish", icon: "🌠", name: "Make a Wish", hint: "Keep an eye on the sky, and be quick.", found: "You caught a shooting star." },
        { id: "night-owl", icon: "🌙", name: "Night Owl", hint: "Come back after midnight.", found: "The moon comes out for late-night math." },
        { id: "maker", icon: "✍️", name: "The Maker", hint: "The logo likes attention. Lots of it.", found: "You met the person who built this." },
    ];

    const secretsPanel = document.getElementById("secrets-panel");
    const secretsBtn = document.getElementById("secrets-btn");
    const secretCount = document.getElementById("secret-count");
    const secretsSub = document.getElementById("secrets-sub");
    const secretsBar = document.getElementById("secrets-bar");
    const secretList = document.getElementById("secret-list");
    const secretsReset = document.getElementById("secrets-reset");

    function renderSecrets() {
        const found = state.secrets.filter((id) => SECRETS.some((s) => s.id === id)).length;
        const total = SECRETS.length;
        secretCount.textContent = `${found}/${total}`;
        secretsBtn.setAttribute("aria-label", `Secrets found: ${found} of ${total}`);
        secretsSub.textContent = found === total
            ? "Every secret found. Legendary."
            : `${found} of ${total} found. Hints below if you're stuck.`;
        secretsBar.style.width = `${(found / total) * 100}%`;
        goldDot.hidden = found < total;

        secretList.replaceChildren(...SECRETS.map((s) => {
            const isFound = state.secrets.includes(s.id);
            const li = document.createElement("li");
            li.className = isFound ? "secret found" : "secret";
            const icon = document.createElement("span");
            icon.className = "secret-icon";
            icon.textContent = isFound ? s.icon : "🔒";
            const body = document.createElement("div");
            const name = document.createElement("span");
            name.className = "secret-name";
            name.textContent = isFound ? s.name : "???";
            const text = document.createElement("span");
            text.className = "secret-text";
            text.textContent = isFound ? s.found : s.hint;
            body.append(name, text);
            li.append(icon, body);
            return li;
        }));
    }

    function secretFound(id) {
        if (state.secrets.includes(id)) return;
        state.secrets.push(id);
        save();
        renderSecrets();
        const s = SECRETS.find((x) => x.id === id);
        const n = state.secrets.length;
        setTimeout(() => {
            sound.play("secret");
            toast({
                icon: "🥚",
                tone: "secret",
                badge: `Secret ${n} of ${SECRETS.length}`,
                title: `You found “${s.name}”`,
                text: "Open the 🥚 below the calculator for hints to the rest.",
            });
            replayClass(secretsBtn, "bump", 800);
            if (n === SECRETS.length) setTimeout(allSecretsFound, 1500);
        }, 1100);
    }

    function allSecretsFound() {
        renderSecrets();
        applyTheme("gold");
        sky.confetti({ count: 220 });
        setTimeout(() => sky.coins(80), 400);
        sound.play("secret");
        toast({ icon: "🏆", title: "Every secret found", text: "You unlocked the Gold theme. Absolute legend.", duration: 6000 });
    }

    secretsBtn.addEventListener("click", () => {
        renderSecrets();
        secretsPanel.showModal();
    });

    let resetArmed = false;
    secretsReset.addEventListener("click", () => {
        if (!resetArmed) {
            resetArmed = true;
            secretsReset.textContent = "Click again to forget everything";
            secretsReset.classList.add("danger");
            setTimeout(() => {
                resetArmed = false;
                secretsReset.textContent = "Reset progress";
                secretsReset.classList.remove("danger");
            }, 3000);
            return;
        }
        resetArmed = false;
        secretsReset.textContent = "Reset progress";
        secretsReset.classList.remove("danger");
        state.secrets = [];
        save();
        renderSecrets();
        if (root.dataset.theme === "gold") applyTheme("aurora");
    });

    // ---------- The easter eggs ----------

    function checkEggs(raw) {
        const expr = unprettify(exprEl.textContent);
        if (raw === "42") deepThought();
        else if (raw === "1337") leet();
        else if (raw === "9001") over9000();
        else if (raw === "777") jackpot();
        else if (raw === "404") notFound();
        else if (raw === "0.7734") hello();
        else if (raw.startsWith("3.14159")) pi();
        else if (raw === "4" && expr === "2+2") quickMaths();
    }

    function deepThought() {
        sky.startEffect("warp", 2800);
        toast({ icon: "🌌", title: "The Answer", text: "42: Life, the Universe, and Everything. Now, what was the question?" });
        secretFound("deep-thought");
    }

    function eventHorizon() {
        replayClass(calc, "fx-void", 3200);
        sky.startEffect("void", 3200);
        toast({ icon: "🕳️", title: "Event horizon reached", text: "You divided by zero. The universe noticed." });
        secretFound("event-horizon");
    }

    let matrixTimer = 0;
    function leet() {
        root.classList.add("mode-matrix");
        clearTimeout(matrixTimer);
        matrixTimer = setTimeout(() => root.classList.remove("mode-matrix"), 7000);
        sky.startEffect("matrix", 7000);
        toast({ icon: "💻", title: "Access granted", text: "Welcome back, 1337 h4x0r." });
        secretFound("leet");
    }

    function over9000() {
        replayClass(calc, "fx-power", 2400);
        sky.startEffect("aura", 2400);
        toast({ icon: "💥", title: "IT'S OVER 9000!", text: "What, 9000?! There's no way that can be right!" });
        secretFound("over-9000");
    }

    function jackpot() {
        sky.coins();
        toast({ icon: "🎰", title: "Jackpot!", text: "7 · 7 · 7. Lady luck is on your side." });
        secretFound("jackpot");
    }

    function notFound() {
        replayClass(display, "fx-glitch", 1300);
        toast({ icon: "👾", title: "Error 404", text: "Answer not found. Just kidding, it's right there." });
        secretFound("not-found");
    }

    let helloCooldown = 0;
    function hello() {
        if (Date.now() < helloCooldown) return;
        helloCooldown = Date.now() + 4500;
        replayClass(display, "fx-flip", 3800);
        toast({ icon: "👋", title: "hELLO", text: "Turned upside down, 0.7734 says hi. The oldest calculator joke there is." });
        secretFound("hello");
    }

    function pi() {
        sky.startEffect("pi", 5500);
        toast({ icon: "🥧", title: "As easy as π", text: "355 ÷ 113 gets π right to six decimal places." });
        secretFound("pi");
    }

    function quickMaths() {
        const r = display.getBoundingClientRect();
        sky.confetti({ x: r.left + r.width / 2, y: r.top + r.height / 2, count: 60 });
        toast({ icon: "🧢", title: "Quick maths", text: "2 plus 2 is 4, minus 1, that's 3." });
        secretFound("quick-maths");
    }

    function togglePartyMode() {
        const on = root.classList.toggle("party");
        if (on) {
            sky.confetti({ count: 180 });
            sound.play("secret");
            toast({ icon: "🎮", title: "Party mode", text: "Cheat code accepted. Enter it again to calm things down." });
            secretFound("konami");
        } else {
            sound.play("clear");
            toast({ icon: "😌", title: "Party's over", text: "Back to business." });
        }
    }

    const WISHES = [
        "May all your remainders be zero.",
        "Your next calculation will be flawless.",
        "May your bugs be few and your coffee strong.",
        "Infinite luck, rounded to six decimals.",
        "Wish granted: one extra decimal place of happiness.",
    ];

    sky.onWish(() => {
        sound.play("secret");
        toast({ icon: "🌠", title: "You caught a shooting star", text: pick(WISHES) });
        secretFound("wish");
    });

    window.addEventListener("pointerdown", (e) => {
        if (e.target.closest(".calculator, .dock, .hint, dialog")) return;
        sky.tryCatchStar(e.clientX, e.clientY);
    });

    const brand = document.querySelector(".brand");
    const signaturePanel = document.getElementById("signature-panel");
    let brandClicks = 0;
    let brandTimer = 0;

    brand.addEventListener("click", () => {
        brandClicks++;
        clearTimeout(brandTimer);
        brandTimer = setTimeout(() => { brandClicks = 0; }, 1500);
        replayClass(brand, "wiggle", 400);
        const r = brand.getBoundingClientRect();
        sky.burst(r.left + 8, r.top + r.height / 2, { count: 6 + brandClicks * 4, spread: 2 + brandClicks });
        if (brandClicks >= 7) {
            brandClicks = 0;
            signaturePanel.showModal();
            sky.confetti({ count: 120, rainbow: false });
            secretFound("maker");
        }
    });

    // ---------- Boot ----------

    applyTheme(state.theme);
    syncSound();
    renderSecrets();
    renderHistory();

    const hour = new Date().getHours();
    if (hour < 5) {
        sky.setMoon(true);
        if (!state.secrets.includes("night-owl")) {
            setTimeout(() => {
                toast({ icon: "🌙", title: "Burning the midnight oil?", text: "The moon came out to keep you company." });
                secretFound("night-owl");
            }, 1800);
        }
    }

    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("booting")));
})();
