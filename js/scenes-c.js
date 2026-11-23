// Solo · scenes C — 발효 → 선물 → 귀환 → 레시피 영수증 → 효모 크레딧
// 공연판의 pH 센서(Arduino)는 여기서 관객의 먹이주기/온도 조절로 움직이는 시뮬레이션이 된다.
// 관객이 맞춘 비율과 온도가 그대로 레시피에 적힌다 = "효모에게 레시피를 받아온다".

(() => {
  "use strict";
  const { ctx, C, T, Btn, clear, clamp, lerp, R, garble, Snd, P, say, sys } = BA;
  const N = BA.PROFILE_N;

  // ═════ 7. FERMENTATION ═══════════════════════════════════════
  BA.add({
    id: "fermentation", mood: "yeast", glow: 0.35, hint: "반죽이 그릇을 가득 채우면 발효 완료 · 밀가루와 물을 같은 양으로 · 온도 24~28°C · 31°C 넘기거나 굶기면 VITAL 감소",
    enter() {
      const S = BA.S;
      if (!S.tg) S.tg = BA.pickTarget();
      if (!S.vessel) S.vessel = { name: S.tg.name, score: 0, profile: S.tg.profile };
      this.t = 0; this.fl = 0; this.wa = 0; this.temp = 19.4; this.f = 0; this.ph = 6.8; this.bump = 0; this.act = 0;
      this.hist = new Array(160).fill(6.8); this.acc = 0; this.feeds = 0; this.tSum = 0; this.tW = 0; this.bSum = 0; this.mark = 0; this.done = 0;
      this.bub = []; this.msg = "배고프다. 가루. 물."; this.msgT = 0; this.starve = 0;
      // 그릇의 부피(층마다 반지름²)를 아래부터 쌓아 둔다 — 반죽은 "부피"로 차오르므로 좁은 목은 빨리, 넓은 배는 천천히 찬다
      const pr = S.vessel.profile; this.cum = new Float32Array(N); let acc = 0;
      for (let i = 0; i < N; i++) { acc += pr[i] * pr[i]; this.cum[i] = acc; }
      for (let i = 0; i < N; i++) this.cum[i] /= acc;
      Snd.drone(82, 0.04, 320);
      say("그릇에 효모가 들어갑니다. 먹이와 온기를 맞춰 발효를 도우세요.");
      sys("발효 시작 · pH 6.80");
    },
    skip() { BA.S.ferm = { ph: 3.9, temp: 26, feeds: this.feeds || 6, sec: Math.round(this.t) }; },
    feed(kind) {
      if (kind === "fl") this.fl = clamp(this.fl + 0.24, 0, 1); else this.wa = clamp(this.wa + 0.24, 0, 1);
      this.feeds++; this.bump = Math.min(0.5, this.bump + 0.12);
      BA.fx.burst(P.x, P.y - 20, 14, kind === "fl" ? "240,236,220" : "140,200,255", 160, 0.6, 3, 400);
      Snd.noise(0.18, 0.06, kind === "fl" ? 900 : 2600, "bandpass");
    },
    update(dt) {
      this.t += dt;
      if (this.done) { this.done += dt; if (this.done > 4.2) BA.next(); return; }
      const food = Math.min(this.fl, this.wa), bal = clamp(1 - Math.abs(this.fl - this.wa) * 2.2, 0, 1);
      const tf = Math.exp(-Math.pow((this.temp - 26) / 3.6, 2));
      this.act = clamp(food * 2.4, 0, 1) * bal * tf;
      this.fl = Math.max(0, this.fl - dt * (0.03 + 0.035 * this.act));
      this.wa = Math.max(0, this.wa - dt * (0.022 + 0.035 * this.act));
      this.temp = Math.max(14, this.temp - dt * 0.32);
      this.f = clamp(this.f + this.act * dt / 26, 0, 1);
      this.bump = Math.max(0, this.bump - dt * 0.15);
      // 실패 조건 — 과열 / 방치
      if (this.temp > 31) BA.Vital.drain(6, dt, "과열 · 효모 폭주");
      this.starve = this.act < 0.05 ? this.starve + dt : 0;
      if (this.starve > 9) BA.Vital.drain(3, dt, "효모 기아 · 생태계 붕괴");
      this.ph = 6.8 - 2.9 * Math.pow(this.f, 0.8) + this.bump;
      Snd.setPh(this.ph);
      this.tSum += this.temp * this.act * dt; this.tW += this.act * dt; this.bSum += (this.wa - this.fl) * this.act * dt;
      this.acc += dt;
      while (this.acc > 0.25) { this.acc -= 0.25; this.hist.shift(); this.hist.push(this.ph); }
      if (this.f > (this.mark + 1) * 0.25 && this.mark < 3) { this.mark++; Snd.bell(440 + this.mark * 110, 0.06); }
      if (R() < this.act * dt * 14) { this.bub.push({ x: R() * 2 - 1, y: 0, s: 2 + R() * 4, v: 0.25 + R() * 0.3 }); if (R() < 0.3) Snd.blip(500 + R() * 900, 0.05, "sine", 0.02); }
      for (const b of this.bub) b.y += b.v * dt;
      this.bub = this.bub.filter((b) => b.y < 1);
      // 효모의 말 — 상태를 가장 크게 막는 요인부터
      this.msgT -= dt;
      if (this.msgT <= 0) {
        this.msgT = 1.2;
        this.msg = food < 0.08 ? (this.fl < this.wa ? "가루가 없다. 배고프다." : this.wa < this.fl ? "물이 없다. 마르다." : "배고프다. 가루. 물.")
          : this.temp < 22 ? "춥다. 온기를 더."
          : this.temp > 30 ? "덥다. 너무 덥다. 기다려라."
          : this.fl - this.wa > 0.2 ? "너무 되다. 물."
          : this.wa - this.fl > 0.2 ? "너무 묽다. 가루."
          : this.act > 0.6 ? "좋다. 부풀고 있다." : "조금만 더. 같은 양으로.";
      }
      if (this.f >= 1) {
        this.done = 0.001;
        BA.S.ferm = { ph: this.ph, temp: Math.round(this.tW ? this.tSum / this.tW : 26), feeds: this.feeds, sec: Math.round(this.t), bal: this.tW ? this.bSum / this.tW : 0 };
        Snd.chord([392, 494, 587, 784, 988], 0.07);
        BA.fx.flash("240,236,220", 0.3); BA.fx.burst(BA.W * 0.3, BA.H * 0.5, 90, "240,236,220", 320, 1.2, 4); BA.Vital.heal(10, "발효 완료");
        say("발효 완료. 반죽이 그릇을 가득 채웠습니다.");
        sys("그릇 가득 · 발효 완료 · pH " + this.ph.toFixed(2));
      }
    },
    render() {
      const { W, H, U, time } = BA, S = BA.S, p = S.vessel.profile;
      clear(0.45);
      const wide = W > H * 1.1;
      const vh = Math.min(H * (wide ? 0.42 : 0.28), W * 0.36), vx = wide ? W * 0.3 : W / 2, vy = wide ? H * 0.5 : H * 0.34;
      const scale = vh * 0.78, bot = vy + vh / 2, sh = vh / N;
      // dough — 그릇 단면 안에서 부풀어 오른다
      // 처음엔 그릇 부피의 1/4. 발효될수록 부피가 늘어 f = 1 에서 정확히 입구까지 찬다 → 가득 차면 끝
      const want = 0.25 + 0.75 * this.f;
      let level = N; for (let i = 0; i < N; i++) if (this.cum[i] >= want - 1e-6) { level = i + 1; break; }
      const fill = Math.round(want * 100), rimY = bot - N * sh, rimR = p[N - 1] * scale;
      for (let i = 0; i < level; i++) {
        const rp = Math.max(0, p[i] * scale - 4), y = bot - (i + 1) * sh, top = i === level - 1;
        ctx.fillStyle = top ? "rgba(240,236,220,0.95)" : "rgba(214,208,188," + (0.5 + 0.3 * Math.sin(i * 1.7 + time)) + ")";
        ctx.fillRect(vx - rp, Math.floor(y), rp * 2, Math.ceil(sh) + 1);
      }
      for (const b of this.bub) {
        const i = Math.floor(b.y * level); if (i >= level) continue;
        const rp = Math.max(0, p[i] * scale - 8);
        ctx.strokeStyle = "rgba(8,8,8,0.55)"; ctx.beginPath(); ctx.arc(vx + b.x * rp, bot - b.y * level * sh, b.s * U, 0, 6.283); ctx.stroke();
      }
      const ny = Math.round(3 + this.f * 9);
      for (let k = 0; k < ny; k++) {
        const i = Math.floor(((k * 0.37 + time * 0.03) % 1) * Math.max(1, level - 2)), rp = Math.max(0, p[i] * scale - 16);
        BA.drawYeast(k % 3 ? "idle" : "bud", vx + Math.sin(k * 2.1 + time * 0.7) * rp * 0.8, bot - (i + 0.5) * sh, Math.max(1.5, 1.8 * U), "#101010", false, 0.8);
      }
      if (this.done) {                                        // 입구 위로 봉긋하게 솟는다
        const k = clamp(this.done / 1.2, 0, 1), rr = Math.max(0, rimR - 4);
        ctx.fillStyle = "rgba(240,236,220,0.95)"; ctx.beginPath(); ctx.ellipse(vx, rimY + 1, rr, rr * 0.5 * k, 0, Math.PI, 0); ctx.fill();
      }
      BA.vesselOutline(p, vx, vy, vh, "rgba(230,225,210,0.95)", null, 3);
      // 입구 = 목표선
      ctx.strokeStyle = this.done ? C.green : "rgba(160,255,160," + (0.45 + 0.35 * Math.sin(time * 4)).toFixed(2) + ")"; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(vx - rimR - 26 * U, rimY); ctx.lineTo(vx + rimR + 26 * U, rimY); ctx.stroke(); ctx.setLineDash([]);
      T(this.done ? "가득 찼다" : "여기까지 차면 완료", vx + rimR + 32 * U, rimY, { size: 10, align: "left", bold: this.done > 0, color: C.green });
      T(S.vessel.name, vx, bot + 30 * U, { size: 12, color: C.dim });
      // 효모의 말
      T(this.done ? "이제 됐다. 그릇이 가득 찼다." : garble(this.msg, 0.06), vx, vy - vh / 2 - 38 * U, { size: 17, bold: true, color: this.act > 0.6 || this.done ? C.white : C.amber });

      T("PAGE 5 — FERMENTATION", W / 2, 96, { size: 13, color: C.dim });
      // panel
      const px = wide ? W * 0.56 : W * 0.08, pw = wide ? W * 0.36 : W * 0.84, py = wide ? H * 0.24 : H * 0.55, gh = wide ? H * 0.22 : H * 0.12;
      ctx.strokeStyle = C.ghost; ctx.strokeRect(px + 0.5, py + 0.5, pw, gh);
      ctx.strokeStyle = C.white; ctx.lineWidth = 1.5; ctx.beginPath();
      this.hist.forEach((v, i) => { const x = px + (i / (this.hist.length - 1)) * pw, y = py + gh - ((v - 3.5) / 4) * gh; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke(); ctx.lineWidth = 1;
      T("pH " + this.ph.toFixed(2), px, py - 14 * U, { size: 18, align: "left", bold: true, color: C.white });
      T("그릇 채움 " + String(fill).padStart(3, "0") + "%", px + pw, py - 14 * U, { size: 14, align: "right", bold: true, color: this.f >= 1 ? C.green : C.text });
      T("7.5", px - 6, py + 6, { size: 9, align: "right", color: C.ghost }); T("3.5", px - 6, py + gh - 4, { size: 9, align: "right", color: C.ghost });
      const bar = (label, v, y, lo, hi, txt, warn) => {
        T(label, px, y, { size: 11, align: "left", color: C.dim });
        const bx = px + 86 * U, bw = pw - 86 * U - 70 * U;
        ctx.strokeStyle = C.ghost; ctx.strokeRect(bx + 0.5, y - 4.5, bw, 9);
        if (lo != null) { ctx.fillStyle = "rgba(216,216,216,0.16)"; ctx.fillRect(bx + bw * lo, y - 4, bw * (hi - lo), 8); }
        ctx.fillStyle = warn ? C.amber : C.white; ctx.fillRect(bx, y - 4, bw * clamp(v, 0, 1), 8);
        T(txt, px + pw, y, { size: 11, align: "right", color: warn ? C.amber : C.text });
      };
      const by0 = py + gh + 28 * U, gapY = 24 * U;
      bar("밀가루", this.fl, by0, null, null, Math.round(this.fl * 100) + "g", this.fl < 0.08);
      bar("물", this.wa, by0 + gapY, null, null, Math.round(this.wa * 100) + "g", this.wa < 0.08);
      bar("온도", (this.temp - 14) / 22, by0 + gapY * 2, (24 - 14) / 22, (28 - 14) / 22, this.temp.toFixed(1) + "°C", this.temp < 22 || this.temp > 30);
      if (this.temp > 31) T("과열 — VITAL 감소 중", px + pw / 2, by0 + gapY * 4, { size: 11, bold: true, color: C.red });
      else if (this.starve > 5 && !this.done) T(this.starve > 9 ? "효모 기아 — VITAL 감소 중" : "효모가 굶고 있다 · " + Math.ceil(9 - this.starve) + "초", px + pw / 2, by0 + gapY * 4, { size: 11, bold: true, color: this.starve > 9 ? C.red : C.amber });
      bar("활동", this.act, by0 + gapY * 3, null, null, Math.round(this.act * 100) + "%", false);
      if (!this.done) {
        const cy = wide ? by0 + gapY * 5.2 : H - 86, cx = px + pw / 2, bw = Math.min(pw / 3 - 8, 150 * U);
        if (Btn("밀가루 +", cx - bw - 8, cy, { w: bw, size: 14 })) this.feed("fl");
        if (Btn("물 +", cx, cy, { w: bw, size: 14 })) this.feed("wa");
        if (Btn("온기 +", cx + bw + 8, cy, { w: bw, size: 14 })) { this.temp = Math.min(36, this.temp + 2.4); Snd.blip(180, 0.25, "sine", 0.06, 260); }
      }
    },
  });

  // ═════ 8. GIFT — 효모 → 아스트로넛 8bit 트랜스퍼 ═════════════
  BA.add({
    id: "gift", mood: "gift", green: true, hint: "초록빛 효모를 클릭해 레시피 조각 5개 받기",
    enter() {
      const S = BA.S, { W, H } = BA;
      S.recipe = BA.makeRecipe(S);
      const x = BA.expandRecipe(S.recipe);
      const parts = [x.base.flours.map((f) => f[0]).join("+"), "수화율 " + x.hyd + "%", "르뱅 " + x.lev + "%", (x.adds.map((a) => a.name).join(" + ") || "부재료 없음"), x.bulk + "h @ " + S.recipe.t + "°C"];
      this.y = parts.map((label, i) => ({ label, x: W * (0.16 + i * 0.17), by: H * (0.34 + (i % 2) * 0.14), p: i * 1.3, got: 0 }));
      this.n = 0; this.t = 0; this.fin = 0;
      Snd.drone(110, 0.04, 700);
      say("효모가 선물을 준비했습니다. 초록빛 효모에게서 레시피 조각을 받으세요.");
      sys("gift signal. 처음으로 초록이 켜진다.");
    },
    skip() {},
    update(dt) {
      this.t += dt;
      for (const y of this.y) if (y.got) y.got += dt;
      if (this.n >= 5) {
        if (!this.fin) { say("최적의 레시피를 효모에게 선물 받았습니다."); sys("transfer complete 5 / 5."); Snd.chord([587, 740, 880, 1175], 0.07); }
        this.fin += dt;
      }
    },
    render() {
      const { W, H, U, time } = BA;
      clear(0.3);
      BA.stars.draw(0.2, time * 0.003, 0.4);
      T("PAGE 6 — GIFT", W / 2, 96, { size: 13, color: C.dim });
      const sx = W / 2, sy = H - 150;
      BA.drawShip(sx, sy, Math.max(3, Math.round(4 * U)), 0);
      for (const y of this.y) {
        const x = y.x + Math.sin(time * 0.6 + y.p) * 26 * U, yy = y.by + Math.sin(time * 1.1 + y.p) * 14 * U;
        if (!y.got) {
          const hov = !this.fin && Math.hypot(P.x - x, P.y - yy) < 48 * U;
          if (hov) BA.hot = true;
          BA.drawYeast(Math.sin(time * 5 + y.p) > 0 ? "idle" : "walk", x, yy, Math.round((hov ? 7 : 6) * U) + 1, C.green, true);
          T("[ " + y.label + " ]", x, yy + 50 * U, { size: 12, color: C.green, bold: true });
          if (hov && P.click) { y.got = 0.001; y.fx = x; y.fy = yy; this.n++; BA.fx.burst(x, yy, 40, "160,255,160", 260, 0.8, 3); BA.fx.shock(x, yy, "160,255,160", 160); Snd.blip(520 + this.n * 90, 0.3, "square", 0.05, 1040 + this.n * 90); sys("레시피 조각 " + this.n + " / 5 · " + y.label); }
        } else if (y.got < 0.9) {
          const k = y.got / 0.9;
          for (let j = 0; j < 6; j++) {
            const kk = clamp(k - j * 0.05, 0, 1), s = 8 * U * (1 - kk * 0.5);
            ctx.fillStyle = "rgba(160,255,160," + (1 - j / 6).toFixed(2) + ")";
            ctx.fillRect(Math.round(lerp(y.fx, sx, kk * kk) / 4) * 4, Math.round(lerp(y.fy, sy, kk) / 4) * 4, s, s);
          }
        }
      }
      // transfer bar
      const bw = 26 * U, x0 = W / 2 - (5 * bw + 4 * 6) / 2, by = H - 84;
      for (let i = 0; i < 5; i++) {
        ctx.strokeStyle = C.green; ctx.strokeRect(x0 + i * (bw + 6) + 0.5, by + 0.5, bw, 10);
        if (i < this.n) { ctx.fillStyle = C.green; ctx.fillRect(x0 + i * (bw + 6), by, bw, 10); }
      }
      T("TRANSFER " + this.n + " / 5", W / 2, by - 12 * U, { size: 10, color: C.dim });
      if (this.fin) {
        const L = ["이제 들린다.", "너희는 우리를 키웠고, 우리는 너희에게 먹히며 이동한다.", "레시피는 귀환 좌표다."];
        L.forEach((l, i) => T(l, W / 2, H * 0.34 + i * 34 * U, { size: W < 900 ? 14 : 19, bold: true, color: i === 2 ? C.green : C.white, alpha: (this.fin - 0.6 - i * 1.5) / 0.8 }));
        if (this.fin > 5 && Btn("[ 귀환 ▶ ]", W / 2, H * 0.62, { size: 16, color: C.green })) BA.next();
      } else T("초록빛 효모를 클릭", W / 2, H * 0.2, { size: 16, bold: true });
    },
  });

  // ═════ 9. RETURN — 귀환 역재생 + 그린 플래시 ═════════════════
  BA.add({
    id: "return", mood: "space", green: true, hint: "귀환 중 — 원래 크기로 돌아갑니다",
    enter() { this.t = 0; this.said = false; Snd.drone(110, 0.06, 900); say(BA.S.name + "가 귀환할 준비합니다. 귀환 시퀀스 · 효모 생태계에서 분리 중."); sys("return sequence · uplinking colony " + BA.S.colony); },
    update(dt) {
      this.t += dt;
      const k = clamp(this.t / 14, 0, 1);
      Snd.drone(110 - k * 50, 0.06, 900 - k * 600);
      if (!this.said && this.t > 13) { this.said = true; say("귀환 완료 · 레시피 도착."); Snd.chord([262, 330, 392, 523], 0.07); }
      if (this.t > 16) BA.next();
    },
    render() {
      const { W, H, U, time } = BA, k = clamp(this.t / 14, 0, 1);
      clear(0.14);
      BA.stars.draw(-(7 - k * 6), (1 - k) * Math.PI * 0.6);
      BA.drawShip(W / 2, H * 0.55 + Math.sin(time * 2) * 3, Math.max(2, Math.round(lerp(3, 6, k) * U)), 2 + (1 - k) * 3, true);
      T("PAGE 2R — RETURN", W / 2, 96, { size: 13, color: C.dim });
      T("RE-SCALE", 24, H * 0.3, { size: 11, align: "left", color: C.dim });
      T(BA.fmtScale(1.7 * Math.pow(5e-6 / 1.7, 1 - k)), 24, H * 0.3 + 26 * U, { size: 26, align: "left", bold: true, color: C.white });
      T("CARGO", W - 24, H * 0.3, { size: 11, align: "right", color: C.dim });
      T("RECIPE × 1", W - 24, H * 0.3 + 26 * U, { size: 22, align: "right", bold: true, color: C.green });
      const g = this.t < 1.2 ? 0.6 * (1 - this.t / 1.2) : this.t > 13 ? clamp((this.t - 13) / 2.5, 0, 0.85) : 0;
      if (g > 0) { ctx.fillStyle = "rgba(160,255,160," + g.toFixed(2) + ")"; ctx.fillRect(0, 0, W, H); }
    },
  });

  // ═════ 10. RECIPE — 영수증 ASCII → 한글 reveal ═══════════════
  function receiptLines(r, shared) {
    const x = BA.expandRecipe(r), d = new Date(r.ts || Date.now()), z = (n) => String(n).padStart(2, "0");
    const L = [
      ["c", "BAKING ASTRONAUT"], ["c", shared ? "— 공유받은 레시피 —" : "— SOURDOUGH RECIPE —"], ["-"],
      ["lr", "NO.", "COLONY-" + r.c],
      ["lr", "DATE", d.getFullYear() + "." + z(d.getMonth() + 1) + "." + z(d.getDate()) + " " + z(d.getHours()) + ":" + z(d.getMinutes())],
      ["lr", "탑승자", r.n], ["-"],
      ["lr", "그릇", r.vn.replace(/ #.*/, "") + " (일치 " + r.vs + "%)"],
      ["lr", "신호 동기화", r.sy + "% → " + BA.RECIPE_DATA.tierName[x.tier] + " 레시피"],
      ["lr", "최종 산도", "pH " + r.ph.toFixed(2)],
      ["lr", "생체 신호", "VITAL " + r.hp + " · 재조립 " + r.d + "회"], ["-"],
      ["c", "「 " + x.name + " 」", "b"],
      ["c", x.shape.name],
      ["lr", "밀가루", x.flour],
      ["lr", "물", x.water],
      ["lr", "르뱅", x.levain],
      ["lr", "소금", x.salt],
    ];
    for (const a of x.addLines) L.push(["lr", a[0], a[1]]);
    L.push(["-"]);
    for (const st of x.steps) L.push(["l", st]);
    L.push(["-"]);
    L.push(["c", x.note || "너희가 우리를 키우는 동안, 우리도 너희의 시간을 부풀린다."]);
    L.push(["c", "— 이 조각은 당신이 가져가는 것 —"]);
    if (BA.RECIPE_DATA.placeholder) L.push(["c", "※ 시험판 배합 — 검증 전 임시 데이터"]);
    return L;
  }
  BA.receiptLines = receiptLines;
  const ASCII = "#%&@$*+=/\\<>01";
  const scramble = (s, k) => {            // k 0..1 — 왼쪽부터 풀린다
    if (k >= 1) return s;
    let o = "";
    for (let i = 0; i < s.length; i++) o += s[i] === " " ? " " : i / s.length < k ? s[i] : ASCII[Math.floor(R() * ASCII.length)];
    return o;
  };
  function drawReceipt(c, lines, x, y, w, lh, fs, reveal) {
    const fh = lh * 5, pad = lh * 1.1, h = lines.length * lh + pad * 2 + fh;
    c.fillStyle = "#e9e6dc"; c.fillRect(x, y, w, h);
    c.beginPath();
    for (let i = 0; i <= 24; i++) c.lineTo(x + (i / 24) * w, y + h + (i % 2 ? lh * 0.35 : 0));
    c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.fill();
    c.textBaseline = "middle";
    if (BA.face) BA.drawFace(c, BA.face, x + w / 2 - fh / 2, y + pad * 0.7, fh, { ink: true, noBg: true });
    lines.forEach((ln, i) => {
      const k = reveal(i); if (k <= 0) return;
      const yy = y + pad + fh + i * lh + lh / 2;
      c.fillStyle = "#141414";
      if (ln[0] === "-") { c.font = fs + "px " + BA.FONT; c.textAlign = "center"; c.fillText("- - - - - - - - - - - - - - - - - - - - -".slice(0, Math.floor(41 * Math.min(1, k))), x + w / 2, yy); return; }
      const bold = ln[0] === "c" && (i < 2 || ln[2] === "b");
      c.font = (bold ? "700 " : "") + (bold ? fs * 1.15 : fs) + "px " + BA.FONT;
      if (ln[0] === "c") { c.textAlign = "center"; c.fillText(scramble(ln[1], k), x + w / 2, yy); }
      else if (ln[0] === "l") { c.textAlign = "left"; c.fillText(scramble(ln[1], k), x + pad, yy); }
      else { c.textAlign = "left"; c.fillText(ln[1], x + pad, yy); c.textAlign = "right"; c.font = "700 " + fs + "px " + BA.FONT; c.fillText(scramble(ln[2], k), x + w - pad, yy); }
    });
    return h;
  }
  BA.drawReceipt = drawReceipt;
  function savePng(lines) {
    const w = 760, lh = 34, cv = document.createElement("canvas");
    cv.width = w + 80; cv.height = lines.length * lh + lh * 7.2 + 100;
    const c = cv.getContext("2d");
    c.fillStyle = "#080808"; c.fillRect(0, 0, cv.width, cv.height);
    drawReceipt(c, lines, 40, 40, w, lh, 20, () => 1);
    const a = document.createElement("a");
    a.download = "baking-astronaut-recipe.png"; a.href = cv.toDataURL("image/png");
    document.body.appendChild(a); a.click(); a.remove();
  }
  BA.add({
    id: "recipe", mood: "gift", green: true, glow: 0.1, hint: "레시피 카드를 확인하고 · 오븐으로 가져가 빵을 구우세요",
    enter() {
      const S = BA.S;
      this.shared = !!BA.sharedRecipe;
      if (this.shared) {                       // 공유 링크로 들어온 경우 — 플레이 없이 카드만 보여준다
        S.recipe = BA.sharedRecipe; S.name = S.recipe.n || "아스트로넛"; S.hp = S.recipe.hp; S.log = "공유받은 레시피";
        if (!BA.face) BA.face = BA.defaultFace();
      } else {
        if (!S.tg) S.tg = BA.pickTarget();
        if (!S.vessel) S.vessel = { name: S.tg.name, score: 0, profile: S.tg.profile };
        if (!S.recipe) S.recipe = BA.makeRecipe(S);
        S.recipe.hp = Math.round(S.hp); S.recipe.d = Math.min(S.deaths, 9);
      }
      this.t = 0; this.lines = receiptLines(S.recipe, this.shared); this.tick = 0; this.saved = false; this.copied = 0; this.scroll = 0; this.user = false;
      Snd.drone(73, 0.03, 400);
      sys(this.shared ? "shared recipe loaded. 당신도 탑승해 자신의 레시피를 받아 오라." : "recipe received. 공연은 당신의 부엌에서 계속된다.");
    },
    update(dt) {
      this.t += dt; this.tick -= dt; this.copied = Math.max(0, this.copied - dt);
      if (this.t < this.lines.length * 0.18 + 0.8 && this.tick <= 0) { this.tick = 0.07; Snd.blip(900 + R() * 600, 0.02, "square", 0.015, null, false); }
    },
    copy() {
      const url = BA.shareUrl(BA.S.recipe);
      const done = () => { this.copied = 2.5; sys("공유 링크 복사됨 — 얼굴 사진은 링크에 담기지 않습니다."); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => window.prompt("이 링크를 복사하세요", url));
      else window.prompt("이 링크를 복사하세요", url);
    },
    render() {
      const { W, H, U } = BA;
      clear(0.5);
      BA.stars.draw(0.2, 0, 0.3);
      // 영수증은 화면보다 길다 — 인쇄되듯 위로 밀려 올라가고, 다 나오면 휠·드래그로 훑어본다
      const n = this.lines.length, lh = Math.max(19, 21 * U), fs = lh * 0.6;
      const w = Math.min(W * 0.92, lh * 24), x = W / 2 - w / 2, top = 78, viewH = H - top - 48 - 74;
      const fullH = (n + 7.6) * lh, maxS = Math.max(0, fullH - viewH), ready = this.t > n * 0.18 + 0.9;
      if (P.wheel) { this.scroll += P.wheel * lh * 3; this.user = true; }
      if (P.down && P.y > top && P.y < top + viewH) { if (this.dragY != null) { this.scroll -= P.y - this.dragY; this.user = true; } this.dragY = P.y; } else this.dragY = null;
      if (!this.user) this.scroll = ready ? lerp(this.scroll, 0, 0.04 * BA.fs) : Math.max(0, (Math.min(n, this.t / 0.18) + 7) * lh - viewH * 0.8);
      this.scroll = clamp(this.scroll, 0, maxS);
      drawReceipt(ctx, this.lines, x, top - this.scroll, w, lh, fs, (i) => (this.t - i * 0.18) / 0.7);
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, 66); ctx.fillRect(0, H - 48 - 72, W, 120);
      if (maxS > 4) {
        const sh = viewH * viewH / fullH;
        ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(x + w + 10, top, 3, viewH);
        ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.fillRect(x + w + 10, top + (viewH - sh) * this.scroll / maxS, 3, sh);
        if (ready) T("휠 · 드래그로 스크롤", x + w + 12, top + viewH + 12, { size: 9, align: "right", color: C.ghost });
      }
      const by = H - 48 - 38;
      if (ready) {
        if (Btn(this.saved ? "저장됨 ✓" : "[ PNG 저장 ]", W / 2 - 190 * U, by, { size: 13, color: C.green })) { savePng(this.lines); this.saved = true; }
        if (this.shared) {
          if (Btn("[ 나도 탑승하기 ▶ ]", W / 2 + 70 * U, by, { size: 14 })) {
            BA.sharedRecipe = null;
            try { history.replaceState(null, "", location.href.split("#")[0]); } catch (_) {}
            BA.restart();
          }
        } else {
          if (Btn(this.copied > 0 ? "복사됨 ✓" : "공유 링크 복사", W / 2 - 20 * U, by, { size: 13 })) this.copy();
          if (Btn("[ 오븐으로 ▶ ]", W / 2 + 170 * U, by, { size: 14, color: C.green })) BA.next();
        }
      }
    },
  });

  // ═════ 11. CREDITS — 효모 엔딩 크레딧 ════════════════════════
  // 플레이어 효모 → 만든 효모들 → 그동안 다녀간 체험자 효모들 순으로 지나간다
  const STAFF = [["기획 효모", "유승협 · 여가은"], ["제작 효모", "유승협"], ["2D 디자인 효모", "유승협 · 여가은"], ["사운드 효모", "유승협"]];
  BA.add({
    id: "credits", mood: "off", green: true, hint: "효모 승무원들이 지나갑니다 — 그동안 다녀간 체험자 효모들과 함께",
    enter() {
      const { W, H } = BA, Log = BA.Log, z = (n) => String(n).padStart(2, "0");
      Log.add(BA.S);                                       // 빵을 건너뛰고 온 경우에도 한 번은 기록한다
      const past = Log.players.slice(0, -1).reverse().slice(0, 40);   // 방금 기록한 나를 뺀, 최근 순
      const roster = [{ role: "플레이어 효모", name: "[ " + BA.S.name + " ]", g: true, me: true }]
        .concat(STAFF.map(([role, name]) => ({ role, name: "[ " + name + " ]", g: true })))
        .concat(past.map((p) => { const d = new Date(p.ts); return { role: (p.m === "hard" ? "★ 어려움 성공 효모" : "체험자 효모") + (p.ts ? " · " + z(d.getMonth() + 1) + "." + z(d.getDate()) : ""), name: "[ " + p.n + " ]", sub: p.r }; }));
      const gap = Math.max(210, W * 0.17);
      this.y = roster.map((c, i) => ({
        ...c, x: W * 0.12 + i * gap, y: 150 + R() * Math.max(60, H - 420),
        v: 44, p: R() * 6.28, s: c.g ? 8 : 5 + Math.floor(R() * 3), bud: !c.g && R() < 0.35,
      }));
      this.span = roster.length * gap;
      this.total = Log.count; this.none = !past.length;
      this.t = 0;
      Snd.drone(98, 0, 500);                               // 엔딩 노래가 흐르므로 배경 지속음은 끈다
      Snd.init(); BA.Chip.start();
      sys("♪ 효모 행진곡 · yeast crew is dispatched. " + this.total + " yeasts on record.");
    },
    exit() { BA.Chip.stop(); },
    update(dt) {
      this.t += dt;
      if (!BA.Chip.playing) BA.Chip.start();              // 소리가 아직 안 켜져 있었다면 켜지는 대로 시작
      for (const y of this.y) { y.x -= y.v * dt; if (y.x < -240) y.x += Math.max(this.span, BA.W + 480); }
    },
    render() {
      const { W, H, U, time } = BA;
      clear(0.4);
      BA.stars.draw(0.3, 0, 0.5);
      T("ENDING CREDITS", W / 2, 96, { size: 13, color: C.dim });
      T("♪ 효모 행진곡", W / 2, 96 + 18 * U, { size: 10, color: Math.floor(time * 2.3) % 2 ? C.green : C.dim });
      for (const y of this.y) {
        if (y.x < -240 || y.x > W + 240) continue;
        const yy = y.y + Math.sin(time * 1.4 + y.p) * 8, col = y.g ? C.green : C.white, sc = Math.max(2, Math.round(y.s * U * 0.8));
        if (y.me && BA.face) BA.drawFace(ctx, BA.face, y.x - sc * 5, yy - sc * 5, sc * 10, {});
        else BA.drawYeast(y.bud ? "bud" : Math.sin(time * 6 + y.p) > 0 ? "idle" : "walk", y.x, yy, sc, col, y.g);
        T(y.role, y.x, yy + sc * 7 + 8, { size: 9, color: C.dim });
        T(y.name, y.x, yy + sc * 7 + 24 * U, { size: 12, bold: true, color: y.g ? C.green : C.text });
        if (y.sub) T(y.sub, y.x, yy + sc * 7 + 40 * U, { size: 9, color: C.ghost });
      }
      ctx.fillStyle = "rgba(8,8,8,0.6)"; ctx.fillRect(0, H - 170, W, 122);
      T("공연은 당신의 부엌에서 계속된다.", W / 2, H - 148, { size: 15, bold: true, color: C.white });
      T(this.none ? "당신이 이곳의 첫 번째 체험자 효모입니다." : "지금까지 " + this.total + "명의 효모가 다녀갔습니다." + (BA.Log.remote ? "" : " (이 기기 기록)"), W / 2, H - 122, { size: 11, color: C.green });
      if (this.t > 3 && Btn("↺ 처음으로", W / 2, H - 86, { size: 13 })) { BA.hush(); BA.restart(); }
    },
  });
})();
