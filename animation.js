/* =====================================================================
   DUOBOTIT — frame-animaatio + tilakone
   ---------------------------------------------------------------------
   Kuvapaikkaan vaihtuu framet järjestyksessä. Jokainen tila on oma
   kuvasarja kansiossa assets/duobotit/<tila>/ (001.webp, 002.webp, ...).

   Vaihtaaksesi omat kuvat:
     1) Korvaa kansion kuvat (sama nimeämistapa: 001, 002, 003 ...).
     2) Jos framejen MÄÄRÄ muuttuu, päivitä alla 'count'.
     3) 'fps' = nopeus (frames/sekunti). 'loop' = jääkö pyörimään.
   Käytä mieluiten .webp (läpinäkyvyys + pieni koko). Jos käytät .png,
   vaihda CONFIG.ext arvoksi "png".
   ===================================================================== */

const CONFIG = {
  basePath: "assets/duobotit",
  ext: "webp",
  states: {
    intro:   { count: 12, fps: 12, loop: false, next: "idle" },
    idle:    { count: 20, fps: 10, loop: true },
    wave:    { count: 14, fps: 12, loop: false, next: "idle" },
    hiding:  { count: 8,  fps: 14, loop: false, next: "hidden" },
    peeking: { count: 10, fps: 12, loop: false, next: "intro" },
  },
  hiddenPauseMs: 900,   // kauanko piilossa ennen kurkkausta
  waveDelayMin: 2800,   // satunnaisen heilautuksen väli (idle-tilassa)
  waveDelayMax: 6000,
};

/* --------------------------- frame-soitin --------------------------- */
const player = {
  img: document.getElementById("frame"),
  raf: null,
  srcs: {},
  pad(n) { return String(n).padStart(3, "0"); },

  list(state) {
    if (this.srcs[state]) return this.srcs[state];
    const s = CONFIG.states[state];
    const arr = [];
    for (let i = 1; i <= s.count; i++) {
      arr.push(`${CONFIG.basePath}/${state}/${this.pad(i)}.${CONFIG.ext}`);
    }
    this.srcs[state] = arr;
    return arr;
  },

  preload(state) {
    this.list(state).forEach((url) => { const im = new Image(); im.src = url; });
  },

  stop() {
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
  },

  play(state, { onDone, onLoop } = {}) {
    const s = CONFIG.states[state];
    const frames = this.list(state);
    const interval = 1000 / s.fps;
    this.stop();

    let idx = 0;
    let last = performance.now();
    this.img.src = frames[0];
    idx = 1;

    const tick = (now) => {
      this.raf = requestAnimationFrame(tick);
      if (now - last < interval) return;
      last += interval;
      if (idx >= frames.length) {
        if (s.loop) { idx = 0; if (onLoop) onLoop(); }
        else { this.stop(); if (onDone) onDone(); return; }
      }
      this.img.src = frames[idx];
      idx++;
    };
    this.raf = requestAnimationFrame(tick);
  },
};

/* näytä vihje jos kuvat puuttuvat */
player.img.addEventListener("error", () => {
  document.body.classList.add("frames-missing-on");
}, { once: true });

/* ---------------------------- tilakone ------------------------------ */
let state = null;
let timer = null;

function clearTimer() { if (timer) { clearTimeout(timer); timer = null; } }

function setState(name) {
  clearTimer();
  state = name;
  document.body.dataset.state = name;

  // "hidden" on pelkkä tauko — viimeinen hiding-frame jää näkyviin
  if (name === "hidden") {
    timer = setTimeout(() => setState("peeking"), CONFIG.hiddenPauseMs);
    return;
  }

  const s = CONFIG.states[name];
  player.play(name, { onDone: () => { if (s.next) setState(s.next); } });

  if (name === "idle") scheduleWave();
}

function scheduleWave() {
  const d = CONFIG.waveDelayMin + Math.random() * (CONFIG.waveDelayMax - CONFIG.waveDelayMin);
  timer = setTimeout(() => { if (state === "idle") setState("wave"); }, d);
}

/* klikkaus kuvaan piilottaa hahmot — toimii vain kun ne ovat esillä */
function triggerHide() {
  if (state === "idle" || state === "wave") setState("hiding");
}
const stageEl = document.getElementById("stage");
stageEl.addEventListener("click", triggerHide);
stageEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    triggerHide();
  }
});

/* ------------------------------ käynnistys -------------------------- */
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (reduce) {
  // liike-efektit pois: näytä yksi staattinen ruutu + "click here"
  document.body.dataset.state = "idle";
  player.img.src = player.list("idle")[0];
} else {
  // aloitus: kurkkaus → intro → idle (sama kuin loopin muut kierrokset)
  player.preload("peeking");
  player.preload("intro");
  player.preload("idle");
  setTimeout(() => setState("peeking"), 400);
  // loput taustalla
  ["wave", "hiding"].forEach((s) => player.preload(s));
}
