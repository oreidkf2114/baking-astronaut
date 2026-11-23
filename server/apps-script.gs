// Baking Astronaut — 체험자 기록 · 참여 인원 · 이메일 발송 (Google Apps Script)
// 설치 방법은 같은 폴더의 README.md.
//
// 이 스크립트가 붙은 구글 시트가 곧 관리자 화면이다: "players" 시트의 행 수 = 참여 인원.
// 저장하는 것: 시각 · 이름 · 군집 번호 · 레시피 이름 · 난이도.   저장하지 않는 것: 얼굴, 이메일 주소.
// 어려움 모드 성공자가 "제작자에게 알리기"를 누르면, 그 사람의 주소와 빵 사진이 이 스크립트 주인의 메일함으로 온다.

const SITE = "https://oreidkf2114.github.io/baking-astronaut/";  // 메일 본문에 넣어도 되는 링크의 앞부분
const SHEET = "players";
const DAILY_MAIL_LIMIT = 80;      // 하루 발송 상한 (개인 구글 계정의 한도는 하루 100통)
const MAX_JPG_CHARS = 2500000;    // 첨부 사진 base64 길이 상한 (약 1.8MB)

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) { sh = ss.insertSheet(SHEET); sh.appendRow(["시각", "이름", "군집", "레시피", "난이도"]); }
  return sh;
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
// 한 줄 문자열로 자르고, 시트가 수식으로 읽지 않게 한다
function text_(v, n) {
  const s = String(v == null ? "" : v).replace(/[\r\n\t]+/g, " ").slice(0, n);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

// GET — 총 인원 + 최근 60명 (크레딧에 지나가는 체험자 효모들)
function doGet() {
  const sh = sheet_(), n = Math.max(0, sh.getLastRow() - 1), take = Math.min(n, 60);
  const rows = take ? sh.getRange(n - take + 2, 1, take, 5).getValues() : [];
  return out_({ ok: true, count: n, players: rows.map(function (r) { return { ts: new Date(r[0]).getTime(), n: String(r[1]), c: String(r[2]), r: String(r[3]), m: String(r[4]) }; }) });
}

// POST — { op: "log", n, c, r, m } · { op: "mail", to, n, r, url, jpg } · { op: "clear", from, n, r, url, note, jpg }
function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (_) { return out_({ ok: false, error: "bad json" }); }

  if (d.op === "log") {
    const lock = LockService.getScriptLock(); lock.waitLock(10000);
    try { sheet_().appendRow([new Date(), text_(d.n, 24), text_(d.c, 6), text_(d.r, 40), text_(d.m, 8)]); } finally { lock.releaseLock(); }
    return out_({ ok: true });
  }

  if (d.op === "mail" || d.op === "clear") {
    const clear = d.op === "clear";
    const to = String((clear ? d.from : d.to) || "").trim();
    if (to.length > 120 || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]{2,}$/.test(to)) return out_({ ok: false, error: "bad address" });
    const jpg = String(d.jpg || "");
    if (!jpg || jpg.length > MAX_JPG_CHARS) return out_({ ok: false, error: "bad image" });
    // 하루 발송 상한 — 누군가 이 주소를 스팸 발송에 쓰지 못하게 한다
    const props = PropertiesService.getScriptProperties(), key = "mail-" + Utilities.formatDate(new Date(), "Asia/Seoul", "yyyyMMdd");
    const lock = LockService.getScriptLock(); lock.waitLock(10000);
    let sent;
    try { sent = Number(props.getProperty(key)) || 0; if (sent < DAILY_MAIL_LIMIT) props.setProperty(key, String(sent + 1)); } finally { lock.releaseLock(); }
    if (sent >= DAILY_MAIL_LIMIT) return out_({ ok: false, error: "daily limit" });

    const name = text_(d.n, 24).replace(/^'/, ""), recipe = text_(d.r, 40).replace(/^'/, "");
    const link = String(d.url || "").indexOf(SITE) === 0 && String(d.url).length < 900 ? String(d.url) : SITE;
    if (clear) {
      // 어려움 모드 성공 알림 — 받는 사람은 언제나 이 스크립트의 주인. 답장을 누르면 체험자에게 간다
      MailApp.sendEmail({
        to: Session.getEffectiveUser().getEmail(),
        replyTo: to,
        name: "Baking Astronaut",
        subject: "[Baking Astronaut] 어려움 모드 성공 — " + name,
        body: name + " 님이 어려움 모드를 통과했습니다.\n\n"
          + "연락받을 주소: " + to + "\n레시피: " + recipe + "\n" + text_(d.note, 60).replace(/^'/, "") + "\n레시피 열기: " + link + "\n\n"
          + "이 메일에 답장하면 위 주소로 갑니다.\n"
          + "※ 성공 여부는 방문자의 브라우저가 보낸 값이라 위조될 수 있습니다.",
        attachments: [Utilities.newBlob(Utilities.base64Decode(jpg), "image/jpeg", "baking-astronaut.jpg")],
      });
      return out_({ ok: true });
    }
    // 본문은 고정 문장 — 보내는 쪽이 마음대로 쓸 수 있는 건 이름(24자)과 레시피 이름(40자)뿐이다
    MailApp.sendEmail({
      to: to,
      name: "Baking Astronaut",
      subject: "[Baking Astronaut] " + recipe,
      body: name + " 님이 효모에게서 받아 와 구운 빵 「" + recipe + "」 입니다.\n\n"
        + "레시피 카드는 첨부한 사진에 있습니다.\n레시피 다시 열기: " + link + "\n\n"
        + "— 공연은 당신의 부엌에서 계속된다.",
      attachments: [Utilities.newBlob(Utilities.base64Decode(jpg), "image/jpeg", "baking-astronaut.jpg")],
    });
    return out_({ ok: true });
  }
  return out_({ ok: false, error: "unknown op" });
}
