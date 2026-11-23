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

  const Hands = {
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
          this.mp.setOptions({ maxNumHands: 2, modelComplexity: 0, minDetectionConfidence: 0.6, minTrackingConfidence: 0.5 });
          this.mp.onResults((r) => { this.raw = r.multiHandLandmarks || []; if (this.raw.length) this.seenT = performance.now(); });
        }
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
    async loop() {
      if (!this.on) return;
      const v = BA.Cam.video;
      if (!this.busy && v.readyState >= 2 && v.videoWidth > 0) {
        this.busy = true;
        try { await this.mp.send({ image: v }); } catch (_) {}
        this.busy = false;
      }
      setTimeout(() => this.loop(), 30);
    },
    // 매 프레임: 랜드마크 → 화면 좌표, 포인터에 반영
    apply(dt) {
      const c = this.cur;
      const fresh = this.on && this.raw.length && performance.now() - this.seenT < 300;
      if (!fresh) {
        if (c.active && c.down) P.down = false;                // 손이 사라지면 클릭 없이 놓는다
        c.active = false; c.down = false; this.list = [];
        return;
      }
      const k = 1 - Math.exp(-dt * 16), prev = this.list;
      const now = this.raw.map((lm) => {
        const pc = palm(lm);
        return { x: mapX(pc.x), y: mapY(pc.y), pinch: pinchOf(lm), pts: lm.map((q) => ({ x: mapX(q.x), y: mapY(q.y) })) };
      });
      // MediaPipe 가 손 순서를 뒤집어도 이전 프레임과 가까운 쪽으로 붙인다
      if (prev.length === 2 && now.length === 2) {
        const d0 = Math.hypot(now[0].x - prev[0].x, now[0].y - prev[0].y) + Math.hypot(now[1].x - prev[1].x, now[1].y - prev[1].y);
        const d1 = Math.hypot(now[1].x - prev[0].x, now[1].y - prev[0].y) + Math.hypot(now[0].x - prev[1].x, now[0].y - prev[1].y);
        if (d1 < d0) now.reverse();
      }
      now.forEach((h, i) => { const p = prev[i]; if (p) { h.x = lerp(p.x, h.x, k); h.y = lerp(p.y, h.y, k); h.pinch = lerp(p.pinch, h.pinch, k * 1.4 > 1 ? 1 : k * 1.4); } });
      this.list = now;
      const h = now[0];
      if (!c.active) { c.x = h.x; c.y = h.y; }
      c.active = true; c.x = h.x; c.y = h.y;
      P.x = c.x; P.y = c.y;
      const want = c.down ? h.pinch > 0.42 : h.pinch > 0.7;    // 히스테리시스
      if (want && !c.down) { c.down = true; P.down = true; P.pressed = true; BA.Snd.init(); }
      else if (!want && c.down) { c.down = false; P.down = false; P.click = true; }
    },
    // 물레용 — 두 손이 보이면 [왼쪽, 오른쪽]
    two() { return this.list.length === 2 ? (this.list[0].x < this.list[1].x ? [this.list[0], this.list[1]] : [this.list[1], this.list[0]]) : null; },
  };
  BA.Hands = Hands;
  BA.pre = (dt) => Hands.apply(dt);
  btn.addEventListener("click", () => { BA.Snd.init(); Hands.toggle(); });

  // 손 골격 + 커서 (fx 레이어)
  const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
  BA.fxDraw = (f) => {
    if (!Hands.list.length) return;
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
