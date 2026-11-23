// Solo v2 · 체험자 기록 — 다녀간 효모들
//   빵이 구워져 나오는 순간(또는 크레딧 진입) 한 번 기록한다: 이름 · 군집 번호 · 레시피 이름 · 시각.
//   얼굴과 이메일 주소는 기록하지 않는다.
//   서버(config.js 의 endpoint)가 없으면 이 브라우저의 localStorage 에만 남는다.

(() => {
  "use strict";
  const KEY = "ba_players_v2", url = String((BA.CONFIG && BA.CONFIG.endpoint) || "").trim();
  try { localStorage.removeItem("ba_players_v1"); } catch (_) {}      // 2026-11-23 기록 초기화 — 이전 기록은 지운다
  const clean = (v, n) => String(v == null ? "" : v).replace(/[\r\n\t]+/g, " ").slice(0, n);
  const entry = (p) => ({ ts: Number(p && p.ts) || 0, n: clean(p && p.n, 24), c: clean(p && p.c, 6), r: clean(p && p.r, 40), m: clean(p && p.m, 8) });
  const b64 = (blob) => new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(",")[1]); fr.onerror = no; fr.readAsDataURL(blob); });
  const local = () => { try { const a = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(a) ? a.map(entry) : []; } catch (_) { return []; } };
  const post = (o) => fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(o) }).then((r) => r.json());

  const Log = {
    remote: !!url, players: local(), count: 0,
    add(S) {
      if (S.logged) return;
      S.logged = true;
      const e = entry({ ts: Date.now(), n: S.name, c: S.colony, r: S.recipe ? BA.expandRecipe(S.recipe).name : "", m: BA.D.id });
      this.players.push(e); this.count++;
      try { const a = local(); a.push(e); localStorage.setItem(KEY, JSON.stringify(a.slice(-300))); } catch (_) {}
      if (url) post({ op: "log", n: e.n, c: e.c, r: e.r, m: e.m }).catch(() => {});
    },
    // 서버에 쌓인 전체 기록(최근 60명 + 총 인원)을 받아 온다
    async load() {
      if (!url) return;
      try {
        const d = await (await fetch(url, { cache: "no-store" })).json();
        if (d && d.ok && Array.isArray(d.players)) { this.players = d.players.map(entry); this.count = Number(d.count) || this.players.length; }
      } catch (_) {}
    },
    async mail(to, blob, info) {
      try {
        const d = await post({ op: "mail", to, n: clean(info.n, 24), r: clean(info.r, 40), url: info.url, jpg: await b64(blob) });
        return !!(d && d.ok);
      } catch (_) { return false; }
    },
    // 어려움 모드 성공 — 체험자의 이메일 주소와 빵 사진을 제작자(서버 주인)의 메일로 보낸다
    async clear(from, blob, info) {
      try {
        const d = await post({ op: "clear", from, n: clean(info.n, 24), r: clean(info.r, 40), url: info.url, note: clean(info.note, 60), jpg: await b64(blob) });
        return !!(d && d.ok);
      } catch (_) { return false; }
    },
  };
  Log.count = Log.players.length;
  BA.Log = Log;
  Log.load();
})();
