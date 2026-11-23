// Solo · scenes B — 도착 / 조율
// 공연판에는 "도착(ACT 2)"이 플레이스홀더였고, 물레로 넘어가는 이유가 화면에 없었다.
// 여기서 관객이 효모의 깨진 말을 직접 조율해 읽고, 효모가 "그릇을 빚어 달라"고 요청한다 → 물레의 동기.

(() => {
  "use strict";
  const { ctx, C, T, Btn, clear, clamp, lerp, R, garble, Snd, P, say, sys } = BA;

  const BROKEN = "발효 중. 우리는 너무 작게 말하고 있다. 떨림을 맞추면 문장이 열린다.";

  BA.add({
    id: "arrival", mood: "yeast", hint: "아래 다이얼을 좌우로 끌어 · 두 소리의 떨림(맥놀이)이 사라지는 지점을 찾기",
    enter() {
      const S = BA.S;
      S.tg = BA.pickTarget();
      this.t = 0; this.phase = "tune"; this.tuned = 0; this.line = 0; this.lt = 0;
      this.tf = 70 + R() * 110;                       // 효모 군집의 주파수 (Hz)
      this.pos = this.tf > 125 ? 0.08 : 0.92;         // 다이얼 0..1 → 40..220Hz
      this.yeast = Array.from({ length: 34 }, (_, i) => ({ a: R() * 6.28, r: 0.25 + R() * 0.75, p: R() * 6.28, k: i % 4 ? "idle" : "bud", s: 2 + Math.floor(R() * 3) }));
      this.a = Snd.osc(this.tf, 0.05); this.b = Snd.osc(40 + this.pos * 180, 0.05);
      const name = S.tg.name.replace(/ #.*/, "");
      this.lines = [
        "채널이 붙었다. 잡음이 아니다.",
        "우리는 흩어진 입으로 말한다.",
        "먼 곳에서 온 탑승자. 우리는 자랄 곳이 필요하다.",
        "그 그릇은 담기 위한 것이 아니다. 자라기 위한 조건이다.",
        "온도는 벽이 되고, 산도는 문이 되고, 기다림은 내부의 공기가 된다.",
        "「" + name + "」를 빚어 달라. 그 안에서 레시피를 발효시켜 돌려주겠다.",
      ];
      Snd.drone(65, 0.03, 300); Snd.setPh(6.8);
      say("효모 생태계에 도착했습니다. 효모의 언어가 아직 번역되지 않았습니다.");
      sys("도착. pH 6.8 · 발효 언어 동기화 필요.");
    },
    exit() { this.a.stop(); this.b.stop(); },
    skip() {},
    update(dt) {
      const { W, H, U } = BA;
      this.t += dt;
      if (this.phase === "tune") {
        const ty = H * 0.8, x0 = W * 0.18, x1 = W * 0.82;
        if (P.pressed && Math.abs(P.y - ty) < 44 * U && P.x > x0 - 30 && P.x < x1 + 30) this.drag = true;
        if (!P.down) this.drag = false;
        if (this.drag) this.pos = clamp((P.x - x0) / (x1 - x0), 0, 1);
        const f = 40 + this.pos * 180;
        this.b.set(f);
        this.diff = Math.abs(f - this.tf);
        this.c = clamp(1 - this.diff / 70, 0, 1);
        if (this.diff < 2.5) this.tuned += dt / 1.6; else this.tuned = Math.max(0, this.tuned - dt);
        if (this.t > 40) BA.Vital.drain(2, dt, "소음 노출 · 언어 불일치");
        if (this.tuned >= 1) {
          this.phase = "talk"; this.c = 1; this.a.vol(0.02); this.b.vol(0.02); this.b.set(this.tf);
          Snd.chord([392, 494, 587, 784], 0.06);
          BA.fx.shock(BA.W / 2, BA.H * 0.42, "216,216,216", 460); BA.fx.burst(BA.W / 2, BA.H * 0.42, 80, "216,216,216", 300, 1, 3); BA.Vital.heal(5, "언어 동기화");
          say("발효 언어 동기화 완료.");
          sys("채널 고정. 효모가 말한다 — 클릭으로 넘기기.");
          BA.hint("화면을 클릭해 효모의 말을 넘기기");
        }
      } else {
        this.lt += dt;
        const full = this.lt * 22 >= this.lines[this.line].length;
        if (P.click && !BA.hot && this.line < this.lines.length - 1) {
          if (!full) this.lt = 99; else { this.ci = -1; this.line++; this.lt = 0; Snd.blip(300 + R() * 300, 0.09, "triangle", 0.05); }
        }
        const ci = Math.floor(this.lt * 22);
        if (ci !== this.ci && ci % 3 === 0 && !full) Snd.blip(180 + R() * 240, 0.03, "triangle", 0.02, null, false);
        this.ci = ci;
      }
    },
    render() {
      const { W, H, U, time } = BA;
      clear(0.35);
      const cx = W / 2, cy = H * 0.42, c = this.c || 0, rad = Math.min(W * 0.36, H * 0.3);
      // colony — 조율될수록 한 박자로 모인다
      for (const y of this.yeast) {
        const jit = (1 - c) * 26 * U, beat = Math.sin(time * 4) * c * 8 * U;
        const rr = rad * y.r * lerp(1.15, 0.8, c) + beat;
        const x = cx + Math.cos(y.a + time * 0.12) * rr + Math.sin(time * 9 + y.p) * jit;
        const yy = cy + Math.sin(y.a + time * 0.12) * rr * 0.62 + Math.cos(time * 8 + y.p) * jit;
        BA.drawYeast(Math.sin(time * 6 + y.p) > 0 ? "idle" : y.k === "bud" ? "bud" : "walk", x, yy, Math.max(2, y.s * U), C.white, false, 0.35 + c * 0.6);
      }
      // 조율될수록 군집이 신경망처럼 이어진다
      if (c > 0.35) {
        ctx.strokeStyle = "rgba(216,216,216," + ((c - 0.35) * 0.3).toFixed(2) + ")"; ctx.beginPath();
        for (let i = 0; i < this.yeast.length; i++) {
          const a = this.yeast[i], b = this.yeast[(i * 7 + 3) % this.yeast.length];
          const ra = rad * a.r * lerp(1.15, 0.8, c), rb = rad * b.r * lerp(1.15, 0.8, c);
          ctx.moveTo(cx + Math.cos(a.a + time * 0.12) * ra, cy + Math.sin(a.a + time * 0.12) * ra * 0.62);
          ctx.lineTo(cx + Math.cos(b.a + time * 0.12) * rb, cy + Math.sin(b.a + time * 0.12) * rb * 0.62);
        }
        ctx.stroke();
      }
      T("PAGE 3 — ARRIVAL / 조율", W / 2, 96, { size: 13, color: C.dim });
      if (this.phase === "tune" && this.t > 30) T(this.t > 40 ? "소음 노출 — VITAL 감소 중" : "소음 한계까지 " + Math.ceil(40 - this.t) + "초", W / 2, 96 + 22 * U, { size: 11, bold: true, color: this.t > 40 ? C.red : C.amber });
      T("pH 6.80", 24, 96, { size: 12, align: "left", color: C.dim });

      if (this.phase === "tune") {
        ctx.fillStyle = "rgba(8,8,8,0.7)"; ctx.fillRect(0, cy - 22 * U, W, 44 * U);
        T(garble(BROKEN, (1 - c) * 0.95), cx, cy, { size: 18, bold: true, color: C.white });
        // 오실로스코프 — 두 파형의 합. 어긋나면 맥놀이가 보인다
        const oy = H * 0.66, amp = 26 * U, f = 40 + this.pos * 180;
        ctx.strokeStyle = "rgba(216,216,216,0.75)"; ctx.lineWidth = 1.5; ctx.beginPath();
        for (let x = W * 0.12; x <= W * 0.88; x += 3) {
          const u = x / W * 3 + time * 0.25;
          const v = (Math.sin(u * this.tf * 0.4) + Math.sin(u * f * 0.4)) * 0.5;
          const yy = oy + v * amp;
          if (x === W * 0.12) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.stroke(); ctx.lineWidth = 1;
        // dial
        const ty = H * 0.8, x0 = W * 0.18, x1 = W * 0.82, kx = lerp(x0, x1, this.pos);
        ctx.strokeStyle = C.ghost; ctx.beginPath(); ctx.moveTo(x0, ty); ctx.lineTo(x1, ty); ctx.stroke();
        for (let i = 0; i <= 18; i++) { const x = lerp(x0, x1, i / 18); ctx.fillStyle = C.ghost; ctx.fillRect(x, ty - (i % 3 ? 4 : 8), 1, i % 3 ? 8 : 16); }
        if (Math.abs(P.y - ty) < 44 * U && P.x > x0 - 30 && P.x < x1 + 30) BA.hot = true;
        ctx.fillStyle = this.diff < 2.5 ? C.white : C.bg; ctx.strokeStyle = C.white; ctx.lineWidth = 2;
        ctx.fillRect(kx - 9 * U, ty - 20 * U, 18 * U, 40 * U); ctx.strokeRect(kx - 9 * U, ty - 20 * U, 18 * U, 40 * U); ctx.lineWidth = 1;
        T(f.toFixed(1) + " Hz", kx, ty - 34 * U, { size: 12, bold: true });
        T("◀ 끌어서 조율 ▶", cx, ty + 38 * U, { size: 11, color: C.dim });
        // 근접도
        const bw = 180 * U;
        T("SYNC", cx - bw / 2 - 10, H * 0.56, { size: 10, align: "right", color: C.dim });
        ctx.strokeStyle = C.ghost; ctx.strokeRect(cx - bw / 2 + 0.5, H * 0.56 - 4, bw, 8);
        ctx.fillStyle = C.white; ctx.fillRect(cx - bw / 2, H * 0.56 - 4, bw * Math.max(c * 0.9, this.tuned), 8);
        if (this.diff < 2.5) T("맞았다 — 그대로 유지", cx, H * 0.56 + 22 * U, { size: 12, bold: true });
        else if (this.t > 25) T(f < this.tf ? "힌트: 더 오른쪽 →" : "힌트: ← 더 왼쪽", cx, H * 0.56 + 22 * U, { size: 11, color: C.dim });
      } else {
        const l = this.lines[this.line], n = Math.min(l.length, Math.floor(this.lt * 22)), last = this.line === this.lines.length - 1;
        ctx.fillStyle = "rgba(8,8,8,0.78)"; ctx.fillRect(0, H * 0.66 - 34 * U, W, 68 * U);
        T(l.slice(0, n), cx, H * 0.66, { size: W < 900 ? 14 : 19, bold: true, color: last ? C.white : C.text });
        T((this.line + 1) + " / " + this.lines.length, cx, H * 0.66 + 26 * U, { size: 10, color: C.ghost });
        if (last && n >= l.length) {
          BA.drawVesselGhost(BA.S.tg.profile, cx, H * 0.4, Math.min(H * 0.26, 220 * U));
          if (Btn("[ 물레 앞에 앉기 ▶ ]", cx, H * 0.82, { size: 16 })) BA.next();
        } else if (n >= l.length && Math.sin(time * 5) > 0) T("▼ 클릭", cx, H * 0.66 + 50 * U, { size: 11, color: C.dim });
      }
    },
  });
})();
