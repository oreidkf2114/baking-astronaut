// Solo v2 · 귀환 후 — 레시피 카드를 오븐에 넣으면 나만의 빵이 나온다
//   넣기  : 카드를 끌거나 클릭해 오븐 투입구로
//   굽기  : 껍질 색 게이지가 오른다. [꺼내기]를 누른 순간이 껍질 색이 된다 (덜 익음 / 황금 / 진함 / 탐)
//   빵    : 레시피가 형태를 정한다 — 성형(불·바타르·틴), 밀가루 색, 부재료 알갱이, 수화율 = 속살 기공 크기
//   향    : 김과 향 글자가 피어오른다
//   자르기: 빵을 반으로 갈라 단면(속살·기공·부재료)을 본다
//   보내기: 빵 + 영수증을 한 장의 JPG 로. 이메일 주소를 적으면 그 주소로 보낸다
//           (config.js 에 서버 주소가 있으면 서버가 발송, 없으면 JPG 저장 + 메일 작성 창)

(() => {
  "use strict";
  const { ctx, C, T, Btn, clear, clamp, lerp, R, hash, Snd, P, say, sys } = BA;
  const mailBox = document.getElementById("mailBox"), mailInput = document.getElementById("mailInput");

  // 부재료 → 알갱이 [r,g,b, 밀도, 크기] / 반죽 색조 / 향
  const SPECK = {
    sesame: [[240, 225, 180, 0.11, 1]], walnut: [[112, 76, 46, 0.045, 2]], raisin: [[72, 32, 52, 0.045, 2]], olive: [[52, 62, 32, 0.045, 2]],
    oat: [[228, 208, 164, 0.13, 1]], cranwal: [[156, 32, 48, 0.04, 2], [112, 76, 46, 0.035, 2]], cheddar: [[244, 162, 40, 0.05, 2]],
    rosemary: [[62, 112, 62, 0.06, 1]], bsesame: [[28, 28, 28, 0.12, 1]], fig: [[124, 52, 72, 0.045, 2]], matcha: [], mugwort: [],
    yuja: [[246, 204, 62, 0.045, 2]], garlic: [[236, 216, 162, 0.035, 2]], cacao: [[52, 32, 22, 0.07, 1], [242, 142, 42, 0.03, 2]],
  };
  const TINT = { matcha: [120, 160, 70, 0.42], mugwort: [96, 120, 70, 0.4], cacao: [70, 44, 30, 0.3], bsesame: [120, 118, 112, 0.18] };
  const SCENT = {
    sesame: "볶은 깨의 고소함", walnut: "구운 호두", raisin: "달큰한 건포도", olive: "짭짤한 올리브", oat: "따뜻한 귀리죽",
    cranwal: "새콤한 크랜베리", cheddar: "녹아내린 체다", rosemary: "로즈마리 숲", bsesame: "흑임자의 깊은 고소함", fig: "무화과 잼",
    matcha: "쌉싸름한 말차", mugwort: "봄 쑥 내음", yuja: "유자 껍질", garlic: "구운 마늘", cacao: "카카오와 오렌지",
  };
  const BASE_SCENT = { white: "갓 구운 밀", ww10: "통밀의 구수함", ww30: "진한 통밀", rye15: "호밀의 흙내음", spelt: "스펠트의 단내" };
  const crustName = (b) => b < 0.45 ? "덜 익은 껍질" : b < 0.8 ? "황금 껍질" : b < 0.93 ? "진한 껍질" : "탄 껍질";

  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  function crustColor(b) {
    const pale = [236, 226, 200], gold = [208, 142, 62], deep = [128, 72, 30], burnt = [44, 28, 20];
    return b < 0.55 ? mix(pale, gold, b / 0.55) : b < 0.85 ? mix(gold, deep, (b - 0.55) / 0.3) : mix(deep, burnt, (b - 0.85) / 0.15);
  }
  // 실루엣: u∈[-1,1], 반환 = 그 위치의 높이(0..1). 0 이면 바깥
  function height(shape, u, rise) {
    if (shape === 2) {                                   // 틴 — 틀 위로 봉긋
      if (Math.abs(u) > 0.74) return 0;
      const dome = Math.sqrt(Math.max(0, 1 - Math.pow(u / 0.76, 2)));
      return 0.34 + 0.34 * rise * dome + (Math.abs(u) > 0.66 ? -0.06 * rise : 0);
    }
    const w = shape === 1 ? 0.98 : 0.8, h = (shape === 1 ? 0.62 : 0.8) * (0.35 + 0.65 * rise);
    const k = 1 - Math.pow(u / w, 2);
    return k <= 0 ? 0 : h * Math.pow(k, 0.5);
  }

  // 도트 빵. (cx, baseY) = 바닥 중앙, size = 가로 폭(px). o: { bake 0..1, rise 0..1, cut 0..1 }
  //   cut > 0 이면 한가운데를 갈라 왼쪽 반 덩이와, 이쪽을 보는 단면(속살·기공·부재료)을 나란히 놓는다
  function drawBread(c, r, x, cx, baseY, size, o) {
    const shape = r.s, G = 72, cell = size / G, seed = (r.ts % 9973) + 1, bake = o.bake, rise = o.rise == null ? 1 : o.rise;
    const cut = clamp(+o.cut || 0, 0, 1), halved = cut > 0.02;
    const base = crustColor(bake), wholeness = x.base.id === "ww30" ? 0.16 : x.base.id === "white" ? 0 : 0.08;
    const ids = x.adds.map((a) => a.id), specks = ids.flatMap((id) => SPECK[id] || []), tints = ids.map((id) => TINT[id]).filter(Boolean);
    const crumb = (() => { let cr = [242, 230, 196]; for (const t of tints) cr = mix(cr, t, t[3] * 1.3); return wholeness ? mix(cr, [190, 160, 120], wholeness * 2) : cr; })();
    const holeS = clamp((x.hyd - 62) / 20, 0.15, 1);     // 수화율이 높을수록 기공이 크다
    const put = (px, py, col) => { c.fillStyle = "rgb(" + (col[0] | 0) + "," + (col[1] | 0) + "," + (col[2] | 0) + ")"; c.fillRect(Math.floor(px), Math.floor(py), Math.ceil(cell), Math.ceil(cell)); };
    const lx = cx - (halved ? size * (0.05 + 0.1 * cut) : 0);            // 덩이(또는 왼쪽 반)의 중심
    for (let gx = 0; gx < G; gx++) {
      const u = (gx + 0.5) / G * 2 - 1, hh = height(shape, u, rise);
      if (hh <= 0 || (halved && u > 0)) continue;
      const rows = Math.round(hh * G * 0.62), face = halved && u > -0.06;  // 잘린 면의 옆모습
      for (let gy = 0; gy < rows; gy++) {
        const v = gy / Math.max(1, rows - 1), hs = hash(gx * 12.9898 + gy * 78.233 + seed);
        const px = lx + u * size / 2 - cell / 2, py = baseY - (gy + 1) * cell;
        if (face) { put(px, py, gy >= rows - 2 || gy === 0 ? mix(base, [40, 26, 18], 0.15) : mix(crumb, [150, 120, 84], 0.35 + hs * 0.2)); continue; }
        // 껍질 — 위·왼쪽이 밝고, 위쪽일수록 더 구워진다
        let lit = 0.62 + 0.42 * v - 0.24 * u + (hs - 0.5) * 0.1;
        if (gy >= rows - 1) lit += 0.12;
        let col = mix(crustColor(clamp(bake * (0.82 + 0.3 * v), 0, 1)), [0, 0, 0], clamp(1 - lit, 0, 0.6));
        for (const t of tints) col = mix(col, t, t[3] * (1 - bake * 0.45));
        if (wholeness) col = mix(col, [96, 62, 34], wholeness);
        // 칼집 — 구워지며 벌어진 "귀"
        const sc = shape === 0 ? Math.min(Math.abs(v - 0.62 - u * 0.3), Math.abs(v - 0.62 + u * 0.3))
          : shape === 1 ? Math.abs(v - 0.58 - u * 0.22) : (Math.abs(u) < 0.05 ? 0 : 1);
        const inScore = shape === 2 ? (sc === 0 && v > 0.72) : (sc < 0.07 && Math.abs(u) < (shape === 1 ? 0.72 : 0.46));
        if (inScore && rise > 0.6) col = mix(col, mix(crumb, base, 0.35), 0.75 * clamp((rise - 0.6) / 0.3, 0, 1));
        else if (!inScore && shape !== 2 && sc < 0.1 && sc >= 0.07 && rise > 0.7 && Math.abs(u) < (shape === 1 ? 0.72 : 0.46)) col = mix(col, [30, 18, 12], 0.45);
        if (hs > 0.9 && v > 0.45 && bake > 0.2) col = mix(col, [250, 246, 236], 0.6);          // 덧가루
        for (const s of specks) if (hash(gx * 5.1 + gy * 2.9 + s[1] + seed) < s[3]) { col = [s[0], s[1], s[2]]; if (bake > 0.85) col = mix(col, [30, 20, 14], 0.5); }
        if (shape === 2 && v < 0.3) col = mix(col, [60, 60, 66], 0.55);                         // 틀
        put(px, py, col);
      }
    }
    if (halved) {
      // 단면 — 껍질 테두리 2칸, 속살, 크고 작은 기공, 부재료 알갱이. 바타르의 단면은 둥글다
      const sp = shape === 2 ? 2 : 0, sw = shape === 2 ? 0.74 : shape === 1 ? 0.62 : 0.8;
      const sx = cx + size * (0.05 + 0.33 * cut), rowsAt = (g) => { const hh = height(sp, ((g + 0.5) / G * 2 - 1) / (shape === 1 ? 0.78 : 1), rise); return hh > 0 ? Math.round(hh * G * 0.62 * (shape === 1 ? 0.9 : 1)) : 0; };
      c.globalAlpha = cut;
      for (let gx = 0; gx < G; gx++) {
        const rows = rowsAt(gx);
        if (!rows) continue;
        const u = (gx + 0.5) / G * 2 - 1, nb = Math.min(rowsAt(gx - 2), rowsAt(gx + 2));
        for (let gy = 0; gy < rows; gy++) {
          const hs = hash(gx * 12.9898 + gy * 78.233 + seed * 1.7), px = sx + u * size / 2 - cell / 2, py = baseY - (gy + 1) * cell;
          let col;
          if (gy >= rows - 2 || gy < 1 || gy >= nb) col = mix(crustColor(clamp(bake * (0.9 + 0.2 * gy / rows), 0, 1)), [30, 18, 12], gy < 1 ? 0.3 : 0.1);
          else {
            const big = hash(Math.floor(gx / (2 + holeS * 3)) * 3.7 + Math.floor(gy / (2 + holeS * 2)) * 9.1 + seed), small = hash(Math.floor(gx / 2) * 5.3 + Math.floor(gy / 1.5) * 2.1 + seed);
            const hole = big < 0.1 + holeS * 0.22 || small < 0.12;
            col = hole ? mix(crumb, [96, 70, 46], 0.5 + hs * 0.2) : mix(crumb, [255, 250, 235], hs * 0.3);
            if (!hole && gy > rows - 5) col = mix(col, base, 0.25);                             // 껍질 바로 아래는 조금 짙다
            for (const s of specks) if (hash(gx * 3.3 + gy * 7.7 + s[0] + seed) < s[3] * 0.9) col = [s[0], s[1], s[2]];
          }
          put(px, py, col);
        }
      }
      c.globalAlpha = 1;
      c.fillStyle = "rgba(0,0,0,0.45)"; c.fillRect(sx - size * sw * 0.5, baseY, size * sw, Math.max(2, cell * 0.8));
      c.fillRect(lx - size * 0.42, baseY, size * 0.42, Math.max(2, cell * 0.8));
    } else { c.fillStyle = "rgba(0,0,0,0.45)"; c.fillRect(cx - size * 0.42, baseY, size * 0.84, Math.max(2, cell * 0.8)); }   // 바닥 그림자
  }
  BA.drawBread = drawBread;
  BA.breadCard = (st) => cardCanvas(BA.S, st);

  // 향 — 구불구불 오르는 김
  function drawSteam(c, cx, topY, w, h, t, amt) {
    for (let k = 0; k < 6; k++) {
      const x0 = cx + (k - 2.5) * w / 6;
      for (let j = 0; j < 22; j++) {
        const q = ((j / 22) + t * 0.16 + k * 0.13) % 1, y = topY - q * h;
        const x = x0 + Math.sin(q * 7 + k * 1.7 + t * 0.9) * (6 + q * 22);
        const a = Math.sin(q * Math.PI) * 0.34 * amt;
        c.fillStyle = "rgba(255,244,224," + a.toFixed(3) + ")";
        const s = 2 + q * 5;
        c.fillRect(Math.round(x / 2) * 2, Math.round(y / 2) * 2, s, s);
      }
    }
  }

  // 공유용 한 장 — 빵 + 영수증
  function cardCanvas(S, st) {
    const r = S.recipe, x = BA.expandRecipe(r), lines = BA.receiptLines(r, false);
    const w = 760, lh = 30, top = 470, cv = document.createElement("canvas");
    cv.width = w + 80; cv.height = top + (lines.length + 7.6) * lh + 90;
    const c = cv.getContext("2d");
    c.fillStyle = "#080808"; c.fillRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < 160; i++) { c.fillStyle = "rgba(216,216,216," + (0.15 + hash(i * 3.3) * 0.5).toFixed(2) + ")"; c.fillRect(hash(i) * cv.width, hash(i + 77) * top, 2, 2); }
    drawSteam(c, cv.width / 2, 150, 300, 110, 3.1, 1);
    drawBread(c, r, x, cv.width / 2, 350, st.cut ? 330 : 380, { bake: st.bake, rise: 1, cut: st.cut ? 1 : 0 });
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillStyle = "#D8D8D8"; c.font = "700 30px " + BA.FONT; c.fillText(x.name, cv.width / 2, 400);
    c.fillStyle = "rgba(255,255,255,0.5)"; c.font = "16px " + BA.FONT;
    c.fillText(x.shape.name + " · " + crustName(st.bake) + " · " + st.scents.join(" · "), cv.width / 2, 432);
    c.fillStyle = "#A0FFA0"; c.font = "700 13px " + BA.FONT; c.fillText("BAKING ASTRONAUT — " + r.n + "의 빵", cv.width / 2, 40);
    BA.drawReceipt(c, lines, 40, top, w, lh, 18, () => 1);
    return cv;
  }
  const download = (blob, name) => {
    const a = document.createElement("a"), url = URL.createObjectURL(blob);
    a.download = name; a.href = url; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  BA.add({
    id: "bake", mood: "gift", green: true, glow: 0.4, hint: "레시피 카드를 오븐에 넣고 · 껍질 색이 마음에 들 때 꺼내세요",
    enter() {
      const S = BA.S;
      if (!S.recipe) { if (!S.tg) S.tg = BA.pickTarget(); if (!S.vessel) S.vessel = { name: S.tg.name, score: 0, profile: S.tg.profile }; S.recipe = BA.makeRecipe(S); }
      this.r = S.recipe; this.x = BA.expandRecipe(this.r);
      this.t = 0; this.phase = "insert"; this.pt = 0; this.bake = 0; this.cut = false; this.cutK = 0; this.sending = false; this.told = false; this.blob = null; this.msg = ""; this.msgT = 0; this.words = []; this.wT = 0;
      this.card = { x: BA.W / 2, y: BA.H * 0.74, drag: false, in: 0 };
      this.scents = [BASE_SCENT[this.x.base.id] || "갓 구운 밀"].concat(this.x.adds.map((a) => SCENT[a.id]).filter(Boolean)).concat(["새콤한 르뱅"]);
      Snd.drone(82, 0.04, 420);
      say("귀환 완료. 받아 온 레시피 카드를 오븐에 넣으세요.");
      sys("oven standby. 레시피 카드 대기.");
    },
    skip() { BA.S.bake = this.bake || 0.65; },
    geom() { const { W, H, U } = BA, ow = Math.min(340 * U, W * 0.7), oh = ow * 0.78; return { ow, oh, ox: W / 2 - ow / 2, oy: H * 0.2, cx: W / 2 }; },
    takeOut() {
      const g = this.geom();
      this.phase = "reveal"; this.pt = 0; BA.S.bake = this.bake;
      BA.fx.flash("255,236,200", 0.5); BA.fx.shock(g.cx, g.oy + g.oh * 0.5, "255,220,160", 520); BA.fx.burst(g.cx, g.oy + g.oh * 0.5, 120, "255,220,160", 420, 1.3, 4);
      Snd.chord(this.bake > 0.93 ? [196, 185, 147] : [392, 494, 587, 784, 988], 0.07);
      say(this.bake > 0.93 ? "조금 탔습니다. 그래도 당신의 빵입니다." : this.x.name + "가 구워졌습니다.");
      sys("bread out · " + crustName(this.bake) + " · " + this.x.name);
      BA.hint("빵을 반으로 잘라 보고 · 이메일 주소를 적어 사진을 보내거나 JPG로 저장하세요");
      mailBox.hidden = false;
      if (BA.Log) BA.Log.add(BA.S);
      // 공유 버튼이 누르는 즉시 동작하도록 이미지를 미리 만들어 둔다
      this.makeBlob();
    },
    makeBlob() {
      this.blob = null;
      try { cardCanvas(BA.S, this).toBlob((b) => { this.blob = b; }, "image/jpeg", 0.92); } catch (_) {}
    },
    note(m) { this.msg = m; this.msgT = 4; sys(m); },
    fileName() { return "baking-astronaut-" + this.r.c + ".jpg"; },
    save() {
      if (this.blob) download(this.blob, this.fileName());
      else {                                  // 미리 만든 이미지가 아직 없으면 그 자리에서 만든다
        const a = document.createElement("a");
        a.download = this.fileName(); a.href = cardCanvas(BA.S, this).toDataURL("image/jpeg", 0.92);
        document.body.appendChild(a); a.click(); a.remove();
      }
      this.note("JPG 저장됨 — " + this.fileName());
    },
    text() { return this.r.n + "의 빵 「" + this.x.name + "」 — 효모에게 받아 온 사워도우 레시피"; },
    // 적어 넣은 주소로 빵 사진을 보낸다. 주소는 발송에만 쓰고 어디에도 저장하지 않는다
    async send() {
      const to = mailInput.value.trim();
      if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]{2,}$/.test(to)) { mailInput.focus(); return this.note("이메일 주소를 확인해 주세요."); }
      if (!this.blob) return this.note("이미지를 만드는 중입니다. 잠시 후 다시 눌러 주세요.");
      if (this.sending) return;
      if (BA.Log && BA.Log.remote) {
        this.sending = true; this.note("보내는 중…");
        const ok = await BA.Log.mail(to, this.blob, { n: this.r.n, r: this.x.name, url: BA.shareUrl(this.r) });
        this.sending = false;
        if (ok) return this.note(to + " 로 보냈습니다. 메일함을 확인하세요.");
        this.note("서버 발송에 실패해 메일 작성 창으로 넘깁니다.");
      }
      // 서버가 없으면: JPG 를 내려받고, 받는 사람이 채워진 메일 작성 창을 연다 (첨부는 직접)
      download(this.blob, this.fileName());
      const x = this.x, body = [this.text(), "", "밀가루  " + x.flour, "물  " + x.water, "르뱅  " + x.levain, "소금  " + x.salt]
        .concat(x.addLines.map((a) => a[0] + "  " + a[1]), [""], x.steps, ["", "레시피 카드 열기: " + BA.shareUrl(this.r), "", "(방금 저장된 JPG를 이 메일에 첨부해 주세요)"]).join("\n");
      window.location.href = "mailto:" + encodeURIComponent(to) + "?subject=" + encodeURIComponent("[Baking Astronaut] " + x.name) + "&body=" + encodeURIComponent(body);
      this.note("JPG를 저장하고 메일 작성 창을 열었습니다 — 저장된 사진을 첨부해 보내세요.");
    },
    // 어려움 모드 성공자 — 적은 주소와 빵 사진을 제작자에게 보낸다 (제작자가 축하 연락을 준다)
    async notify() {
      const from = mailInput.value.trim();
      if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]{2,}$/.test(from)) { mailInput.focus(); return this.note("연락받을 이메일 주소를 먼저 적어 주세요."); }
      if (!this.blob) return this.note("이미지를 만드는 중입니다. 잠시 후 다시 눌러 주세요.");
      if (this.sending || this.told) return;
      if (!(BA.Log && BA.Log.remote)) return this.note("제작자 연락 서버가 아직 연결되지 않았습니다.");
      this.sending = true; this.note("제작자에게 보내는 중…");
      const ok = await BA.Log.clear(from, this.blob, { n: this.r.n, r: this.x.name, url: BA.shareUrl(this.r), note: BA.S.noHands ? "2차 물레: 카메라 없이 마우스 대체" : "2차 물레: 손 인식" });
      this.sending = false; this.told = ok;
      this.note(ok ? "제작자에게 전달했습니다. 축하 연락을 기다려 주세요." : "전달에 실패했습니다. 잠시 후 다시 눌러 주세요.");
    },
    exit() { mailBox.hidden = true; },
    update(dt) {
      const { W, H, U } = BA, g = this.geom(), c = this.card;
      this.t += dt; this.pt += dt; this.msgT = Math.max(0, this.msgT - dt);
      this.cutK = clamp(this.cutK + (this.cut ? 1 : -1) * dt * 2.2, 0, 1);
      if (this.phase === "insert") {
        const slotX = g.cx, slotY = g.oy + 4;
        if (c.in) { c.in += dt * 2.2; c.x = lerp(c.x, slotX, 0.2); c.y = lerp(c.y, slotY, 0.2); if (c.in >= 1) { this.phase = "bake"; this.pt = 0; Snd.blip(160, 0.5, "sawtooth", 0.07, 320); Snd.noise(0.5, 0.1, 400); sys("오븐 250°C. 껍질 색을 보고 꺼내라."); } return; }
        const over = Math.abs(P.x - c.x) < 60 * U && Math.abs(P.y - c.y) < 76 * U;
        if (P.pressed && over) c.drag = true;
        if (c.drag && P.down) { c.x = P.x; c.y = P.y; }
        if (c.drag && !P.down) {
          c.drag = false;
          if (c.y < g.oy + g.oh + 30 * U || P.click) c.in = 0.001;          // 오븐 근처에 놓거나, 그냥 클릭해도 들어간다
        }
        if (c.in) { Snd.blip(520, 0.2, "square", 0.05, 1040); BA.fx.burst(c.x, c.y, 24, "160,255,160", 200, 0.6, 3); }
      } else if (this.phase === "bake") {
        this.bake = clamp(this.pt / 11, 0, 1);
        if (R() < dt * 9) BA.fx.spark(g.cx + (R() - 0.5) * g.ow * 0.6, g.oy + g.oh * 0.75, (R() - 0.5) * 40, -60 - R() * 80, "255,170,80", 0.7, 2, -40);
        if (Math.floor(this.pt * 2) !== Math.floor((this.pt - dt) * 2)) Snd.blip(90 + this.bake * 60, 0.08, "sine", 0.05, null, false);
        if (this.bake >= 1) this.takeOut();
      } else {
        this.wT -= dt;
        if (this.wT <= 0) { this.wT = 1.1; const s = this.scents[Math.floor(R() * this.scents.length)]; this.words.push({ s, x: W / 2 + (R() - 0.5) * W * 0.36, y: H * 0.44, t: 0, p: R() * 6 }); }
        for (const w of this.words) w.t += dt;
        this.words = this.words.filter((w) => w.t < 4.5);
        if (R() < dt * 5) BA.fx.spark(W / 2 + (R() - 0.5) * 220 * U, H * 0.42, (R() - 0.5) * 20, -30 - R() * 50, "255,236,200", 1.6, 2, -10);
      }
    },
    render() {
      const { W, H, U, time } = BA, g = this.geom(), r = this.r, x = this.x;
      clear(0.45);
      BA.stars.draw(0.15, 0, 0.3);
      T("PAGE 7 — 나만의 빵", W / 2, 96, { size: 13, color: C.dim });
      // 귀환 — 착륙한 우주선에서 탑승자가 걸어 나와 오븐 곁에 선다. 빵이 나오면 뛴다
      {
        const reveal = this.phase === "reveal", as = Math.max(3, Math.round(4 * U)), ss = Math.max(2, Math.round(3 * U));
        const ground = reveal ? H * 0.5 : g.oy + g.oh + 10 * U;
        const left = reveal ? W / 2 - Math.min(380 * U, W * 0.62) / 2 : g.ox;
        const shipX = Math.max(34 * U, left - 170 * U), stand = Math.max(shipX + 50 * U, left - 40 * U);
        const wk = clamp((this.t - 0.6) / 2.2, 0, 1), ax = lerp(shipX + 10 * U, stand, wk);
        const hop = reveal ? Math.abs(Math.sin(time * 7)) * (this.pt < 5 ? 16 : 4) * U : this.phase === "bake" && this.bake > 0.45 ? Math.abs(Math.sin(time * 3)) * 3 * U : 0;
        BA.drawShip(shipX, ground - 7 * ss, ss, 0);
        ctx.fillStyle = "rgba(216,216,216,0.25)"; ctx.fillRect(shipX - 40 * U, ground, stand - shipX + 80 * U, 1);
        if (this.t > 0.6) BA.drawAstro(ctx, ax, ground - hop, as, { walk: wk < 1 });
        if (this.t < 3.2) T("귀환", shipX, ground + 14 * U, { size: 9, color: C.green, alpha: 3.2 - this.t });
      }

      if (this.phase !== "reveal") {
        // 오븐
        const heat = this.phase === "bake" ? 0.35 + this.bake * 0.65 : 0.08;
        ctx.fillStyle = "#1b1b1d"; ctx.fillRect(g.ox, g.oy, g.ow, g.oh);
        ctx.strokeStyle = "rgba(216,216,216,0.7)"; ctx.lineWidth = 2; ctx.strokeRect(g.ox + 1, g.oy + 1, g.ow - 2, g.oh - 2); ctx.lineWidth = 1;
        ctx.fillStyle = "#050505"; ctx.fillRect(g.cx - 46 * U, g.oy + 8 * U, 92 * U, 7 * U);                    // 카드 투입구
        T("RECIPE IN", g.cx, g.oy + 26 * U, { size: 9, color: this.phase === "insert" ? (Math.sin(time * 6) > 0 ? C.green : C.dim) : C.ghost });
        for (let k = 0; k < 3; k++) { ctx.fillStyle = k < Math.ceil(heat * 3) ? "#ff8c1e" : "#333"; ctx.beginPath(); ctx.arc(g.ox + g.ow - (22 + k * 22) * U, g.oy + 18 * U, 6 * U, 0, 6.283); ctx.fill(); }
        const wx = g.ox + g.ow * 0.1, wy = g.oy + g.oh * 0.24, ww = g.ow * 0.8, wh = g.oh * 0.62;
        const gr = ctx.createLinearGradient(0, wy, 0, wy + wh);
        gr.addColorStop(0, "rgba(" + Math.round(40 + heat * 120) + "," + Math.round(16 + heat * 50) + ",8,1)"); gr.addColorStop(1, "rgba(" + Math.round(80 + heat * 175) + "," + Math.round(30 + heat * 110) + ",14,1)");
        ctx.fillStyle = gr; ctx.fillRect(wx, wy, ww, wh);
        ctx.strokeStyle = "rgba(216,216,216,0.5)"; ctx.strokeRect(wx + 0.5, wy + 0.5, ww, wh);
        if (this.phase === "bake") {
          const rise = clamp(this.pt / 5, 0, 1), wob = Math.sin(time * 30) * heat;                              // 열 아지랑이
          drawBread(ctx, r, x, g.cx + wob, wy + wh - 8 * U, ww * 0.7, { bake: this.bake, rise: 0.2 + 0.8 * rise });
          for (let i = 0; i < 5; i++) { const yy = wy + ((time * 40 + i * 37) % wh); ctx.fillStyle = "rgba(255,200,120,0.06)"; ctx.fillRect(wx, yy, ww, 3); }
        }
        ctx.fillStyle = "rgba(216,216,216,0.5)"; ctx.fillRect(g.ox + g.ow * 0.2, wy + wh + 10 * U, g.ow * 0.6, 5 * U);        // 손잡이
        ctx.fillStyle = "#111"; ctx.fillRect(g.ox + 14 * U, g.oy + g.oh, 16 * U, 10 * U); ctx.fillRect(g.ox + g.ow - 30 * U, g.oy + g.oh, 16 * U, 10 * U);
      }

      if (this.phase === "insert") {
        // 레시피 카드 (미니 영수증)
        const c = this.card, cw = 96 * U, ch = 130 * U, k = c.in ? 1 - c.in : 1, bob = c.drag || c.in ? 0 : Math.sin(time * 2.4) * 5 * U;
        if (!c.in && Math.abs(P.x - c.x) < 60 * U && Math.abs(P.y - c.y) < 76 * U) BA.hot = true;
        ctx.save(); ctx.translate(c.x, c.y + bob); ctx.scale(1, Math.max(0.05, k)); ctx.rotate(c.drag ? 0 : -0.05);
        ctx.fillStyle = "#e9e6dc"; ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
        if (BA.face) BA.drawFace(ctx, BA.face, -cw * 0.22, -ch * 0.44, cw * 0.44, { ink: true, noBg: true });
        ctx.fillStyle = "#141414";
        for (let i = 0; i < 9; i++) ctx.fillRect(-cw * 0.38, -ch * 0.04 + i * ch * 0.052, cw * (0.4 + hash(i * 3.1) * 0.36), 2);
        ctx.restore();
        if (!c.in) {
          T("레시피 카드를 오븐에 넣으세요", W / 2, g.oy + g.oh + 44 * U, { size: 17, bold: true });
          T("카드를 끌어 올리거나, 그냥 클릭", W / 2, g.oy + g.oh + 68 * U, { size: 11, color: C.dim });
          T("「 " + x.name + " 」", W / 2, c.y + ch / 2 + 26 * U, { size: 12, color: C.green });
        }
      } else if (this.phase === "bake") {
        const bw = Math.min(420 * U, W * 0.74), bx = W / 2 - bw / 2, by = g.oy + g.oh + 44 * U, b = this.bake;
        T(b < 0.2 ? "오븐 스프링 — 반죽이 부풀어 오른다" : b < 0.45 ? "껍질이 잡히는 중" : crustName(b), W / 2, by - 22 * U, { size: 16, bold: true, color: b > 0.93 ? C.red : b >= 0.45 && b < 0.8 ? C.amber : C.text });
        for (let i = 0; i < 60; i++) { const cc = crustColor(i / 59); ctx.fillStyle = "rgb(" + (cc[0] | 0) + "," + (cc[1] | 0) + "," + (cc[2] | 0) + ")"; ctx.fillRect(bx + (i / 60) * bw, by, bw / 60 + 1, 14 * U); }
        ctx.strokeStyle = C.amber; ctx.lineWidth = 2; ctx.strokeRect(bx + bw * 0.45, by - 3, bw * 0.35, 14 * U + 6); ctx.lineWidth = 1;
        T("황금", bx + bw * 0.625, by + 30 * U, { size: 10, color: C.amber });
        ctx.fillStyle = C.white; ctx.fillRect(bx + bw * b - 2, by - 8, 4, 14 * U + 16);
        if (b > 0.12 && Btn("[ 지금 꺼내기 ]", W / 2, by + 62 * U, { size: 16, color: b >= 0.45 && b < 0.8 ? C.green : C.white })) this.takeOut();
      } else {
        // ── 나만의 빵 ──
        const k = clamp(this.pt / 1.2, 0, 1), size = Math.min(380 * U, W * 0.62) * (0.7 + 0.3 * k), baseY = H * 0.5;
        const lg = ctx.createRadialGradient(W / 2, baseY - size * 0.2, 10, W / 2, baseY - size * 0.2, size * 0.9);
        lg.addColorStop(0, "rgba(255,210,140," + (0.16 * k).toFixed(3) + ")"); lg.addColorStop(1, "rgba(255,210,140,0)");
        ctx.fillStyle = lg; ctx.fillRect(0, 64, W, H * 0.6);
        drawSteam(ctx, W / 2, baseY - size * 0.36, size * 0.8, H * 0.22, time, k);
        drawBread(ctx, r, x, W / 2, baseY, size * (1 - 0.12 * this.cutK), { bake: this.bake, rise: 1, cut: this.cutK });
        for (const w of this.words) {
          const a = Math.sin(clamp(w.t / 4.5, 0, 1) * Math.PI);
          T(w.s, w.x + Math.sin(w.t * 1.3 + w.p) * 18 * U, w.y - w.t * 34 * U, { size: 12, color: "rgba(255,236,200,1)", alpha: a * 0.85 });
        }
        T("「 " + x.name + " 」", W / 2, baseY + 34 * U, { size: W < 900 ? 18 : 24, bold: true, color: C.white, alpha: k });
        T(x.shape.name + " · " + crustName(this.bake) + " · 수화율 " + x.hyd + "%", W / 2, baseY + 60 * U, { size: 12, color: C.dim, alpha: k });
        T(r.n + "가 효모에게서 받아 와 구운 빵", W / 2, baseY + 80 * U, { size: 11, color: C.green, alpha: k });
        if (this.pt > 1.6) {
          const y1 = H - 48 - 186, y2 = H - 48 - 86;                       // 그 사이(아래에서 178px)에 이메일 입력칸. 자막 자리는 비워 둔다
          if (Btn(this.cut ? "다시 붙이기" : "빵 반으로 자르기 ✂", W / 2 - 110 * U, y1, { size: 13, color: this.cut ? C.white : C.amber })) {
            this.cut = !this.cut; Snd.noise(0.15, 0.1, 3000, "highpass"); Snd.blip(900, 0.12, "square", 0.04, 300);
            BA.fx.burst(W / 2, baseY - size * 0.2, 40, "242,230,196", 200, 0.7, 3, 500); BA.fx.shock(W / 2, baseY - size * 0.2, "255,236,200", 220);
            if (this.cut) { sys("단면 확인 — 수화율 " + x.hyd + "% 의 기공."); say("속살이 보입니다."); }
            this.makeBlob();
          }
          if (Btn("엔딩 크레딧 ▶", W / 2 + 120 * U, y1, { size: 12 })) BA.next();
          const star = BA.hardClear(), off = star ? 110 * U : 0;
          if (Btn(this.sending ? "보내는 중…" : "[ 이메일로 사진 보내기 ]", W / 2 - 80 * U - off, y2, { size: 13, color: C.green })) this.send();
          if (Btn("JPG 저장", W / 2 + 130 * U - off, y2, { size: 12 })) this.save();
          if (star) {
            T("★ 어려움 모드 성공 ★", W / 2, 96 + 26 * U, { size: 16, bold: true, color: C.amber });
            T("이메일을 적고 [제작자에게 알리기]를 누르면, 그 주소와 빵 사진이 제작자에게 전달되어 축하 연락을 받습니다.", W / 2, 96 + 48 * U, { size: 10, color: C.dim });
            if (Btn(this.told ? "✓ 제작자에게 전달됨" : "[ ★ 제작자에게 알리기 ]", W / 2 + 190 * U, y2, { size: 13, color: C.amber, disabled: this.told })) this.notify();
          }
          if (this.msgT > 0) T(this.msg, W / 2, y1 - 30 * U, { size: 11, color: C.amber, alpha: this.msgT });
        }
      }
    },
  });
  // 크레딧 앞으로 옮긴다 (recipe → bake → credits)
  const me = BA.scenes.pop(), ci = BA.scenes.findIndex((s) => s.id === "credits");
  BA.scenes.splice(ci < 0 ? BA.scenes.length : ci, 0, me);
})();
