// Solo v2 · 사워도우 레시피 데이터 + 생성기 + 공유 링크
//
// ┌─ 이 파일의 DATA 는 임시 데이터다 ───────────────────────────────────────────┐
// │ 일반적인 사워도우 배합 범위로 채운 시험용 값이며, 직접 구워 검증한 레시피가   │
// │ 아니다. 공개 전에 본인 레시피로 교체하고 DATA.placeholder 를 false 로 바꿀 것. │
// └────────────────────────────────────────────────────────────────────────────┘
//
// 모든 양은 베이커스 퍼센트(밀가루 총량 = 100%).
// 플레이 결과 → 레시피:
//   발효 장면의 물/밀가루 균형 → 수화율        발효 온도 → 1차 발효 시간·르뱅 비율
//   빚은 그릇의 형태          → 성형           신호 동기화율 → 부재료 등급
//   그릇 일치도 85%+          → 부재료 하나 더  재조립(사망) 횟수 → 접기 횟수

(() => {
  "use strict";
  const { clamp, R } = BA;

  const DATA = {
    placeholder: true,
    flourTotal: 400,                       // 한 덩이 기준 밀가루 g
    // 밀가루 배합. hyd = 이 배합에 어울리는 수화율 보정(%p)
    bases: [
      { id: "white", name: "플레인", flours: [["강력분", 100]], hyd: 0 },
      { id: "ww10", name: "통밀", flours: [["강력분", 90], ["통밀", 10]], hyd: 2 },
      { id: "ww30", name: "통밀 듬뿍", flours: [["강력분", 70], ["통밀", 30]], hyd: 5 },
      { id: "rye15", name: "호밀", flours: [["강력분", 85], ["호밀", 15]], hyd: 3 },
      { id: "spelt", name: "스펠트", flours: [["강력분", 80], ["스펠트", 20]], hyd: -1 },
    ],
    // 부재료. tier 1 흔함 / 2 드묾 / 3 희귀. items = [이름, %]. when = 넣는 시점. hyd = 수화율 보정(%p)
    // pair: true = 다른 부재료와 함께 두 번째 재료로 붙어도 무난한 것
    addins: [
      { id: "sesame", tier: 1, name: "참깨", items: [["볶은 참깨", 8]], when: "두 번째 접기", pair: true },
      { id: "walnut", tier: 1, name: "호두", items: [["구운 호두", 20]], when: "두 번째 접기", pair: true },
      { id: "raisin", tier: 1, name: "건포도", items: [["건포도(물에 불려 물기 제거)", 15]], when: "두 번째 접기" },
      { id: "olive", tier: 1, name: "올리브", items: [["씨 뺀 올리브", 15]], when: "두 번째 접기" },
      { id: "oat", tier: 1, name: "귀리", items: [["오트밀(같은 양의 뜨거운 물에 불림)", 10]], when: "첫 번째 접기", pair: true },
      { id: "cranwal", tier: 2, name: "크랜베리 호두", items: [["건크랜베리", 12], ["구운 호두", 12]], when: "두 번째 접기" },
      { id: "cheddar", tier: 2, name: "체다", items: [["체다 치즈 큐브", 15]], when: "성형 직전" },
      { id: "rosemary", tier: 2, name: "로즈마리", items: [["다진 로즈마리", 1], ["올리브오일", 3]], when: "소금과 함께" },
      { id: "bsesame", tier: 2, name: "흑임자", items: [["흑임자", 6]], when: "두 번째 접기" },
      { id: "fig", tier: 2, name: "무화과", items: [["말린 무화과(잘게)", 18]], when: "두 번째 접기" },
      { id: "matcha", tier: 3, name: "말차", items: [["말차 가루", 2]], when: "밀가루에 미리 섞기", hyd: 2, note: "초록 가루를 넣어라. 다시 부풀어 오를 것이다." },
      { id: "mugwort", tier: 3, name: "쑥", items: [["쑥 가루", 3]], when: "밀가루에 미리 섞기", hyd: 2 },
      { id: "yuja", tier: 3, name: "유자", items: [["유자청 건더기", 6]], when: "두 번째 접기", hyd: -2 },
      { id: "garlic", tier: 3, name: "구운 마늘", items: [["구운 마늘", 8]], when: "두 번째 접기" },
      { id: "cacao", tier: 3, name: "카카오 오렌지", items: [["카카오닙", 5], ["오렌지 필", 8]], when: "두 번째 접기" },
    ],
    shapes: [
      { id: "boule", name: "불 (둥근 덩이)", how: "둥글게 말아 반느통에" },
      { id: "batard", name: "바타르 (타원)", how: "길게 접어 타원 반느통에" },
      { id: "tin", name: "틴 (식빵틀)", how: "돌돌 말아 식빵틀에" },
    ],
    salt: 2,
    bake: "뚜껑 덮고 250°C 20분 → 열고 230°C 20~25분",
    tierName: ["", "흔함", "드묾", "희귀"],
  };
  BA.RECIPE_DATA = DATA;

  const pick = (a) => a[Math.floor(R() * a.length)];
  const half = (v) => Math.round(v * 2) / 2;

  // 빚은 그릇의 실루엣 → 성형
  function shapeFor(profile) {
    if (!profile) return 0;
    let mx = 0, sum = 0;
    for (const v of profile) { mx = Math.max(mx, v); sum += v; }
    const mean = sum / profile.length, top = profile[profile.length - 1];
    if (top < mx * 0.55) return 1;          // 목이 좁다 → 길쭉한 바타르
    if (mean > 0.36) return 0;              // 배가 넉넉하다 → 불
    return 2;                               // 날씬하다 → 틴
  }

  // S(플레이 결과) → 레시피. 저장·공유를 위해 인덱스와 숫자만 담는다.
  function makeRecipe(S) {
    const f = S.ferm || {}, sync = S.sync || 0, score = (S.vessel && S.vessel.score) || 0;
    const b = Math.floor(R() * DATA.bases.length);
    const tier = sync >= 0.9 ? 3 : sync >= 0.5 ? 2 : 1;
    const pool = DATA.addins.map((a, i) => i).filter((i) => DATA.addins[i].tier === tier);
    const a = [pick(pool)];
    if (score >= 85) {                      // 잘 빚은 그릇에는 무난하게 어울리는 견과·곡물이 하나 더 붙는다
      const p2 = DATA.addins.map((x, i) => i).filter((i) => DATA.addins[i].pair && i !== a[0]);
      if (p2.length) a.push(pick(p2));
    }
    const temp = clamp(Math.round(f.temp || 26), 22, 30);
    return {
      v: 1, b, a,
      h: 0,                                 // 아래 finalize 에서 채운다
      bal: clamp(f.bal || 0, -0.3, 0.3),
      t: temp,
      s: shapeFor(S.vessel && S.vessel.profile),
      d: Math.min(S.deaths || 0, 9),
      n: S.name, c: S.colony, vn: S.vessel ? S.vessel.name : "", vs: score, sy: Math.round(sync * 100),
      ph: +(f.ph || 3.9).toFixed(2), hp: Math.round(S.hp), ts: Date.now(),
    };
  }

  // 인덱스 → 사람이 읽는 값(그램·시간·문장)
  function expand(r) {
    const base = DATA.bases[r.b] || DATA.bases[0], adds = (r.a || []).map((i) => DATA.addins[i]).filter(Boolean);
    const F = DATA.flourTotal, g = (pct) => Math.round(F * pct / 100);
    let hyd = 72 + base.hyd + Math.round(r.bal * 30);
    for (const a of adds) hyd += a.hyd || 0;
    hyd = clamp(hyd, 65, 84);
    const lev = r.t <= 24 ? 25 : r.t >= 28 ? 15 : 20;
    const bulk = half(clamp(4.5 - (r.t - 26) * 0.5, 3, 7));
    const folds = 4 + Math.min(r.d, 2);
    const shape = DATA.shapes[r.s] || DATA.shapes[0];
    const name = (adds.length ? adds.map((a) => a.name).join(" ") + " " : "") + (base.id === "white" ? "" : base.name + " ") + "사워도우";
    return {
      name, base, adds, hyd, lev, bulk, folds, shape, tier: Math.max(1, ...adds.map((a) => a.tier)),
      flour: base.flours.map(([n, p]) => n + " " + g(p) + "g").join(" + "),
      water: g(hyd) + "g (" + hyd + "%)",
      levain: g(lev) + "g (" + lev + "%)",
      salt: g(DATA.salt) + "g (" + DATA.salt + "%)",
      addLines: adds.flatMap((a) => a.items.map(([n, p]) => [n, g(p) + "g (" + p + "%)"])),
      steps: [
        "1  밀가루+물+르뱅 섞고 30분 → 소금",
        "2  1차 발효 " + r.t + "°C · " + bulk + "시간 (30분마다 접기 ×" + folds + ")",
      ].concat(adds.map((a) => "·  " + a.name + ": " + a.when))
        .concat(["3  " + shape.how + " → 냉장 12시간", "4  " + DATA.bake]),
      note: (adds.find((a) => a.note) || {}).note || "",
    };
  }

  // ── 공유 링크: 레시피를 URL 해시에 담는다 (서버 없음, 얼굴은 담지 않는다) ──
  function encode(r) {
    const bytes = new TextEncoder().encode(JSON.stringify(r));
    let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decode(code) {
    try {
      const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
      const r = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
      if (!r || r.v !== 1 || !DATA.bases[r.b] || !Array.isArray(r.a)) return null;
      // 링크로 들어온 값은 믿지 않는다 — 길이와 범위를 다시 조인다
      const str = (v, n) => String(v == null ? "" : v).slice(0, n), num = (v, lo, hi) => clamp(Number(v) || 0, lo, hi);
      return {
        v: 1, b: r.b | 0, a: r.a.slice(0, 2).map((i) => i | 0).filter((i) => DATA.addins[i]),
        bal: num(r.bal, -0.3, 0.3), t: num(r.t, 22, 30), s: num(r.s, 0, DATA.shapes.length - 1) | 0, d: num(r.d, 0, 9) | 0,
        n: str(r.n, 24), c: str(r.c, 6), vn: str(r.vn, 40), vs: num(r.vs, 0, 100) | 0, sy: num(r.sy, 0, 100) | 0,
        ph: num(r.ph, 3, 8), hp: num(r.hp, 0, 100) | 0, ts: num(r.ts, 0, 4e12),
      };
    } catch (_) { return null; }
  }
  const shareUrl = (r) => location.href.split("#")[0] + "#r=" + encode(r);

  const m = /[#&]r=([A-Za-z0-9_-]+)/.exec(location.hash || "");
  BA.sharedRecipe = m ? decode(m[1]) : null;

  Object.assign(BA, { makeRecipe, expandRecipe: expand, shareUrl });
})();
