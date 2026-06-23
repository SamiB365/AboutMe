/* =====================================================================
   DUOBOTIT — sivuston pohja
   1) Intro-portti: robottianimaatio, "click me" → avaa sivun
   2) Karuselli: scrollaus kiertää kortteja putken (sylinterin) ympäri ja
      nostaa niitä tasoittain → spiraali. Alas = jo nähdyt kortit jäävät
      yläviistoon, uudet nousevat alhaalta. Lopuksi sivun pohja tulee esiin.
   3) Kortin klikkaus avaa ison näkymän (modaali).
   =====================================================================

   ====== TÄRKEIMMÄT SÄÄTÖARVOT ======
   - pixelsPerCard : kuinka paljon pitää scrollata kortista seuraavaan.
        Pienennä → kortit vaihtuvat nopeammin. Suurenna → hitaammin.
   - anglePerCard  : kuinka monta astetta kortti kiertää putkea / askel.
        Iso = jyrkempi kaari, kortit kaartuvat nopeammin sivuun.
   - levelStep     : pystyporras (px) korttien välillä – tekee spiraalin.
        Iso = jyrkempi kierreportaikko. 0 = tasainen rengas.
   - snapThreshold : kuinka lähellä keskustaa kortin pitää olla, että snap
        aktivoituu (0–0.5). Sen ulkopuolella karuselli liikkuu vapaasti.
   - snapVelocity  : alle tämän nopeuden (px/ms) snäppi sallitaan. Tätä kovempi
        vauhti → karuselli liukuu vapaasti kortin ohi snäppäämättä.
   Lisäksi CSS:n :root-muuttujat --radius (putken paksuus) ja --perspective
   (3D:n voimakkuus) säätävät ulkonäköä. (styles.css)
*/
const CONFIG = {
  pixelsPerCard: 1300,   // kuinka paljon scrollia kortista seuraavaan
  anglePerCard: 46,      // putken kierto astetta / kortti – iso = enemmän väliä, kortit näyttävät selkänsä aiemmin
  tiltPerCard: 10,       // taustakorttien YLIMÄÄRÄINEN kallistus astetta / kortti – iso = enemmän 3D-tunnelmaa (keskikortti pysyy suorassa)
  tiltMax: 34,           // kallistuksen katto astetta – ettei kaukaiset kortit käänny liikaa / katoa
  levelStep: 180,        // pystyporras (px) / kortti – tekee spiraalin (työpöytä)
  levelStepMobile: 110,  // sama mobiililla (kapea ruutu, max-width 640px) – pienempi = kortit lähempänä toisiaan
  snapThreshold: 0.26,   // snap aktivoituu vasta kun kortti on näin lähellä keskustaa (0–0.5). Pienempi = snäppää vain lähempänä
  snapVelocity: 0.5,     // px/ms – alle tämän vauhdin snäppi sallitaan; kovempi vauhti liukuu vapaasti kortin ohi
  snapEnabled: true,     // false = pelkkä liukuva scroll ilman snäppiä; true = snäppi päällä
  smoothScroll: true,    // true = oma inertia-scroll (jokainen rullaus lisää voimaa, liukuu kitkalla ohi)
  scrollForce: 0.6,      // kuinka paljon voimaa per rullaus – iso = liukuu pidemmälle
  scrollFriction: 0.965,  // kitka per frame (0–1) – lähellä 1 = liukuu kauemmin ja sulavammin
  scrollMaxSpeed: 50,    // px/frame kattonopeus, ettei yksi reilu rullaus karkaa käsistä
};

