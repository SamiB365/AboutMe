/* =====================================================================
   DUOBOTIT — WebGL-sivusto (Three.js)
   ---------------------------------------------------------------------
   Aito 3D-kokemus työpöytäselaimelle:
   1) Intro-portti (robottianimaatio, "click me") → kamera lentää sisään
   2) Karuselli = kaarevat kortit sylinterin kehällä, scroll pyörittää
   3) Parallaksi-kamera (hiiri) + bloom + kromaattinen aberraatio + grain
   4) Hiukkaskenttä taustalla → syvyys ja liike
   5) Kortin klikkaus → SUKELLUS kortin läpi (refraktio + välähdys) →
      avautuu sarjakuvamaailma (DOM, webtoon-pystyscroll)

   Ulkoiset riippuvuudet: VAIN three (CDN, importmap index.html:ssä).
   Ei buildiä. Suunniteltu työpöydälle.
   ===================================================================== */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

/* ====== TÄRKEIMMÄT SÄÄDÖT ====== */
const CONFIG = {
  radius: 6.8,          // putken säde (isompi → loivempi kaari, enemmän kortteja näkyvissä)
  anglePerCard: 28,     // astetta korttien välillä kehällä
  helix: 1.1,           // pystyporras / kortti ≈ 1/3 kortin korkeudesta (selvä spiraali)
  cameraZ: 13.0,        // kameran lepoetäisyys (taempana → isompi rengas mahtuu)
  cameraEnterZ: 21,     // mistä kamera lentää sisään introssa
  fov: 55,
  scrollSensitivity: 0.0017, // wheel → karusellin pyöritys
  scrollEase: 0.085,    // kuinka nopeasti nykyinen indeksi seuraa tavoitetta
  snapDelay: 150,       // ms scrollin jälkeen ennen snäppiä lähimpään korttiin
  parallax: 0.9,        // hiiriparallaksin voimakkuus (kamera)
  // bloom hillitymmäksi: pienempi voimakkuus + korkeampi kynnys → ei isoa hehkua keskelle
  bloom: { strength: 0.32, radius: 0.6, threshold: 0.85 },
  card: { w: 2.7, h: 3.5, corner: 0.22, depth: 0.42, // kortin koko + kulman pyöristys + PAKSUUS (3D)
    frame: { width: 0.09, glow: 0.6, hoverGlow: 2.6, metalness: 0.9, roughness: 0.25 } }, // hohtava kehys + hover-hehku
  // DIGITAALINEN PIIRILEVYPUU keskellä (kortit kiertävät sitä)
  tree: {
    enabled: true,
    baseY: -4.5,         // rungan tyven korkeus (kasvaa tästä ylöspäin)
    trunkH: 2.6,         // rungon korkeus ennen ensimmäistä haaraa
    depth: 5,            // rekursion syvyys (haarautumiskerrat)
    branches: 2,         // lapsia per haara
    segLen: 1.3,         // perussegmentin pituus
    shrink: 0.78,        // pituus kutistuu per syvyys
    spread: 2.0,         // vaakalevitys (90° mutkat)
    spreadX: 1.35,       // X-painotus (näytöllä leveämpi → näkyy korttien ympärillä)
    depthZ: 1.0,         // kuinka paljon haarat leviävät Z-syvyyteen (→ 3D joka kulmasta)
    color: "120,210,255",     // syaani-sininen trace
    nodeColor: "190,235,255", // hohtavat solmut
    packetColor: "210,245,255", // datapaketit (kirkkaat)
    width: 0.06,         // trace-paksuus (world-yksikötä)
    glow: 1.7,           // trace-värin kirkkaus (→ bloom)
    nodeGlow: 1.15,      // solmujen kirkkaus (pieni → ei sokaise bloomissa)
    scale: 1.5,          // koko (latva nousee korttien yläpuolelle)
    rotSpeed: 0.06,      // hidas pyörintä (paljastaa 3D-syvyyden)
    packets: 30,         // datapakettien määrä
    packetSpeed: 0.55,   // datan virtausnopeus
    seed: 7,             // satunnaissiemen (vakaa puu reloadissa)
  },
  exposure: 1.12,
};

/* ====== KORTIT ====== */
const CARDS = [
  { img: "assets/duobotit/idle/006.webp",    title: "Tekninen tuki",     tint: "255,120,180" },
  { img: "assets/duobotit/wave/006.webp",    title: "Ohjelmistokehitys", tint: "95,208,196"  },
  { img: "assets/duobotit/peeking/005.webp", title: "Pelit",             tint: "168,130,255" },
  { img: "assets/duobotit/intro/008.webp",   title: "Sarjakuva",         tint: "255,178,76"  },
  { img: "assets/duobotit/idle/014.webp",    title: "Automaatio",        tint: "120,200,255" },
  { img: "assets/duobotit/hiding/006.webp",  title: "Konsultointi",      tint: "255,150,120" },
  { img: "assets/duobotit/wave/012.webp",    title: "Yhteistyö",         tint: "150,255,180" },
];

/* ====== INTRO-ANIMAATIO (robotin frame-soitin, DOM) ====== */
const ANIM = {
  basePath: "assets/duobotit",
  ext: "webp",
  states: {
    intro: { count: 12, fps: 12, loop: false, next: "idle" },
    idle:  { count: 20, fps: 10, loop: true },
    wave:  { count: 14, fps: 12, loop: false, next: "idle" },
  },
};

/* ====== PIKKU-APURIT ====== */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);
const easeOutExpo = (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));
const easeInOut = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

// Pieni tween-apuri (ei ulkoista kirjastoa).
function tween({ dur = 1000, ease = easeOutCubic, onUpdate, onDone }) {
  const t0 = performance.now();
  let raf;
  const step = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    const e = ease(p);
    if (onUpdate) onUpdate(e, p);
    if (p < 1) raf = requestAnimationFrame(step);
    else if (onDone) onDone();
  };
  raf = requestAnimationFrame(step);
  return () => raf && cancelAnimationFrame(raf);
}

// sRGB-värimuunnos (raakashaderit tarvitsevat lineaariset värit).
function colHex(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }
function colRGB255(str) {
  const [r, g, b] = str.split(",").map((n) => parseFloat(n) / 255);
  return new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
}

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* =====================================================================
   1) LATAUS — esiladataan korttikuvat + introframet, näytetään palkki
   ===================================================================== */
const loaderEl = document.getElementById("loader");
const loaderFill = document.getElementById("loaderFill");

