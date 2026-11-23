// Solo v2 · MediaPipe Hands — 손으로 조작
//   한 손  : 손바닥 위치 = 포인터, 엄지+검지 핀치 = 클릭/누르고 있기 → 모든 장면을 손으로 통과 가능
//   두 손  : 물레에서 공연판과 같은 BRACKET — 양손 사이 거리가 그 높이의 반지름
// 공연판 digital-wheel-v2 와 같은 CDN 빌드(@mediapipe/hands 0.4)를 필요할 때만 불러온다. 인터넷 필요.
// 마우스는 항상 함께 동작한다(손이 화면에 없으면 마우스가 포인터).

(() => {
  "use strict";
  const { clamp, lerp, P, C, sys } = BA;
  const CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/";
  const btn = document.getElementById("btnHand");

  const palm = (lm) => { let x = 0, y = 0; for (const i of [0, 5, 9, 13, 17]) { x += lm[i].x; y += lm[i].y; } return { x: x / 5, y: y / 5 }; };
  const scaleOf = (lm) => Math.hypot(lm[9].x - lm[0].x, lm[9].y - lm[0].y);
  const pinchOf = (lm) => { const sc = scaleOf(lm); return sc < 0.01 ? 0 : clamp(1 - (Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) / sc - 0.18) / 0.6, 0, 1); };
  // 카메라 프레임 가운데 76% 를 화면 전체로 편다 (팔을 끝까지 뻗지 않아도 가장자리에 닿게)
  const mapX = (nx) => clamp((1 - nx - 0.12) / 0.76, 0, 1) * BA.W;
  const mapY = (ny) => clamp((ny - 0.14) / 0.7, 0, 1) * BA.H;

  const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
  const Hands = {
    BONES,
    on: false, loading: false, err: "", mp: null, raw: [], seenT: 0, busy: false,
    list: [],                 // 화면 좌표로 보정·평활된 손 [{x,y,pinch,pts}]
    cur: { x: 0, y: 0, down: false, active: false },
    label() { return this.loading ? "HAND …" : this.on ? "HAND ON" : "HAND OFF"; },
    sync() { btn.textContent = this.label(); btn.classList.toggle("off", !this.on); },
    async toggle() { if (this.on || this.loading) this.disable(); else await this.enable(); this.sync(); },
    async enable() {
      this.loading = true; this.err = ""; btn.textContent = this.label();
      try {
        if (!window.Hands) {
          await new Promise((res, rej) => {
            const s = document.createElement("script");
            s.src = CDN + "hands.js"; s.crossOrigin = "anonymous";
            s.onload = res; s.onerror = () => rej(new Error("net"));
            document.head.appendChild(s);
          });
        }
        if (!(await BA.Cam.start())) throw new Error(BA.Cam.err);
        if (!this.mp) {
          this.mp = new window.Hands({ locateFile: (f) => CDN + f });
          this.mp.setOptions({ maxNumHands: 2, modelComplexity: 0, minDetectionConfidence: 0.5, minTrackingConfidence: 0.45 });
          this.mp.onResults((r) => { this.raw = r.multiHandLandmarks || []; if (this.raw.length) this.seenT = performance.now(); });
        }
        if (this.mp.initialize) await this.mp.initialize();   // 모델을 미리 올려, 켜자마자 첫 인식이 늦지 않게
        this.on = true; this.loading = false;
        this.loop();
        sys("손 인식 켜짐 · 손바닥 = 포인터 · 엄지+검지 핀치 = 클릭");
      } catch (e) {
        this.loading = false; this.on = false;
        this.err = e.message === "net" ? "손 인식 모듈을 불러오지 못했습니다 (인터넷 필요)" : (e.message || "손 인식을 시작할 수 없습니다");
        sys(this.err + " — 마우스로 계속 진행");
      }
      this.sync();
    },
    disable() {
      this.on = false; this.loading = false; this.list = []; this.cur.active = false;
      if (this.cur.down) { P.down = false; this.cur.down = false; }
      const sc = BA.scene();
      if (!sc || sc.id !== "idle") BA.Cam.stop();
    },
    // 추론 루프 — 새 카메라 프레임만 보내고, 추론이 느린 기기에서는 간격을 벌려 화면이 끊기지 않게 한다
    async loop() {
      if (!this.on) return;
      const v = BA.Cam.video;
      let wait = 12;
      if (!this.busy && v.readyState >= 2 && v.videoWidth > 0 && v.currentTime !== this.lastT) {
        this.busy = true; this.lastT = v.currentTime;
        const t0 = performance.now();
        try { await this.mp.send({ image: v }); } catch (_) {}
        this.busy = false;
        this.ms = lerp(this.ms || 30, performance.now() - t0, 0.2);
        wait = clamp(this.ms * 0.4, 4, 60);
      }
      setTimeout(() => this.loop(), wait);
    },
    // 매 프레임: 랜드마크 → 손 트랙(화면 좌표 x,y + 카메라 안 좌표 nx,ny), 포인터에 반영
    //   인식이 한두 프레임 끊겨도 0.3초 동안은 마지막 위치를 붙들고 있어 조작이 뚝뚝 끊기지 않는다
    apply(dt) {
      const c = this.cur;
      const fresh = this.on && performance.now() - this.seenT < 400;
      const drop = () => { if (c.active && c.down) P.down = false; c.active = false; c.down = false; this.list = []; };   // 손이 사라지면 클릭 없이 놓는다
      if (!fresh) return drop();
      const k = 1 - Math.exp(-dt * 18), kn = 1 - Math.exp(-dt * 12);
      const det = this.raw.map((lm) => {
        const pc = palm(lm);
        return { x: mapX(pc.x), y: mapY(pc.y), nx: 1 - pc.x, ny: pc.y, rnx: 1 - pc.x, rny: pc.y, miss: 0, pinch: pinchOf(lm),
          pts: lm.map((q) => ({ x: mapX(q.x), y: mapY(q.y) })), npts: lm.map((q) => ({ x: 1 - q.x, y: q.y })) };
      });
      const used = det.map(() => false);
      for (const t of this.list) {                              // 이전 트랙에 가장 가까운 손을 붙인다 (순서가 뒤집혀도 유지)
        let bi = -1, bd = 0.3;
        det.forEach((d, i) => { if (!used[i]) { const dd = Math.hypot(d.nx - t.rnx, d.ny - t.rny); if (dd < bd) { bd = dd; bi = i; } } });
        if (bi < 0) { t.miss += dt; continue; }
        const d = det[bi]; used[bi] = true; t.miss = 0; t.rnx = d.nx; t.rny = d.ny;
        t.x = lerp(t.x, d.x, k); t.y = lerp(t.y, d.y, k); t.nx = lerp(t.nx, d.nx, kn); t.ny = lerp(t.ny, d.ny, kn);
        t.pinch = lerp(t.pinch, d.pinch, Math.min(1, k * 1.4)); t.pts = d.pts; t.npts = d.npts;
      }
      det.forEach((d, i) => { if (!used[i] && this.list.length < 2) this.list.push(d); });
      this.list = this.list.filter((t) => t.miss < 0.3);
      if (!this.list.length) return drop();
      const h = this.list[0];
      c.active = true; c.x = h.x; c.y = h.y;
      P.x = c.x; P.y = c.y;
      const want = c.down ? h.pinch > 0.42 : h.pinch > 0.7;    // 히스테리시스
      if (want && !c.down) { c.down = true; P.down = true; P.pressed = true; BA.Snd.init(); }
      else if (!want && c.down) { c.down = false; P.down = false; P.click = true; }
    },
    // 물레용 — 두 손이 보이면 [왼쪽, 오른쪽]
    two() { return this.list.length === 2 ? (this.list[0].nx < this.list[1].nx ? [this.list[0], this.list[1]] : [this.list[1], this.list[0]]) : null; },
    seen() { return this.list.filter((t) => t.miss === 0).length; },
    // 카메라 미리보기(거울, 흑백) + 손 골격 — 손이 화면 어디쯤 잡히는지 보여 준다
    preview(c, x, y, w, h, band) {
      const v = BA.Cam.video;
      c.fillStyle = "#050505"; c.fillRect(x, y, w, h);
      if (v.readyState >= 2 && v.videoWidth) {
        c.save(); c.translate(x + w, y); c.scale(-1, 1);
        try { c.filter = "grayscale(1) contrast(1.15)"; } catch (_) {}
        c.globalAlpha = 0.7; c.drawImage(v, 0, 0, w, h);
        c.restore();
      }
      if (band) {                                               // 이 띠 안에서 빚는다
        c.fillStyle = "rgba(160,255,160,0.08)"; c.fillRect(x, y + h * band[0], w, h * (band[1] - band[0]));
        c.fillStyle = "rgba(160,255,160,0.5)"; c.fillRect(x, y + h * band[0], w, 1); c.fillRect(x, y + h * band[1], w, 1);
        c.fillStyle = "rgba(216,216,216,0.35)"; c.fillRect(x + w / 2, y, 1, h);
      }
      for (const t of this.list) {
        c.strokeStyle = "rgba(160,255,160," + (t.miss ? 0.3 : 0.95) + ")"; c.lineWidth = 1.5; c.beginPath();
        for (const [p, q] of BONES) { c.moveTo(x + t.npts[p].x * w, y + t.npts[p].y * h); c.lineTo(x + t.npts[q].x * w, y + t.npts[q].y * h); }
        c.stroke();
      }
      c.lineWidth = 1; c.strokeStyle = this.list.length ? C.green : "rgba(255,255,255,0.3)"; c.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(h));
    },
  };
  BA.Hands = Hands;
  BA.pre = (dt) => Hands.apply(dt);
  btn.addEventListener("click", () => { BA.Snd.init(); Hands.toggle(); });

  // 손 골격 + 커서 (fx 레이어)
  BA.fxDraw = (f) => {
    if (!Hands.list.length || Hands.quiet) return;            // 물레에서는 점토 옆에 따로 그린다
    for (const h of Hands.list) {
      f.strokeStyle = "rgba(160,255,160,0.35)"; f.lineWidth = 1;
      f.beginPath();
      for (const [a, b] of BONES) { f.moveTo(h.pts[a].x, h.pts[a].y); f.lineTo(h.pts[b].x, h.pts[b].y); }
      f.stroke();
      f.fillStyle = "rgba(160,255,160,0.8)";
      for (const q of h.pts) f.fillRect(Math.round(q.x) - 1, Math.round(q.y) - 1, 3, 3);
    }
    const c = Hands.cur, r = 16 * BA.U;
    f.strokeStyle = C.green; f.lineWidth = 2;
    f.beginPath(); f.arc(c.x, c.y, r, 0, 6.283); f.stroke();
    f.fillStyle = "rgba(160,255,160," + (c.down ? 0.85 : 0.15 + Hands.list[0].pinch * 0.4) + ")";
    f.beginPath(); f.arc(c.x, c.y, r * (c.down ? 0.75 : 0.25 + Hands.list[0].pinch * 0.4), 0, 6.283); f.fill();
    f.lineWidth = 1;
  };
})();