/* ====== KORTIT ======
   Lisää/poista kortteja vapaasti. Jokaisella oma kuva, otsikko ja sävy.
   img: korvaa omalla sarjakuva-/pelikuvalla. tint: hehkun väri "R,G,B".
*/
const CARDS = [
  { img: "assets/duobotit/idle/006.webp",    title: "Kortti 1",  tint: "255,120,180" },
  { img: "assets/duobotit/wave/006.webp",    title: "Kortti 2",  tint: "95,208,196"  },
  { img: "assets/duobotit/peeking/005.webp", title: "Kortti 3",  tint: "168,130,255" },
  { img: "assets/duobotit/intro/008.webp",   title: "Kortti 4",  tint: "255,178,76"  },
  { img: "assets/duobotit/idle/014.webp",    title: "Kortti 5",  tint: "120,200,255" },
  { img: "assets/duobotit/hiding/006.webp",  title: "Kortti 6",  tint: "255,150,120" },
  { img: "assets/duobotit/wave/012.webp",    title: "Kortti 7",  tint: "150,255,180" },
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------------------------------------------------------------------
   Pieni frame-soitin (introanimaatiota varten)
   --------------------------------------------------------------------- */
const ANIM = {
  basePath: "assets/duobotit",
  ext: "webp",
  states: {
    intro:   { count: 12, fps: 12, loop: false, next: "idle" },
    idle:    { count: 20, fps: 10, loop: true },
    wave:    { count: 14, fps: 12, loop: false, next: "idle" },
  },
};
function framePlayer(img) {
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
      if (idx >= frames.length) { if (s.loop) idx = 0; else { cancelAnimationFrame(raf); raf = null; if (s.next) play(s.next); return; } }
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

/* ---------------------------------------------------------------------
   Käynnistys
   --------------------------------------------------------------------- */
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (reduce) document.body.classList.add("reduced");

// Kosketuslaite (mobiili/tabletti): snäppi pois käytöstä — natiivi kosketus-
// liuku tuntuu paremmalta ilman snäppiä. Vain hiirellä/levyllä snäppi käytössä.
const isTouch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;

// Kapea ruutu = mobiili: käytetään CONFIG.levelStepMobile (kortit lähempänä).
const mobileMq = window.matchMedia("(max-width: 640px)");

/* ----- KORTTIEN LUONTI ----- */
const ring = document.getElementById("ring");
CARDS.forEach((c, i) => {
  const slot = document.createElement("div");
  slot.className = "slot";

  const card = document.createElement("button");
  card.className = "card";
  card.type = "button";
  card.style.setProperty("--tint", c.tint);
  card.style.setProperty("--focus", i === 0 ? "1" : "0");
  card.setAttribute("aria-label", c.title);
  // Litteä 2D-kortti: vain etu- ja takapinta (ei paksuutta / ekstruusiota).
  card.innerHTML =
    `<span class="card-face card-back" aria-hidden="true"></span>` +
    `<span class="card-face card-front">` +
      `<img class="card-img" src="${c.img}" alt="" />` +
      `<span class="card-title">${c.title}</span>` +
    `</span>`;
  card.addEventListener("click", (ev) => {
    // Avaa vain kun kortin ETUPUOLI on kameraan päin. Jos kortti on kääntynyt
    // selkä edellä (yli 90°), klikkaus ei tee mitään.
    const angle = parseFloat(slot.style.getPropertyValue("--angle")) || 0;
    const tilt = parseFloat(card.style.getPropertyValue("--tilt")) || 0;
    const a = (((angle + tilt) % 360) + 360) % 360;   // 0–360°
    const frontFacing = a < 90 || a > 270;
    if (!frontFacing) return;
    openModal(c, card, ev);
  });

  slot.appendChild(card);
  ring.appendChild(slot);
});
const slots = Array.from(ring.children);

/* (scroll-snap hoidetaan nyt JS:llä — ks. snapToNearest alempana) */

/* ----- SCROLL → KARUSELLIN PYÖRITYS ----- */
const track = document.getElementById("track");
const scrollHint = document.getElementById("scrollHint");

function layout() {
  if (reduce) { track.style.height = ""; return; }
  const span = (CARDS.length - 1) * CONFIG.pixelsPerCard;
  track.style.height = span + window.innerHeight + "px";
}

function update() {
  if (reduce) return;
  const rect = track.getBoundingClientRect();
  const trackTop = window.scrollY + rect.top;
  const scrollable = track.offsetHeight - window.innerHeight;
  const p = clamp((window.scrollY - trackTop) / scrollable, 0, 1);
  const t = p * (CARDS.length - 1);

  // Kapealla ruudulla (mobiili) pienempi pystyporras → kortit lähempänä.
  const levelStep = mobileMq.matches ? CONFIG.levelStepMobile : CONFIG.levelStep;

  slots.forEach((slot, i) => {
    const off = i - t;                       // <0 = jo nähty (yläviistoon), >0 = tuleva (alhaalta)
    slot.style.setProperty("--angle", off * CONFIG.anglePerCard + "deg");
    slot.style.setProperty("--level", off * levelStep + "px");
    const d = Math.abs(off);
    // Taustakorttien ylimääräinen kallistus → enemmän 3D-tunnelmaa. off=0 (keski) → 0°.
    const tilt = clamp(off * CONFIG.tiltPerCard, -CONFIG.tiltMax, CONFIG.tiltMax);
    slot.firstElementChild.style.setProperty("--tilt", tilt + "deg");
    slot.firstElementChild.style.setProperty("--focus", String(Math.max(0, 1 - Math.min(d, 3.5) / 3.5)));
    // Hohto vain kun ETUPUOLI on kameraan päin – selkä edellä (yli 90°) ei hohda.
    const a = (((off * CONFIG.anglePerCard + tilt) % 360) + 360) % 360;
    slot.firstElementChild.style.setProperty("--face", a < 90 || a > 270 ? "1" : "0");
  });

  if (scrollHint) scrollHint.style.opacity = window.scrollY > 60 ? "0" : "";
}

let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => { update(); ticking = false; });
}
window.addEventListener("scroll", onScroll, { passive: true });
window.addEventListener("resize", () => { layout(); update(); });

