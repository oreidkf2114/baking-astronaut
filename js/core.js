// Baking Astronaut — Solo · core
// 캔버스 / 입력 / 사운드(WebAudio) / 음성(TTS) / 장면 전환. 외부 의존성 없음.
// 공연판의 bridge·GM relay·TouchDesigner·VCV·Arduino 역할을 전부 이 한 파일이 브라우저 안에서 대신한다.

window.BA = (() => {
  "use strict";

  const cv = document.getElementById("stage");
  const ctx = cv.getContext("2d");
  let DPR = Math.min(window.devicePixelRatio || 1, 2);
  const FONT = '"Courier New","D2Coding","Malgun Gothic","Apple SD Gothic Neo",monospace';

  const C = {
    bg: "#080808",
    white: "#D8D8D8",
    text: "rgba(255,255,255,0.85)",
    dim: "rgba(255,255,255,0.45)",
    ghost: "rgba(255,255,255,0.2)",
    green: "#A0FFA0",
    amber: "#f1c453",
    red: "#e8392a",
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const R = Math.random;
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  const BA = { ctx, C, FONT, clamp, lerp, R, hash, W: 0, H: 0, U: 1, time: 0, fs: 1, hot: false, locked: false, dead: 0, shakeAmt: 0 };

  function resize() {
    BA.W = window.innerWidth;
    BA.H = window.innerHeight;
    if (BA.lite) DPR = 1;
    cv.width = Math.floor(BA.W * DPR);
    cv.height = Math.floor(BA.H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = false;
    BA.U = clamp(Math.min(BA.W / 1280, BA.H / 720), 0.55, 1.8);
    // 핸드폰(세로로 좁은 화면) — 글자·도형 배율을 화면 폭에 맞춰 키운다
    BA.touch = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
    BA.mobile = BA.W < 700 && BA.H > BA.W;
    if (BA.mobile) BA.U = clamp(BA.W / 500, 0.66, 0.95);
  }
  window.addEventListener("resize", resize);
  resize();

  // ───── pointer ─────────────────────────────────────────────
  const P = { x: BA.W / 2, y: BA.H / 2, down: false, pressed: false, click: false, wheel: 0 };
  BA.P = P;
  cv.addEventListener("pointermove", (e) => { P.x = e.clientX; P.y = e.clientY; });
  cv.addEventListener("pointerdown", (e) => {
    P.x = e.clientX; P.y = e.clientY; P.down = true; P.pressed = true;
    try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    Snd.init();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  });
  const up = (e) => { if (P.down) P.click = true; P.down = false; if (e.clientX != null) { P.x = e.clientX; P.y = e.clientY; } };
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", () => { P.down = false; });
  cv.addEventListener("wheel", (e) => { P.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  cv.addEventListener("contextmenu", (e) => e.preventDefault());

  // ───── drawing helpers ─────────────────────────────────────
  const fontPx = (size) => Math.max(BA.mobile ? 9 : 8, Math.round(size * BA.U));
  function setFont(size, bold) { ctx.font = (bold ? "700 " : "") + fontPx(size) + "px " + FONT; }
  // 터치 기기에서는 마우스 말투를 손가락 말투로 바꿔 읽는다
  const touchWords = (s) => s.replace("마우스를 움직여", "화면을 문질러").replace("마우스: 누른 채", "누른 채").replace(" · 휠 = 손 넓이", "").replace(/마우스/g, "손가락").replace(/클릭/g, "터치");

  function T(s, x, y, o) {
    o = o || {};
    if (BA.touch && typeof s === "string") s = touchWords(s);
    setFont(o.size || 14, o.bold);
    const al = o.align || "center";
    ctx.textAlign = al;
    ctx.textBaseline = o.base || "middle";
    ctx.globalAlpha = o.alpha == null ? 1 : clamp(o.alpha, 0, 1);
    ctx.fillStyle = o.color || C.text;
    // 좁은 화면 — 넘치는 글은 두 줄로 나누고, 그래도 넘치면 글자를 줄인다
    if (BA.mobile && typeof s === "string") {
      const room = Math.max(60, al === "center" ? 2 * Math.min(x, BA.W - x) - 10 : al === "left" ? BA.W - x - 6 : x - 6), w = ctx.measureText(s).width;
      if (w > room) {
        const px = fontPx(o.size || 14), shrink = (ww) => { ctx.font = (o.bold ? "700 " : "") + Math.max(7, Math.floor(px * room / ww)) + "px " + FONT; };
        let cut = -1;
        if (!o.one && w > room * 1.2) for (let i = 1; i < s.length - 1; i++) if (s[i] === " " && (cut < 0 || Math.abs(i - s.length / 2) < Math.abs(cut - s.length / 2))) cut = i;
        if (cut > 0) {
          const a = s.slice(0, cut), b = s.slice(cut + 1), w2 = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
          if (w2 > room) shrink(w2);
          ctx.fillText(a, x, y - px * 0.62); ctx.fillText(b, x, y + px * 0.62);
          ctx.globalAlpha = 1;
          return;
        }
        shrink(w);
      }
    }
    ctx.fillText(s, x, y);
    ctx.globalAlpha = 1;
  }

  function clear(alpha) {
    // 잔상 알파를 60fps 기준으로 보정 (고주사율 모니터에서도 같은 길이의 꼬리)
    if (alpha != null && alpha < 1) alpha = 1 - Math.pow(1 - alpha, BA.fs);
    ctx.fillStyle = alpha == null || alpha >= 1 ? C.bg : "rgba(8,8,8," + alpha.toFixed(4) + ")";
    ctx.fillRect(0, 0, BA.W, BA.H);
  }

  const inRect = (px, py, x, y, w, h) => px >= x && px <= x + w && py >= y && py <= y + h;

  // immediate-mode 버튼: 그리면서 클릭 여부를 돌려준다
  const btnRects = [];
  function Btn(label, cx, cy, o) {
    o = o || {};
    const fs = o.size || 14;
    setFont(fs, true);
    if (BA.touch) label = touchWords(label);
    let w = o.w || ctx.measureText(label).width + 40 * BA.U;
    const h = Math.max(o.h || fs * BA.U * 2.7, BA.mobile ? 34 : 0);       // 손가락으로 누를 수 있는 높이
    if (BA.mobile) {
      // 화면 밖으로 나가지 않게 하고, 같은 줄의 다른 버튼과 겹치면 한 줄 위로 올린다
      w = Math.min(w, BA.W - 16); cx = clamp(cx, w / 2 + 8, BA.W - w / 2 - 8);
      for (let n = 0; n < 6; n++) {
        const hit = btnRects.find((r) => Math.abs(r.cx - cx) < (r.w + w) / 2 + 4 && Math.abs(r.cy - cy) < (r.h + h) / 2 + 2);
        if (!hit) break;
        cy = hit.cy - (hit.h + h) / 2 - 8;
      }
      btnRects.push({ cx, cy, w, h });
    }
    const x = cx - w / 2, y = cy - h / 2;
    const hov = !o.disabled && !BA.locked && inRect(P.x, P.y, x, y, w, h);
    if (hov) BA.hot = true;
    const col = o.disabled ? C.ghost : (o.color || C.white);
    ctx.lineWidth = 1;
    if (hov) { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); }
    else { ctx.fillStyle = "rgba(8,8,8,0.82)"; ctx.fillRect(x, y, w, h); }
    ctx.strokeStyle = col;
    ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(h));
    T(label, cx, cy + 1, { size: fs, bold: true, color: hov ? C.bg : col, one: true });
    if (hov && P.click) { Snd.blip(880, 0.05, "square", 0.05); return true; }
    return false;
  }

  // 글자를 깨뜨린다 — amt 0(읽힘) ~ 1(전부 깨짐)
  const GLYPH = "ㅂㅏㄹㅎㅛㅈㅜㅇ▒░#/\\<>01·:;";
  function garble(s, amt, t) {
    if (amt <= 0.01) return s;
    const k = Math.floor((t == null ? BA.time : t) * 9);
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === " ") { out += ch; continue; }
      out += hash(i * 13.37 + s.length) < amt
        ? GLYPH[Math.floor(hash(i * 7.1 + k * 3.3) * GLYPH.length)]
        : ch;
    }
    return out;
  }

  // ───── sprites ─────────────────────────────────────────────
  // 둥근 현창이 달린 로켓 — W 선체 · D 그늘/노즐 · G 현창 유리
  const SHIP = [
    "......W......",
    ".....WWW.....",
    "....WWWWW....",
    "...WWDDDWW...",
    "...WDGGGDW...",
    "...WDGGGDW...",
    "...WWDDDWW...",
    "..WWWWWWWWW..",
    "..WWWWWWWWW..",
    ".WWWDWWWDWWW.",
    "WWWWDWWWDWWWW",
    "WW.WWWWWWW.WW",
    "W...WW.WW...W",
    "....D...D....",
  ];
  function drawShip(cx, cy, scale, flame, flip) {
    const cols = SHIP[0].length, rows = SHIP.length;
    const x0 = Math.round(cx - (cols * scale) / 2), y0 = Math.round(cy - (rows * scale) / 2);
    for (let r = 0; r < rows; r++) {
      const row = SHIP[flip ? rows - 1 - r : r];
      for (let c = 0; c < cols; c++) {
        const ch = row[c];
        if (ch === ".") continue;
        ctx.fillStyle = ch === "G" ? C.green : ch === "D" ? "#8c8c8c" : C.white;
        ctx.fillRect(x0 + c * scale, y0 + r * scale, scale, scale);
      }
    }
    if (flame > 0) {
      const frame = Math.floor(BA.time * 30);
      [4, 8].forEach((col, i) => {                          // 두 노즐
        const len = Math.round(flame) + (((frame + i * 7) % 6) < 3 ? 0 : 1);
        for (let j = 0; j < len; j++) {
          ctx.fillStyle = "rgba(216,216,216," + ((1 - j / Math.max(1, len)) * 0.85).toFixed(2) + ")";
          const fy = flip ? y0 - (j + 1) * scale : y0 + (rows + j) * scale;
          ctx.fillRect(x0 + col * scale, fy, scale, scale);
        }
      });
    }
  }

  const YEAST = {
    idle: ["..o.o.o..", "...WWWW..", ".oWWWWWWo", ".WWWWWWW.", "oWWWWWWWo", ".WWWWWWW.", "oWWWWWWWo", "..WWWWWW.", "...WWWW..", "..o.o.o.."],
    walk: ["..o.o.o..", "...WWWW..", ".oWWWWWWo", ".WWWWWWW.", "oWWWWWWWo", ".WWWWWWW.", "oWWWWWWWo", "..WWWWWW.", "...WWWW..", ".o.o.o.o."],
    bud: ["..o.o.o.o...", "...WWWW.....", ".oWWWWWWo.o.", ".WWWWWWW.WW.", "oWWWWWWWoWWo", ".WWWWWWW.WW.", "oWWWWWWWo.o.", "..WWWWWW....", "...WWWW.....", "..o.o.o.o..."],
  };
  // (x, y) = 스프라이트 중심.
  // 효모 한 마리는 원 60여 개 + 번짐이라, 매 프레임 새로 그리면 효모가 많은 장면(선물·크레딧)이 무거워진다.
  // 모양·크기·색마다 한 번만 그려 작은 캔버스에 구워 두고 찍어 쓴다.
  const yeastCache = new Map();
  function yeastSprite(kind, scale, color, glow) {
    const key = kind + "|" + scale + "|" + color + "|" + (glow ? 1 : 0);
    let sp = yeastCache.get(key);
    if (sp) return sp;
    const grid = YEAST[kind] || YEAST.idle, cols = Math.max(...grid.map((l) => l.length)), pad = glow ? 26 : 2;
    sp = document.createElement("canvas");
    sp.width = Math.ceil(cols * scale + pad * 2); sp.height = Math.ceil(grid.length * scale + pad * 2); sp.pad = pad;
    const c = sp.getContext("2d");
    if (glow) { c.shadowColor = color; c.shadowBlur = 18; }
    c.fillStyle = color;
    for (let r = 0; r < grid.length; r++) {
      const line = grid[r];
      for (let q = 0; q < line.length; q++) {
        const ch = line[q];
        if (ch === ".") continue;
        c.beginPath();
        c.arc(pad + q * scale + scale / 2, pad + r * scale + scale / 2, (scale * (ch === "W" ? 1 : 0.55)) / 2, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.shadowBlur = 0;
    c.fillStyle = C.bg;
    for (const ec of [2, 6]) {
      c.beginPath();
      c.arc(pad + ec * scale + scale / 2, pad + 4 * scale + scale / 2, scale * 0.25, 0, Math.PI * 2);
      c.fill();
    }
    if (yeastCache.size > 120) yeastCache.clear();
    yeastCache.set(key, sp);
    return sp;
  }
  function drawYeast(kind, x, y, scale, color, glow, alpha) {
    const sc = Math.max(1, Math.round(scale * 2) / 2), grid = YEAST[kind] || YEAST.idle, sp = yeastSprite(kind, sc, color, glow);
    ctx.globalAlpha = alpha == null ? 1 : clamp(alpha, 0, 1);
    ctx.drawImage(sp, Math.round(x - (9 * sc) / 2 - sp.pad), Math.round(y - (grid.length * sc) / 2 - sp.pad));
    ctx.globalAlpha = 1;
  }

  // 3D 투영 별밭. speed<0 이면 역재생(귀환)
  class Stars {
    constructor(n) {
      this.s = [];
      for (let i = 0; i < (n || 420); i++) {
        this.s.push({ x: (R() - 0.5) * 4000, y: (R() - 0.5) * 4000, z: R() * 2000 + 80, tier: R() < 0.12 ? 2 : 1 });
      }
    }
    draw(speed, spin, alphaMul) {
      const cx = BA.W / 2, cy = BA.H / 2, ca = Math.cos(spin || 0), sa = Math.sin(spin || 0);
      const am = alphaMul == null ? 1 : alphaMul;
      const raw = speed;
      speed *= BA.fs;
      for (const s of this.s) {
        s.z -= speed;
        if (s.z < 1) { s.z = 2200; s.x = (R() - 0.5) * 4000; s.y = (R() - 0.5) * 4000; }
        else if (s.z > 2200) { s.z = 60 + R() * 120; s.x = (R() - 0.5) * 4000; s.y = (R() - 0.5) * 4000; }
        const sx = ((s.x * ca - s.y * sa) / s.z) * 600 + cx;
        const sy = ((s.x * sa + s.y * ca) / s.z) * 600 + cy;
        if (sx < -10 || sx > BA.W + 10 || sy < -10 || sy > BA.H + 10) continue;
        const depth = clamp((2200 - s.z) / 2200, 0, 1);
        const size = Math.max(1, Math.floor(depth * 2.4 * s.tier));
        const al = Math.min(1, (0.2 + depth * 1.1) * am);
        ctx.fillStyle = "rgba(216,216,216," + al.toFixed(2) + ")";
        ctx.fillRect(Math.floor(sx), Math.floor(sy), size, size);
        // 워프 스트릭 — 빠를수록 길게 끌린다
        if (Math.abs(raw) > 2.2) {
          const z2 = s.z + raw * 5;
          if (z2 > 1) {
            ctx.strokeStyle = "rgba(216,216,216," + (al * 0.5).toFixed(2) + ")"; ctx.lineWidth = size;
            ctx.beginPath(); ctx.moveTo(sx, sy);
            ctx.lineTo(((s.x * ca - s.y * sa) / z2) * 600 + cx, ((s.x * sa + s.y * ca) / z2) * 600 + cy); ctx.stroke();
          }
        }
      }
    }
  }

  // ───── sound (WebAudio — TD/VCV 대체) ──────────────────────
  const Snd = {
    ac: null, on: true, master: null, fx: null, delay: null, droneG: null, droneF: null, droneO: [],
    init() {
      if (this.ac) { if (this.ac.state === "suspended") this.ac.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ac = (this.ac = new AC());
      this.master = ac.createGain();
      this.master.gain.value = this.on ? 0.9 : 0;
      this.master.connect(ac.destination);
      // pH가 딜레이 타임을 변조한다 (공연판의 PH→VCV 딜레이를 그대로 옮김)
      this.delay = ac.createDelay(1.5);
      this.delay.delayTime.value = 0.42;
      const fb = ac.createGain(); fb.gain.value = 0.38;
      const wet = ac.createGain(); wet.gain.value = 0.5;
      this.fx = ac.createGain();
      this.fx.connect(this.delay); this.delay.connect(fb); fb.connect(this.delay);
      this.delay.connect(wet); wet.connect(this.master);
      // drone
      this.droneF = ac.createBiquadFilter(); this.droneF.type = "lowpass"; this.droneF.frequency.value = 220;
      this.droneG = ac.createGain(); this.droneG.gain.value = 0;
      this.droneF.connect(this.droneG); this.droneG.connect(this.master); this.droneG.connect(this.fx);
      for (const d of [0, 7, -5]) {
        const o = ac.createOscillator(); o.type = "sawtooth"; o.frequency.value = 55; o.detune.value = d;
        o.connect(this.droneF); o.start(); this.droneO.push(o);
      }
      this.drone(this._df || 55, this._dv || 0, this._dc || 220);
    },
    setOn(v) { this.on = v; if (this.master) this.master.gain.setTargetAtTime(v ? 0.9 : 0, this.ac.currentTime, 0.05); },
    drone(freq, vol, cutoff) {
      this._df = freq; this._dv = vol; this._dc = cutoff || 220;
      if (!this.ac) return;
      const t = this.ac.currentTime;
      this.droneO.forEach((o, i) => o.frequency.setTargetAtTime(freq * (i === 2 ? 1.5 : 1), t, 0.4));
      this.droneG.gain.setTargetAtTime(vol, t, 0.5);
      this.droneF.frequency.setTargetAtTime(this._dc, t, 0.4);
    },
    setPh(ph) {
      if (!this.ac) return;
      this.delay.delayTime.setTargetAtTime(clamp(lerp(0.11, 0.5, (ph - 3.8) / 3.2), 0.08, 0.6), this.ac.currentTime, 0.3);
    },
    blip(freq, dur, type, vol, slideTo, wet) {
      if (!this.ac) return;
      const ac = this.ac, t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
      o.type = type || "square"; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + (dur || 0.08));
      g.gain.setValueAtTime(vol == null ? 0.06 : vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.08));
      o.connect(g); g.connect(this.master); if (wet !== false) g.connect(this.fx);
      o.start(t); o.stop(t + (dur || 0.08) + 0.02);
    },
    noise(dur, vol, cutoff, type) {
      if (!this.ac) return;
      const ac = this.ac, n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (R() * 2 - 1) * (1 - i / n);
      const s = ac.createBufferSource(); s.buffer = buf;
      const f = ac.createBiquadFilter(); f.type = type || "lowpass"; f.frequency.value = cutoff || 800;
      const g = ac.createGain(); g.gain.value = vol == null ? 0.1 : vol;
      s.connect(f); f.connect(g); g.connect(this.master); s.start();
    },
    bell(freq, vol) {
      for (const [m, v] of [[1, 1], [2.01, 0.4], [3.02, 0.2]]) this.blip(freq * m, 1.6, "sine", (vol || 0.07) * v);
    },
    chord(freqs, vol) { freqs.forEach((f, i) => setTimeout(() => this.bell(f, vol || 0.05), i * 110)); },
    // 지속음 — 조율 장면용
    osc(freq, vol, type) {
      if (!this.ac) return { set() {}, vol() {}, stop() {} };
      const ac = this.ac, o = ac.createOscillator(), g = ac.createGain();
      o.type = type || "sine"; o.frequency.value = freq; g.gain.value = 0;
      g.gain.setTargetAtTime(vol, ac.currentTime, 0.2);
      o.connect(g); g.connect(this.master); o.start();
      return {
        set: (f) => o.frequency.setTargetAtTime(f, ac.currentTime, 0.03),
        vol: (v) => g.gain.setTargetAtTime(v, ac.currentTime, 0.1),
        stop: () => { g.gain.setTargetAtTime(0, ac.currentTime, 0.1); o.stop(ac.currentTime + 0.6); },
      };
    },
  };
  BA.Snd = Snd;
  // 소리 잠금 해제.
  // 핸드폰 브라우저(카카오톡 등 앱 안의 브라우저 포함)는 "손가락을 뗀 순간·클릭·키 입력" 안에서만 소리를 허락한다.
  // 화면을 누르는 순간(pointerdown)에만 켜려 하면 거절되어, 새로고침하기 전까지 소리가 나지 않았다.
  // → 허락되는 순간마다 다시 깨우고, 무음 한 조각을 흘려 확실히 연다. 전화·앱 전환으로 끊긴 뒤에도 다음 터치에 되살아난다.
  const unlock = () => {
    Snd.init();
    const ac = Snd.ac;
    if (!ac) return;
    if (ac.state !== "running") { try { const p = ac.resume(); if (p && p.catch) p.catch(() => {}); } catch (_) {} }
    if (!Snd.unlocked) {
      try { const s = ac.createBufferSource(); s.buffer = ac.createBuffer(1, 1, 22050); s.connect(ac.destination); s.start(0); } catch (_) {}
      if (ac.state === "running") Snd.unlocked = true;
    }
  };
  for (const ev of ["pointerup", "touchend", "click", "keydown"]) document.addEventListener(ev, unlock, { capture: true, passive: true });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && Snd.ac && Snd.ac.state !== "running") Snd.unlocked = false; });

  // ───── ambient music ───────────────────────────────────────
  // 기본: 브라우저에서 생성되는 앰비언트(패드 + 드문 벨). 파일 불필요.
  // 교체: sprint/solo/audio/ambient.mp3 를 넣으면 그 파일이 루프로 재생되고 생성 패드는 물러난다.
  const MOODS = {
    idle:    { root: 110.0, chords: [[0, 7, 12, 16], [-2, 5, 12, 14]], bells: 0.10, vol: 0.050, bright: 500 },
    search:  { root: 98.0,  chords: [[0, 7, 10, 15], [-4, 3, 10, 12]], bells: 0.06, vol: 0.040, bright: 420 },
    tension: { root: 87.3,  chords: [[0, 6, 12, 13], [0, 7, 12, 15]], bells: 0.00, vol: 0.045, bright: 380 },
    space:   { root: 110.0, chords: [[0, 7, 14, 19], [-5, 2, 9, 16], [-3, 4, 12, 19]], bells: 0.22, vol: 0.055, bright: 800 },
    yeast:   { root: 130.8, chords: [[0, 7, 12, 14], [-3, 4, 9, 16], [-5, 2, 11, 14]], bells: 0.30, vol: 0.050, bright: 900 },
    wheel:   { root: 98.0,  chords: [[0, 7, 12, 16], [5, 12, 16, 21]], bells: 0.16, vol: 0.040, bright: 600 },
    gift:    { root: 146.8, chords: [[0, 4, 7, 14], [5, 9, 12, 16], [-3, 4, 7, 12]], bells: 0.45, vol: 0.060, bright: 1400 },
    off:     { root: 110.0, chords: [[0, 7, 12, 16]], bells: 0, vol: 0, bright: 300 },
  };
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19];
  const Music = {
    on: true, mood: MOODS.idle, voices: null, bus: null, filt: null, file: null, fileOk: false, t: 0, ci: 0, bellT: 3,
    init() {
      if (this.voices || !Snd.ac) return;
      const ac = Snd.ac;
      this.bus = ac.createGain(); this.bus.gain.value = 0;
      this.filt = ac.createBiquadFilter(); this.filt.type = "lowpass"; this.filt.frequency.value = 500;
      this.filt.connect(this.bus); this.bus.connect(Snd.master); this.bus.connect(Snd.fx);
      this.voices = [0, 1, 2, 3].map((i) => {
        const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain();
        o.type = "triangle"; o2.type = "sine"; o2.detune.value = 6 + i * 2;
        o.connect(g); o2.connect(g); g.gain.value = 0.25; g.connect(this.filt);
        // 느린 숨 — 성부마다 다른 주기
        const l = ac.createOscillator(), lg = ac.createGain();
        l.frequency.value = 0.05 + i * 0.023; lg.gain.value = 0.18; l.connect(lg); lg.connect(g.gain);
        o.start(); o2.start(); l.start();
        return { o, o2 };
      });
      // 사용자 제공 음원(선택)
      try {
        const a = new Audio("./audio/ambient.mp3");
        a.loop = true; a.volume = 0; a.preload = "auto";
        a.addEventListener("canplaythrough", () => { this.fileOk = true; this.file = a; a.play().catch(() => {}); this.apply(); }, { once: true });
        a.addEventListener("error", () => {}, { once: true });
        a.load();
      } catch (_) {}
      this.chord(0.1); this.apply();
    },
    set(name) { this.mood = MOODS[name] || MOODS.idle; this.ci = 0; if (this.voices) { this.chord(2.5); this.apply(); } },
    setOn(v) { this.on = v; this.apply(); },
    apply() {
      if (!this.voices) return;
      const t = Snd.ac.currentTime, m = this.mood, live = this.on && m.vol > 0;
      // 파일이 있으면 생성 패드는 1/4로 물러난다
      this.bus.gain.setTargetAtTime(live ? m.vol * (this.fileOk ? 0.25 : 1) : 0, t, 1.2);
      this.filt.frequency.setTargetAtTime(m.bright, t, 1.5);
      if (this.file) this.file.volume = live && Snd.on ? 0.55 : 0;
    },
    chord(glide) {
      const m = this.mood, ch = m.chords[this.ci % m.chords.length], t = Snd.ac.currentTime;
      this.voices.forEach((v, i) => {
        const f = m.root * Math.pow(2, ch[i] / 12);
        v.o.frequency.setTargetAtTime(f, t, glide); v.o2.frequency.setTargetAtTime(f * (i === 3 ? 2 : 1), t, glide);
      });
    },
    tick(dt) {
      if (!this.voices) { if (Snd.ac) this.init(); return; }
      this.t += dt;
      if (this.t > 13) { this.t = 0; this.ci++; this.chord(3); }
      this.bellT -= dt;
      if (this.bellT <= 0) {
        const m = this.mood;
        this.bellT = 1.5 + R() * 5;
        if (this.on && R() < m.bells * 2) {
          const n = PENTA[Math.floor(R() * PENTA.length)];
          Snd.blip(m.root * 4 * Math.pow(2, n / 12), 2.4, "sine", 0.022 + R() * 0.02);
        }
      }
    },
  };
  BA.Music = Music;

  // ───── voice (TTS) + 자막 ──────────────────────────────────
  const subEl = document.getElementById("sub");
  const subQ = [];
  let subBusy = false, voiceOn = true;
  function pumpSub() {
    if (subBusy) return;
    const text = subQ.shift();
    if (!text) { subEl.classList.remove("on"); return; }
    subBusy = true;
    subEl.textContent = text;
    subEl.classList.add("on");
    if (voiceOn && window.speechSynthesis && Snd.ac) {
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "ko-KR"; u.rate = 0.95; u.pitch = 0.8; u.volume = Snd.on ? 0.9 : 0;
        window.speechSynthesis.speak(u);
      } catch (_) {}
    }
    setTimeout(() => { subBusy = false; pumpSub(); }, Math.max(2600, text.length * 150));
  }
  function say(text) { subQ.push(text); pumpSub(); }
  function hush() { subQ.length = 0; try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (_) {} }

  const sysEl = document.getElementById("sys");
  const hintEl = document.getElementById("hint");
  function sys(msg) { sysEl.textContent = "> " + msg; }
  function hint(msg) { hintEl.textContent = BA.touch ? touchWords(msg) : msg; }

  // ───── run state ───────────────────────────────────────────
  function reset() {
    BA.S = {
      name: "아스트로넛",
      colony: String(Math.floor(R() * 9000) + 1000),
      coord: "α 12.4° · δ -03.1°",
      sync: 0,
      target: 0,
      vessel: null,           // { name, score, profile }
      ferm: { ph: 3.9, temp: 26, feeds: 0, sec: 0 },
      hp: 100, deaths: 0, log: "생체 신호 안정", tg: null,
      t0: Date.now(),
    };
  }
  reset();

  // ───── scene manager ───────────────────────────────────────
  const scenes = [];
  let cur = -1, pending = null, fade = 1, fadeDir = -1, last = 0, slow = 0.016, slowT = 0;
  const hudScene = document.getElementById("hudScene");
  const hudStep = document.getElementById("hudStep");
  const progFill = document.getElementById("progFill");

  function add(scene) { scenes.push(scene); }
  function go(i) {
    if (pending != null) return;
    pending = ((i % scenes.length) + scenes.length) % scenes.length;
    fadeDir = 1;
  }
  function next() { go(cur + 1); }
  // 처음부터 다시 — 상태 초기화는 장면이 실제로 바뀌는 순간에 한다.
  // (먼저 지우면, 화면이 어두워지는 동안 떠나는 장면이 비어 버린 상태를 읽다가 멈춘다)
  let onSwap = null;
  function restart(after) { pending = 0; fadeDir = 1; onSwap = () => { reset(); if (after) after(); }; }
  function swap() {
    if (scenes[cur] && scenes[cur].exit) scenes[cur].exit();
    if (onSwap) { const f = onSwap; onSwap = null; f(); }
    cur = pending; pending = null;
    const sc = scenes[cur];
    hudScene.textContent = sc.id;
    hudStep.textContent = String(cur).padStart(2, "0") + " / " + String(scenes.length - 1).padStart(2, "0");
    progFill.style.width = ((cur / (scenes.length - 1)) * 100).toFixed(1) + "%";
    progFill.classList.toggle("recipe", !!sc.green);
    hint(sc.hint || "마우스 클릭으로 진행");
    P.click = false; P.pressed = false;
    Music.set(sc.mood || "idle");
    sc.enter();
  }

  function frame(now) {
    // 창이 최소화되어 크기가 0이면 그리지 않고 기다린다
    if (BA.W < 2 || BA.H < 2) { last = now; requestAnimationFrame(frame); return; }
    // 60fps 상한 — 144·240Hz 모니터에서 같은 화면을 서너 번씩 그리지 않는다 (그만큼 GPU 가 손 인식에 쓰인다)
    if (now - last < 13) { requestAnimationFrame(frame); return; }
    const raw = (now - last) / 1000 || 0.016, dt = Math.min(0.05, raw);
    last = now;
    // 계속 느리면(약 38fps 아래로 3초) 가벼운 모드로 — 블룸을 끄고 해상도 배율을 1로 낮춘다. 한번 켜지면 유지.
    if (!BA.lite && raw < 0.25) {
      slow += (raw - slow) * 0.04;
      slowT = slow > 0.026 && BA.time > 6 ? slowT + raw : 0;
      if (slowT > 3) { BA.lite = true; window.dispatchEvent(new Event("resize")); sys("화면이 느려 가벼운 모드로 전환했습니다."); }
    }
    BA.time += dt;
    BA.fs = dt * 60;
    if (fadeDir > 0) {
      fade += dt * 2.6;
      if (fade >= 1) { fade = 1; fadeDir = -1; swap(); }
    } else if (fade > 0) fade = Math.max(0, fade - dt * 1.8);
    BA.locked = pending != null;
    BA.hot = false; btnRects.length = 0;
    Music.tick(dt);
    if (BA.pre) BA.pre(dt);                      // 손 인식 → 포인터
    const sc = scenes[cur];
    if (sc) {
      const dead = BA.dead > 0;
      if (sc.update && !dead) sc.update(dt);
      const pc = P.click, pd = P.down, pp = P.pressed;
      if (dead) { P.click = P.down = P.pressed = false; BA.locked = true; }
      ctx.save();
      if (BA.shakeAmt > 0.3) ctx.translate((R() - 0.5) * BA.shakeAmt, (R() - 0.5) * BA.shakeAmt);
      sc.render(dt);
      ctx.restore();
      if (dead) { P.click = pc; P.down = pd; P.pressed = pp; BA.locked = pending != null; BA.hot = false; }
    }
    if (BA.overlay) BA.overlay(dt, sc);         // 상태창 · 사망 화면 · 후처리
    if (fade > 0) { ctx.fillStyle = "rgba(8,8,8," + fade.toFixed(3) + ")"; ctx.fillRect(0, 0, BA.W, BA.H); }
    cv.style.cursor = BA.hot ? "pointer" : (sc && sc.cursor) || "default";
    P.click = false; P.pressed = false; P.wheel = 0;
    requestAnimationFrame(frame);
  }

  // ───── HUD buttons ─────────────────────────────────────────
  const bSound = document.getElementById("btnSound");
  const bVoice = document.getElementById("btnVoice");
  bSound.addEventListener("click", () => {
    Snd.init(); Snd.setOn(!Snd.on);
    bSound.textContent = Snd.on ? "SOUND ON" : "SOUND OFF"; bSound.classList.toggle("off", !Snd.on);
    if (!Snd.on) hush();
    Music.apply();
  });
  const bMusic = document.getElementById("btnMusic");
  bMusic.addEventListener("click", () => {
    Snd.init(); Music.setOn(!Music.on);
    if (BA.Chip) BA.Chip.sync();
    bMusic.textContent = Music.on ? "MUSIC ON" : "MUSIC OFF"; bMusic.classList.toggle("off", !Music.on);
  });
  bVoice.addEventListener("click", () => {
    voiceOn = !voiceOn;
    bVoice.textContent = voiceOn ? "VOICE ON" : "VOICE OFF"; bVoice.classList.toggle("off", !voiceOn);
    if (!voiceOn) try { window.speechSynthesis.cancel(); } catch (_) {}
  });
  document.getElementById("btnSkip").addEventListener("click", () => {
    Snd.init();
    if (pending != null || BA.dead) return;
    const sc = scenes[cur];
    if (BA.D && BA.D.noSkip && sc && sc.id !== "idle" && sc.id !== "credits" && sc.id !== "recipe" && sc.id !== "bake") { sys("어려움 모드에서는 SKIP 할 수 없습니다."); return; }
    if (sc && sc.id !== "idle") BA.S.skipped = true;
    if (sc && sc.skip) sc.skip();
    hush();
    next();
  });

  function start(i) { pending = i || 0; fade = 1; fadeDir = 1; requestAnimationFrame((t) => { last = t; frame(t); }); }

  Object.assign(BA, { T, Btn, clear, inRect, garble, setFont, drawShip, drawYeast, Stars, say, hush, sys, hint, add, go, next, reset, restart, start, scenes, curIndex: () => cur, scene: () => scenes[cur] });
  return BA;
})();
