/* =====================================================================
   FRAME-PLAYER — jaettu robotin sprite-animaatio (intro → idle → wave)
   Käyttää assets/duobotit/{intro,idle,wave}/NNN.webp -kuvasarjoja.
   Käytössä sekä sarjakuva.html:n (app.js) että index.html:n 2D-etusivun
   framePlayer-animaatiossa. EI riippuvuuksia Three.js:ään.
   ===================================================================== */

export const ANIM = {
  basePath: "assets/duobotit",
  ext: "webp",
  states: {
    intro: { count: 12, fps: 12, loop: false, next: "idle" },
    idle:  { count: 20, fps: 10, loop: true },
    wave:  { count: 14, fps: 12, loop: false, next: "idle" },
  },
};

export function framePlayer(img, opts = {}) {
  const { onStateEnd } = opts; // valinnainen: (name) => {} kutsutaan kun ei-looppaava tila (esim. "intro") päättyy
  const cache = {};
  const list = (s) => {
    if (cache[s]) return cache[s];
    const arr = [];
    for (let i = 1; i <= ANIM.states[s].count; i++)
      arr.push(`${ANIM.basePath}/${s}/${String(i).padStart(3, "0")}.${ANIM.ext}`);
    return (cache[s] = arr);
  };
  let raf = null, timer = null, state = null;
  const stop = () => { if (raf) cancelAnimationFrame(raf), raf = null; if (timer) clearTimeout(timer), timer = null; };
  function play(name) {
    state = name;
    const s = ANIM.states[name]; const frames = list(name); const interval = 1000 / s.fps;
    if (raf) cancelAnimationFrame(raf);
    let idx = 1, last = performance.now(); img.src = frames[0];
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (now - last < interval) return;
      last += interval;
      if (idx >= frames.length) {
        if (s.loop) idx = 0;
        else {
          cancelAnimationFrame(raf); raf = null;
          if (onStateEnd) onStateEnd(name);
          if (s.next) play(s.next);
          return;
        }
      }
      img.src = frames[idx]; idx++;
    };
    raf = requestAnimationFrame(tick);
    if (name === "idle") {
      const d = 2800 + Math.random() * 3200;
      timer = setTimeout(() => { if (state === "idle") set("wave"); }, d);
    }
  }
  function set(name) { if (timer) clearTimeout(timer), timer = null; state = name; play(name); }
  return { start: () => set("intro"), stop, static: () => { stop(); img.src = list("idle")[0]; } };
}