/* ---------------------------------------------------------------------
   INERTIA / MOMENTUM -SCROLL (wheel)
   Jokainen rullaus lisää NOPEUTTA (voimaa), jota kitka hidastaa joka framella.
   Näin liike liukuu sulavasti kortin ohi sen sijaan että siirtäisi kiinteän
   määrän per rullaus. Vain hiiren/levyn wheel; kosketus käyttää natiivia liukua.
   --------------------------------------------------------------------- */
let glideVel = 0;                 // nykyinen scroll-nopeus (px/frame)
let glidePos = window.scrollY;    // tavoiteltava scroll-sijainti
let glideRAF = null;
const maxScroll = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

function glideStep() {
  glideVel *= CONFIG.scrollFriction;          // kitka hidastaa
  glidePos += glideVel;
  const max = maxScroll();
  if (glidePos <= 0)   { glidePos = 0;   glideVel = 0; }
  if (glidePos >= max) { glidePos = max; glideVel = 0; }
  window.scrollTo(0, glidePos);
  if (Math.abs(glideVel) > 0.4) glideRAF = requestAnimationFrame(glideStep);
  else glideRAF = null;
}

function onWheel(e) {
  if (!CONFIG.smoothScroll || reduce) return;
  e.preventDefault();                         // korvataan natiivi wheel-scroll
  if (!glideRAF) glidePos = window.scrollY;    // aloita nykyisestä sijainnista
  let dy = e.deltaY;
  if (e.deltaMode === 1) dy *= 16;             // rivit → pikselit
  else if (e.deltaMode === 2) dy *= window.innerHeight; // sivut → pikselit
  glideVel += dy * CONFIG.scrollForce;         // lisää voimaa
  glideVel = clamp(glideVel, -CONFIG.scrollMaxSpeed, CONFIG.scrollMaxSpeed);
  if (!glideRAF) glideRAF = requestAnimationFrame(glideStep);
}
window.addEventListener("wheel", onWheel, { passive: false });

/* ---------------------------------------------------------------------
   PEHMEÄ SNAP (JS)
   Kun scrollaus pysähtyy, lasketaan lähin kortti ja liu'utetaan se
   TÄSMÄLLEEN keskelle (samaan pisteeseen missä pyörähdys = 0).
   --------------------------------------------------------------------- */
let snapRAF = null, isSnapping = false, snapTimer = null;

function cancelSnap() {
  if (snapRAF) { cancelAnimationFrame(snapRAF); snapRAF = null; }
  isSnapping = false;
}
function animateScrollTo(target, dur = 480) {
  cancelSnap();
  if (glideRAF) { cancelAnimationFrame(glideRAF); glideRAF = null; }  // pysäytä inertia-liuku
  glideVel = 0;
  const start = window.scrollY, dist = target - start;
  if (Math.abs(dist) < 1) return;
  const t0 = performance.now();
  isSnapping = true;
  const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
  const step = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    window.scrollTo(0, start + dist * ease(p));
    if (p < 1) snapRAF = requestAnimationFrame(step);
    else { snapRAF = null; isSnapping = false; }
  };
  snapRAF = requestAnimationFrame(step);
}
function snapToNearest() {
  if (reduce || isSnapping) return;
  const rect = track.getBoundingClientRect();
  const trackTop = window.scrollY + rect.top;
  const scrollable = track.offsetHeight - window.innerHeight;
  const rel = window.scrollY - trackTop;
  if (rel < -40 || rel > scrollable + 40) return;   // karusellin ulkopuolella → ei snappia
  const t = rel / CONFIG.pixelsPerCard;
  const k = clamp(Math.round(t), 0, CARDS.length - 1);
  // snap vain jos lähin kortti on jo lähellä keskustaa – muuten liikkuu vapaasti
  if (Math.abs(t - k) > CONFIG.snapThreshold) return;
  animateScrollTo(trackTop + k * CONFIG.pixelsPerCard);
}