function preload() {
  const introUrls = [];
  for (const s of ["intro", "idle"]) {
    for (let i = 1; i <= ANIM.states[s].count; i++)
      introUrls.push(`${ANIM.basePath}/${s}/${String(i).padStart(3, "0")}.${ANIM.ext}`);
  }
  const cardUrls = CARDS.map((c) => c.img);
  const all = [...cardUrls, ...introUrls];
  let done = 0;
  const texLoader = new THREE.TextureLoader();
  const cardTextures = {};

  return new Promise((resolve) => {
    const bump = () => {
      done++;
      if (loaderFill) loaderFill.style.width = Math.round((done / all.length) * 100) + "%";
      if (done >= all.length) resolve(cardTextures);
    };
    // Korttikuvat → Three-tekstuureiksi
    cardUrls.forEach((url) => {
      texLoader.load(
        url,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 8;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.generateMipmaps = true;
          cardTextures[url] = tex;
          bump();
        },
        undefined,
        bump // virhe → jatka silti
      );
    });
    // Introframet → selaimen kuvavälimuistiin
    introUrls.forEach((url) => {
      const img = new Image();
      img.onload = bump;
      img.onerror = bump;
      img.src = url;
    });
  });
}

/* =====================================================================
   SHADERIT
   ===================================================================== */

// --- Tausta: pehmeä radiaaligradientti (brändin avaruustausta) ---
const BG_VERT = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;
const BG_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform vec3  uGlow;   // keskuksen hehku
  uniform vec3  uEdge;   // reunan tummuus
  uniform float uTime;
  uniform float uAspect; // leveys/korkeus → pylväät pysyvät pystyssä

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    float a = hash(i), b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.02; a *= 0.5; }
    return v;
  }

  void main(){
    vec2 uv = vUv;
    float d = distance(uv, vec2(0.5, 0.55));

    // 1) syvä avaruusgradientti
    vec3 col = mix(uGlow, uEdge, smoothstep(0.0, 0.78, d));

    // 2) kosmiset nebula-pilvet (hidas liike)
    float n = fbm(uv * vec2(uAspect, 1.0) * 3.2 + vec2(uTime * 0.02, uTime * 0.013));
    float n2 = fbm(uv * vec2(uAspect, 1.0) * 6.0 - vec2(uTime * 0.015, 0.0));
    vec3 nebA = vec3(0.10, 0.04, 0.26);   // violetti
    vec3 nebB = vec3(0.0, 0.22, 0.34);    // syaani
    vec3 neb = mix(nebA, nebB, n2);
    col += neb * pow(n, 1.6) * 0.55 * (1.0 - d * 0.7);

    // 3) tähtikenttä (kimaltava)
    vec2 sg = uv * vec2(uAspect, 1.0) * 240.0;
    vec2 sc = floor(sg);
    float s = hash(sc);
    float twk = step(0.991, s) * (0.5 + 0.5 * sin(uTime * 3.0 + s * 50.0));
    col += vec3(0.85, 0.92, 1.0) * twk;

    // 4) MATRIX-digitaalisade (vihreät pystypylväät, kirkas pää + himmenevä jälki)
    float cols = 70.0;
    float ci = floor(uv.x * cols);
    float r1 = hash(vec2(ci, 9.0));
    float speed = 0.18 + r1 * 0.5;
    float head = fract(r1 * 17.0 + uTime * speed);   // pään y-paikka (0..1)
    float colY = 1.0 - uv.y;                          // ylä = 0
    float dy = colY - head;                           // etäisyys päästä alaspäin
    float trail = exp(-max(dy, 0.0) * 5.5) * step(-0.02, dy);
    float headGlow = exp(-abs(dy) * 26.0);
    float rows = 48.0;
    float ri = floor(uv.y * rows);
    float flick = step(0.30, hash(vec2(ci, ri) + floor(uTime * 7.0)));
    vec3 mtx = vec3(0.18, 1.0, 0.45) * (trail * flick * 0.9 + headGlow);
    // näkyy enemmän reunoilla → ei peitä keskellä olevia kortteja
    col += mtx * 0.30 * smoothstep(0.14, 0.6, d);

    gl_FragColor = vec4(col, 1.0);
  }
`;

// --- Kortti: pyöristetty SDF-suorakaide + cover-tekstuuri + fresnel-hohto + sukellus ---
const CARD_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uDive;
  uniform float uHover;
  uniform vec2  uMouse;      // hiiren osumakohta kortin UV:ssä
  uniform float uQuadAspect; // kortin leveys/korkeus
  varying vec2 vUv;
  varying vec3 vViewNormal;
  varying vec3 vViewPos;
  void main(){
    vUv = uv;
    vec3 pos = position;
    // litteä etupinta → istuu KIINNI paksussa rungossa (ei irrallaan)
    float k = 0.0;
    pos.z -= pos.x * pos.x * k;
    // hover: pieni nosto + paikallinen aalto hiiren kohdalla (seuraa hiirtä)
    pos.z += uHover * 0.05;
    float hr = length((uv - uMouse) * vec2(uQuadAspect, 1.0));
    pos.z += sin(hr * 26.0 - uTime * 6.0) * 0.05 * uHover * smoothstep(0.7, 0.0, hr);
    // sukelluksen aaltoileva pinta (radiaalinen)
    float r = length(uv - 0.5);
    pos.z += sin(r * 28.0 - uTime * 6.0) * 0.14 * uDive;
    // kaarevuudesta johdettu normaali → realistinen sheeni/fresnel
    vec3 nrm = normalize(vec3(2.0 * k * pos.x, 0.0, 1.0));
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vViewPos = mv.xyz;
    vViewNormal = normalize(normalMatrix * nrm);
    gl_Position = projectionMatrix * mv;
  }
`;
const CARD_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uTex;
  uniform vec3  uTint;
  uniform float uFocus;     // 0 = tausta (himmeä), 1 = etukortti
  uniform float uHover;
  uniform float uDive;      // 0..1 sukellus
  uniform float uTime;
  uniform float uOpacity;
  uniform float uImgAspect; // kuvan leveys/korkeus
  uniform float uQuadAspect;// kortin leveys/korkeus
  uniform float uCorner;    // kulman pyöristys
  uniform vec2  uMouse;     // hiiren osumakohta kortin UV:ssä
  varying vec2 vUv;
  varying vec3 vViewNormal;
  varying vec3 vViewPos;

  // pyöristetyn suorakaiteen etäisyysfunktio
  float roundedBox(vec2 p, vec2 b, float r){
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
  }
  // cover-sovitus (täyttää kortin, rajaa ylimenevän)
  vec2 coverUV(vec2 uv, float ia, float qa){
    vec2 c = uv - 0.5;
    if (ia > qa) c.x *= qa / ia; else c.y *= ia / qa;
    return c + 0.5;
  }
  void main(){
    // SDF normalisoidussa tilassa (korkeus = 1, leveys = quadAspect)
    vec2 p = (vUv - 0.5) * vec2(uQuadAspect, 1.0);
    vec2 b = vec2(0.5 * uQuadAspect, 0.5);
    float d = roundedBox(p, b, uCorner);
    float aa = 0.005;
    float alpha = 1.0 - smoothstep(-aa, aa, d);
    if (alpha <= 0.001) discard;

    // tekstuuri (cover) + sukelluksen refraktio
    vec2 uv = coverUV(vUv, uImgAspect, uQuadAspect);
    float rr = length(vUv - 0.5);
    uv += (vUv - 0.5) * sin(rr * 24.0 - uTime * 6.0) * 0.045 * uDive;
    // kromaattinen erottelu sukelluksessa
    float ca = 0.014 * uDive;
    vec3 col;
    col.r = texture2D(uTex, uv + vec2(ca, 0.0)).r;
    col.g = texture2D(uTex, uv).g;
    col.b = texture2D(uTex, uv - vec2(ca, 0.0)).b;
    float texA = texture2D(uTex, uv).a;   // kuvan läpinäkyvyys

    // taustakortit himmeämpiä
    col *= mix(0.32, 1.0, uFocus);
    // kevyt yläsheeni
    col += uTint * 0.04 * (1.0 - vUv.y);

    vec3 N = normalize(vViewNormal);
    vec3 V = normalize(-vViewPos);

    // realistinen liukuva spekulaarikiilto (lasimainen pinta, ei iso hehku)
    vec3 L = normalize(vec3(0.45, 0.65, 0.85));
    float spec = pow(max(dot(reflect(-L, N), V), 0.0), 28.0);
    col += vec3(1.0) * spec * 0.35 * (0.4 + 0.6 * uFocus);

    // fresnel-reunahohto teemavärillä (katselukulmasta riippuva → tuntuu 3D:ltä)
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.5);
    col += uTint * fres * (0.35 + 0.7 * uFocus + uHover * 0.25);

    // kirkas ohut reunaviiva
    float border = smoothstep(0.012, 0.0, abs(d));
    col += uTint * border * (0.4 + uHover * 0.3);

    // hover: paikallinen aalto hiiren osumakohdassa (seuraa hiirtä, vaimenee etäisyydellä)
    float md = length((vUv - uMouse) * vec2(uQuadAspect, 1.0));
    float wave = 0.5 + 0.5 * sin(md * 34.0 - uTime * 6.0);
    col += uTint * wave * uHover * 0.5 * smoothstep(0.55, 0.0, md);

    // hover kirkastaa hieman
    // (poistettu iso kirkastus → ei sokaise; liike tulee ripple-renkaasta yllä)
    // sukelluksen loppu → valkoinen läpäisy
    col = mix(col, vec3(1.4), smoothstep(0.72, 1.0, uDive) * 0.7);

    // läpinäkyvät kuvakohdat paljastavat värillisen rungon → robotti istuu kortissa.
    // sukelluksen lopussa koko kortti täyttyy (whiteout).
    float fill = max(texA, smoothstep(0.6, 1.0, uDive));
    float a = alpha * uOpacity * fill;
    if (a <= 0.002) discard;
    gl_FragColor = vec4(col, a);
  }
