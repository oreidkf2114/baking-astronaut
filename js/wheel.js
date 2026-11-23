// Solo v2 · 디지털 물레
//   타깃  : 공연판 15종 전부(매번 조금씩 변주) + 절차 생성 "변이종"(매번 새로운 형태)
//   조작  : 마우스(높이=슬라이스, 중심축 거리=반지름) 또는 MediaPipe 양손 BRACKET(공연판과 동일)
//   실패  : 합격선 미달이면 효모가 거부 → VITAL 피해. 0 이 되면 사망.

(() => {
  "use strict";
  const { ctx, C, T, Btn, clear, clamp, lerp, R, Snd, P, say, sys } = BA;

  const N = 48, MIN_R = 0.08, MAX_R = 0.6;
  let DURATION = 90, PASS = 65;          // 난이도에 따라 begin() 에서 정해진다
  const mk = (fn) => { const p = new Float32Array(N); for (let i = 0; i < N; i++) p[i] = clamp(fn(i / (N - 1)), MIN_R, MAX_R); return p; };
  const gauss = (t, c, w) => Math.exp(-Math.pow((t - c) * w, 2));

  // ── 공연판 15종 (digital-wheel-v2 GHOSTS 그대로) ──
  const CLASSIC = [
    { name: "컵", simple: 1, fn: (t) => 0.32 + 0.03 * Math.sin(t * Math.PI) },
    { name: "원통", simple: 1, fn: () => 0.36 },
    { name: "넓은 사발", simple: 1, fn: (t) => 0.17 + Math.pow(t, 0.45) * 0.42 },
    { name: "원뿔", simple: 1, fn: (t) => 0.55 - t * 0.4 },
    { name: "다완", fn: (t) => 0.22 + 0.28 * Math.pow(t, 0.72) },
    { name: "달항아리", fn: (t) => { const u = t - 0.5; return 0.54 - u * u * 1.05; } },
    { name: "단지", fn: (t) => t < 0.55 ? 0.5 - t * 0.05 : t < 0.88 ? 0.48 - (t - 0.55) * 1.02 : 0.14 + (t - 0.88) * 0.45 },
    { name: "화병", fn: (t) => (0.2 + 0.32 * gauss(t, 0.42, 2.0)) * (t > 0.78 ? Math.max(0.4, 1 - (t - 0.78) * 3.2) : 1) },
    { name: "트럼펫", fn: (t) => 0.18 + Math.pow(t, 1.55) * 0.42 },
    { name: "호리병", fn: (t) => 0.22 + 0.22 * gauss(t, 0.28, 3.6) + 0.17 * gauss(t, 0.78, 4.8) },
    { name: "술병", fn: (t) => t < 0.65 ? 0.45 : t < 0.74 ? 0.45 - (t - 0.65) * 3.1 : 0.17 },
    { name: "매병", fn: (t) => t < 0.18 ? 0.18 + t * 0.9 : t < 0.58 ? 0.34 + Math.sin(((t - 0.18) / 0.4) * Math.PI) * 0.22 : 0.34 - (t - 0.58) * 0.43 },
    { name: "주병", fn: (t) => t < 0.18 ? 0.16 + t * 1.35 : t < 0.68 ? 0.38 + Math.sin(((t - 0.18) / 0.5) * Math.PI) * 0.18 : 0.38 - (t - 0.68) * 0.58 },
    { name: "암포라", fn: (t) => t < 0.12 ? 0.14 + t * 0.9 : t < 0.74 ? 0.24 + Math.sin(((t - 0.12) / 0.62) * Math.PI) * 0.34 : 0.24 - (t - 0.74) * 0.42 },
    { name: "이중 호리병", fn: (t) => 0.15 + 0.29 * gauss(t, 0.28, 4.3) + 0.26 * gauss(t, 0.74, 5.0) },
  ];

  const buf = new Float32Array(N);
  function smooth(p, amt) {
    buf[0] = p[0]; buf[N - 1] = p[N - 1];
    for (let i = 1; i < N - 1; i++) buf[i] = p[i] * (1 - amt) + (p[i - 1] + p[i + 1]) * 0.5 * amt;
    p.set(buf);
  }
  const initial = () => mk((t) => 0.34 + 0.04 * Math.sin(t * Math.PI));
  const dist = (p, g) => { let d = 0; for (let i = 0; i < N; i++) d += Math.abs(p[i] - g[i]); return d / N; };
  // 형태 복잡도 — 반지름 폭 + 방향 전환 횟수
  function complexity(p) {
    let lo = 1, hi = 0, turns = 0, dir = 0;
    for (let i = 0; i < N; i++) {
      lo = Math.min(lo, p[i]); hi = Math.max(hi, p[i]);
      if (i) { const d = p[i] - p[i - 1]; if (Math.abs(d) > 0.004) { const s = Math.sign(d); if (dir && s !== dir) turns++; dir = s; } }
    }
    return { range: hi - lo, turns };
  }

  // 15종은 매번 조금씩 변주된다. 단순한 4종(컵·원통·사발·원뿔)은 굴곡을 더해 "너무 단순하지 않게".
  function classicTarget(i) {
    const g = CLASSIC[i];
    const a1 = g.simple ? 0.09 + R() * 0.08 : (R() - 0.5) * 0.05, c1 = 0.2 + R() * 0.25, w1 = 3 + R() * 2;
    const a2 = g.simple ? -(0.05 + R() * 0.07) : (R() - 0.5) * 0.04, c2 = 0.6 + R() * 0.25, w2 = 4 + R() * 3;
    const lip = g.simple && R() < 0.6 ? 0.06 + R() * 0.07 : 0;
    const p = mk((t) => g.fn(t) + a1 * gauss(t, c1, w1) + a2 * gauss(t, c2, w2) + lip * gauss(t, 1, 9));
    smooth(p, 0.5);
    return { name: g.name + (g.simple ? " 변주" : ""), kind: "classic", profile: p };
  }

  // 절차 생성 — 굽 + 2~3개의 배 + (목) + (나팔입). 충분히 복잡할 때까지 다시 뽑는다.
  const SUF = ["효모병", "발효호", "포자단지", "르뱅병", "기포항아리", "누룩병", "배양호"];
  function randomTarget() {
    for (let tries = 0; tries < 40; tries++) {
      const base = 0.13 + R() * 0.09, three = R() < 0.4, neck = R() < 0.6, lip = R() < 0.55;
      const L = [{ a: 0.16 + R() * 0.2, c: 0.16 + R() * 0.2, w: 2.6 + R() * 2.4 }, { a: 0.12 + R() * 0.2, c: 0.6 + R() * 0.22, w: 3 + R() * 3 }];
      if (three) L.push({ a: 0.1 + R() * 0.14, c: 0.42 + R() * 0.1, w: 5 + R() * 3 });
      const tn = 0.72 + R() * 0.12, nk = 0.45 + R() * 0.25, la = 0.08 + R() * 0.12, foot = R() < 0.5 ? 0.05 + R() * 0.06 : 0;
      const p = mk((t) => {
        let r = base + foot * gauss(t, 0, 9);
        for (const l of L) r += l.a * gauss(t, l.c, l.w);
        if (neck && t > tn) r *= lerp(1, nk, clamp((t - tn) / 0.12, 0, 1));
        if (lip) r += la * gauss(t, 1, 8);
        return r;
      });
      smooth(p, 0.5); smooth(p, 0.5);
      const cx = complexity(p);
      if (cx.range < 0.24 || cx.turns < 2) continue;
      const id = Math.floor(R() * 4096).toString(16).toUpperCase().padStart(3, "0");
      const name = (neck ? "목 좁은 " : "") + (three ? "삼단 " : "쌍봉 ") + (lip ? "나팔입 " : "") + SUF[Math.floor(R() * SUF.length)];
      return { name: name + " #" + id, kind: "mutant", profile: p };
    }
    return classicTarget(14);
  }
  let lastClassic = -1;
  function pickTarget() {
    if (R() < 0.45) {
      let i; do { i = Math.floor(R() * CLASSIC.length); } while (i === lastClassic);
      lastClassic = i;
      return classicTarget(i);
    }
    return randomTarget();
  }
  BA.pickTarget = pickTarget;
  BA.classicCount = CLASSIC.length;

  function applyShape(p, y0, targetR, weight, sigma) {
    const k = 1 / (2 * sigma * sigma);
    for (let i = 0; i < N; i++) {
      const d = i - y0, w = Math.exp(-d * d * k) * weight;
      p[i] = clamp(p[i] * (1 - w) + targetR * w, MIN_R, MAX_R);
    }
  }
  const matchScore = (p, g, base) => Math.pow(clamp(1 - dist(p, g) / Math.max(base, 0.05), 0, 1), 0.7) * 100;

  // ── 렌더 ──
  const strip = document.createElement("canvas");
  strip.width = 96; strip.height = 1;
  (() => {
    const c = strip.getContext("2d");
    for (let x = 0; x < 96; x++) {
      const u = (x + 0.5) / 96 * 2 - 1, nz = Math.sqrt(Math.max(0, 1 - u * u));
      let l = clamp(0.1 + 0.95 * (nz * 0.72 - u * 0.52), 0, 1) * nz ** 0.35;
      const spec = Math.pow(clamp(1 - Math.abs(u + 0.42) * 5, 0, 1), 2) * 0.5;      // 젖은 흙의 하이라이트
      l = Math.round(clamp(l + spec, 0, 1) * 8) / 8;
      const rim = Math.pow(clamp((u - 0.55) / 0.45, 0, 1), 2) * 0.35;                // 뒤에서 도는 차가운 림라이트
      c.fillStyle = "rgb(" + Math.round(34 + l * 196) + "," + Math.round(31 + l * 182 + rim * 60) + "," + Math.round(28 + l * 160 + rim * 110) + ")";
      c.fillRect(x, 0, 1, 1);
    }
  })();
  const marks = Array.from({ length: 150 }, () => ({ i: Math.floor(R() * N), a: R() * 6.283, l: 1 + Math.floor(R() * 4) }));

  function drawVessel(p, cx, cy, h, rot, glow) {
    const scale = h * 0.78, sh = h / N, bot = cy + h / 2, wr = scale * 0.74;
    // wheel head — 회전 눈금 + 광륜
    ctx.fillStyle = "#171614"; ctx.beginPath(); ctx.ellipse(cx, bot + 6, wr, wr * 0.16, 0, 0, 6.283); ctx.fill();
    ctx.strokeStyle = "rgba(216,216,216,0.3)"; ctx.stroke();
    ctx.strokeStyle = "rgba(216,216,216,0.1)"; ctx.beginPath(); ctx.ellipse(cx, bot + 6, wr * 0.7, wr * 0.16 * 0.7, 0, 0, 6.283); ctx.stroke();
    for (let k = 0; k < 24; k++) {
      const a = rot + k * 0.2618, s = Math.sin(a), co = Math.cos(a);
      ctx.fillStyle = "rgba(216,216,216," + (co > 0 ? (k % 6 ? 0.35 : 0.9) : 0.08) + ")";
      ctx.fillRect(cx + s * wr * 0.93 - 1, bot + 6 + co * wr * 0.16 * 0.93 - 1, k % 6 ? 2 : 4, 2);
    }
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < N; i++) {
      const rp = p[i] * scale;
      ctx.drawImage(strip, cx - rp, Math.floor(bot - (i + 1) * sh), rp * 2, Math.ceil(sh) + 1);
    }
    // 물레 자국 — 슬라이스 경계의 어두운 띠
    ctx.fillStyle = "rgba(10,9,8,0.16)";
    for (let i = 2; i < N; i += 3) { const rp = p[i] * scale; ctx.fillRect(cx - rp, Math.floor(bot - (i + 1) * sh), rp * 2, 1); }
    for (const m of marks) {
      const co = Math.cos(m.a + rot);
      if (co <= 0.1) continue;
      for (let j = 0; j < m.l && m.i + j < N; j++) {
        const rp = p[m.i + j] * scale;
        ctx.fillStyle = "rgba(20,18,16," + (0.32 * co).toFixed(2) + ")";
        ctx.fillRect(cx + Math.sin(m.a + rot) * rp - 1, Math.floor(bot - (m.i + j + 1) * sh), 3, Math.ceil(sh));
      }
    }
    const rt = p[N - 1] * scale, yt = bot - h;
    ctx.fillStyle = "#100f0e"; ctx.beginPath(); ctx.ellipse(cx, yt, rt, rt * 0.2, 0, 0, 6.283); ctx.fill();
    ctx.strokeStyle = glow ? C.green : "rgba(236,230,214,0.95)"; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
  }

  function outline(p, cx, cy, h, color, dash, width) {
    const scale = h * 0.78, bot = cy + h / 2;
    ctx.strokeStyle = color; ctx.lineWidth = width || 1.5; ctx.setLineDash(dash || []);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const x = cx + side * p[i] * scale, y = bot - (i + 0.5) / N * h;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (const i of [0, N - 1]) { ctx.beginPath(); ctx.ellipse(cx, bot - (i + 0.5) / N * h, p[i] * scale, p[i] * scale * 0.2, 0, 0, 6.283); ctx.stroke(); }
    ctx.setLineDash([]); ctx.lineWidth = 1;
  }
  // 홀로그램 고스트 — 윤곽 + 층층이 도는 링 + 위로 훑는 스캔
  function hologram(p, cx, cy, h, hue, alpha, time) {
    const scale = h * 0.78, bot = cy + h / 2;
    outline(p, cx, cy, h, "hsla(" + hue + ",75%,64%," + alpha.toFixed(2) + ")", [6, 5], 2);
    for (let i = 3; i < N - 1; i += 6) {
      ctx.strokeStyle = "hsla(" + hue + ",75%,64%," + (alpha * 0.28).toFixed(2) + ")";
      ctx.beginPath(); ctx.ellipse(cx, bot - (i + 0.5) / N * h, p[i] * scale, p[i] * scale * 0.2, 0, 0, 6.283); ctx.stroke();
    }
    const si = Math.floor(((time * 0.35) % 1) * N), sy = bot - (si + 0.5) / N * h;
    ctx.strokeStyle = "hsla(" + hue + ",90%,75%," + (alpha * 0.9).toFixed(2) + ")"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(cx, sy, p[si] * scale, p[si] * scale * 0.2, 0, 0, 6.283); ctx.stroke(); ctx.lineWidth = 1;
  }
  BA.drawVesselGhost = (p, cx, cy, h) => hologram(p, cx, cy, h, 50, 0.85, BA.time);
  BA.drawVessel = drawVessel;
  BA.vesselOutline = outline;
  BA.PROFILE_N = N;

  BA.add({
    id: "wheel", mood: "wheel", cursor: "none", hint: "마우스: 누른 채 위아래 · 휠 = 손 넓이   |   손 인식: 양손으로 점토를 감싸기 · 핀치 = 정밀",
    enter() {
      if (!BA.S.tg) BA.S.tg = pickTarget();
      this.round = 1;
      this.begin(true);
    },
    // 어려움 모드는 두 번 빚는다 — 1차는 마우스만, 2차는 손 인식(MediaPipe)만 듣는다
    begin(announce) {
      const D = BA.D, second = D.rounds === 2 && this.round === 2;
      PASS = second ? (BA.S.noHands ? 85 : D.pass2) : D.pass; DURATION = second ? D.dur2 : D.dur;
      this.mouseOnly = D.rounds === 2 && this.round === 1; this.handOnly = second && !BA.S.noHands;
      this.g = BA.S.tg;
      this.p = initial(); this.base = dist(this.p, this.g.profile);
      this.t = 0; this.rot = 0; this.brush = 2.6; this.score = 0; this.sm = 0;
      this.state = "run"; this.left = DURATION; this.touched = false; this.fr = 0; this.rt = 0; this.wasHot = false; this.con = null; this.passed = false;
      Snd.drone(98, 0.045, 380);
      if (announce) say((this.handOnly ? "이번에는 손으로 빚습니다. " : "") + "효모가 요청한 그릇은 " + this.g.name.replace(/ #.*/, "") + "입니다. 점선에 맞춰 점토를 빚으세요. 실패하면 효모가 거부합니다.");
      sys("디지털 물레 · " + this.g.name + " · 합격선 " + PASS + "% · " + DURATION + "초");
    },
    skip() { this.commit(); },
    commit() { BA.S.handRound = !!this.handOnly; BA.S.vessel = { name: this.g.name, score: Math.round(this.sm), profile: Float32Array.from(this.p) }; },
    finish() {
      if (this.state !== "run") return;
      this.state = "result"; this.rt = 0;
      const s = Math.round(this.sm), g = this.geom();
      this.passed = s >= PASS;
      if (this.passed) {
        this.commit();
        Snd.chord([523, 659, 784, 1047], 0.07); say("효모가 그릇을 받아들였습니다.");
        BA.fx.shock(g.cx, g.cy, "160,255,160", 380); BA.fx.burst(g.cx, g.cy, 90, "160,255,160", 380, 1.1, 4); BA.fx.flash("160,255,160", 0.25);
        BA.Vital.heal(15, "그릇 수락");
        sys("조형 성공 · 일치도 " + s + "%");
      } else {
        // 그릇이 무너진다
        for (let i = 0; i < N; i += 2) BA.fx.burst(g.cx + (R() - 0.5) * this.p[i] * g.scale * 2, g.bot - i / N * g.h, 3, "200,190,170", 220, 0.9, 4, 500);
        Snd.chord([196, 185, 147], 0.05);
        BA.Vital.damage(30, "효모가 그릇을 거부");
      }
    },
    // 2차(손 인식) 진입 전 — 카메라를 켠다. 카메라가 없으면 마우스로 대체할 수 있지만 기록에 남는다
    gateUI() {
      const { W, H, U, time } = BA, hd = BA.Hands;
      T("PAGE 4 — DIGITAL WHEEL · 2차", W / 2, 96, { size: 13, color: C.dim });
      hologram(this.g.profile, W / 2, H * 0.36, Math.min(H * 0.26, 220 * U), 45, 0.8, time);
      T("두 번째 그릇은 손으로 빚는다", W / 2, H * 0.56, { size: 24, bold: true, color: C.white });
      T("「 " + this.g.name + " 」 · 카메라 앞에서 양손으로 점토를 감싸듯 — 마우스는 듣지 않는다", W / 2, H * 0.56 + 30 * U, { size: 12, color: C.dim });
      if (hd.on) {
        if (Btn("[ 손으로 빚기 시작 ▶ ]", W / 2, H * 0.72, { size: 16, color: C.green })) this.begin(true);
      } else {
        if (Btn(hd.loading ? "손 인식 불러오는 중…" : "[ 손 인식 켜기 ]", W / 2, H * 0.72, { size: 16, color: C.green }) && !hd.loading) hd.enable();
        if (hd.err) {
          T(hd.err, W / 2, H * 0.72 + 40 * U, { size: 11, color: C.amber });
          if (Btn("카메라 없이 마우스로 (합격선 85% · 기록에 표시)", W / 2, H * 0.72 + 76 * U, { size: 11 })) { BA.S.noHands = true; this.begin(true); }
        }
      }
    },
    geom() {
      const { W, H } = BA;
      const h = Math.min(H * 0.48, W * 0.44), cx = W / 2, cy = H * 0.5;
      return { h, cx, cy, scale: h * 0.78, bot: cy + h / 2, top: cy - h / 2 };
    },
    update(dt) {
      this.t += dt; this.rot += dt * (this.state === "run" ? 5.2 : 1.2);
      if (this.state !== "run") { this.rt += dt; return; }
      const g = this.geom(), U = BA.U;
      if (P.wheel) this.brush = clamp(this.brush - P.wheel * 0.4, 0.9, 6);
      const handPtr = !!(BA.Hands && BA.Hands.cur.active), mouseOk = this.handOnly ? handPtr : this.mouseOnly ? !handPtr : true;
      const two = !this.mouseOnly && BA.Hands && BA.Hands.two();
      let y = null, r = 0, sigma = this.brush, mode = "";
      if (two) {                                                    // 양손 BRACKET (공연판 방식)
        const ym = (two[0].y + two[1].y) / 2, pin = (two[0].pinch + two[1].pinch) / 2;
        if (ym > g.top - 30 * U && ym < g.bot + 20 * U) {
          y = ym; r = Math.abs(two[1].x - two[0].x) / 2 / g.scale;
          sigma = lerp(this.brush, 0.9, pin); mode = pin > 0.5 ? "PINCH" : "BRACKET";
        }
      } else if (mouseOk && P.down && !this.wasHot && P.y > g.top - 26 * U && P.y < g.bot + 16 * U && Math.abs(P.x - g.cx) < g.scale * 0.95) {
        y = P.y; r = Math.abs(P.x - g.cx) / g.scale; mode = "SINGLE";
        if (BA.Hands && BA.Hands.cur.active) sigma = this.brush * 0.8;
      }
      this.mode = mode; this.con = null;
      if (y != null) {
        this.touched = true;
        r = clamp(r, MIN_R, MAX_R);
        const y0 = clamp((g.bot - y) / g.h * N - 0.5, 0, N - 1);
        applyShape(this.p, y0, r, 1 - Math.exp(-dt * 3.4), sigma);
        smooth(this.p, Math.min(0.3, 0.035 * BA.fs));
        this.con = { y, r: r * g.scale, sigma };
        const cr = this.p[Math.round(y0)] * g.scale;
        this.fr -= dt;
        if (this.fr <= 0) {
          this.fr = 0.05; Snd.noise(0.12, 0.03, 1400 + r * 1800, "bandpass");
          // 흙물이 접선 방향으로 튄다
          for (const s of [-1, 1]) BA.fx.spark(g.cx + s * cr, y, s * (120 + R() * 200), -40 - R() * 120, "214,204,182", 0.5 + R() * 0.4, 2 + R() * 2, 600);
        }
      } else smooth(this.p, Math.min(0.3, 0.004 * BA.fs));
      if (this.touched) this.left -= dt;
      this.score = matchScore(this.p, this.g.profile, this.base);
      this.sm = lerp(this.sm, this.score, 1 - Math.exp(-dt * 7));
      if (this.left < 10 && this.left > 0 && Math.floor(this.left) !== Math.floor(this.left + dt)) Snd.blip(880, 0.06, "square", 0.05);
      if (this.left <= 0) this.finish();
    },
    render() {
      const { W, H, U, time } = BA, g = this.geom(), run = this.state === "run";
      this.cursor = run ? "none" : "default";
      clear(0.5);
      BA.stars.draw(0.15, time * 0.004, 0.35);
      if (this.state === "gate") { this.cursor = "default"; this.gateUI(); return; }
      const sN = this.sm / 100, ok = this.sm >= PASS;
      // 물레 아래로 떨어지는 빛기둥
      const lg = ctx.createLinearGradient(0, g.top - 60, 0, g.bot);
      lg.addColorStop(0, "rgba(216,216,216,0)"); lg.addColorStop(1, "rgba(216,216,216," + (0.05 + sN * 0.06).toFixed(3) + ")");
      ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(g.cx - g.scale * 0.25, g.top - 60); ctx.lineTo(g.cx + g.scale * 0.25, g.top - 60); ctx.lineTo(g.cx + g.scale * 0.74, g.bot + 6); ctx.lineTo(g.cx - g.scale * 0.74, g.bot + 6); ctx.fill();

      if (run || this.passed) drawVessel(this.p, g.cx, g.cy, g.h, this.rot, !run && this.passed);
      else { ctx.globalAlpha = clamp(1 - this.rt * 1.4, 0.15, 1); drawVessel(this.p, g.cx, g.cy + this.rt * 14, g.h, this.rot, false); ctx.globalAlpha = 1; }
      const flick = 0.78 + 0.22 * Math.sin(time * 5) * Math.cos(time * 3.1);
      hologram(this.g.profile, g.cx, g.cy, g.h, 45 + sN * 80, run ? flick : 0.3, time);

      T("PAGE 4 — DIGITAL WHEEL" + (BA.D.rounds === 2 ? (this.round === 1 ? " · 1차 마우스" : this.handOnly ? " · 2차 손 인식" : " · 2차 (마우스 대체)") : ""), W / 2, 96, { size: 13, color: C.dim });
      T("TARGET · " + (this.g.kind === "mutant" ? "변이종" : "고전 " + BA.classicCount + "종"), 24, H * 0.22, { size: 11, align: "left", color: C.dim });
      T(this.g.name, 24, H * 0.22 + 28 * U, { size: this.g.name.length > 9 ? 17 : 26, align: "left", bold: true, color: C.white });
      T("점선 = 효모가 원하는 형태", 24, H * 0.22 + 52 * U, { size: 10, align: "left", color: C.ghost });
      T("MATCH", W - 24, H * 0.22, { size: 11, align: "right", color: C.dim });
      T(Math.round(this.sm) + "%", W - 24, H * 0.22 + 30 * U, { size: 34, align: "right", bold: true, color: ok ? C.green : C.white });
      T("합격선 " + PASS + "% · 미달 시 VITAL −" + Math.round(30 * BA.D.dmg), W - 24, H * 0.22 + 58 * U, { size: 10, align: "right", color: C.ghost });
      const bw = 150 * U, bx = W - 24 - bw, by = H * 0.22 + 72 * U;
      ctx.strokeStyle = C.ghost; ctx.strokeRect(bx + 0.5, by + 0.5, bw, 6);
      ctx.fillStyle = ok ? C.green : C.white; ctx.fillRect(bx, by, bw * sN, 6);
      ctx.fillStyle = C.amber; ctx.fillRect(bx + bw * PASS / 100, by - 3, 1, 12);

      if (run) {
        const m = Math.max(0, Math.ceil(this.left)), urgent = this.left < 10;
        T(this.touched ? "0" + Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0") : "첫 터치부터 " + DURATION + "초", W / 2, 96 + 28 * U,
          { size: urgent ? 24 : 17, bold: true, color: urgent ? (Math.sin(time * 14) > 0 ? C.red : C.amber) : C.text });
        if (this.mode) T(this.mode, W / 2, 96 + 52 * U, { size: 10, color: C.dim });
        // 두 손(괄호)
        const two = !this.mouseOnly && BA.Hands && BA.Hands.two();
        let cy0 = null, rr = 0, act = !!this.con;
        if (this.con) { cy0 = this.con.y; rr = this.con.r; }
        else if (two) { cy0 = (two[0].y + two[1].y) / 2; rr = Math.abs(two[1].x - two[0].x) / 2; }
        else if (P.y > g.top - 26 * U && P.y < g.bot + 16 * U && Math.abs(P.x - g.cx) < g.scale * 0.95) { cy0 = P.y; rr = Math.abs(P.x - g.cx); }
        if (cy0 != null) {
          rr = clamp(rr, MIN_R * g.scale, MAX_R * g.scale);
          const bh = (this.con ? this.con.sigma : this.brush) * g.h / N * 1.6;
          ctx.strokeStyle = act ? C.white : "rgba(216,216,216,0.45)"; ctx.lineWidth = act ? 3 : 1.5;
          for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(g.cx + s * (rr + 12), cy0 - bh); ctx.quadraticCurveTo(g.cx + s * rr, cy0, g.cx + s * (rr + 12), cy0 + bh); ctx.stroke(); }
          ctx.lineWidth = 1;
          ctx.strokeStyle = act ? "rgba(255,160,80,0.9)" : "rgba(216,216,216,0.25)";      // 조형 중인 높이의 링
          ctx.beginPath(); ctx.ellipse(g.cx, cy0, rr, rr * 0.2, 0, 0, 6.283); ctx.stroke();
        } else if (!(BA.Hands && BA.Hands.cur.active)) {
          ctx.strokeStyle = C.dim; ctx.beginPath(); ctx.moveTo(P.x - 7, P.y); ctx.lineTo(P.x + 7, P.y); ctx.moveTo(P.x, P.y - 7); ctx.lineTo(P.x, P.y + 7); ctx.stroke();
        }
        if (!this.touched) {
          const a = 0.6 + 0.4 * Math.sin(time * 3), hand = this.handOnly || (!this.mouseOnly && BA.Hands && BA.Hands.on);
          T(hand ? "① 양손을 화면에 넣고 점토를 감싸듯 좌우로 벌렸다 좁혔다" : "① 점토 옆에서 마우스를 누른 채 위아래로 천천히", W / 2, g.bot + 40 * U, { size: 14, bold: true, alpha: a });
          T(hand ? "② 양손 높이 = 빚는 높이 · 간격 = 폭   ③ 엄지+검지를 붙이면 정밀" : "② 중심에서 멀어지면 넓어지고, 가까우면 좁아진다   ③ 마우스 휠 = 손 넓이", W / 2, g.bot + 60 * U, { size: 11, color: C.dim });
        }
        this.wasHot = false;
        const by2 = H - 84;
        if (Btn("RESET", W / 2 - 110 * U, by2, { size: 12 })) { this.p = initial(); Snd.noise(0.2, 0.06, 500); }
        if (Btn(ok ? "[ 효모에게 건네기 ▶ ]" : "건네기 (합격선 미달)", W / 2 + 80 * U, by2, { size: 13, color: ok ? C.green : C.amber, disabled: !this.touched })) this.finish();
        this.wasHot = BA.hot;
      } else {
        const s = Math.round(this.sm);
        ctx.fillStyle = "rgba(8,8,8,0.72)"; ctx.fillRect(0, H * 0.6, W, H * 0.22);
        T(this.passed ? "✓ 효모가 그릇을 받아들였다" : "× 효모가 그릇을 거부했다", W / 2, H * 0.65, { size: 22, bold: true, color: this.passed ? C.green : C.red });
        T(this.g.name + " · 일치도 " + s + "% / 합격선 " + PASS + "%", W / 2, H * 0.65 + 30 * U, { size: 13, color: C.dim });
        if (this.rt > 0.8 && !BA.dead) {
          if (this.passed) {
            if (BA.D.rounds === 2 && this.round === 1) {
              if (Btn("[ 2차 — 손으로 빚기 ▶ ]", W / 2, H * 0.76, { size: 15, color: C.amber })) { this.round = 2; BA.S.tg = pickTarget(); this.g = BA.S.tg; this.state = "gate"; Snd.blip(520, 0.2, "square", 0.05, 260); sys("2차 조형 · 손 인식 준비."); }
            } else if (Btn("[ 이 그릇으로 발효 ▶ ]", W / 2, H * 0.76, { size: 15, color: C.green })) BA.next();
          } else {
            if (Btn("↺ 같은 형태 다시", W / 2 - 120 * U, H * 0.76, { size: 13 })) this.begin(false);
            if (Btn("다른 형태 요청", W / 2 + 110 * U, H * 0.76, { size: 13 })) { BA.S.tg = pickTarget(); this.begin(true); }
          }
        }
      }
    },
  });
})();