/* käyttäjän oma scrollaus keskeyttää snapin (saa ohjata vapaasti) */
["wheel", "touchstart", "keydown"].forEach((ev) =>
  window.addEventListener(ev, cancelSnap, { passive: true })
);

/* ----- VAUHDIN SEURANTA -----
   Mitataan scrollin hetkellinen nopeus (px/ms). Snäppi sallitaan vain kun
   vauhti on pudonnut alle snapVelocity-rajan — kovaa liikkuessa kortin ohi
   ei tartuta, vaan karuselli liukuu vapaasti. */
let lastY = window.scrollY, lastT = performance.now();
let velocity = 0;     // px/ms (etumerkillinen, pehmennetty)
function trackVelocity() {
  const now = performance.now();
  const dt = Math.max(1, now - lastT);
  const v = (window.scrollY - lastY) / dt;
  velocity = velocity * 0.6 + v * 0.4;     // pehmennys, vaimentaa piikit
  lastY = window.scrollY;
  lastT = now;
}

/* Yritä snäpätä: snapToNearest tarkistaa että kortti on tarpeeksi lähellä keskustaa. */
function attemptSnap() {
  if (reduce || isTouch || isSnapping || !CONFIG.snapEnabled) return;
  velocity = 0;
  snapToNearest();
}

window.addEventListener("scroll", () => {
  if (isSnapping) return;
  trackVelocity();
  // Vauhti jo hidas → snäppää (ei odoteta täyttä pysähdystä).
  // Vauhti yhä kova → ei snappia, liukuu vapaasti kortin ohi.
  if (Math.abs(velocity) < CONFIG.snapVelocity) attemptSnap();
  clearTimeout(snapTimer);
  snapTimer = setTimeout(attemptSnap, 120);   // varmistus kun scroll pysähtyy kokonaan
}, { passive: true });

/* ---------------------------------------------------------------------
   Intro-portti
   --------------------------------------------------------------------- */
const intro = document.getElementById("intro");
const introBtn = document.getElementById("introBtn");
const player = framePlayer(document.getElementById("introFrame"));

document.body.classList.add("intro-active");
if (reduce) player.static(); else player.start();

function enterSite() {
  player.stop();
  document.body.classList.remove("intro-active");
  document.body.classList.add("entered");
  intro.setAttribute("hidden", "");
  layout(); update();
  window.scrollTo(0, 0);
}
introBtn.addEventListener("click", enterSite);

/* ---------------------------------------------------------------------
   Modaali: kortti kasvaa → sukellus VESIPORTAALIN läpi → maailma (sarjakuva)

   Vaiheet:
   1) Klikatusta kortista tehdään klooni (.zoomer), joka kasvaa täyteen ruutuun.
   2) Zoomin loppupuolella avautuu pyöreä "vesiportaali" klikkauskohdasta:
      .world-maski (--rip) kasvaa, SVG-suodatin (#waterRipple) taittaa reunaa
      kuin vedenpinta, ja valonvälähdys leimahtaa. Portaalin alta paljastuu
      maailma (hero-kuva + webtoon-tyyliset sarjakuvaruudut).
   --------------------------------------------------------------------- */
const modal = document.getElementById("modal");
const modalClose = document.getElementById("modalClose");
const worldEl = document.getElementById("world");
const dispEl = document.getElementById("fxDisp");   // feDisplacementMap (vesivääristymä)
const turbEl = document.getElementById("fxTurb");   // feTurbulence (kohina)
let modalSource = null;     // klikattu kortti-elementti
let activeZoomer = null;    // kasvatettu kortin klooni
let diveTimer = null;       // ajastin: koska sukellus alkaa
let portalRAF = null;       // portaalianimaation rAF-id
let diveFallback = null;    // varmistusajastin jos rAF ei pyöri (tausta-välilehti)

