// Solo v2 · 시각효과 레이어
//   #glow  — 무대 캔버스를 1/4 해상도로 복사 → CSS blur + screen 블렌드 = 블룸 (피드백 없음)
//   #fx    — 파티클 · 글리치 슬라이스 · 플래시 · 스캔라인/비네트 · 저체력 경고
// 무대(#stage) 위에 덧그리지 않으므로 장면의 잔상 효과와 섞여 번지지 않는다.

(() => {
  "use strict";
  const { clamp, R } = BA;
  const stage = document.getElementById("stage");
  const glow = document.getElementById("glow"), g = glow.getContext("2d");
  const fxc = document.getElementById("fx"), f = fxc.getContext("2d");
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const vig = document.createElement("canvas");

  function resize() {
    const W = window.innerWidth, H = window.innerHeight;
    glow.width = Math.ceil(W / 4); glow.height = Math.ceil(H / 4);
    fxc.width = Math.floor(W * DPR); fxc.height = Math.floor(H * DPR);
    f.setTransform(DPR, 0, 0, DPR, 0, 0);
    // 비네트 + 스캔라인은 한 번만 굽는다
    vig.width = Math.ceil(W / 2); vig.height = Math.ceil(H / 2);
    const v = vig.getContext("2d"), w = vig.width, h = vig.height;
    const gr = v.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.56);
    gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,0.62)");
    v.fillStyle = gr; v.fillRect(0, 0, w, h);
    v.fillStyle = "rgba(0,0,0,0.13)";
    for (let y = 0; y < h; y += 2) v.fillRect(0, y, w, 1);
  }
  window.addEventListener("resize", resize);
  resize();

  const fx = {
    ctx: f, p: [], glitchT: 0, flashA: 0, flashC: "255,255,255", ring: [],
    // 파티클 버스트. color = "r,g,b"
    burst(x, y, n, color, speed, life, size, grav) {
      for (let i = 0; i < n; i++) {
        const a = R() * 6.283, s = (speed || 160) * (0.3 + R() * 0.9);
        this.p.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: (life || 0.7) * (0.5 + R() * 0.8), c: color || "216,216,216", s: (size || 3) * (0.6 + R() * 0.8), g: grav || 0 });
      }
      if (this.p.length > 900) this.p.splice(0, this.p.length - 900);
    },
    spark(x, y, vx, vy, color, life, size, grav) {
      this.p.push({ x, y, vx, vy, t: 0, life: life || 0.5, c: color || "216,216,216", s: size || 2, g: grav || 0 });
    },
    shock(x, y, color, max) { this.ring.push({ x, y, t: 0, c: color || "216,216,216", max: max || 260 }); },
    shake(a) { BA.shakeAmt = Math.max(BA.shakeAmt, a); },
    glitch(t) { this.glitchT = Math.max(this.glitchT, t); },
    flash(rgb, a) { this.flashC = rgb; this.flashA = Math.max(this.flashA, a); },

    post(dt) {
      const W = BA.W, H = BA.H, U = BA.U;
      BA.shakeAmt = Math.max(0, BA.shakeAmt - dt * 60);
      // bloom source
      g.clearRect(0, 0, glow.width, glow.height);
      g.drawImage(stage, 0, 0, glow.width, glow.height);
      // 장면별 블룸 세기 (영수증처럼 흰 면이 큰 장면은 약하게)
      const sc = BA.scene(), want = sc && sc.glow != null ? sc.glow : 0.5;
      if (want !== this.glowNow) { this.glowNow = want; glow.style.opacity = want; }

      f.clearRect(0, 0, W, H);
      // glitch — 무대의 가로 띠를 어긋나게 다시 찍는다
      if (this.glitchT > 0) {
        this.glitchT -= dt;
        const k = clamp(this.glitchT * 2.5, 0, 1), n = 3 + Math.floor(k * 7);
        for (let i = 0; i < n; i++) {
          const sy = Math.floor(R() * H), sh = 3 + Math.floor(R() * 46 * k), dx = (R() - 0.5) * 120 * k * U;
          try { f.drawImage(stage, 0, sy * DPR, W * DPR, sh * DPR, dx, sy, W, sh); } catch (_) {}
          f.fillStyle = R() < 0.5 ? "rgba(255,40,70,0.12)" : "rgba(60,255,220,0.10)";
          f.fillRect(0, sy, W, sh);
        }
      }
      // particles
      f.globalCompositeOperation = "lighter";
      let w = 0;
      for (const p of this.p) {
        p.t += dt; if (p.t >= p.life) continue;
        p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 1.4; p.vy *= 1 - dt * 1.4;
        const a = 1 - p.t / p.life, s = Math.max(1, p.s * U * (0.5 + a * 0.5));
        f.fillStyle = "rgba(" + p.c + "," + a.toFixed(2) + ")";
        f.fillRect(Math.round(p.x / 2) * 2, Math.round(p.y / 2) * 2, s, s);
        this.p[w++] = p;
      }
      this.p.length = w;
      for (const r of this.ring) {
        r.t += dt;
        const k = r.t / 0.7; if (k >= 1) continue;
        f.strokeStyle = "rgba(" + r.c + "," + ((1 - k) * 0.9).toFixed(2) + ")"; f.lineWidth = 3 * (1 - k) + 1;
        f.beginPath(); f.arc(r.x, r.y, (1 - Math.pow(1 - k, 3)) * r.max * U, 0, 6.283); f.stroke();
      }
      this.ring = this.ring.filter((r) => r.t < 0.7);
      f.globalCompositeOperation = "source-over"; f.lineWidth = 1;

      if (BA.fxDraw) BA.fxDraw(f, dt);           // 손 커서 등
      f.drawImage(vig, 0, 0, W, H);
      // 저체력 — 가장자리가 심장 박동으로 붉게 조인다
      const hp = BA.S.hp;
      if (hp < 34 && BA.scene() && BA.scene().id !== "idle") {
        const beat = Math.pow(Math.max(0, Math.sin(BA.time * (hp < 15 ? 9 : 6))), 6);
        const gr = f.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.55);
        gr.addColorStop(0, "rgba(232,57,42,0)"); gr.addColorStop(1, "rgba(232,57,42," + (0.16 + beat * 0.3).toFixed(2) + ")");
        f.fillStyle = gr; f.fillRect(0, 0, W, H);
      }
      if (this.flashA > 0.01) {
        f.fillStyle = "rgba(" + this.flashC + "," + this.flashA.toFixed(2) + ")"; f.fillRect(0, 0, W, H);
        this.flashA *= Math.pow(0.02, dt);
      }
    },
  };
  BA.fx = fx;
})();