`;

// --- Post: CMYK-aberraatio + vinjetti + grain + SARJAKUVASUKELLUS (Spider-Verse) ---
const POST_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uTime;
  uniform float uAberration;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uFlash;
  uniform float uRipple;
  uniform float uComic;      // 0..1 sarjakuvasukellus (halftone + muste-roiske)
  uniform float uAspect;     // ruudun leveys/korkeus
  uniform vec3  uFlashColor; // teeman painoväri (muste)
  uniform vec2  uCenter;     // klikkikohta = roiskeen keskipiste
  varying vec2 vUv;

  void main(){
    vec2 uv = vUv;
    vec2 dir = uv - uCenter;
    float dist = length(dir);
    vec2 ar = vec2(uAspect, 1.0);
    float bd = length(dir * ar);           // aspektikorjattu etäisyys klikkikohdasta
    float ang = atan(dir.y, dir.x);

    // CMYK-painovirhe: kanavasiirto, voimistuu sukelluksessa
    float reg = uAberration + 0.018 * uComic;
    vec2 off = (uv - 0.5) * reg * (0.4 + dist) + vec2(0.0016, 0.0009) * uComic;
    float r = texture2D(tDiffuse, uv - off).r;
    float g = texture2D(tDiffuse, uv).g;
    float b = texture2D(tDiffuse, uv + off).b;
    vec3 col = vec3(r, g, b);

    // pehmeä värillinen välähdys (läpäisy)
    col += uFlashColor * uFlash;

    // --- SARJAKUVASUKELLUS: orgaaninen muste-roiske + Ben-Day halftone ---
    if (uComic > 0.0001) {
      float ph = uTime * 3.0;
      // wobbly reuna → musteroiskeen orgaaninen muoto
      float wob = 1.0 + 0.16 * sin(ang * 6.0 + ph)
                      + 0.09 * sin(ang * 11.0 - ph * 1.3)
                      + 0.05 * sin(ang * 19.0 + ph * 0.7);
      float rad = uComic * 2.3 * wob;
      // rikotaan säteittäiset rengaskontuurit kohinalla → orgaaninen muste, EI ympyröitä
      vec2 nc = floor(uv * vec2(uAspect, 1.0) * 30.0);
      float nz = fract(sin(dot(nc, vec2(12.9898, 78.233))) * 43758.5453);
      float bdn = bd + (nz - 0.5) * 0.18;
      // sävygradientti: 0 reunan ulkona → 1 syvällä roiskeen sisällä
      float tone = smoothstep(rad, rad - 0.8, bdn);
      // Ben-Day halftone: säteittäinen pistemaski ruudukossa, pisteet kasvavat sävyn mukaan
      vec2 cell = fract(uv * vec2(uAspect, 1.0) * 78.0) - 0.5;
      float patt = length(cell) / 0.5;
      float thr  = tone * 1.35;
      float inked = 1.0 - smoothstep(thr - 0.10, thr + 0.10, patt);
      // täysi peitto syvällä sisällä (ei aukkoja lopussa)
      float cover = max(inked, smoothstep(0.55, 0.95, tone));
      vec3 ink = uFlashColor * 1.25;
      col = mix(col, ink, clamp(cover, 0.0, 1.0));
      // action-vauhtiviivat roiskeen ulkopuolelle
      float outside = smoothstep(rad, rad + 0.06, bd);
      float lines = pow(0.5 + 0.5 * sin(ang * 80.0), 6.0);
      col = mix(col, col * 0.32, lines * outside * uComic * 0.5);
      // valkoinen "punch" aivan lopussa → läpäisy maailmaan
      col += vec3(1.0) * smoothstep(0.82, 1.0, uComic) * 0.55;
    }

    // vinjetti
    col *= smoothstep(0.95, 0.32, dist * uVignette);
    // hienovarainen filmigrain / paperirae
    float n = fract(sin(dot(uv * (uTime + 1.0), vec2(12.9898, 78.233))) * 43758.5453);
    col += (n - 0.5) * uGrain;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/* =====================================================================
   3D-SCENEN RAKENNUS
   ===================================================================== */
let renderer, scene, camera, composer, bloomPass, postPass;
let ringGroup, particleGroup;
let bgMat = null;             // taustashaderin materiaali (uTime-päivitys)
let treeGroup = null;         // digitaalinen piirilevypuu (keskellä)
let treeData = null;          // { segA, segB, packets, pkAttr, mats[] } datavirtaa varten
let treeT = 0;                // edellinen aika (dt-laskentaan)
const cards = [];          // { mesh, mat, index, hover }
const cardMeshes = [];
let textures = {};

// tila
let entered = false, diving = false, modalOpen = false, scrollEnabled = false;
let tCurrent = 0, tTarget = 0, lastWheel = 0;
let diveCancel = null;       // sukelluksen tweenin peruutus
let diveIndex = -1;          // aktiivisen sukelluksen kortti (paluuanimaatiota varten)
let revealP = 0;           // intron paljastus 0..1
let mouseX = 0, mouseY = 0;
const pointer = new THREE.Vector2(-2, -2);
const raycaster = new THREE.Raycaster();
let hovered = -1;
let clock;

function initThree(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = CONFIG.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  // sumu → kaukaiset kortit häipyvät kosmiseen taustaan (korvaa läpinäkyvyyshäivytyksen)
  scene.fog = new THREE.Fog(0x0a0c1e, 9, 24);
  camera = new THREE.PerspectiveCamera(CONFIG.fov, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 0.4, reduce ? CONFIG.cameraZ : CONFIG.cameraEnterZ);
  camera.lookAt(0, 0.2, 0);

  buildBackground();
  buildParticles();
  buildLights();
  buildCircuitTree();
  buildCards();
  buildComposer();

  clock = new THREE.Clock();
}

// Tausta: kosminen avaruus + matrix-digitaalisade (iso taso kauimpana)
function buildBackground() {
  const geo = new THREE.PlaneGeometry(120, 80);
  const mat = new THREE.ShaderMaterial({
    vertexShader: BG_VERT,
    fragmentShader: BG_FRAG,
    uniforms: {
      uGlow: { value: colHex("#10122e") },
      uEdge: { value: colHex("#03040a") },
      uTime: { value: 0 },
      uAspect: { value: window.innerWidth / window.innerHeight },
    },
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.z = -22;
  mesh.renderOrder = -10;
  scene.add(mesh);
  bgMat = mat;
}

// Hiukkaskenttä (syvyys + liike, bloom saa ne kimaltelemaan)
function buildParticles() {
  particleGroup = new THREE.Group();
  const N = reduce ? 400 : 1500;
  const positions = new Float32Array(N * 3);
  const sizes = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 60;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 36;
    positions[i * 3 + 2] = -25 + Math.random() * 30;
    sizes[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: colHex("#9fc6ff") }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aSize;
      uniform float uTime;
      varying float vA;
      void main(){
        vec3 p = position;
        p.y += sin(uTime * 0.2 + position.x * 0.3) * 0.4;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (aSize * 3.0 + 0.6) * (140.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
        vA = aSize;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vA;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(uColor * (0.4 + vA), a * (0.25 + vA * 0.6));
      }
    `,
  });
  const pts = new THREE.Points(geo, mat);
  particleGroup.add(pts);
  particleGroup.userData.mat = mat;
  scene.add(particleGroup);
}

