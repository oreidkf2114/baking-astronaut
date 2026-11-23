// Solo · scenes A — 대기 → 좌표 탐색 → 좌표 발견 → 탑승 → 발사 → 항해
// 공연판에서 GM(iPad)이 넘기던 페이지 0 / 1 / 1-2 / 1-3 / 1-4 / 2 를 관객 혼자 클릭으로 통과한다.

(() => {
  "use strict";
  const { ctx, C, T, Btn, clear, clamp, lerp, R, garble, Snd, P, say, sys } = BA;
  const stars = new BA.Stars(420);
  BA.stars = stars;

  // ═════ 0. IDLE — 대기 / 얼굴 스캔 / 탑승 수속 ═════════════════
  const WAIT = ["대기 상태 양호.", "비커 채널 휴면 중.", "산성도 안정권 진입.", "표면 기포 활동 감지.", "외부 오염도 낮음.", "탑승자 신호 대기.", "발효 언어 동기화 필요."];
  const nameBox = document.getElementById("nameBox");
  const nameInput = document.getElementById("nameInput");
  BA.add({
    id: "idle", mood: "idle", hint: "얼굴을 스캔하면 당신이 도트 승무원이 됩니다 · 약 8분 · 소리 켜기 권장",
    enter() {
      this.t = 0; this.mode = BA.faceIsPhoto ? "shot" : "intro"; this.live = null; this.flash = 0; this.msg = "";
      nameBox.hidden = false; Snd.drone(55, 0.035, 200); sys("standby. 탑승자 신호 대기.");
    },
    exit() {
      nameBox.hidden = true;
      if (!BA.face) { BA.face = BA.defaultFace(); BA.faceIsPhoto = false; }
      if (!(BA.Hands && (BA.Hands.on || BA.Hands.loading))) BA.Cam.stop();     // 손 인식을 안 쓰면 카메라를 바로 끈다
      BA.S.name = "아스트로넛 " + (nameInput.value.trim() || "무명");
      BA.S.t0 = Date.now();
    },
    async scan() {
      this.msg = "카메라 연결 중…";
      if (await BA.Cam.start()) { this.mode = "cam"; this.msg = ""; }
      else this.msg = BA.Cam.err + " — 스캔 없이 탑승할 수 있습니다";
    },
    board() { Snd.init(); Snd.chord([220, 330, 440]); BA.fx.shock(BA.W / 2, BA.H * 0.42, "216,216,216", 420); BA.next(); },
    update(dt) { this.t += dt; this.flash = Math.max(0, this.flash - dt * 2); if (this.mode === "cam") this.live = BA.sampleFace() || this.live; },
    render() {
      const { W, H, U, time } = BA;
      clear(0.3);
      stars.draw(0.5, this.t * 0.01);
      BA.drawShip(W / 2, H * 0.115 + Math.sin(this.t * 1.2) * 4 * U, Math.max(2, Math.round(3 * U)), 2);
      T("BAKING ASTRONAUT", W / 2, H * 0.2, { size: 34, bold: true, color: C.white });
      T("베이킹 아스트로넛 — 1인 탑승 체험 v2", W / 2, H * 0.2 + 30 * U, { size: 12, color: C.dim });
      // 초상
      const fs = Math.min(190 * U, H * 0.27), fx0 = W / 2 - fs / 2, fy0 = H * 0.44 - fs / 2;
      const face = this.mode === "cam" ? this.live : this.mode === "shot" ? BA.face : null;
      BA.drawFace(ctx, face || BA.defaultFace(), fx0, fy0, fs, { dmg: this.mode === "intro" ? 0.25 : 0 });
      if (this.mode === "cam") {
        ctx.strokeStyle = "rgba(160,255,160,0.8)"; ctx.setLineDash([4, 6]);
        ctx.beginPath(); ctx.ellipse(W / 2, H * 0.44, fs * 0.33, fs * 0.42, 0, 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
        const sy = fy0 + ((time * 0.7) % 1) * fs;
        ctx.fillStyle = "rgba(160,255,160,0.5)"; ctx.fillRect(fx0, sy, fs, 2);
        T("얼굴을 점선 안에 맞추세요", W / 2, fy0 - 14 * U, { size: 12, bold: true, color: C.green });
      } else if (this.mode === "intro") T("탑승자 미등록", W / 2, fy0 - 14 * U, { size: 11, color: C.dim });
      else T("탑승자 등록 완료", W / 2, fy0 - 14 * U, { size: 11, bold: true, color: C.green });
      if (this.flash > 0) { ctx.fillStyle = "rgba(255,255,255," + this.flash.toFixed(2) + ")"; ctx.fillRect(fx0, fy0, fs, fs); }
      const i = Math.floor(this.t / 2.2) % WAIT.length;
      T(garble(WAIT[i], (this.t % 2.2) < 0.3 ? 0.6 : 0), W / 2, fy0 + fs + 18 * U, { size: 11, color: C.ghost });
      // 버튼
      const by = H * 0.76;
      if (this.mode === "intro") {
        if (Btn("[ 얼굴 스캔 ]", W / 2 - 130 * U, by, { size: 15, color: C.green })) this.scan();
        if (Btn("스캔 없이 탑승 ▶", W / 2 + 130 * U, by, { size: 14 })) this.board();
      } else if (this.mode === "cam") {
        if (Btn("[ ● 촬영 ]", W / 2 - 90 * U, by, { size: 15, color: C.green }) && this.live) {
          BA.face = Float32Array.from(this.live); BA.faceIsPhoto = true; this.mode = "shot"; this.flash = 1;
          Snd.noise(0.12, 0.2, 5000, "highpass"); Snd.blip(1200, 0.08, "square", 0.05);
        }
        if (Btn("취소", W / 2 + 100 * U, by, { size: 13 })) this.mode = BA.faceIsPhoto ? "shot" : "intro";
      } else {
        if (Btn("다시 찍기", W / 2 - 170 * U, by, { size: 13 })) this.scan();
        if (Btn("[ 탑승 수속 시작 ▶ ]", W / 2 + 70 * U, by, { size: 16, color: C.green })) this.board();
      }
      const hand = BA.Hands;
      if (Btn("손 인식 조작 : " + (hand.loading ? "불러오는 중…" : hand.on ? "ON (손바닥 = 포인터 · 핀치 = 클릭)" : "OFF — 눌러서 켜기"), W / 2, H * 0.845, { size: 11, color: hand.on ? C.green : C.dim })) hand.toggle();
      T(this.msg || hand.err || "카메라 영상은 이 브라우저 안에서만 처리되며 저장·전송되지 않습니다.", W / 2, H * 0.9, { size: 10, color: this.msg || hand.err ? C.amber : C.ghost });
    },
  });

  // ═════ 1. SEARCH — 효모 좌표 탐색 ═══════════════════════════
  BA.add({
    id: "search", mood: "search", cursor: "crosshair", hint: "마우스를 움직여 신호를 찾고 · 가장 강한 곳에서 길게 누르기",
    enter() {
      const { W, H } = BA;
      this.t = 0; this.lock = 0; this.done = 0; this.beep = 0; this.sig = 0;
      const a = R() * Math.PI * 2, d = 0.24 + R() * 0.12;
      this.tx = clamp(W / 2 + Math.cos(a) * W * d, W * 0.12, W * 0.88);
      this.ty = clamp(H / 2 + Math.sin(a) * H * d, H * 0.22, H * 0.8);
      this.dots = Array.from({ length: 300 }, () => ({ x: R(), y: R(), p: R() * 6.28 }));
      Snd.drone(49, 0.04, 260);
      sys("효모 좌표 탐색 중. 르뱅 군집은 아직 비활성.");
    },
    skip() { BA.S.coord = "α 12.4° · δ -03.1°"; },
    update(dt) {
      const { W, H } = BA;
      this.t += dt;
      if (this.done) { this.done += dt; if (this.done > 2.4) BA.next(); return; }
      const d = Math.hypot(P.x - this.tx, P.y - this.ty);
      this.sig = Math.pow(clamp(1 - d / (Math.hypot(W, H) * 0.5), 0, 1), 1.8);
      this.beep -= dt;
      if (this.beep <= 0) { this.beep = lerp(0.85, 0.06, this.sig); Snd.blip(lerp(260, 1500, this.sig), 0.04, "square", 0.03 + this.sig * 0.03, null, false); }
      if (this.sig > 0.86 && P.down) this.lock += dt / 1.5; else this.lock = Math.max(0, this.lock - dt * 1.5);
      if (this.t > 40) BA.Vital.drain(2.5, dt, "산소 저하 · 탐색 지연");
      if (this.lock >= 1) {
        this.done = 0.001;
        BA.S.coord = "α " + (this.tx / W * 24).toFixed(1) + "° · δ " + ((0.5 - this.ty / H) * 40).toFixed(1) + "°";
        Snd.chord([440, 554, 659, 880], 0.06);
        BA.fx.shock(this.tx, this.ty, "216,216,216", 420); BA.fx.burst(this.tx, this.ty, 70, "216,216,216", 320, 0.9, 3); BA.Vital.heal(5, "좌표 고정");
        say("효모 비활성 상태에서 활성화가 완료 되었습니다.");
        sys("신호 고정. 군집 활성화.");
      }
    },
    render() {
      const { W, H, U, time } = BA;
      clear(0.35);
      const hintAmt = clamp((this.t - 18) / 20, 0, 1);
      for (const d of this.dots) {
        const x = d.x * W, y = d.y * H, near = clamp(1 - Math.hypot(x - this.tx, y - this.ty) / (220 * U), 0, 1);
        const tw = 0.5 + 0.5 * Math.sin(time * 3 + d.p);
        const a = 0.08 + tw * 0.1 + near * (0.15 + hintAmt * 0.6) * tw;
        ctx.fillStyle = "rgba(216,216,216," + a.toFixed(2) + ")";
        const s = near > 0.4 && tw > 0.6 ? 3 : 2;
        ctx.fillRect(Math.round(x + Math.sin(time * 2 + d.p) * near * 6), Math.round(y + Math.cos(time * 2.3 + d.p) * near * 6), s, s);
      }
      // scanner
      const r = 64 * U, x = P.x, y = P.y, sig = this.done ? 1 : this.sig;
      ctx.strokeStyle = "rgba(216,216,216," + (0.35 + sig * 0.6).toFixed(2) + ")"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, r * (0.3 + 0.7 * ((time * (0.6 + sig * 2)) % 1)), 0, 6.283); ctx.globalAlpha = 0.3; ctx.stroke(); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.moveTo(x - r - 8, y); ctx.lineTo(x - r * 0.4, y); ctx.moveTo(x + r * 0.4, y); ctx.lineTo(x + r + 8, y);
      ctx.moveTo(x, y - r - 8); ctx.lineTo(x, y - r * 0.4); ctx.moveTo(x, y + r * 0.4); ctx.lineTo(x, y + r + 8); ctx.stroke();
      if (this.lock > 0 || this.done) {
        ctx.strokeStyle = C.white; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(x, y, r + 7, -1.57, -1.57 + 6.283 * clamp(this.done ? 1 : this.lock, 0, 1)); ctx.stroke();
      }
      T("SIG " + String(Math.round(sig * 100)).padStart(3, "0") + "%", x + r + 14, y - 10 * U, { size: 12, align: "left", bold: true });
      T(garble(BA.S.coord && this.done ? BA.S.coord : "α --.-° · δ --.-°", 1 - sig), x + r + 14, y + 8 * U, { size: 11, align: "left", color: C.dim });
      // header + signal bar
      T("PAGE 1 — 효모 좌표 탐색", W / 2, 96, { size: 13, color: C.dim });
      if (this.t > 30 && !this.done) T(this.t > 40 ? "산소 저하 — VITAL 감소 중" : "산소 잔량 " + Math.ceil(40 - this.t) + "초", W / 2, 96 + 50 * U, { size: 11, bold: true, color: this.t > 40 ? C.red : C.amber });
      T(this.done ? "COORD LOCKED" : sig > 0.86 ? "여기다 — 길게 누르세요" : "마우스를 움직여 효모의 신호를 찾으세요", W / 2, 96 + 26 * U, { size: 17, bold: true, color: sig > 0.86 ? C.white : C.text });
      const bw = Math.min(420 * U, W * 0.7), bx = W / 2 - bw / 2, by = H - 88;
      ctx.strokeStyle = C.ghost; ctx.strokeRect(bx + 0.5, by + 0.5, bw, 8);
      ctx.fillStyle = C.white; ctx.fillRect(bx, by, bw * sig, 8);
      T("SIGNAL", bx - 10, by + 4, { size: 10, align: "right", color: C.dim });
      if (this.done) { ctx.fillStyle = "rgba(216,216,216," + clamp(0.5 - this.done * 0.5, 0, 0.5) + ")"; ctx.fillRect(0, 0, W, H); }
    },
  });

  // ═════ 2. COORD FOUND — 좌표 LOCKED · 줌인 ══════════════════
  BA.add({
    id: "coord_found", mood: "search",
    enter() { this.t = 0; this.said = false; Snd.drone(65, 0.05, 320); sys("좌표 고정. 줌 2.6×."); },
    update(dt) {
      this.t += dt;
      if (!this.said && this.t > 0.8) { this.said = true; say("효모 생태계의 좌표를 발견했습니다."); }
    },
    render() {
      const { W, H, U, time } = BA;
      clear(0.4);
      const z = lerp(1, 2.6, clamp(this.t / 3, 0, 1) ** 0.6), cx = W / 2, cy = H / 2;
      ctx.strokeStyle = "rgba(216,216,216,0.12)"; ctx.lineWidth = 1;
      const g = 60 * U * z;
      for (let x = cx % g; x < W; x += g) { ctx.beginPath(); ctx.moveTo(x, 64); ctx.lineTo(x, H - 48); ctx.stroke(); }
      for (let y = cy % g; y < H; y += g) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      for (let i = 0; i < 4; i++) {
        const rr = ((time * 0.35 + i / 4) % 1) * 260 * U;
        ctx.strokeStyle = "rgba(216,216,216," + (0.5 * (1 - rr / (260 * U))).toFixed(2) + ")";
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 6.283); ctx.stroke();
      }
      const n = Math.floor(clamp(this.t - 1, 0, 6) * 3);
      for (let i = 0; i < n; i++) {
        const a = i * 2.4, rr = (40 + i * 9) * U * (z / 2.6);
        BA.drawYeast(i % 3 ? "idle" : "bud", cx + Math.cos(a + time * 0.2) * rr, cy + Math.sin(a + time * 0.2) * rr, 2 * U * z / 2.6 + 1, C.white, false, 0.85);
      }
      T("PAGE 1-2 — COORD LOCKED", W / 2, 96, { size: 13, color: C.dim });
      T("COLONY " + BA.S.colony, W / 2, H * 0.2, { size: 30, bold: true, color: C.white });
      T(BA.S.coord + " · ZOOM " + z.toFixed(1) + "×", W / 2, H * 0.2 + 30 * U, { size: 13, color: C.dim });
      if (this.t > 3.6 && Btn("[ 생태계 보고 데이터 읽기 ▶ ]", W / 2, H * 0.82)) BA.next();
    },
  });

  // ═════ 3. BOARDING — 원심분리기 탑승 (A-B 분기) ═════════════
  const REPORT = [
    "> 효모 생태계 보고 데이터",
    "군집 수 ............ 3.2 × 10^8",
    "산성도 ............. pH 6.8 (휴면)",
    "온도 ............... 19.4°C",
    "표면 기포 활동 ..... 감지",
    "외부 오염도 ........ 낮음",
    "발효 언어 동기화 ... 필요",
    "탑승자 신호 ........ 대기",
  ];
  BA.add({
    id: "boarding", mood: "tension", hint: "보고가 끝나면 · 깜빡이는 [B] 포드를 클릭해 탑승",
    enter() { this.t = 0; this.ang = 0; this.w = 0.55; this.board = 0; this.called = false; Snd.drone(58, 0.05, 240); say("효모의 생태계 보고 데이터를 읽는다."); sys("보고 데이터 수신 중."); },
    update(dt) {
      this.t += dt;
      if (!this.called && this.t > 7.5) { this.called = true; say("원심분리기가 곧 보딩 준비가 완료 됩니다. " + BA.S.name + "는 원심분리기에 탑승하세요."); sys("탑승 대기. [B] 포드를 클릭."); }
      if (this.board) {
        this.board += dt; this.w = Math.min(16, this.w + dt * 4.2);
        Snd.drone(58 + this.w * 9, 0.07, 240 + this.w * 60);
        if (this.board > 4.6) BA.next();
      }
      this.ang += this.w * dt;
    },
    render() {
      const { W, H, U, time } = BA;
      clear(this.board ? 0.18 : 0.45);
      T("PAGE 1-3 — BOARDING", W / 2, 96, { size: 13, color: C.dim });
      const wide = W > H * 1.15, lx = wide ? W * 0.08 : W * 0.08, ly = wide ? H * 0.3 : 120;
      const shown = this.t * 9;
      let acc = 0;
      REPORT.forEach((l, i) => {
        const n = clamp(Math.floor(shown - acc), 0, l.length); acc += l.length;
        if (n > 0 && (wide || i < 4)) T(l.slice(0, n), lx, ly + i * 24 * U, { size: i ? 12 : 13, align: "left", color: i ? C.dim : C.text, bold: !i });
      });
      const cx = wide ? W * 0.66 : W / 2, cy = wide ? H * 0.52 : H * 0.54, r = Math.min(wide ? W * 0.2 : W * 0.3, wide ? H * 0.27 : H * 0.2);
      const CH = "·:+*#";
      for (let k = 0; k < 56; k++) {
        const a = this.ang * 0.6 + (k / 56) * 6.283;
        T(CH[(k + Math.floor(time * 4)) % CH.length], cx + Math.cos(a) * r * 1.22, cy + Math.sin(a) * r * 1.22, { size: 12, color: C.ghost });
      }
      ctx.strokeStyle = C.ghost; ctx.beginPath(); ctx.arc(cx, cy, r * 0.18, 0, 6.283); ctx.stroke();
      T("⊕", cx, cy, { size: 20, color: C.dim });
      for (let k = 0; k < 6; k++) {
        const a = this.ang + (k / 6) * 6.283, px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
        ctx.strokeStyle = "rgba(216,216,216,0.15)"; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();
        if (k === 0) {
          this.px = px; this.py = py;
          const ready = this.called && !this.board, blink = Math.sin(time * 8) > 0;
          const hov = ready && Math.hypot(P.x - px, P.y - py) < 52 * U;
          if (hov) BA.hot = true;
          T(this.board ? "[●]" : "[B]", px, py, { size: 22, bold: true, color: this.board ? C.green : ready ? (blink || hov ? C.white : C.dim) : C.dim });
          if (ready) { ctx.strokeStyle = hov ? C.white : C.ghost; ctx.beginPath(); ctx.arc(px, py, 34 * U, 0, 6.283); ctx.stroke(); }
          if (hov && P.click) { this.board = 0.001; Snd.blip(220, 0.5, "sawtooth", 0.06, 880); BA.fx.burst(px, py, 50, "160,255,160", 260, 0.8, 3); BA.fx.glitch(0.3); sys("탑승 확인. 분기 발생."); }
        } else T("[ ]", px, py, { size: 18, color: C.dim });
      }
      if (this.board) {
        const lines = ["분기 발생.", "A는 물질로 이동한다.", "B는 상태로 탑승한다.", "피펫은 작은 우주선이다."];
        lines.forEach((l, i) => { if (this.board > 0.4 + i * 0.9) T(l, cx, cy + r * 1.22 + (34 + i * 22) * U, { size: 14, color: i ? C.text : C.white, bold: !i }); });
      } else if (this.called) T("깜빡이는 [B] 포드를 클릭해 탑승", cx, cy + r * 1.22 + 40 * U, { size: 14, bold: true });
    },
  });

  // ═════ 4. LAUNCH — 8단계 시스템 체크 + 발사 ═════════════════
  const STEPS = ["HATCH", "CRYO", "G-LOCK", "LIFE", "NAV", "CARGO", "TARGET", "ARMED"];
  const STEP_KO = ["해치 밀폐", "저온 유지", "중력 고정", "생명 유지", "항법 정렬", "화물(밀가루·물)", "목표 군집", "점화 준비"];
  BA.add({
    id: "launch", mood: "tension", hint: "깜빡이는 스위치를 순서대로 클릭 → LAUNCH 길게 누르기",
    enter() { this.step = 0; this.hold = 0; this.go = 0; this.err = 0; Snd.drone(46, 0.06, 200); sys("발사 전 시스템 체크 0 / 8. GM 없이 당신이 직접 통과시킨다."); },
    update(dt) {
      this.dt = dt;
      this.err = Math.max(0, this.err - dt);
      if (this.go) {
        this.go += dt; Snd.drone(46 + this.go * 30, 0.1, 200 + this.go * 400);
        BA.fx.shake(6 + this.go * 5);
        for (let k = 0; k < 3; k++) BA.fx.spark(BA.W * R(), BA.H + 4, (R() - 0.5) * 200, -300 - R() * 500, R() < 0.5 ? "232,120,60" : "216,216,216", 0.7, 3, 0);
        if (this.go > 3.4) BA.next();
      }
    },
    render() {
      const { W, H, U, time } = BA;
      ctx.save();
      clear(0.5);
      stars.draw(this.go ? this.go * 6 : 0.3, 0, 0.6);
      T("PAGE 1-4 — LAUNCH", W / 2, 96, { size: 13, color: C.dim });
      const tm = this.go ? Math.max(0, 3 - Math.floor(this.go)) : 20 - this.step * 2;
      const red = this.go > 0;
      T("T-" + String(tm).padStart(2, "0") + (this.go >= 3 ? " GO" : ""), W / 2, H * 0.22, { size: 64, bold: true, color: red ? (Math.sin(time * 20) > 0 ? C.red : C.white) : C.white });
      const cols = W > H ? 4 : 2, rows = 8 / cols;
      const bw = Math.min(190 * U, (W * 0.86) / cols), bh = Math.min(74 * U, (H * 0.34) / rows), gap = 10 * U;
      const gx = W / 2 - (cols * bw + (cols - 1) * gap) / 2, gy = H * 0.36;
      STEPS.forEach((s, i) => {
        const x = gx + (i % cols) * (bw + gap), y = gy + Math.floor(i / cols) * (bh + gap);
        const done = i < this.step, cur = i === this.step && !this.go;
        const hov = !this.go && this.step < 8 && BA.inRect(P.x, P.y, x, y, bw, bh);
        if (hov) BA.hot = true;
        ctx.fillStyle = done ? "rgba(216,216,216,0.9)" : hov ? "rgba(216,216,216,0.12)" : "rgba(8,8,8,0.8)";
        ctx.fillRect(x, y, bw, bh);
        ctx.strokeStyle = cur ? (Math.sin(time * 7) > 0 ? C.white : C.dim) : done ? C.white : C.ghost;
        ctx.lineWidth = cur ? 2 : 1; ctx.strokeRect(x + 0.5, y + 0.5, bw, bh); ctx.lineWidth = 1;
        T((i + 1) + " · " + s, x + bw / 2, y + bh * 0.38, { size: 15, bold: true, color: done ? C.bg : cur ? C.white : C.dim });
        T(done ? "OK" : STEP_KO[i], x + bw / 2, y + bh * 0.72, { size: 10, color: done ? C.bg : C.dim });
        if (hov && P.click) {
          if (i === this.step) {
            this.step++; Snd.blip(330 + this.step * 70, 0.12, "square", 0.06);
            sys("시스템 체크 " + this.step + " / 8 · " + s + " 통과" + (this.step === 8 ? " — 발사 준비 완료." : ""));
          } else if (i > this.step) { this.err = 0.4; BA.Vital.damage(8, "순서 오류 · 선체 압력 손실"); sys("순서 오류. 다음은 " + (this.step + 1) + " · " + STEPS[this.step]); }
        }
      });
      if (this.step >= 8 && !this.go) {
        const cy = gy + rows * (bh + gap) + 46 * U, w = Math.min(360 * U, W * 0.8), h = 58 * U, x = W / 2 - w / 2, y = cy - h / 2;
        const hov = BA.inRect(P.x, P.y, x, y, w, h);
        if (hov) BA.hot = true;
        if (hov && P.down) { this.hold += this.dt / 1.2; if (R() < this.dt * 25) Snd.blip(200 + this.hold * 600, 0.03, "sawtooth", 0.03, null, false); } else this.hold = Math.max(0, this.hold - this.dt * 2);
        ctx.fillStyle = "rgba(232,57,42,0.25)"; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = C.red; ctx.fillRect(x, y, w * clamp(this.hold, 0, 1), h);
        ctx.strokeStyle = C.red; ctx.strokeRect(x + 0.5, y + 0.5, w, h);
        T("LAUNCH — 길게 누르기", W / 2, cy + 1, { size: 17, bold: true, color: C.white });
        if (this.hold >= 1) { this.go = 0.001; BA.fx.shake(26); BA.fx.flash("232,57,42", 0.25); Snd.noise(3.4, 0.25, 500); Snd.blip(60, 3, "sawtooth", 0.1, 240); sys("점화. 미세 수축 항해 시작."); }
      }
      ctx.restore();
      if (this.go > 2.8) { ctx.fillStyle = "rgba(255,255,255," + clamp((this.go - 2.8) * 1.6, 0, 1) + ")"; ctx.fillRect(0, 0, W, H); }
    },
    skip() {},
  });

  // ═════ 5. SPACE — 미세 수축 항해 / 신호 수집 ═════════════════
  const fmtScale = (m) => m >= 1 ? m.toFixed(2) + " m" : m >= 0.01 ? (m * 100).toFixed(1) + " cm" : m >= 0.001 ? (m * 1000).toFixed(2) + " mm" : (m * 1e6).toFixed(m < 1e-5 ? 1 : 0) + " µm";
  BA.fmtScale = fmtScale;
  const PHASES = [[0.15, "boarding"], [0.4, "liftoff"], [0.7, "cruise"], [0.92, "approach"], [1.01, "handoff"]];
  const NEED = 10, DUR = 36;
  BA.add({
    id: "space", mood: "space", cursor: "none", hint: "우주선을 움직여 효모 신호(◆)를 모으고 · 붉은 오염체(✕)는 피하세요",
    enter() {
      this.t = 0; this.sx = BA.W / 2; this.sy = BA.H * 0.7; this.sig = []; this.spawn = 3; this.got = 0; this.end = 0; this.pop = []; this.hz = []; this.hzT = 7; this.inv = 0;
      Snd.drone(73, 0.05, 500); say("미세 수축 항해를 시작합니다. 효모의 크기까지 작아집니다."); sys("approach colony " + BA.S.colony + ".");
    },
    skip() { BA.S.sync = Math.max(BA.S.sync, 0.5); },
    update(dt) {
      const { W, H, U } = BA;
      this.t += dt;
      const prog = clamp(this.t / DUR, 0, 1);
      this.sx = lerp(this.sx, clamp(P.x, 40, W - 40), 1 - Math.exp(-dt * 6));
      this.sy = lerp(this.sy, clamp(P.y, H * 0.3, H - 110), 1 - Math.exp(-dt * 6));
      this.spawn -= dt;
      if (this.spawn <= 0 && prog < 0.93) {
        this.spawn = 1.25 + R() * 0.7;
        this.sig.push({ tx: W * (0.14 + R() * 0.72), ty: H * (0.34 + R() * 0.46), life: 0 });
      }
      for (const s of this.sig) {
        s.life += dt / 4.2;
        const k = s.life * s.life;
        s.x = lerp(W / 2, s.tx, k); s.y = lerp(H / 2, s.ty, k);
        if (!s.dead && s.life > 0.5 && Math.hypot(s.x - this.sx, s.y - this.sy) < 48 * U) {
          s.dead = true; this.got++; this.pop.push({ x: s.x, y: s.y, t: 0 });
          BA.fx.burst(s.x, s.y, 26, "160,255,160", 240, 0.7, 3); BA.Vital.heal(2, "신호 동기화");
          Snd.blip(660 + this.got * 60, 0.25, "sine", 0.07);
          sys("효모 신호 동기화 " + Math.min(this.got, NEED) + " / " + NEED);
        }
      }
      this.sig = this.sig.filter((s) => !s.dead && s.life < 1.25);
      // 오염체(✕) — 닿으면 VITAL 손실. 뒤로 갈수록 자주 온다
      this.hzT -= dt; this.inv = Math.max(0, this.inv - dt);
      if (this.hzT <= 0 && prog < 0.93) {
        this.hzT = lerp(2.6, 1.0, prog) * (0.7 + R() * 0.6);
        const aim = R() < 0.6;
        this.hz.push({ tx: aim ? this.sx + (R() - 0.5) * 160 * U : W * (0.1 + R() * 0.8), ty: aim ? this.sy + (R() - 0.5) * 120 * U : H * (0.3 + R() * 0.5), life: 0, rot: R() * 6 });
      }
      for (const h of this.hz) {
        h.life += dt / 3.4;
        const k = h.life * h.life;
        h.x = lerp(W / 2, h.tx, k); h.y = lerp(H / 2, h.ty, k);
        if (!h.dead && this.inv <= 0 && h.life > 0.62 && h.life < 1.1 && Math.hypot(h.x - this.sx, h.y - this.sy) < 34 * U) {
          h.dead = true; this.inv = 0.8;
          BA.fx.burst(h.x, h.y, 40, "232,57,42", 300, 0.7, 3);
          BA.Vital.damage(12, "오염체 충돌");
        }
      }
      this.hz = this.hz.filter((h) => !h.dead && h.life < 1.3);
      this.pop = this.pop.filter((p) => (p.t += dt) < 0.6);
      BA.S.sync = clamp(this.got / NEED, 0, 1);
      Snd.drone(73 + prog * 40, 0.05 + prog * 0.03, 500 + prog * 600);
      if (prog >= 1) {
        if (!this.end) { Snd.chord([523, 659, 784, 1047], 0.06); sys("handoff. 효모 생태계 궤도 진입."); if (this.got < NEED / 2) BA.Vital.damage(15, "신호 동기화 부족"); }
        this.end += dt; if (this.end > 1.6) BA.next();
      }
    },
    render() {
      const { W, H, U, time } = BA;
      const prog = clamp(this.t / DUR, 0, 1), ramp = clamp(this.t / 20, 0, 1);
      clear(0.12 + prog * 0.06);
      stars.draw(0.8 + ramp * 6.5, ramp * Math.PI * 0.6 + Math.sin(time * 0.5) * 0.012);
      for (const s of this.sig) {
        const sz = Math.max(3, s.life * s.life * 16 * U), a = clamp(s.life * 2, 0, 1) * clamp((1.25 - s.life) * 4, 0, 1);
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(0.785); ctx.globalAlpha = a;
        ctx.shadowColor = C.green; ctx.shadowBlur = 14; ctx.fillStyle = C.green; ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
        ctx.restore(); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      }
      for (const h of this.hz) {
        const sz = Math.max(4, h.life * h.life * 22 * U), a = clamp(h.life * 2, 0, 1) * clamp((1.3 - h.life) * 4, 0, 1);
        ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.rot + time * 3); ctx.globalAlpha = a;
        ctx.shadowColor = C.red; ctx.shadowBlur = 12; ctx.fillStyle = C.red;
        ctx.fillRect(-sz / 2, -sz / 8, sz, sz / 4); ctx.fillRect(-sz / 8, -sz / 2, sz / 4, sz);
        ctx.restore(); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      }
      if (this.inv > 0 && Math.sin(time * 40) > 0) { ctx.strokeStyle = C.red; ctx.beginPath(); ctx.arc(this.sx, this.sy, 40 * U, 0, 6.283); ctx.stroke(); }
      if (R() < 0.5) BA.fx.spark(this.sx + (R() - 0.5) * 16 * U, this.sy + 30 * U, (R() - 0.5) * 30, 120 + R() * 160, "216,216,216", 0.35, 2, 0);
      for (const p of this.pop) { ctx.strokeStyle = "rgba(160,255,160," + (1 - p.t / 0.6).toFixed(2) + ")"; ctx.beginPath(); ctx.arc(p.x, p.y, p.t * 90 * U, 0, 6.283); ctx.stroke(); }
      const shrink = lerp(5, 3, prog);
      BA.drawShip(this.sx, this.sy + Math.sin(time * 2) * 3, Math.max(2, Math.round(shrink * U)), 2 + prog * 3);
      const phase = PHASES.find((p) => prog < p[0])[1];
      T("PAGE 2 — APPROACH / " + phase, W / 2, 96, { size: 13, color: C.dim });
      T("MICRO-SHRINK", 24, H * 0.3, { size: 11, align: "left", color: C.dim });
      T(fmtScale(1.7 * Math.pow(5e-6 / 1.7, prog)), 24, H * 0.3 + 26 * U, { size: 26, align: "left", bold: true, color: C.white });
      T("탑승자 크기", 24, H * 0.3 + 50 * U, { size: 10, align: "left", color: C.ghost });
      T("SIGNAL SYNC", W - 24, H * 0.3, { size: 11, align: "right", color: C.dim });
      T(Math.min(this.got, NEED) + " / " + NEED, W - 24, H * 0.3 + 26 * U, { size: 26, align: "right", bold: true, color: this.got >= NEED ? C.green : C.white });
      T("◆ 받기 · ✕ 피하기", W - 24, H * 0.3 + 50 * U, { size: 10, align: "right", color: C.ghost });
      const bw = Math.min(520 * U, W * 0.8), bx = W / 2 - bw / 2, by = H - 76;
      ctx.fillStyle = "rgba(255,255,255,0.1)"; ctx.fillRect(bx, by, bw, 2);
      ctx.fillStyle = prog > 0.96 ? C.green : C.white; ctx.fillRect(bx, by, bw * prog, 2);
      if (this.end) { ctx.fillStyle = "rgba(160,255,160," + clamp(this.end * 0.5, 0, 0.7) + ")"; ctx.fillRect(0, 0, W, H); }
    },
  });
})();
