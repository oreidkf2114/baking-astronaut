// Solo v2 · 탑승자 — 얼굴 스캔 → 도트 캐릭터, VITAL(생체 신호), 하단 상태창, 사망/재조립
// 카메라 영상은 32×32 밝기 격자로만 축약되어 이 페이지 메모리에만 남는다. 저장·전송 없음.

(() => {
  "use strict";
  const { ctx, C, T, Btn, clamp, lerp, R, hash, Snd, P, say, sys } = BA;
  const G = 32;

  // ───── camera ──────────────────────────────────────────────
  const video = document.getElementById("cam");
  const Cam = {
    video, stream: null, on: false, err: "",
    async start() {
      if (this.on) return true;
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("이 브라우저는 카메라를 지원하지 않습니다");
        this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio: false });
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

  // ───── face → 32×32 dot grid ───────────────────────────────
  const sc = document.createElement("canvas"); sc.width = sc.height = G;
  const sx = sc.getContext("2d", { willReadFrequently: true });
  function sampleFace() {
    if (!Cam.on || video.readyState < 2 || !video.videoWidth) return null;
    const vw = video.videoWidth, vh = video.videoHeight, s = Math.min(vw, vh) * 0.82;
    sx.save(); sx.translate(G, 0); sx.scale(-1, 1);          // 거울
    sx.imageSmoothingEnabled = true; sx.imageSmoothingQuality = "high";
    sx.drawImage(video, (vw - s) / 2, (vh - s) / 2, s, s, 0, 0, G, G);
    sx.restore();
    const d = sx.getImageData(0, 0, G, G).data, out = new Float32Array(G * G), sorted = [];
    for (let i = 0; i < G * G; i++) { out[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255; sorted.push(out[i]); }
    sorted.sort((a, b) => a - b);
    const lo = sorted[Math.floor(G * G * 0.04)], hi = sorted[Math.floor(G * G * 0.96)], span = Math.max(0.12, hi - lo);
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
      const i = y * G + x, u = (x + 0.5) / G * 2 - 1, v = (y + 0.5) / G * 2 - 1;
      const m = clamp(1.25 - (u * u * 1.25 + v * v * 0.95) * 1.1, 0, 1);       // 타원 마스크
      out[i] = Math.pow(clamp((out[i] - lo) / span, 0, 1), 0.85) * Math.min(1, m * 2.2);
    }
    return out;
  }
  // 카메라 없이 탑승할 때의 기본 승무원 (헬멧)
  function defaultFace() {
    const out = new Float32Array(G * G);
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
      const u = (x + 0.5) / G * 2 - 1, v = (y + 0.5) / G * 2 - 1, r = Math.hypot(u * 1.05, v * 1.0);
      let l = 0;
      if (r < 0.9) l = 0.55 + 0.3 * (1 - r);
      if (r < 0.92 && r > 0.8) l = 0.95;                                       // 헬멧 테
      if (Math.abs(v + 0.02) < 0.3 && Math.abs(u) < 0.6) l = 0.16;             // 바이저
      if (Math.abs(v + 0.05) < 0.07 && (Math.abs(u - 0.26) < 0.09 || Math.abs(u + 0.26) < 0.09)) l = 1; // 눈
      if (v > 0.5 && v < 0.58 && Math.abs(u) < 0.2) l = 0.25;                  // 입
      out[y * G + x] = l;
    }
    return out;
  }
  BA.face = null; BA.faceIsPhoto = false;
  BA.sampleFace = sampleFace; BA.defaultFace = defaultFace;

  // 도트 초상. dmg 0(정상)~1(위독), dead 0~1(분해 진행), ink = 영수증용 어두운 점
  function drawFace(c, face, x, y, size, o) {
    o = o || {};
    const cell = size / G, dmg = clamp(o.dmg || 0, 0, 1), dead = o.dead || 0, t = BA.time, k8 = Math.floor(t * 9);
    if (!o.noBg) { c.fillStyle = o.ink ? "#e9e6dc" : "#0b0b0b"; c.fillRect(x, y, size, size); }
    const col = o.ink ? "20,20,20" : dmg > 0.66 ? "255,96,80" : dmg > 0.33 ? "241,196,83" : "224,224,216";
    for (let gy = 0; gy < G; gy++) {
      // 손상될수록 가로줄이 밀리고 끊긴다
      const rowJ = !o.ink && hash(gy * 3.1 + k8) < dmg * 0.55 ? (hash(gy + k8 * 1.7) - 0.5) * cell * 9 * dmg : 0;
      for (let gx = 0; gx < G; gx++) {
        let l = face[gy * G + gx];
        if (l < 0.06) continue;
        if (!o.ink && hash(gx * 12.9 + gy * 78.2 + k8 * 0.37) < dmg * 0.4) continue;      // 픽셀 탈락
        let px = x + gx * cell + cell / 2 + rowJ, py = y + gy * cell + cell / 2, a = 1;
        if (dead > 0) {                                                                    // 효모에게 분해된다
          const h = hash(gx * 5.3 + gy * 9.7), d = clamp(dead * 1.6 - h * 0.6, 0, 1);
          px += (h - 0.5) * size * 0.9 * d; py += d * d * size * 0.9; a = 1 - d; l *= 1 - d * 0.5;
          if (a <= 0.02) continue;
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

  // ───── VITAL ───────────────────────────────────────────────
  let hitT = 0, shownHp = 100, beatT = 0, drainAcc = 0;
  const Vital = {
    damage(n, reason) {
      const S = BA.S;
      if (BA.dead || S.hp <= 0) return;
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

  // ───── 하단 상태창 ─────────────────────────────────────────
  function panel(dt) {
    const { H, U } = BA, S = BA.S;
    shownHp = lerp(shownHp, S.hp, 1 - Math.exp(-dt * 6));
    hitT = Math.max(0, hitT - dt);
    const fs = Math.round(72 * U), pad = 8, tw = Math.round(176 * U);
    const w = fs + tw + pad * 3, h = fs + pad * 2, x = 14 + (hitT > 0 ? (R() - 0.5) * 10 : 0), y = H - 48 - h - 10;
    const dmg = 1 - S.hp / 100, col = S.hp > 66 ? C.white : S.hp > 33 ? C.amber : C.red;
    ctx.fillStyle = "rgba(8,8,8,0.92)"; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = hitT > 0 ? C.red : "rgba(255,255,255,0.22)"; ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, w, h);
    drawFace(ctx, BA.face || defaultFace(), x + pad, y + pad, fs, { dmg: Math.max(dmg, hitT > 0 ? 0.9 : 0) });
    const tx = x + fs + pad * 2;
    T(S.name, tx, y + pad + 7 * U, { size: 11, align: "left", bold: true, color: C.text });
    T("VITAL", tx, y + pad + 26 * U, { size: 9, align: "left", color: C.dim });
    T(String(Math.round(shownHp)).padStart(3, "0"), tx + tw, y + pad + 26 * U, { size: 12, align: "right", bold: true, color: col });
    const by = y + pad + 36 * U, seg = 10, sw = (tw - (seg - 1) * 2) / seg;
    for (let i = 0; i < seg; i++) {
      const on = shownHp / 100 * seg > i + 0.05;
      ctx.fillStyle = on ? col : "rgba(255,255,255,0.1)";
      ctx.fillRect(tx + i * (sw + 2), by, sw, 7 * U);
    }
    T("상태 · " + Vital.state() + (BA.Hands && BA.Hands.on ? "   HAND ●" : ""), tx, y + pad + 56 * U, { size: 10, align: "left", bold: true, color: col });
    T(S.log, tx, y + pad + 70 * U, { size: 9, align: "left", color: hitT > 0 ? C.red : C.dim });
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
      if (Btn("[ 이 장면에서 재조립 · VITAL 50 ]", W / 2 - 150 * U, by, { size: 13 })) {
        S.hp = 50; S.log = "재조립 완료"; shownHp = 0; BA.dead = 0; drainAcc = 0;
        Snd.chord([196, 262, 330], 0.06); BA.fx.flash("216,216,216", 0.4);
        BA.go(BA.curIndex());
      }
      if (Btn("처음부터 다시 탑승", W / 2 + 170 * U, by, { size: 13, color: C.red })) {
        BA.reset(); shownHp = 100; BA.dead = 0; drainAcc = 0; BA.go(0);
      }
    }
  }

  BA.overlay = (dt, scene) => {
    if (scene && scene.id !== "idle") panel(dt);
    if (BA.dead) deathScreen(dt);
    BA.fx.post(dt);
  };
})();
