// Solo v2 · 탑승자 — 얼굴 스캔 → 도트 캐릭터, VITAL(생체 신호), 하단 상태창, 사망/재조립
// 카메라 영상은 48×48 도트 격자로만 축약되어 이 페이지 메모리에만 남는다. 저장·전송 없음.

(() => {
  "use strict";
  const { ctx, C, T, Btn, clamp, lerp, R, hash, Snd, P, say, sys } = BA;
  const G = 48;

  // ───── camera ──────────────────────────────────────────────
  const video = document.getElementById("cam");
  const Cam = {
    video, stream: null, on: false, err: "",
    async start() {
      if (this.on) return true;
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("이 브라우저는 카메라를 지원하지 않습니다");
        this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 }, facingMode: "user" }, audio: false });
        video.srcObject = this.stream;
        await video.play();
        this.on = true; this.err = "";
        return true;
      } catch (e) {
        this.err = e && e.name === "NotAllowedError" ? "카메라 권한이 거부되었습니다" : "카메라를 찾을 수 없습니다";
        return false;
      }
    },
    stop() {
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null; this.on = false; video.srcObject = null;
    },
  };
  BA.Cam = Cam;

  // ───── face → 48×48 만화 도트 ────────────────────────────
  // 반환값 = 밝기 격자(Float32Array, 영수증·카드용) + .q(RGBA 만화 도트: 흑백, 톤을 5단으로 끊고 윤곽에 잉크 선)
  const sc = document.createElement("canvas"); sc.width = sc.height = G;
  const sx = sc.getContext("2d", { willReadFrequently: true });
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], TONES = 5, EDGE = 1.0;
  function toon(ln, m, d) {
    const q = new Uint8ClampedArray(G * G * 4), at = (x, y) => ln[clamp(y, 0, G - 1) * G + clamp(x, 0, G - 1)];
    const inM = (x, y) => x >= 0 && y >= 0 && x < G && y < G && m[y * G + x] >= 0.5;
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
      const i = y * G + x, o = i * 4;
      if (m[i] < 0.5) continue;
      q[o + 3] = 255;
      // 잉크 선 — 얼굴 테두리, 그리고 밝기가 급히 바뀌는 곳(소벨)
      const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      if (!inM(x - 1, y) || !inM(x + 1, y) || !inM(x, y - 1) || !inM(x, y + 1) || Math.hypot(gx, gy) > EDGE) { q[o] = 18; q[o + 1] = 14; q[o + 2] = 24; continue; }
      // 셀 셰이딩 — 톤을 5단으로, 경계는 디더로 섞는다
      const lv = Math.round(clamp(ln[i] + (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.47) / (TONES - 1) * 0.9, 0, 1) * (TONES - 1)) / (TONES - 1);
      const tone = 0.1 + 0.9 * lv;
      if (d) {
        const r = d[o] / 255, g = d[o + 1] / 255, b = d[o + 2] / 255, k = Math.min(3.2, tone / Math.max(0.05, r * 0.3 + g * 0.59 + b * 0.11));
        const gr = (r * 0.3 + g * 0.59 + b * 0.11) * k;
        q[o] = (gr + (r * k - gr) * 1.35) * 255; q[o + 1] = (gr + (g * k - gr) * 1.35) * 255; q[o + 2] = (gr + (b * k - gr) * 1.35) * 255;
      } else { const v = 26 + tone * 222; q[o] = v; q[o + 1] = v; q[o + 2] = v * 0.97; }
    }
    return q;
  }
  // src 를 주면 그 이미지에서, 없으면 카메라에서 뽑는다
  function sampleFace(src) {
    let vw, vh;
    if (src) { vw = src.naturalWidth || src.videoWidth || src.width; vh = src.naturalHeight || src.videoHeight || src.height; }
    else { if (!Cam.on || video.readyState < 2 || !video.videoWidth) return null; src = video; vw = video.videoWidth; vh = video.videoHeight; }
    const s = Math.min(vw, vh) * 0.82, n = G * G;
    sx.save(); sx.translate(G, 0); sx.scale(-1, 1);          // 거울
    sx.imageSmoothingEnabled = true; sx.imageSmoothingQuality = "high";
    sx.drawImage(src, (vw - s) / 2, (vh - s) / 2, s, s, 0, 0, G, G);
    sx.restore();
    const d = sx.getImageData(0, 0, G, G).data, raw = new Float32Array(n);
    for (let i = 0; i < n; i++) raw[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255;
    const sorted = raw.slice().sort();
    const lo = sorted[Math.floor(n * 0.04)], hi = sorted[Math.floor(n * 0.96)], span = Math.max(0.12, hi - lo);
    const out = new Float32Array(n), ln = new Float32Array(n), m = new Float32Array(n);
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
      const i = y * G + x, u = (x + 0.5) / G * 2 - 1, v = (y + 0.5) / G * 2 - 1;
      m[i] = Math.min(1, clamp(1.25 - (u * u * 1.25 + v * v * 0.95) * 1.1, 0, 1) * 2.2);       // 타원 마스크
      ln[i] = Math.pow(clamp((raw[i] - lo) / span, 0, 1), 0.85);
      out[i] = ln[i] * m[i];
    }
    out.q = toon(ln, m, null);                              // 흑백 — 작품의 무채색 화면에 맞춘다
    return out;
  }
  // 카메라 없이 탑승할 때의 기본 승무원 (헬멧)
  let defFace = null;
  function defaultFace() {
    if (defFace) return defFace;
    const out = new Float32Array(G * G), m = new Float32Array(G * G);
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
      const u = (x + 0.5) / G * 2 - 1, v = (y + 0.5) / G * 2 - 1, r = Math.hypot(u * 1.05, v * 1.0);
      let l = 0;
      if (r < 0.9) l = 0.55 + 0.3 * (1 - r);
      if (r < 0.92 && r > 0.8) l = 0.95;                                       // 헬멧 테
      if (Math.abs(v + 0.02) < 0.3 && Math.abs(u) < 0.6) l = 0.16;             // 바이저
      if (Math.abs(v + 0.05) < 0.07 && (Math.abs(u - 0.26) < 0.09 || Math.abs(u + 0.26) < 0.09)) l = 1; // 눈
      if (v > 0.5 && v < 0.58 && Math.abs(u) < 0.2) l = 0.25;                  // 입
      out[y * G + x] = l; m[y * G + x] = l > 0.06 ? 1 : 0;
    }
    out.q = toon(out, m, null);
    return (defFace = out);
  }
  BA.face = null; BA.faceIsPhoto = false;
  BA.sampleFace = sampleFace; BA.defaultFace = defaultFace;

  // 도트 초상. dmg 0(정상)~1(위독), dead 0~1(분해 진행), ink = 영수증용 어두운 점
  function drawFace(c, face, x, y, size, o) {
    o = o || {};
    const cell = size / G, dmg = clamp(o.dmg || 0, 0, 1), dead = o.dead || 0, t = BA.time, k8 = Math.floor(t * 9), q = face.q;
    if (!o.noBg) {
      c.fillStyle = o.ink ? "#e9e6dc" : "#0b0b0b"; c.fillRect(x, y, size, size);
      if (!o.ink && size > 60) {                               // 만화 망점 배경
        c.fillStyle = "rgba(255,255,255,0.09)";
        for (let gy = 1; gy < G; gy += 3) for (let gx = 1 + (gy % 2) * 1.5; gx < G; gx += 3) { const r = cell * (0.25 + 0.9 * gy / G); c.fillRect(x + gx * cell - r / 2, y + gy * cell - r / 2, r, r); }
      }
    }
    const col = o.ink ? "20,20,20" : dmg > 0.66 ? "255,96,80" : dmg > 0.33 ? "241,196,83" : "224,224,216";
    const tint = dmg > 0.66 ? [255, 70, 60] : dmg > 0.33 ? [241, 196, 83] : null, tk = tint ? 0.25 + 0.35 * dmg : 0, des = dmg * 0.7;
    for (let gy = 0; gy < G; gy++) {
      // 손상될수록 가로줄이 밀리고 끊긴다
      const rowJ = !o.ink && hash(gy * 3.1 + k8) < dmg * 0.55 ? (hash(gy + k8 * 1.7) - 0.5) * cell * 9 * dmg : 0;
      for (let gx = 0; gx < G; gx++) {
        const i = gy * G + gx;
        let l = face[i];
        if (q && !o.ink ? !q[i * 4 + 3] : l < 0.06) continue;
        if (!o.ink && hash(gx * 12.9 + gy * 78.2 + k8 * 0.37) < dmg * 0.4) continue;      // 픽셀 탈락
        let px = x + gx * cell + cell / 2 + rowJ, py = y + gy * cell + cell / 2, a = 1;
        if (dead > 0) {                                                                    // 효모에게 분해된다
          const h = hash(gx * 5.3 + gy * 9.7), d = clamp(dead * 1.6 - h * 0.6, 0, 1);
          px += (h - 0.5) * size * 0.9 * d; py += d * d * size * 0.9; a = 1 - d; l *= 1 - d * 0.5;
          if (a <= 0.02) continue;
        }
        if (q && !o.ink) {                                                                 // 만화 도트 — 네모 픽셀
          let r = q[i * 4], g = q[i * 4 + 1], b = q[i * 4 + 2];
          if (dmg > 0) { const lum = r * 0.3 + g * 0.59 + b * 0.11; r += (lum - r) * des; g += (lum - g) * des; b += (lum - b) * des; }
          if (tint) { r += (tint[0] - r) * tk; g += (tint[1] - g) * tk; b += (tint[2] - b) * tk; }
          c.fillStyle = "rgba(" + (r | 0) + "," + (g | 0) + "," + (b | 0) + "," + a.toFixed(2) + ")";
          c.fillRect(Math.floor(px - cell / 2), Math.floor(py - cell / 2), Math.ceil(cell), Math.ceil(cell));
          continue;
        }
        const r = cell * 0.5 * (0.3 + 0.75 * l);
        c.fillStyle = "rgba(" + col + "," + (a * (o.ink ? 0.35 + l * 0.65 : 0.4 + l * 0.6)).toFixed(2) + ")";
        if (cell < 3.2) c.fillRect(px - r, py - r, r * 2, r * 2);
        else { c.beginPath(); c.arc(px, py, r, 0, 6.283); c.fill(); }
      }
    }
    if (!o.noBg && !o.ink) {
      c.strokeStyle = dmg > 0.66 ? C.red : dmg > 0.33 ? C.amber : "rgba(255,255,255,0.35)";
      c.lineWidth = 1; c.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(size), Math.round(size));
    }
  }
  BA.drawFace = drawFace;

  // 전신 도트 우주비행사 — 헬멧 안에 탑승자 얼굴(5×4로 축약)이 들어간다
  //   (x, feetY) = 발바닥 중앙. s = 한 칸 px. o: { face, walk, dmg, alpha }
  const ASTRO = [
    "...WWWWW...",
    "..WHHHHHW..",
    "..WHHHHHW..",
    "..WHHHHHW..",
    "..WHHHHHW..",
    "...WWWWW...",
    ".DWWWWWWWD.",
    ".DWWGWWWWD.",
    ".DWWWWWWWD.",
    "..WWWWWWW..",
  ];
  const LEGS = [
    ["..WW...WW..", "..WW...WW..", ".DDD...DDD."],      // 서 있기
    ["..WW...WW..", "..WW..DDD..", ".DDD......."],      // 걷기 A
    ["..WW...WW..", ".DDD...WW..", "......DDD.."],      // 걷기 B
  ];
  function drawAstro(c, x, feetY, s, o) {
    o = o || {};
    const face = o.face || BA.face || defaultFace(), dmg = o.dmg || 0, q = face.q, k = G / 32;
    const fr = o.walk ? 1 + (Math.floor(BA.time * 7) % 2) : 0;
    const rows = ASTRO.concat(LEGS[fr]), x0 = Math.round(x - 5.5 * s), y0 = Math.round(feetY - rows.length * s);
    c.globalAlpha = o.alpha == null ? 1 : clamp(o.alpha, 0, 1);
    for (let r = 0; r < rows.length; r++) for (let p = 0; p < 11; p++) {
      const ch = rows[r][p];
      if (ch === ".") continue;
      if (ch === "H") {
        // 얼굴 격자의 가운데 영역을 5×4 칸으로 평균
        const fx = p - 3, fy = r - 1;
        let R0 = 0, G0 = 0, B0 = 0, n = 0;
        for (let yy = Math.floor((6 + fy * 5) * k); yy < Math.floor((11 + fy * 5) * k); yy++) for (let xx = Math.floor((4 + fx * 5) * k); xx < Math.floor((9 + fx * 5) * k); xx++) {
          const j = (yy * G + xx) * 4; n++;
          if (q[j + 3]) { R0 += q[j]; G0 += q[j + 1]; B0 += q[j + 2]; }
        }
        R0 /= n; G0 /= n; B0 /= n;
        if (dmg > 0.66) { const v = R0 * 0.3 + G0 * 0.59 + B0 * 0.11; R0 = v; G0 = v * 0.4; B0 = v * 0.35; }
        c.fillStyle = "rgb(" + (R0 | 0) + "," + (G0 | 0) + "," + (B0 | 0) + ")";
      } else c.fillStyle = ch === "G" ? C.green : ch === "D" ? "#8c8c8c" : C.white;
      c.fillRect(x0 + p * s, y0 + r * s, s, s);
    }
    c.globalAlpha = 1;
  }
  BA.drawAstro = drawAstro;

  // ───── 난이도 ─────────────────────────────────────────────
  //   dmg 피해 배율 · pass/dur 물레 합격선·제한 시간 · need/hz 수축 항해의 필요 신호 수·오염체 빈도
  //   어려움: 물레 2회(1차 마우스 → 2차 손 인식), 재조립·SKIP 불가
  BA.DIFFS = [
    { id: "easy", name: "쉬움", dmg: 0.6, pass: 55, dur: 110, need: 8, hz: 0.6,
      lines: ["피해 ×0.6", "물레 합격선 55% · 110초", "수축 항해 신호 8개", "쓰러져도 그 자리에서 재조립"] },
    { id: "normal", name: "보통", dmg: 1, pass: 65, dur: 90, need: 10, hz: 1,
      lines: ["피해 ×1", "물레 합격선 65% · 90초", "수축 항해 신호 10개", "쓰러져도 그 자리에서 재조립"] },
    { id: "hard", name: "어려움", dmg: 1.4, pass: 75, dur: 75, need: 14, hz: 2, rounds: 2, pass2: 70, dur2: 100, noRevive: true, noSkip: true,
      lines: ["피해 ×1.4 · 재조립·SKIP 불가", "수축 항해: 오염체 2배 · 난기류", "물레 2회: 마우스 75% → 손 인식 70%", "성공하면 제작자에게 알릴 수 있음"] },
  ];
  BA.diff = 1;
  Object.defineProperty(BA, "D", { get() { return BA.DIFFS[BA.diff] || BA.DIFFS[1]; } });
  // 어려움 모드를 건너뛰기·재조립 없이 끝까지 통과했는가
  BA.hardClear = () => BA.D.id === "hard" && !BA.S.skipped && !BA.S.deaths;

  // ───── VITAL ───────────────────────────────────────────────
  let hitT = 0, shownHp = 100, beatT = 0, drainAcc = 0;
  const Vital = {
    damage(n, reason) {
      const S = BA.S;
      if (BA.dead || S.hp <= 0) return;
      n *= BA.D.dmg;
      S.hp = Math.max(0, S.hp - n); S.log = reason + "  −" + Math.round(n);
      hitT = 0.6;
      BA.fx.shake(10 + n * 0.6); BA.fx.glitch(0.25 + n * 0.012); BA.fx.flash("232,57,42", 0.28);
      Snd.noise(0.3, 0.16, 300); Snd.blip(140, 0.35, "sawtooth", 0.09, 50);
      sys("경고 · " + reason + " · VITAL " + Math.round(S.hp));
      if (S.hp <= 0) this.die(reason);
    },
    // 지속 피해 — 5 단위로 끊어서 타격감을 준다
    drain(rate, dt, reason) {
      drainAcc += rate * dt;
      if (drainAcc >= 5) { drainAcc -= 5; this.damage(5, reason); }
    },
    heal(n, reason) {
      const S = BA.S;
      if (BA.dead || S.hp >= 100) return;
      S.hp = Math.min(100, S.hp + n);
      if (reason) S.log = reason + "  +" + Math.round(n);
    },
    die(reason) {
      const S = BA.S;
      S.deaths++; S.cause = reason;
      BA.dead = 0.001;
      BA.hush();
      BA.fx.glitch(1.2); BA.fx.shake(30); BA.fx.flash("232,57,42", 0.6);
      Snd.blip(220, 2.2, "sawtooth", 0.12, 30); Snd.noise(1.6, 0.2, 220);
      Snd.drone(40, 0.07, 140);
      say("탑승자 신호 소실.");
      sys("SIGNAL LOST · " + reason);
    },
    state() { const hp = BA.S.hp; return hp > 66 ? "정상" : hp > 33 ? "불안정" : hp > 0 ? "위독" : "소실"; },
  };
  BA.Vital = Vital;

  // ───── 하단 상태창 — 에너지 단계마다 모습이 달라진다 ─────
  //   정상(67~)  : 차분한 테두리, 초록 심전도, 제 색 초상
  //   불안정(34~): 호박색 점선 테두리, 빠르고 고르지 않은 심전도, 식은땀
  //   위독(~33)  : 붉게 맥동하는 바탕, 경고 띠, 흐트러진 심전도, 깨지는 초상
  const beat = (p) => p < 0.08 ? -0.2 * Math.sin(p / 0.08 * Math.PI) : p < 0.12 ? (p - 0.08) / 0.04 : p < 0.16 ? 1 - (p - 0.12) / 0.04 * 1.6
    : p < 0.2 ? -0.6 + (p - 0.16) / 0.04 * 0.6 : p > 0.35 && p < 0.5 ? 0.18 * Math.sin((p - 0.35) / 0.15 * Math.PI) : 0;
  function panel(dt) {
    const { H, U, time } = BA, S = BA.S;
    shownHp = lerp(shownHp, S.hp, 1 - Math.exp(-dt * 6));
    hitT = Math.max(0, hitT - dt);
    const tier = S.hp > 66 ? 0 : S.hp > 33 ? 1 : 2, pulse = 0.5 + 0.5 * Math.sin(time * (tier === 2 ? 9 : 4));
    const fs = Math.round(84 * U), pad = 8, tw = Math.round(176 * U);
    const jit = hitT > 0 ? 10 : tier === 2 ? 2.5 : 0;
    const w = fs + tw + pad * 3, h = fs + pad * 2, x = 14 + (R() - 0.5) * jit, y = H - 48 - h - 10 + (R() - 0.5) * jit * 0.4;
    const dmg = 1 - S.hp / 100, col = tier === 0 ? C.white : tier === 1 ? C.amber : C.red, live = tier === 0 ? C.green : col;
    ctx.fillStyle = tier === 0 ? "rgba(8,8,8,0.92)" : tier === 1 ? "rgba(24,17,4,0.93)" : "rgba(" + Math.round(26 + pulse * 34) + ",5,5,0.94)";
    ctx.fillRect(x, y, w, h);
    if (tier === 2) {                                           // 경고 띠
      const sw = 10 * U, off = (time * 30) % (sw * 2);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y - 5 * U, w, 5 * U); ctx.clip();
      for (let k = -2; k * sw * 2 < w + sw * 2; k++) { ctx.fillStyle = C.red; ctx.fillRect(x + k * sw * 2 + off, y - 5 * U, sw, 5 * U); }
      ctx.restore();
    }
    ctx.strokeStyle = hitT > 0 ? C.red : tier === 0 ? (S.hp >= 90 ? "rgba(160,255,160,0.5)" : "rgba(255,255,255,0.22)") : tier === 1 ? C.amber : (pulse > 0.5 ? C.red : "rgba(232,57,42,0.4)");
    ctx.lineWidth = tier === 2 ? 2 : 1; if (tier === 1) ctx.setLineDash([6, 4]);
    ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, w, h); ctx.setLineDash([]); ctx.lineWidth = 1;
    const fx0 = x + pad, fy0 = y + pad;
    drawFace(ctx, BA.face || defaultFace(), fx0, fy0, fs, { dmg: Math.max(dmg, hitT > 0 ? 0.9 : 0) });
    if (tier > 0) {                                             // 식은땀
      const d = fs / 20;
      for (let k = 0; k < tier; k++) {
        const q = (time * (0.6 + k * 0.25) + k * 0.5) % 1, dx = fx0 + fs * (k ? 0.14 : 0.8), dy = fy0 + fs * (0.1 + 0.34 * q);
        ctx.fillStyle = "rgba(140,210,255," + (1 - q).toFixed(2) + ")";
        ctx.fillRect(dx, dy, d, d); ctx.fillRect(dx - d / 2, dy + d, d * 2, d * 1.6);
      }
    }
    if (tier === 2 && pulse > 0.5) T("!", fx0 + fs - 9 * U, fy0 + 11 * U, { size: 16, bold: true, color: C.red });
    if (S.hp >= 90 && Math.sin(time * 3) > 0.3) T("✦", fx0 + fs - 8 * U, fy0 + 9 * U, { size: 10, color: C.green });
    const tx = x + fs + pad * 2;
    T(S.name, tx, y + pad + 7 * U, { size: 11, align: "left", bold: true, color: C.text });
    T(BA.D.name, tx + tw, y + pad + 7 * U, { size: 9, align: "right", color: BA.D.id === "hard" ? C.red : C.dim });
    T("VITAL", tx, y + pad + 24 * U, { size: 9, align: "left", color: C.dim });
    T(String(Math.round(shownHp)).padStart(3, "0"), tx + tw, y + pad + 24 * U, { size: 12, align: "right", bold: true, color: col });
    const by = y + pad + 32 * U, seg = 10, sw = (tw - (seg - 1) * 2) / seg;
    for (let i = 0; i < seg; i++) {
      const on = shownHp / 100 * seg > i + 0.05;
      ctx.fillStyle = on ? (tier === 2 && pulse < 0.5 ? "rgba(232,57,42,0.5)" : col) : "rgba(255,255,255,0.1)";
      ctx.fillRect(tx + i * (sw + 2), by, sw, 7 * U);
    }
    // 심전도
    const ey = y + pad + 54 * U, eh = 9 * U, rate = tier === 0 ? 1.1 : tier === 1 ? 1.9 : 3;
    ctx.strokeStyle = live; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let px = 0; px <= tw; px += 2) {
      const ph = time * rate - px / tw * 2.4, n = Math.floor(ph);
      let v = S.hp <= 0 ? 0 : beat(ph - n);
      if (tier === 1) v *= 0.55 + 0.7 * hash(n * 3.3);
      if (tier === 2) v = v * (hash(n * 7.3) < 0.3 ? 0.1 : 1.25) + (hash(px * 1.7 + Math.floor(time * 20)) - 0.5) * 0.4;
      if (px) ctx.lineTo(tx + tw - px, ey - v * eh); else ctx.moveTo(tx + tw, ey - v * eh);
    }
    ctx.stroke(); ctx.lineWidth = 1;
    if (tier < 2 || pulse > 0.35) T((tier === 0 ? "♥ " : tier === 1 ? "△ " : "✕ ") + "상태 · " + Vital.state() + (BA.Hands && BA.Hands.on ? "   HAND ●" : ""), tx, y + pad + 70 * U, { size: 10, align: "left", bold: true, color: live });
    T(S.log, tx, y + pad + 83 * U, { size: 9, align: "left", color: hitT > 0 ? C.red : C.dim });
    // 위독 — 심장 박동음
    if (S.hp < 34 && !BA.dead) { beatT -= dt; if (beatT <= 0) { beatT = S.hp < 15 ? 0.5 : 0.8; Snd.blip(58, 0.14, "sine", 0.2, 40, false); setTimeout(() => Snd.blip(50, 0.12, "sine", 0.14, 36, false), 130); } }
  }

  // ───── 사망 화면 ───────────────────────────────────────────
  function deathScreen(dt) {
    const { W, H, U, time } = BA, S = BA.S;
    BA.dead += dt;
    const k = BA.dead;
    ctx.fillStyle = "rgba(8,4,4," + clamp(k * 0.9, 0, 0.88).toFixed(2) + ")"; ctx.fillRect(0, 0, W, H);
    const fs = Math.min(220 * U, H * 0.3), fx0 = W / 2 - fs / 2, fy0 = H * 0.2;
    drawFace(ctx, BA.face || defaultFace(), fx0, fy0, fs, { dmg: 1, dead: clamp((k - 0.8) / 6, 0, 0.8), noBg: true });
    if (k > 0.5 && k < 4 && R() < 0.3) BA.fx.spark(fx0 + R() * fs, fy0 + fs * (0.4 + R() * 0.6), (R() - 0.5) * 40, 30 + R() * 60, "255,96,80", 1.2, 2, 80);
    const yy = fy0 + fs + 46 * U;
    T(Math.sin(time * 22) > -0.6 ? "SIGNAL LOST" : "S1GN∆L L0ST", W / 2, yy, { size: 44, bold: true, color: C.red, alpha: k / 0.6 });
    T("탑승자 신호 소실 — " + (S.cause || ""), W / 2, yy + 42 * U, { size: 14, color: C.text, alpha: (k - 0.8) / 0.6 });
    T("효모는 당신을 분해해 다음 반죽의 먹이로 삼는다.", W / 2, yy + 66 * U, { size: 12, color: C.dim, alpha: (k - 1.6) / 0.6 });
    T("사망 " + S.deaths + "회", W / 2, yy + 88 * U, { size: 10, color: C.ghost, alpha: (k - 1.6) / 0.6 });
    if (k > 2.8) {
      const by = Math.min(H - 90, yy + 136 * U);
      const noRev = BA.D.noRevive;
      if (noRev) T("어려움 모드 — 재조립 없음", W / 2, by - 34 * U, { size: 11, color: C.amber });
      if (!noRev && Btn("[ 이 장면에서 재조립 · VITAL 50 ]", W / 2 - 150 * U, by, { size: 13 })) {
        S.hp = 50; S.log = "재조립 완료"; shownHp = 0; BA.dead = 0; drainAcc = 0;
        Snd.chord([196, 262, 330], 0.06); BA.fx.flash("216,216,216", 0.4);
        BA.go(BA.curIndex());
      }
      if (Btn("처음부터 다시 탑승", noRev ? W / 2 : W / 2 + 170 * U, by, { size: 13, color: C.red })) {
        BA.restart(() => { shownHp = 100; BA.dead = 0; drainAcc = 0; });
      }
    }
  }

  BA.overlay = (dt, scene) => {
    if (scene && scene.id !== "idle") panel(dt);
    if (BA.dead) deathScreen(dt);
    BA.fx.post(dt);
  };
})();