/* ----- PLACEHOLDER-MAAILMA -----
   Rakennetaan toistaiseksi nykyisistä robottikuvista. Korvaa antamalla
   kortille oma world-objekti: { cover, title, theme, panels:[{img,text}] }. */
const IMG_POOL = CARDS.map((c) => c.img);
function placeholderWorld(card) {
  const i = Math.max(0, CARDS.indexOf(card));
  const pick = (n) => IMG_POOL[(((i + n) % IMG_POOL.length) + IMG_POOL.length) % IMG_POOL.length];
  return {
    cover: card.img,
    title: card.title,
    theme: card.tint,
    panels: [
      { img: pick(0), text: "Tähän tulee sarjakuvan ensimmäinen ruutu. (placeholder)" },
      { img: pick(1), text: "Toinen ruutu – korvaa oikealla kuvalla ja tekstillä." },
      { img: pick(2), text: "Kolmas ruutu. Lisää ruutuja kortin world.panels-taulukkoon." },
      { img: pick(3), text: "Neljäs ruutu. Pystyscroll = webtoon-tyylinen sarjakuva." },
    ],
  };
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Rakentaa maailman sisällön (hero + sarjakuvaruudut) modaaliin.
function buildWorld(world) {
  worldEl.style.setProperty("--world-theme", world.theme || "120,200,255");
  const hero =
    `<div class="world-hero" style="background-image:url('${encodeURI(world.cover)}')">` +
      `<h2 class="world-title">${escapeHtml(world.title || "")}</h2>` +
      `<span class="world-cue">selaa ↓</span>` +
    `</div>`;
  const panels = (world.panels || [])
    .map(
      (p) =>
        `<figure class="panel"><img src="${encodeURI(p.img)}" alt="" loading="lazy">` +
        (p.text ? `<figcaption class="panel-text">${escapeHtml(p.text)}</figcaption>` : "") +
        `</figure>`
    )
    .join("");
  worldEl.innerHTML = `<div class="world-scroll">${hero}${panels}</div>`;
  worldEl.scrollTop = 0;
  observePanels();
}

// Sarjakuvaruudut feidaavat sisään, kun ne tulevat näkyviin (webtoon).
let panelObserver = null;
function observePanels() {
  const panels = worldEl.querySelectorAll(".panel");
  if (reduce) { panels.forEach((p) => p.classList.add("in")); return; }
  if (panelObserver) panelObserver.disconnect();
  panelObserver = new IntersectionObserver(
    (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("in"); }),
    { root: worldEl, threshold: 0.15 }
  );
  panels.forEach((p) => panelObserver.observe(p));
}

// Muunnos, joka vie kortin sen nykyiseltä paikalta täyteen ruutuun (keskelle).
function zoomTransform(src) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Kasvatetaan niin että kortti täyttää ruudun (mobiilissa reunasta reunaan).
  const scale = Math.max(vw / src.width, (vh * 0.98) / src.height);
  const dx = vw / 2 - (src.left + src.width / 2);
  const dy = vh / 2 - (src.top + src.height / 2);
  return `translate(${dx}px, ${dy}px) scale(${scale})`;
}

function openModal(card, sourceEl, ev) {
  modalSource = sourceEl || null;
  const world = card.world || placeholderWorld(card);
  buildWorld(world);

  modal.hidden = false;
  document.body.classList.add("modal-open");   // karuselli vetäytyy taustalle
  requestAnimationFrame(() => modal.classList.add("open"));   // tausta + sulkunappi esiin

  // Portaalin keskipiste = klikkauskohta (fallback: ruudun keskus).
  const px = ev && ev.clientX ? ev.clientX : window.innerWidth / 2;
  const py = ev && ev.clientY ? ev.clientY : window.innerHeight / 2;
  modal.style.setProperty("--px", px + "px");
  modal.style.setProperty("--py", py + "px");

  // Ilman animaatiota (reduced motion / ei lähde-elementtiä): näytä maailma suoraan.
  if (!modalSource || reduce) {
    worldEl.style.opacity = "1";
    worldEl.style.webkitMaskImage = "none";
    worldEl.style.maskImage = "none";
    modal.classList.add("opened");
    modalClose.focus();
    return;
  }

  // Vaihe 1: kortin klooni kasvaa täyteen ruutuun.
  const src = modalSource.getBoundingClientRect();
  const z = document.createElement("div");
  z.className = "zoomer";
  z.style.cssText = `left:${src.left}px;top:${src.top}px;width:${src.width}px;height:${src.height}px;`;
  z.innerHTML = `<img src="${encodeURI(card.img)}" alt="">`;
  modal.appendChild(z);
  activeZoomer = z;
  z.getBoundingClientRect();                 // pakota reflow
  z.style.transition =
    "transform 0.62s cubic-bezier(0.4, 0, 0.2, 1), border-radius 0.5s ease";
  z.style.transform = zoomTransform(src);
  z.style.borderRadius = "0px";

  // Vaihe 2: sukellus kortin läpi (~zoomin loppupuolella).
  diveTimer = window.setTimeout(startDive, 430);
  modalClose.focus();
}