// Valot: antavat korttien paksulle rungolle aitoa 3D-varjostusta
function buildLights() {
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const key = new THREE.DirectionalLight(0xbcd2ff, 1.15);
  key.position.set(3, 5, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff79c0, 0.55);
  rim.position.set(-4, -2, 4);
  scene.add(rim);
}

/* =====================================================================
   DIGITAALINEN PIIRILEVYPUU (proseduraalinen, keskellä → kortit kiertävät)
   - PCB-tyyli: suorakulmaiset (90°) "tracet", haarautuvat 3D:nä joka suuntaan
   - hohtavat solmut (vias) + datapaketit virtaavat oksia pitkin (matrix-henki)
   ===================================================================== */
function buildCircuitTree() {
  if (!CONFIG.tree.enabled) return;
  const T = CONFIG.tree;
  treeGroup = new THREE.Group();
  treeGroup.position.y = T.baseY;       // tyvi tähän → kasvaa ylös, skaalaus pohjasta
  treeGroup.visible = false;            // näkyviin vasta introsta (enter)
  scene.add(treeGroup);

  // pieni siemennetty RNG → puu on vakaa joka reloadissa
  let s = T.seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

  const segA = [], segB = [];           // segmenttien päätepisteet (lerp datapaketeille)
  const mainPos = [], twigPos = [];     // fat-line positiot (paksu runko / ohuet oksat)
  const nodes = [];                     // { p, big } hohtavat solmut

  function pushSeg(a, b, main) {
    segA.push(a.clone()); segB.push(b.clone());
    const arr = main ? mainPos : twigPos;
    arr.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }

  // rekursiivinen haara: PCB-tyyli (vaakamutka 90° → pystysegmentti ylös)
  function grow(pos, len, depth) {
    if (depth > T.depth || len < 0.18) {
      nodes.push({ p: pos.clone(), big: true });   // lehtipää = kirkas solmu
      return;
    }
    const main = depth <= 1;
    const nB = depth === 0 ? 1 : T.branches + (rnd() < 0.3 ? 1 : 0);
    for (let k = 0; k < nB; k++) {
      // levityssuunta vaakatasossa (XZ) → 3D-syvyys joka kulmasta
      const ang = rnd() * Math.PI * 2;
      const spreadAmt = (depth === 0 ? 0 : T.spread * (0.5 + rnd() * 0.5)) * (len / T.segLen);
      const dx = Math.cos(ang) * spreadAmt * (T.spreadX || 1);
      const dz = Math.sin(ang) * spreadAmt * (T.depthZ / T.spread);
      // 1) vaakasegmentti (90° mutka) — paitsi rungon ensimmäinen joka menee suoraan ylös
      const corner = pos.clone();
      if (depth > 0) {
        corner.add(new THREE.Vector3(dx, 0, dz));
        pushSeg(pos, corner, main);
        nodes.push({ p: corner.clone(), big: false });   // mutkasolmu (vias)
      }
      // 2) pystysegmentti ylös
      const up = depth === 0 ? T.trunkH : len * (0.7 + rnd() * 0.5);
      const top = corner.clone().add(new THREE.Vector3(0, up, 0));
      pushSeg(corner, top, main);
      grow(top, len * T.shrink, depth + 1);
    }
  }

  grow(new THREE.Vector3(0, 0, 0), T.segLen, 0);

  const res = new THREE.Vector2(window.innerWidth, window.innerHeight);
  const traceCol = colRGB255(T.color).multiplyScalar(T.glow);

  // paksu runko + ohuet oksat = kaksi fat-line-objektia
  function makeLines(posArr, width) {
    if (!posArr.length) return null;
    const g = new LineSegmentsGeometry();
    g.setPositions(posArr);
    const m = new LineMaterial({
      color: 0xffffff,
      worldUnits: true,
      linewidth: width,
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    m.color.copy(traceCol);
    m.resolution.copy(res);
    const ls = new LineSegments2(g, m);
    ls.computeLineDistances();
    treeGroup.add(ls);
    return m;
  }
  const matMain = makeLines(mainPos, T.width * 1.8);
  const matTwig = makeLines(twigPos, T.width);

  // hohtavat solmut (Points, additiivinen pyöreä sprite)
  const nPos = new Float32Array(nodes.length * 3);
  const nSize = new Float32Array(nodes.length);
  nodes.forEach((n, i) => {
    nPos[i * 3] = n.p.x; nPos[i * 3 + 1] = n.p.y; nPos[i * 3 + 2] = n.p.z;
    nSize[i] = n.big ? 0.7 : 0.32 + rnd() * 0.16;
  });
  const nGeo = new THREE.BufferGeometry();
  nGeo.setAttribute("position", new THREE.BufferAttribute(nPos, 3));
  nGeo.setAttribute("aSize", new THREE.BufferAttribute(nSize, 1));
  const nodeMat = glowPoints(colRGB255(T.nodeColor).multiplyScalar(T.nodeGlow), 1.7);
  treeGroup.add(new THREE.Points(nGeo, nodeMat));

  // datapaketit: kirkkaat pisteet liukuvat satunnaisia tracoja pitkin ylös
  const pk = Math.min(T.packets, segA.length);
  const packets = [];
  for (let i = 0; i < pk; i++) {
    packets.push({ i: Math.floor(rnd() * segA.length), t: rnd(), sp: (0.5 + rnd()) * T.packetSpeed });
  }
  const pkPos = new Float32Array(pk * 3);
  const pkSize = new Float32Array(pk).fill(0.6);
  const pkGeo = new THREE.BufferGeometry();
  pkGeo.setAttribute("position", new THREE.BufferAttribute(pkPos, 3));
  pkGeo.setAttribute("aSize", new THREE.BufferAttribute(pkSize, 1));
  const pkMat = glowPoints(colRGB255(T.packetColor).multiplyScalar(2.0), 2.2);
  treeGroup.add(new THREE.Points(pkGeo, pkMat));

  treeData = {
    segA, segB, packets,
    pkAttr: pkGeo.getAttribute("position"),
    mats: [matMain, matTwig, nodeMat, pkMat].filter(Boolean),
  };
}

// pieni apufunktio: additiivinen hohtava pyöreä piste-materiaali
function glowPoints(colorVec, sizeScale) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: colorVec }, uSize: { value: sizeScale }, uOpacity: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aSize;
      uniform float uSize;
      varying float vA;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uSize * (150.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
        vA = aSize;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity;
      varying float vA;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(uColor, a * uOpacity);
      }
    `,
  });
}

// puun päivitys joka frame: hidas pyörintä, datavirta, paljastus (revealP)
function updateTree(time) {
  if (!treeGroup || !treeData) return;
  const dt = Math.min(0.05, Math.max(0, time - treeT));
  treeT = time;
  const T = CONFIG.tree;
  treeGroup.rotation.y = time * T.rotSpeed;
  // paljastus: kasva tyvestä ylös + feidaa sisään
  const r = revealP;
  const sxz = T.scale * (0.9 + 0.1 * r);
  treeGroup.scale.set(sxz, T.scale * Math.max(0.0001, r), sxz);
  for (const m of treeData.mats) {
    if (m.uniforms && m.uniforms.uOpacity) m.uniforms.uOpacity.value = r;
    else m.opacity = r;
  }
  // datapaketit liukuvat tracoja pitkin
  const { segA, segB, packets, pkAttr } = treeData;
  const arr = pkAttr.array;
  for (let j = 0; j < packets.length; j++) {
    const p = packets[j];
    const a = segA[p.i], b = segB[p.i];
    const len = a.distanceTo(b) || 1;
    p.t += (p.sp * dt) / len;
    if (p.t > 1) { p.t -= 1; p.i = Math.floor(Math.random() * segA.length); }
    const a2 = segA[p.i], b2 = segB[p.i], tt = p.t;
    arr[j * 3] = a2.x + (b2.x - a2.x) * tt;
    arr[j * 3 + 1] = a2.y + (b2.y - a2.y) * tt;
    arr[j * 3 + 2] = a2.z + (b2.z - a2.z) * tt;
  }
  pkAttr.needsUpdate = true;
}

// Kortit sylinterin kehälle — paksuja (3D-runko + tekstuuripinta)
function buildCards() {
  ringGroup = new THREE.Group();
  ringGroup.rotation.x = -0.07;
  ringGroup.visible = false;          // näkyviin vasta introsta (enter)
  scene.add(ringGroup);

  const W = CONFIG.card.w, H = CONFIG.card.h, D = CONFIG.card.depth;
  const quadAspect = W / H;
  const faceGeo = new THREE.PlaneGeometry(W, H, 40, 40);
  const bodyGeo = new RoundedBoxGeometry(W, H, D, 4, CONFIG.card.corner);
  // hohtava kehys: hieman isompi pyöristetty laatikko rungon ympärillä → reuna kurkistaa esiin
  const fw = CONFIG.card.frame.width;
  const frameGeo = new RoundedBoxGeometry(W + fw * 2, H + fw * 2, D * 0.92, 4, CONFIG.card.corner + fw);

  CARDS.forEach((c, i) => {
    const group = new THREE.Group();
    group.userData.index = i;

    // 1) paksu runko (pyöristetty laatikko) → näkyvät reunat = 3D, KIINTEÄ (peittää tähdet)
    const tcol = colRGB255(c.tint);
    // 0) hohtava kehys rungon ympärille (oma emissiivinen mesh → menee bloomiin)
    const frameMat = new THREE.MeshStandardMaterial({
      color: tcol.clone().multiplyScalar(0.12),  // tumma runko → vain emissive hohtaa
      emissive: tcol.clone(),
      emissiveIntensity: CONFIG.card.frame.glow,
      metalness: CONFIG.card.frame.metalness,
      roughness: CONFIG.card.frame.roughness,
    });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.z = -0.02;                   // hieman rungon taakse → reuna näkyy ympärillä
    group.add(frame);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: tcol.clone().multiplyScalar(0.5),     // elävä teemaväri (robotti istuu kortissa)
      emissive: tcol.clone().multiplyScalar(0.28),
      emissiveIntensity: 1.0,
      metalness: 0.35,
      roughness: 0.5,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(body);

    // 2) tekstuuripinta etupuolelle (oma shader: SDF + fresnel + sheeni)
    const tex = textures[c.img];
    const ia = tex && tex.image ? tex.image.width / tex.image.height : 1;
    const mat = new THREE.ShaderMaterial({
      vertexShader: CARD_VERT,
      fragmentShader: CARD_FRAG,
      transparent: true,
      depthTest: true,
      depthWrite: true,
      uniforms: {
        uTex: { value: tex || null },
        uTint: { value: tcol },
        uFocus: { value: i === 0 ? 1 : 0 },
        uHover: { value: 0 },
        uDive: { value: 0 },
        uTime: { value: 0 },
        uOpacity: { value: 0 },         // paljastuu introssa
        uImgAspect: { value: ia },
        uQuadAspect: { value: quadAspect },
        uCorner: { value: CONFIG.card.corner },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },  // aalto seuraa hiirtä
      },
    });
    const face = new THREE.Mesh(faceGeo, mat);
    face.position.z = D / 2 + 0.005;    // kiinni rungon etupinnassa (ei irrallaan)
    face.userData.index = i;            // raycast → kortin indeksi
    group.add(face);

    ringGroup.add(group);
    const card = { mesh: group, mat, body, bodyMat, frameMat, index: i, hover: 0 };
    cards.push(card);
    cardMeshes.push(face);              // raycast osuu tekstuuripintaan
  });
  layoutCarousel(true);
}

function buildComposer() {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    CONFIG.bloom.strength, CONFIG.bloom.radius, CONFIG.bloom.threshold
  );
  composer.addPass(bloomPass);

  postPass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uAberration: { value: 0.0035 },
      uVignette: { value: 1.15 },
      uGrain: { value: reduce ? 0.0 : 0.045 },
      uFlash: { value: 0 },
      uRipple: { value: 0 },
      uComic: { value: 0 },
      uAspect: { value: window.innerWidth / window.innerHeight },
      uFlashColor: { value: new THREE.Color(1, 1, 1) },
      uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: POST_FRAG,
  });
  composer.addPass(postPass);
  composer.addPass(new OutputPass());
}

/* =====================================================================
   KARUSELLIN ASETTELU (joka frame, paitsi sukelluksen/modaalin aikana)
   ===================================================================== */
function layoutCarousel(force) {
  if (!force && (diving || modalOpen)) return;
  const angleRad = THREE.MathUtils.degToRad(CONFIG.anglePerCard);
  for (const c of cards) {
    const off = c.index - tCurrent;
    const ang = off * angleRad;
    c.mesh.position.set(Math.sin(ang) * CONFIG.radius, off * CONFIG.helix, Math.cos(ang) * CONFIG.radius);
    c.mesh.rotation.y = ang;
    const dist = Math.abs(off);
    const op = revealP * clamp(1 - dist / 6.0, 0, 1);
    c.mat.uniforms.uFocus.value = clamp(1 - dist / 4.0, 0, 1);
    c.mat.uniforms.uOpacity.value = op;
    // runko on kiinteä; sumu hoitaa etäisyyden häivytyksen
  }
}

// Etukortin otsikko DOM-labeliin
const cardLabel = document.getElementById("cardLabel");
let labelIndex = -1;
function updateLabel() {
  const front = Math.round(tCurrent);
  const centered = Math.abs(tCurrent - front) < 0.32;
  if (centered && front !== labelIndex && front >= 0 && front < CARDS.length) {
    labelIndex = front;
    cardLabel.textContent = CARDS[front].title;
    cardLabel.classList.add("show");
  } else if (!centered && labelIndex !== -1) {
    labelIndex = -1;
    cardLabel.classList.remove("show");
  }
}

/* =====================================================================
   VUOROVAIKUTUS
   ===================================================================== */
function onWheel(e) {
  if (!entered || diving || modalOpen || !scrollEnabled || reduce) return;
  e.preventDefault();
  let dy = e.deltaY;
  if (e.deltaMode === 1) dy *= 16; else if (e.deltaMode === 2) dy *= window.innerHeight;
  tTarget = clamp(tTarget + dy * CONFIG.scrollSensitivity, 0, CARDS.length - 1);
  lastWheel = performance.now();
}

function onPointerMove(e) {
  mouseX = (e.clientX / window.innerWidth) * 2 - 1;
  mouseY = -((e.clientY / window.innerHeight) * 2 - 1);
  pointer.x = mouseX;
  pointer.y = mouseY;
}

function onClick(e) {
  if (!entered || diving || modalOpen) return;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(cardMeshes, false);
  if (!hits.length) return;
  const idx = hits[0].object.userData.index;
  const front = Math.round(tCurrent);
  if (idx === front && Math.abs(tCurrent - front) < 0.35) {
    // klikkauskohta → portaalin keskipiste (UV, y käännetty)
    postPass.uniforms.uCenter.value.set(e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight);
    startDive(idx);
  } else {
    tTarget = idx;          // sivukortti → tuo eteen
    lastWheel = performance.now();
  }
}

// Touch-tuki (vedä pystyyn → pyöritä)
let touchY = null;
function onTouchStart(e) { if (e.touches[0]) touchY = e.touches[0].clientY; }
function onTouchMove(e) {
  if (touchY == null || !entered || diving || modalOpen) return;
  const y = e.touches[0].clientY;
  tTarget = clamp(tTarget + (touchY - y) * 0.01, 0, CARDS.length - 1);
  touchY = y;
  lastWheel = performance.now();
}

/* =====================================================================
   SUKELLUS: kortti kasvaa kohti kameraa, refraktio + välähdys → maailma
   ===================================================================== */
function startDive(i) {
  diving = true;
  scrollEnabled = false;
  diveIndex = i;
  const card = cards[i];
  const tint = CARDS[i].tint;
  card.mesh.userData.home = card.mesh.position.clone();
  const camFront = new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z - 3.2);
  const baseBloom = CONFIG.bloom.strength;

  buildWorld(CARDS[i].world || placeholderWorld(CARDS[i]));
  modal.style.setProperty("--world-theme", tint);
  modal.hidden = false;
  document.body.classList.add("modal-open");

  postPass.uniforms.uFlashColor.value.copy(colRGB255(tint));

  diveCancel = tween({
    dur: reduce ? 10 : 1150,
    ease: easeInOut,
    onUpdate: (e) => {
      card.mat.uniforms.uDive.value = 0;   // ei kortin omaa refraktio/whiteout-rengasta → vain sarjakuva
      postPass.uniforms.uRipple.value = Math.sin(e * Math.PI);
      postPass.uniforms.uAberration.value = 0.0035 + 0.05 * e;
      // sarjakuvasukellus roiskahtaa klikkikohdasta ja täyttää ruudun ennen maailmaa
      postPass.uniforms.uComic.value = smoothstep(0.0, 0.78, e);
      bloomPass.strength = baseBloom + e * 1.3;
      // kortti kohti kameraa + kasvaa → täyttää ruudun
      card.mesh.position.lerpVectors(card.mesh.userData.home, camFront, e * 0.9);
      card.mesh.scale.setScalar(1 + e * 2.8);
      // muut kortit himmenevät (robottipinta feidaa; runko kiinteä → peittyy zoomissa/välähdyksessä)
      for (const o of cards) if (o.index !== i) {
        o.mat.uniforms.uOpacity.value = revealP * (1 - e);
      }
      // pehmeä värivälähdys läpäisyhetkellä
      postPass.uniforms.uFlash.value = smoothstep(0.55, 0.78, e) * (1 - smoothstep(0.78, 1.0, e)) * 0.85;
      // maailma feidaa esiin loppuvaiheessa
      const m = clamp((e - 0.62) / 0.38, 0, 1);
      modal.style.setProperty("--world-opacity", m.toFixed(3));
      if (m > 0) modal.classList.add("open");
    },
    onDone: () => finishDive(i),
  });
}

function finishDive(i) {
  if (diveCancel) { diveCancel(); diveCancel = null; }
  const card = cards[i];
  modal.classList.add("open", "opened");
  postPass.uniforms.uFlash.value = 0;
  postPass.uniforms.uRipple.value = 0;
  postPass.uniforms.uComic.value = 0;
  postPass.uniforms.uAberration.value = 0.0035;
  bloomPass.strength = CONFIG.bloom.strength;
  card.mat.uniforms.uDive.value = 0;
  card.mat.uniforms.uOpacity.value = 0;   // piilossa modaalin takana
  card.bodyMat.opacity = 0;
  diving = false;
  modalOpen = true;
  modalClose.focus();
}

function closeModal() {
  if (!modalOpen && !diving) return;
  if (diveCancel) { diveCancel(); diveCancel = null; }
  const i = diveIndex;
  const card = i >= 0 ? cards[i] : null;
  modalOpen = false;
  diving = true;                       // estä vuorovaikutus paluun aikana
  scrollEnabled = false;
  modal.classList.remove("opened");    // maailma saa taas häipyä (--world-opacity)
  document.body.classList.remove("modal-open");

  const home = card && card.mesh.userData.home ? card.mesh.userData.home : null;
  const camFront = new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z - 3.2);
  const baseBloom = CONFIG.bloom.strength;

  // tuo sukeltava kortti takaisin näkyviin (täyttää ruudun kuten maailma)
  if (card) {
    card.mat.uniforms.uOpacity.value = revealP;
    card.mat.uniforms.uDive.value = 0;
    card.mesh.position.copy(camFront);
    card.mesh.scale.setScalar(3.8);
    postPass.uniforms.uFlashColor.value.copy(colRGB255(CARDS[i].tint));
  }

  // KÄÄNTEINEN SUKELLUS: kortti imeytyy takaisin paikalleen, maailma häipyy
  diveCancel = tween({
    dur: reduce ? 10 : 950,
    ease: easeInOut,
    onUpdate: (e) => {
      const back = 1 - e;             // 1→0 (sukellus takaperin)
      if (card && home) {
        card.mat.uniforms.uDive.value = 0;
        card.mesh.position.lerpVectors(home, camFront, back * 0.9);
        card.mesh.scale.setScalar(1 + back * 2.8);
      }
      const puls = Math.sin(e * Math.PI);
      postPass.uniforms.uRipple.value = puls;
      postPass.uniforms.uAberration.value = 0.0035 + 0.05 * puls;
      // sarjakuvasukellus kutistuu takaisin klikkikohtaan
      postPass.uniforms.uComic.value = smoothstep(0.0, 0.78, 1 - e);
      bloomPass.strength = baseBloom + puls * 1.0;
      // välähdys heti paluun alussa
      postPass.uniforms.uFlash.value = smoothstep(0.0, 0.22, e) * (1 - smoothstep(0.22, 0.55, e)) * 0.65;
      // maailma häipyy alussa
      modal.style.setProperty("--world-opacity", clamp(1 - e / 0.4, 0, 1).toFixed(3));
      // muut kortit palaavat näkyviin loppua kohti
      const reveal = clamp((e - 0.3) / 0.7, 0, 1);
      for (const o of cards) if (!card || o.index !== i) {
        const dist = Math.abs(o.index - tCurrent);
        o.mat.uniforms.uOpacity.value = revealP * reveal * clamp(1 - dist / 6.0, 0, 1);
      }
    },
    onDone: () => finishClose(i),
  });
}

function finishClose(i) {
  if (diveCancel) { diveCancel(); diveCancel = null; }
  modal.classList.remove("open");
  modal.style.setProperty("--world-opacity", "0");
  modal.hidden = true;
  if (panelObserver) { panelObserver.disconnect(); panelObserver = null; }
  worldEl.innerHTML = "";
  // nollaa efektit + kortit
  postPass.uniforms.uFlash.value = 0;
  postPass.uniforms.uRipple.value = 0;
  postPass.uniforms.uComic.value = 0;
  postPass.uniforms.uAberration.value = 0.0035;
  bloomPass.strength = CONFIG.bloom.strength;
  for (const o of cards) { o.mesh.scale.setScalar(1); o.mat.uniforms.uDive.value = 0; }
  diving = false;
  modalOpen = false;
  diveIndex = -1;
  scrollEnabled = true;
  layoutCarousel(true);
}

/* =====================================================================
   MAAILMA (DOM) — sarjakuva webtoon-pystyscrollina
   ===================================================================== */
const modal = document.getElementById("modal");
const modalClose = document.getElementById("modalClose");
const worldEl = document.getElementById("world");

const IMG_POOL = CARDS.map((c) => c.img);
function placeholderWorld(card) {
  const i = Math.max(0, CARDS.indexOf(card));
  const pick = (n) => IMG_POOL[(((i + n) % IMG_POOL.length) + IMG_POOL.length) % IMG_POOL.length];
  return {
    cover: card.img,
    title: card.title,
    theme: card.tint,
    panels: [
      { img: pick(0), text: "Tähän tulee tarinan ensimmäinen ruutu. (placeholder)" },
      { img: pick(1), text: "Toinen ruutu – korvaa oikealla kuvalla ja tekstillä." },
      { img: pick(2), text: "Kolmas ruutu. Lisää ruutuja kortin world.panels-taulukkoon." },
      { img: pick(3), text: "Neljäs ruutu. Pystyscroll = webtoon-tyylinen sarjakuva." },
    ],
  };
}
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function buildWorld(world) {
  modal.style.setProperty("--world-theme", world.theme || "120,200,255");
  const hero =
    `<div class="world-hero" style="background-image:url('${encodeURI(world.cover)}')">` +
    `<h2 class="world-title">${escapeHtml(world.title || "")}</h2>` +
    `<span class="world-cue">selaa ↓</span></div>`;
  const panels = (world.panels || [])
    .map((p) =>
      `<figure class="panel"><img src="${encodeURI(p.img)}" alt="" loading="lazy">` +
      (p.text ? `<figcaption class="panel-text">${escapeHtml(p.text)}</figcaption>` : "") +
      `</figure>`)
    .join("");
  worldEl.innerHTML = `<div class="world-scroll">${hero}${panels}</div>`;
  worldEl.scrollTop = 0;
  observePanels();
}

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

/* =====================================================================
   INTRO-PORTTI (DOM robotti) + ENTER
   ===================================================================== */
const introEl = document.getElementById("intro");
const introBtn = document.getElementById("introBtn");
const introFrame = document.getElementById("introFrame");

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
const player = framePlayer(introFrame);

function enter() {
  if (entered) return;
  entered = true;
  player.stop();
  introEl.setAttribute("hidden", "");
  document.body.classList.add("entered");
  ringGroup.visible = true;           // kortit näkyviin (emergoituvat sumusta kameran lentäessä)
  if (treeGroup) treeGroup.visible = true; // digitaalinen puu näkyviin (kasvaa esiin revealP:n myötä)
  if (reduce) {
    revealP = 1; camera.position.z = CONFIG.cameraZ; scrollEnabled = true; layoutCarousel(true); return;
  }
  tween({
    dur: 1700, ease: easeOutExpo,
    onUpdate: (e) => {
      revealP = e;
      camera.position.z = lerp(CONFIG.cameraEnterZ, CONFIG.cameraZ, e);
    },
    onDone: () => { scrollEnabled = true; },
  });
}
introBtn.addEventListener("click", enter);

/* =====================================================================
   RENDER-LOOP
   ===================================================================== */
function animate() {
  requestAnimationFrame(animate);
  const time = clock.getElapsedTime();

  // snäppi lähimpään korttiin kun scroll on tauolla
  if (entered && !diving && !modalOpen && scrollEnabled && !reduce) {
    if (performance.now() - lastWheel > CONFIG.snapDelay) {
      tTarget = clamp(Math.round(tTarget), 0, CARDS.length - 1);
    }
    tCurrent += (tTarget - tCurrent) * CONFIG.scrollEase;
  }

  layoutCarousel(false);
  updateLabel();

  // kamera pysyy paikallaan (ei hiiriparallaksia) – aalto seuraa hiirtä kortissa
  if (!reduce) {
    if (!diving) {
      camera.position.x += (0 - camera.position.x) * 0.05;
      camera.position.y += (0.4 - camera.position.y) * 0.05;
    }
    camera.lookAt(0, 0.2, 0);
    ringGroup.rotation.y = 0;
    ringGroup.rotation.x = -0.07;
    particleGroup.rotation.y = time * 0.01;
  }

  // hover-raycast (vain kun ei sukelleta)
  if (entered && !diving && !modalOpen) {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(cardMeshes, false);
    hovered = hits.length ? hits[0].object.userData.index : -1;
    // siirrä aalto hiiren osumakohtaan kortin pinnalla
    if (hits.length && hits[0].uv) {
      const hc = cards[hovered];
      if (hc) hc.mat.uniforms.uMouse.value.copy(hits[0].uv);
    }
    const front = Math.round(tCurrent);
    renderer.domElement.style.cursor = hovered === front && Math.abs(tCurrent - front) < 0.35 ? "pointer" : "default";
  } else {
    hovered = -1;
  }
  for (const c of cards) {
    const target = c.index === hovered ? 1 : 0;
    c.hover += (target - c.hover) * 0.15;
    c.mat.uniforms.uHover.value = c.hover;
    c.mat.uniforms.uTime.value = time;
    // kehyksen hehku voimistuu hoverissa
    c.frameMat.emissiveIntensity = CONFIG.card.frame.glow +
      (CONFIG.card.frame.hoverGlow - CONFIG.card.frame.glow) * c.hover;
  }

  // post + hiukkasten aika
  postPass.uniforms.uTime.value = time;
  if (bgMat) bgMat.uniforms.uTime.value = time;
  if (particleGroup.userData.mat) particleGroup.userData.mat.uniforms.uTime.value = time;
  updateTree(time);

  composer.render();
}

/* =====================================================================
   RESIZE
   ===================================================================== */
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloomPass.setSize(w, h);
  if (bgMat) bgMat.uniforms.uAspect.value = w / h;
  if (postPass) postPass.uniforms.uAspect.value = w / h;
  if (treeData) for (const m of treeData.mats) { if (m.resolution) m.resolution.set(w, h); }
}

/* =====================================================================
   KÄYNNISTYS
   ===================================================================== */
async function boot() {
  const canvas = document.getElementById("gl");
  try {
    textures = await preload();
    initThree(canvas);

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    renderer.domElement.addEventListener("click", onClick);
    window.addEventListener("resize", onResize);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    modalClose.addEventListener("click", closeModal);
    modal.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closeModal));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modalOpen) closeModal(); });

    animate();

    // lataus pois, intro esiin
    loaderEl.classList.add("hide");
    introEl.removeAttribute("hidden");
    if (reduce) player.static(); else player.start();

    // Debug-koukku (testausta varten; vaaraton tuotannossa).
    window.__duo = {
      enter,
      reveal(v) { revealP = clamp(v, 0, 1); },
      setCam(z) { camera.position.z = z; },
      frame() { layoutCarousel(true); updateTree(clock.getElapsedTime()); composer.render(); },
      goto(i) { tCurrent = tTarget = clamp(i, 0, CARDS.length - 1); layoutCarousel(true); updateTree(clock.getElapsedTime()); composer.render(); },
      tree(v) { if (treeGroup) treeGroup.visible = v !== false; },
      ring(v) { if (ringGroup) ringGroup.visible = v !== false; composer.render(); },
      inspect() {
        const c = cards[3];
        const t = c.mat.uniforms.uTex.value;
        return {
          uOpacity: c.mat.uniforms.uOpacity.value,
          bodyOpacity: c.bodyMat.opacity,
          bodyTransparent: c.bodyMat.transparent,
          texFormat: t ? t.format : null,        // 1023 = RGBAFormat (on alfa), 1022 = RGBFormat
          revealP,
        };
      },
      solid() { for (const c of cards) { c.bodyMat.transparent = false; c.bodyMat.needsUpdate = true; } layoutCarousel(true); composer.render(); },
      dive(i) { postPass.uniforms.uCenter.value.set(0.5, 0.5); startDive(i); },
      state: () => ({ entered, diving, modalOpen, tCurrent, tTarget, revealP }),
      cardsOnScreen() {
        camera.updateMatrixWorld();
        return cards.map((c) => {
          const p = new THREE.Vector3();
          c.mesh.getWorldPosition(p);
          p.project(camera);
          return {
            i: c.index,
            x: +p.x.toFixed(2), y: +p.y.toFixed(2),
            on: Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05 && p.z < 1,
            op: +c.mat.uniforms.uOpacity.value.toFixed(2),
          };
        });
      },
    };

    window.__APP_READY = true;
  } catch (err) {
    window.__APP_ERROR = String(err && err.stack || err);
    if (loaderEl) loaderEl.innerHTML = '<p style="color:#ff9">Virhe ladattaessa 3D-näkymää.<br>' + escapeHtml(String(err)) + "</p>";
    console.error(err);
  }
}
boot();
