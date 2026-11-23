// Solo v2 · 엔딩 노래 — 「효모 행진곡」
// 브라우저에서 바로 합성하는 8비트풍 곡 (파일 없음). 사각파 멜로디 + 화음 아르페지오 + 삼각파 베이스 + 잡음 드럼.
// 다장조, 분당 138박, 16마디(A A B)를 되풀이한다. 크레딧 장면에서만 흐른다. MUSIC 버튼으로 끌 수 있다.

(() => {
  "use strict";
  const { Snd } = BA;
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const hz = (n) => { const m = /^([A-G])(#?)(\d)$/.exec(n); return 440 * Math.pow(2, (NOTE[m[1]] + (m[2] ? 1 : 0) + (m[3] - 4) * 12 - 9) / 12); };
  // 한 마디 = 8분음표 8칸. "-" 는 쉼, "~" 는 앞 음을 이어 끈다
  const A = [
    ["C", "E5 G5 C6 G5 E5 G5 C6 ~"],
    ["Am", "E5 A5 C6 A5 E5 A5 B5 C6"],
    ["F", "A5 C6 F6 C6 A5 C6 F6 ~"],
    ["G", "G5 B5 D6 B5 G5 A5 B5 D6"],
  ];
  const B = [
    ["F", "C6 ~ A5 F5 A5 C6 A5 -"],
    ["G", "D6 ~ B5 G5 B5 D6 B5 -"],
    ["Em", "G5 B5 E6 ~ D6 B5 G5 -"],
    ["Am", "A5 C6 E6 ~ D6 C6 A5 -"],
    ["F", "F5 A5 C6 F6 E6 C6 A5 C6"],
    ["G", "G5 B5 D6 G6 F6 D6 B5 D6"],
    ["C", "C6 E6 G6 E6 C6 G5 E5 G5"],
    ["C", "C6 ~ - C6 C6 ~ ~ -"],
  ];
  const SONG = A.concat(A, B).map(([ch, m]) => [ch, m.split(" ")]);
  const CHORD = { C: ["C3", "E4", "G4", "C5"], Am: ["A2", "E4", "A4", "C5"], F: ["F2", "F4", "A4", "C5"], G: ["G2", "D4", "G4", "B4"], Em: ["E2", "E4", "G4", "B4"] };
  const STEP = 60 / 138 / 2;

  let bus = null, timer = 0, on = false, step = 0, nextT = 0, noiseBuf = null;
  function tone(type, f, t, dur, vol) {
    const ac = Snd.ac, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.setValueAtTime(vol * 0.7, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.03);
  }
  function drum(t, dur, vol, hp) {
    const ac = Snd.ac, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; f.type = "highpass"; f.frequency.value = hp;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t); s.stop(t + dur + 0.02);
  }
  function kick(t) {
    const ac = Snd.ac, o = ac.createOscillator(), g = ac.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.2);
  }
  function schedule() {
    const ac = Snd.ac;
    if (!on || !ac) return;
    while (nextT < ac.currentTime + 0.25) {
      const bar = SONG[Math.floor(step / 8) % SONG.length], i = step % 8, t = nextT, ch = CHORD[bar[0]], n = bar[1][i];
      if (n !== "-" && n !== "~") {                              // 멜로디 — 뒤따르는 "~" 만큼 길게
        let len = 1; while (i + len < 8 && bar[1][i + len] === "~") len++;
        tone("square", hz(n), t, STEP * len * 0.92, 0.05);
      }
      tone("triangle", hz(ch[0]) * (i % 2 ? 2 : 1), t, STEP * 0.85, 0.11);          // 통통 튀는 옥타브 베이스
      if (i % 2) tone("square", hz(ch[1 + (Math.floor(step / 2) % 3)]), t, STEP * 0.5, 0.018);   // 엇박 아르페지오
      if (i === 0 || i === 4) kick(t);
      if (i === 2 || i === 6) drum(t, 0.09, 0.07, 1800);        // 스네어
      drum(t, 0.03, 0.025, 7000);                                // 하이햇
      step++; nextT += STEP;
    }
  }
  BA.Chip = {
    start() {
      const ac = Snd.ac;
      if (on || !ac) return;
      if (!bus) {
        bus = ac.createGain(); bus.connect(Snd.master);
        noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.2), ac.sampleRate);
        const d = noiseBuf.getChannelData(0); for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
      }
      on = true; step = 0; nextT = ac.currentTime + 0.4;
      this.sync();
      timer = setInterval(schedule, 60);
    },
    stop() {
      if (!on) return;
      on = false; clearInterval(timer);
      if (bus) bus.gain.setTargetAtTime(0, Snd.ac.currentTime, 0.15);
    },
    // MUSIC 버튼 상태를 따른다
    sync() { if (bus) bus.gain.setTargetAtTime(BA.Music.on ? 0.8 : 0, Snd.ac.currentTime, 0.1); },
    get playing() { return on; },
  };
})();