// Vaihe 2: vesiportaali avautuu klikkauskohdasta ja paljastaa maailman.
function startDive() {
  diveTimer = null;
  worldEl.style.opacity = "1";                 // näkyy portaalin maskin läpi
  worldEl.style.filter = "url(#waterRipple)";  // vesimäinen taittuma reunaan
  modal.classList.add("diving");               // valonvälähdys

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    if (portalRAF) { cancelAnimationFrame(portalRAF); portalRAF = null; }
    if (diveFallback) { clearTimeout(diveFallback); diveFallback = null; }
    // Valmis → poista raskaat efektit ja jätä selattava maailma.
    worldEl.style.filter = "";
    worldEl.style.webkitMaskImage = "none";
    worldEl.style.maskImage = "none";
    modal.classList.remove("diving");
    modal.classList.add("opened");
    if (activeZoomer) { activeZoomer.remove(); activeZoomer = null; }
  };
  animatePortal(finish);
  // Varmistus: jos rAF ei pyöri (esim. tausta-välilehti), avaa silti.
  diveFallback = window.setTimeout(finish, 720 + 300);
}

// Animoi portaalin säteen (--rip) + vesivääristymän (rAF, ~0.72 s).
function animatePortal(onDone) {
  const DUR = 720;
  const start = performance.now();
  // Maskiympyrän loppusäde: ruudun lävistäjä (+ marginaali) → peittää koko ruudun.
  const target = Math.hypot(window.innerWidth, window.innerHeight) * 1.1;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  function frame(now) {
    const t = Math.min(1, (now - start) / DUR);
    const e = easeOut(t);
    worldEl.style.setProperty("--rip", (e * target).toFixed(1) + "px");
    if (dispEl) dispEl.setAttribute("scale", ((1 - e) * 38).toFixed(1));   // taittuma laantuu
    if (turbEl) {
      const bf = 0.01 + (1 - e) * 0.016;   // kohina hieman tihenee → laantuu
      turbEl.setAttribute("baseFrequency", bf.toFixed(4) + " " + (bf * 1.6).toFixed(4));
    }
    if (t < 1) portalRAF = requestAnimationFrame(frame);
    else { portalRAF = null; if (onDone) onDone(); }
  }
  portalRAF = requestAnimationFrame(frame);
}

function closeModal() {
  if (diveTimer) { clearTimeout(diveTimer); diveTimer = null; }
  if (diveFallback) { clearTimeout(diveFallback); diveFallback = null; }
  if (portalRAF) { cancelAnimationFrame(portalRAF); portalRAF = null; }
  modal.classList.remove("open", "diving", "opened");
  document.body.classList.remove("modal-open");   // karuselli palaa
  if (activeZoomer) { activeZoomer.remove(); activeZoomer = null; }

  // Maailma feidaa pois, sitten modaali piiloon ja tilat nollataan.
  worldEl.style.transition = "opacity 0.4s ease";
  worldEl.style.opacity = "0";
  window.setTimeout(() => {
    modal.hidden = true;
    if (panelObserver) { panelObserver.disconnect(); panelObserver = null; }
    worldEl.style.cssText = "";   // nollaa maski/opacity/suodatin/--rip seuraavaa avausta varten
    worldEl.innerHTML = "";
    if (dispEl) dispEl.setAttribute("scale", "0");
  }, 460);
  modalSource = null;
}
document.getElementById("modalClose").addEventListener("click", closeModal);
modal.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closeModal));
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeModal(); });

/* alkutila */
layout();
update();
