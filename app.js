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
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
/* ====== TÄRKEIMMÄT SÄÄDÖT ====== */
const CONFIG = {
  radius: 6.8,          // putken säde (isompi → loivempi kaari, enemmän kortteja näkyvissä)
  anglePerCard: 28,     // astetta korttien välillä kehällä
  helix: 1.1,           // pystyporras / kortti ≈ 1/3 kortin korkeudesta (selvä spiraali)
  ringYOffset: -3.0,    // koko kierteen (kortit+kuplat+kamera) yleinen lasku — n. puhekuplan koon (3.0)
                        // verran, jotta aloituspiste (indeksi 0) osuu juuri gridin tasolle (baseY -3)
  slotYOffset: 1.0,     // kortin OMA "slot"-korkeus nostettu hieman ylemmäs — EI vaikuta kameran
                        // katselukohteeseen (h), joten kortti näkyy hieman ruudun keskiön yläpuolella
  cameraZ: 15.0,        // kameran lepoetäisyys (taempana → isompi rengas mahtuu)
  cameraEnterZ: 21,     // mistä kamera lentää sisään introssa
  fov: 55,
  scrollSensitivity: 0.0017, // wheel → karusellin pyöritys
  scrollEase: 0.085,    // kuinka nopeasti nykyinen indeksi seuraa tavoitetta
  snapDelay: 150,       // ms scrollin jälkeen ennen snäppiä lähimpään korttiin
  parallax: 0.9,        // hiiriparallaksin voimakkuus (kamera)
  // bloom hillitymmäksi: pienempi voimakkuus + korkeampi kynnys → ei isoa hehkua keskelle
  bloom: { strength: 0.32, radius: 0.6, threshold: 0.85 },
  // VAIHE 1: yksi proseduraalinen puhekupla (SDF-muoto + halftone-täyttö + hohtava ääriviiva, ei PNG:tä)
  bubble: {
    size: 3.0,                  // kuplan koko maailmassa (säädä mittakaavaan)
    opacity: 0.9,               // sisuksen läpinäkyvyys
    catColor: [0.6, 0.3, 0.8],  // kuplan väri 0..1 (violetti esim.)
    halftoneScale: 60.0,        // pisterasterin tiheys (ruutuja per kupla)
    halftoneStrength: 0.5,      // pisterasterin voimakkuus 0..1
    outlineWidth: 0.04,         // hohtavan ääriviivan leveys (SDF-yksiköissä)
    outlineColor: [1, 1, 1],    // ääriviivan väri 0..1 (hohtava muste → bloom)
    ringY: 0.3,                 // nosto kortin/tekstin paikalta ylös
    bend: 1.5,                  // kaarevuus renkaan mukaan (0 = litteä, 1 = istuu ympärän)
    rippleFreq: 26.0,           // pixel-ripplen rengastiheys (suuri = tiheät renkaat)
    rippleSpeed: 7.0,           // aallon etenemisnopeus ulospäin
    rippleAmp: 0.06,            // halftone-ruudukon radiaalisiirto aallossa (UV-yksiköissä)
    rippleFalloff: 2.0,         // vaimeneminen osumakohdasta ulospäin (suuri = paikallinen)
    hoverScale: 0.12,           // kuinka paljon kupla kasvaa hoverissa (0.12 = +12 %)
    radiusOffset: 1.5,          // lisäetäisyys CONFIG.radius:n päälle → kuplat kauemmas puusta/keskeltä
    yRestore: -0.1,             // NETTO-Y kortin päälle (ringY + yRestore = 0.2) — täsmää kameran
                                // katselukohteen korkeuden kanssa (h+0.2, ks. animate()), jotta kupla
                                // näkyy tarkalleen ruudun pystykeskellä fokusoituna
  },
  card: { w: 2.2, h: 3.0, corner: 0.09, depth: 0.22, // mitat (PORTRAIT-lasi). HUOM: corner <= depth/2 → rungon (RoundedBox) ja facen kulmat täsmäävät (ei tuplareunaa)
    frame: { width: 0.06, glow: 0.45, hoverGlow: 2.2, edgePow: 3.5 }, // ohut neonreuna (fresnel-siluetti, ei pastellislabia) + hover-hehku
    // GLASSMORPHISM: tumma/sumea lasipaneeli, hehkuva neonreuna, syvyys + kiilto
    glass: {
      darken: 0.78,       // rungon/lasin tummennus (1 = musta)
      opacity: 0.92,      // läpinäkyvyys (1 = umpinainen, <1 = tausta kuultaa läpi)
      gradient: 0.35,     // pystygradientti (ylhäällä vaaleampi → tilavuus)
      innerGlow: 0.45,    // sisähehku reunoja kohti
      rimPow: 2.5,        // fresnel-reunan terävyys
      rimStrength: 0.55,  // fresnel-reunan voimakkuus (matalampi → ei kirkasta sisäkehystä, neonreuna tulee frame-meshistä)
      reflection: 0.25,   // fake-ympäristöheijastus (kiilto näkyy pimeässä)
      sheen: 0.4,         // animoitu liukuva kiilto
    },
    // KUVA ISTUTETTU LASIIN (ei tarra): contain-sovitus + sulautus paletiin + huuru
    image: {
      blend: 0.18,        // kuinka paljon kuva värjäytyy lasin tinttiin (yhtenäisyys)
      inset: 0.06,        // kuvan sisennys kortin sisään (contain → KOKO kuva näkyy, ei reunojen rajausta)
      frost: 0.12,        // lasin huuru kuvan päällä (etched/"lasin sisällä" -tuntu)
      fillColor: "26,28,48",      // alfa-täytön väri (luettavuus, irti rakenteellisesta väristä)
      backColor: "210,225,255",   // robotin takavalon väri
      backGlow: 0.5,              // takavalon voimakkuus (luettavuus + syvyys)
    },
    content: { inset: 0.0 }, // sisällön (ikoni/otsikko/teksti/nappi) reunamarginaali UV:ssä (canvasissa oma padding)
    ripple: { freq: 30.0, speed: 6.0, amp: 0.012, radius: 0.55 }, // vesiwobble hiiren kohdalla
    edgeEmissive: 0.04,  // rungon etuviisteen perustaso (matala → ei sisäkehystä; varsinainen neonreuna = frame-mesh)
    halo: { size: 1.3, intensity: 0.5 }, // hehkuhalo kortin takana (ankkuroi avaruuteen, bloom nappaa)
    hoverLift: 0.05,     // kortin nousu hoverissa
  },
  // UUSI 3D-MALLI keskellä (GLB, korvaa vanhan proseduraalisen piirilevypuun) — kortit kiertävät sitä
  tree: {
    enabled: true,
    url: "assets/models/sakura tree_3D ilman lehtiä.glb", // GLB-tiedoston polku
    baseY: -3,       // tyven korkeus (kortit kiertävät tämän ympärillä) — myös gridin "reunan" korkeus
    scale: 3,        // koko (säädä mallin omien mittojen mukaan)
    rotSpeed: 0,     // pyörintänopeus (0 = ei pyöri)
    sinkIntoWell: 1.15, // kuinka paljon puu laskeutuu baseY:n ALAPUOLELLE, jotta tyvi/juuristo istuu
                        // täsmälleen kuopan pohjimmaisen kohdan (baseY - wellDepth) tasolla
  },
  // NEONGRIDI-ALUSTA puun alla (synkkywave-lattia, kuten referenssikuvan hehkuva ruudukko + rengas)
  grid: {
    enabled: true,
    size: 60,                 // lattiatason koko (world-yksikköä)
    cellSize: 1.2,             // ruudukon solun koko
    lineWidth: 0.02,           // viivan paksuus (world-yksikköä)
    color: "80,200,255",       // ruudukon väri (syaäni)
    glow: 1.6,                 // ruudukon kirkkaus (bloom nappaa)
    ringColor: "255,120,220",  // hehkuva rengas puun tyven ympärillä
    ringRadius: 4.2,           // renkaan säde (isompi → näkyy rungon/kiven ulkopuolella)
    ringWidth: 0.18,           // renkaan paksuus
    fadeRadius: 22,            // etäisyys jolloin ruudukko häipyy näkyvistä (horisontti)
    wellDepth: 4.5,            // kuinka syvälle ruudukko "uppoaa" puun kohdalla (massakuoppa) —
                               // iso arvo = jyrkkä, syvä suppilo (kuten painovoimakuoppa-referenssikuva)
    wellRadius: 6.5,           // uppouman leveys — leveä säde levittää suppilon laajalle alueelle
                               // ruudukkoa (ei enää vain tyven kokoinen tiukka notko)
    gradientRadius: 9,         // etäisyys jolloin ruudukon väri siirtyy kokonaan rengasväristä (pinkki)
                               // perusväriin (syaani) — referenssikuvan liukuvärinen lattia
    pulseSpeed: 1.3,           // renkaiden sykkeen (hengityksen) nopeus
    pulseAmount: 0.35,         // sykkeen voimakkuus (0..1, kirkkauden vaihteluväli)
    ring2Radius: 3.0,          // sisemmän renkaan säde (kerroksellinen hehku, kuten referenssikuvassa)
    ring2Width: 0.12,          // sisemmän renkaan paksuus
    yOffset: -1,             // koko gridin oma lisälasku (puun/korttien korkeuteen ei vaikuta)

    // VALOEFEKTI: N hehkuvaa "käärmettä" (snakeCount kpl) kulkee pitkin ruudukkoviivoja eteenpäin,
    // kääntyen aina risteyksessä satunnaiseen suuntaan (ei koskaan käänny takaisin). Jos käärme
    // ylittäisi gridin näkyvyysrajan (uFadeRadius), se poistetaan ja luodaan uudelleen satunnaiseen
    // kohtaan näkyvällä alueella — CPU puolella simuloitu polku (ks. snakes-tila animate()-silmukassa).
    // SUORITUSKYKY (kevyt/tekstuuripohjainen toteutus): kiinteä häntä bakataan CPU:lla pieneen
    // tekstuuriin, shader tekee vain 2 texture2D-hakua per pikseli riippumatta käärmeiden määrästä
    // (O(1)) — vain käärmeiden liikkuvat pääsegmentit lasketaan per-pikseli (O(snakeCount), halpaa).
    // snakeCount voi siis olla iso ilman raskasta GPU-kuormaa (max SNAKE_MAX_COUNT=100, ks. app.js).
    snakeEnabled: false,       // POIS KÄYTÖSTÄ tähän versioon (käyttäjän pyynnöstä) — true ottaa takaisin
    snakeCount: 50,            // kuinka monta käärmettä kentällä liikkuu samaan aikaan
    snakeSpeed: 3.0,           // kaikkien käärmeiden nopeus (world-yksikköä/s)
    snakeThickness: 0.08,      // hehkun puoliskoleveys (world-yksikköä) — ohuempi, helposti seurattava
    snakeTailLength: 6,        // kuinka monta pistettä (segmenttiä) näkyy hehkuvana hännässä
    // Väripaletti, josta käärmeet saavat värinsä kierrättäen (indeksi % paletin pituus) — antaa
    // visuaalista vaihtelua kun monta käärmettä liikkuu yhtä aikaa.
    snakeColors: ["255,120,220", "150,90,255", "80,200,255"],
  },
  // SARJAKUVATAUSTA (Spider-Verse-printti): halftone-pisteet + litteät väritasot + terävät hiukkaset
  comicBg: {
    baseColor: "26,18,54",       // pohjaväri (syvä indigo) – litteä taso (alavyöhyke)
    midColor: "64,22,92",        // välitaso (violetti/magenta) – litteä taso (ylävyöhyke)
    edgeColor: "8,5,20",         // reuna/tummennus (litteä vinjetti)
    dotColorA: "236,64,160",     // halftone-pisteen väri 1 (magenta)
    dotColorB: "40,210,230",     // halftone-pisteen väri 2 (syaani)
    dotScale: 90.0,              // halftone-pisteitä ruudun korkeudelle (isompi → pienemmät/tiheämmät)
    dotStrength: 0.2,            // pisterasterin voimakkuus (0–1)
    dotParallax: 0.1,           // pisterasterin parallaksi (kiinnitetty kupuun; 0 = litteä screen-space)
    dotSharpness: 80.0,           // rasterin tasosekoituksen terävyys (isompi → vähemmän päällekkäisiä pisteitä; ~4–16)
    drift: 0.012,                // nebulan ajautumisnopeus (lähes paikallaan)
    // --- KAAREVA AVARUUS-DOME (kamera ympäristön sisällä) ---
    domeRadius: 80,              // taustapallon säde (ympäristön koko; kamera sisällä)
    starColor: "235,240,255",    // tähtien väri (litteät, kovareunaiset)
    starDensity: 1.0,            // tähtien tiheys (kerroin; isompi → enemmän tähtiä)
    nebulaColorA: "120,40,170",  // nebula litteä väri 1 (violetti)
    nebulaColorB: "40,120,180",  // nebula litteä väri 2 (syaani)
    nebulaStrength: 0.5,         // nebulan voimakkuus (litteät väripalat 0–1)
    nebulaParallax: 0.05,        // nebulakerrosten parallaksi kameran liikkeessä (3D-syvyys; 0 = litteä)
    nebulaLight: 0.6,            // nebulan pseudo-valaistus (pyöreät, kohopintaiset pilvet; 0 = litteä)
    starParallax: 0.04,          // tähtikerrosten parallaksi (lähitähdet liikkuvat enemmän; 0 = litteä)
    caustic: 0.35,               // vedenalainen VIRTAUS: nebulan pyörteily/virtaus (0 = paikallaan, ~0.6 voimakas)
    causticScale: 2.2,           // virtauksen kuvion koko (isompi → tiheämpi pyörteily)
    rays: 0.16,                  // VALOKEILAT (Spider-Verse light shaftit): voimakkuus (0 = pois)
    rayColor: "120,180,255",     // valokeilojen väri (viileä sininen = vedenalainen/avaruus)
    rayCount: 9.0,               // valokeilojen tiheys (montako keilaa kuvun yli)
    raySpeed: 0.06,              // valokeilojen liukunopeus (hidas huojunta)
    rotateWithScroll: 0.0,       // VALINNAINEN lisäkierto kameran kiertoradan PÄÄLLE (0 = pelkkä luonnollinen parallaksi)
    spin: 0.004,                 // taustan oma hidas pyörintä (rad/s)
    // --- DIGITAALINEN RASTERI / NÄYTTÖ-TUNTU ---
    dotMode: "halftone",         // 'halftone' = pyöreät Ben-Day-pisteet | 'pixel' = neliö-/pikseliruudukko (näyttötuntu)
    scanlines: 0.0,              // vaakajuovien (CRT/digital shimmer) voimakkuus (0 = pois, ~0.2 hienovarainen)
    glitch: 0.0,                 // hienovarainen RGB-split / rivisiirtymä-aksentti (0 = pois, ~0.1 maltillinen)
    // --- ENERGIA-/DATASAUMAT (kintsugi-säröt PÄÄELEMENTTINÄ) ---
    crack: {
      layers: 2,                 // säröjen syvyyskerrokset (1–3; isompi = 3D-syvempi mutta raskaampi)
      flow: 0.4,                 // valon virtausnopeus saumoissa (data liikkuu johdoissa)
      flowCount: 3,              // montako pulssia kulkee verkon läpi (1–3)
      nodeGlow: 0.6,             // solmukohtien (kulmapisteet) kirkkaus
      nodePulse: 0.5,            // solmujen sykkeen voimakkuus (0 = tasainen, 1 = vahva syke)
      warp: 0.15,                // domain-warp: orgaanisuus (0 = suora/geometrinen, ~0.3 mutkainen)
      edgeSharpness: 0.5,        // saumareunan terävyys (0 = pehmeä hehku, 1 = terävä digitaalinen)
      flare: 0.3,                // satunnaisten energialeimahdusten yleisyys (0 = pois)
    },
    // --- PERSPEKTIIVINEN TRON-GRID (pelillinen syvyysvihje) ---
    grid: {
      enabled: true,             // näytä digitaalinen viivaruudukko (lattia + katto, keskelle jää avoin)
      scale: 14.0,               // ruudukon tiheys
      fade: 1.4,                 // häipyminen horisonttiin (isompi → avoimempi keskivyöhyke)
      scroll: 0.04,              // ruudukon hidas vyöryminen (nopeuden tuntu)
      opacity: 0.16,             // ruudukon näkyvyys (taustaelementti, ei dominoi)
      color: "80,150,255",       // ruudukon väri (viileä sininen neon)
    },
    // --- SISÄKKÄISET PALLOKERROKSET (parallaksi: eri säde + pyörimisnopeus; sisin pyörii nopeimmin) ---
    layers: [
      // r=60, keskinopeus: tähdet + nebula-utu + hehkuvat energia-/datasaumat (PÄÄELEMENTTI)
      { radius: 60, speed: 0.020, starDensity: 0.7, starSize: 1.0, neb: 0.30, crack: 0.40, crackColor: "90,230,255", opacity: 0.9, digital: 0 },
      // r=42, nopein (lähin → vahvin parallaksi): digitaaliset datahiukkaset (neliöt/bitit)
      { radius: 42, speed: 0.040, starDensity: 0.5, starSize: 1.6, neb: 0.0, crack: 0.0, crackColor: "90,230,255", opacity: 0.8, digital: 1 },
    ],
    // --- HIUKKASET ---
    particleCount: 220,          // sarjakuvahiukkasten määrä
    particleFps: 12,             // hiukkasten nykivän liikkeen päivitystahti (fps; render pyörii 60)
    particleColors: ["236,64,160", "40,210,230", "255,232,64"], // kirkkaat CMYK-henkiset värit
  },
  // --- UUSI TAUSTA: avoin avaruus + sivuun virtaava hiukkasvirta (pääelementti) ---
  legacyBg: false,        // true = vanha Spider-Verse-dome (nebula/halftone/säröverkko); false = uusi avoin avaruus
  bg: {
    centerColor: "30,16,52",     // taustan keskiväri (tumma violetti) → reunat puhtaaseen mustaan
    vignette: 0.8,               // reunatummennus (isompi = avoimempi/tummempi reuna, "ääretön tila")
  },
  flow: {
    count: 5000,                 // hiukkasten määrä (avoimuus tavoitteena: 3000–8000)
    dir: [1, 0.1, 0.2],          // virtaussuunta maailmassa (lähes vaakasuora sivuvirta)
    speed: 2.0,                  // perusnopeus virtaussuuntaan
    curlStrength: 1.5,           // curl-noise-amplitudi → nauhojen kaartuvuus (0 = suora pöly)
    curlScale: 0.08,             // kohinan skaala (pieni = isot pyörteet/leveät nauhat)
    boxSize: 100,                // alueen koko origon ympärillä (ympäröi kameran kiertoradan)
    sizeMin: 0.05,               // pienimmän hiukkasen koko
    sizeMax: 1.0,                // suurimman hiukkasen koko
    sizeScale: 620,              // pistekoon yleiskerroin (sizeAttenuation: lähellä iso, kaukana pieni)
    opacity: 1.0,                // hiukkasten yleisläpinäkyvyys
    plusRatio: 0.22,             // osuus hiukkasista plus-merkkejä (loput pehmeitä pisteitä)
    fadeInner: 0.55,             // mistä säteestä (0–1) hiukkaset alkavat häipyä → tyhjät reunat
    fadeOuter: 1.05,             // mihin säteeseen mennessä häipyneet kokonaan (avara, tyhjä tila)
    colors: ["180,90,255", "236,64,160", "40,210,230", "120,180,255"], // violetti–pinkki–syaani neon
  },
  exposure: 1.12,
};

/* ====== KORTIT ====== */
const CARDS = [
  { img: "assets/duobotit/idle/006.webp",    title: "Tekninen tuki",     tint: "255,120,180", icon: "\u{1F6E0}", desc: "Nopeaa apua laitteisiin ja järjestelmiin." },
  { img: "assets/duobotit/wave/006.webp",    title: "Ohjelmistokehitys", tint: "95,208,196",  icon: "</>",      desc: "Räätälöidyt sovellukset ja verkkopalvelut." },
  { img: "assets/duobotit/peeking/005.webp", title: "Pelit",             tint: "168,130,255", icon: "\u{1F3AE}", desc: "Pelikokemuksia ideasta julkaisuun." },
  { img: "assets/duobotit/intro/008.webp",   title: "Sarjakuva",         tint: "255,178,76",  icon: "\u{1F4AC}", desc: "Tarinat ja hahmot eloon kuvituksena." },
  { img: "assets/duobotit/idle/014.webp",    title: "Automaatio",        tint: "120,200,255", icon: "\u26A1",    desc: "Toistuvat työt hoituvat itsestään." },
  { img: "assets/duobotit/hiding/006.webp",  title: "Konsultointi",      tint: "255,150,120", icon: "\u{1F4A1}", desc: "Suuntaa ja sparrausta projekteihin." },
  { img: "assets/duobotit/wave/012.webp",    title: "Yhteistyö",         tint: "150,255,180", icon: "\u{1F91D}", desc: "Rakennetaan jotain isoa yhdessä." },
];

/* ====== INTRO-ANIMAATIO (robotin frame-soitin, DOM) ======
   ANIM-konfiguraatio + framePlayer() tuodaan jaetusta frame-player.js:stä
   (sama tiedosto käytössä myös index.html:n 2D-etusivulla). ====== */

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

// Piirrä pyöristetty suorakaide canvas-polkuun
function roundRectPath(x, rx, ry, w, h, r) {
  x.beginPath();
  x.moveTo(rx + r, ry);
  x.arcTo(rx + w, ry, rx + w, ry + h, r);
  x.arcTo(rx + w, ry + h, rx, ry + h, r);
  x.arcTo(rx, ry + h, rx, ry, r);
  x.arcTo(rx, ry, rx + w, ry, r);
  x.closePath();
}
// Rivitä teksti annettuun leveyteen
function wrapText(x, text, rx, ry, maxW, lh) {
  const words = text.split(" ");
  let line = "", y = ry;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (x.measureText(test).width > maxW && line) { x.fillText(line, rx, y); line = w; y += lh; }
    else line = test;
  }
  if (line) x.fillText(line, rx, y);
  return y;
}
// Korttipohjan SISÄLTÖ (ikoni + otsikko + teksti + nappi) → läpinäkyvä canvas-tekstuuri.
// Tausta jätetään läpinäkyväksi → lasi (shader) näkyy sisällön takaa.
function makeCardContentTexture(card) {
  const w = 700, h = 950, p = 66;
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const x = cv.getContext("2d");
  const t = card.tint.split(",").map(Number);
  const rgb = (a = 1) => `rgba(${t[0]},${t[1]},${t[2]},${a})`;
  const lit = (a = 1) => `rgba(${Math.min(255, t[0] + 60)},${Math.min(255, t[1] + 60)},${Math.min(255, t[2] + 60)},${a})`;

  // IKONI-badge (gradientti kategoriavärillä)
  const bs = 124, bx = p, by = p;
  const ig = x.createLinearGradient(bx, by, bx + bs, by + bs);
  ig.addColorStop(0, lit(0.95)); ig.addColorStop(1, rgb(0.9));
  roundRectPath(x, bx, by, bs, bs, 30); x.fillStyle = ig; x.fill();
  x.fillStyle = "rgba(255,255,255,0.96)";
  x.font = '600 60px "Segoe UI Emoji","Segoe UI",system-ui,sans-serif';
  x.textAlign = "center"; x.textBaseline = "middle";
  x.fillText(card.icon, bx + bs / 2, by + bs / 2 + 2);

  // OTSIKKO
  x.textAlign = "left"; x.textBaseline = "alphabetic";
  x.fillStyle = "#ffffff";
  x.font = '700 56px "Segoe UI",system-ui,sans-serif';
  x.fillText(card.title, p, by + bs + 92);

  // KUVAUS (rivitetty, himmeä)
  x.fillStyle = "rgba(224,230,245,0.72)";
  x.font = '400 32px "Segoe UI",system-ui,sans-serif';
  wrapText(x, card.desc, p, by + bs + 150, w - p * 2, 46);

  // NAPPI (gradientti-pilleri)
  const bw = 268, bh = 88, bxx = p, byy = h - p - bh;
  const bgg = x.createLinearGradient(bxx, byy, bxx + bw, byy + bh);
  bgg.addColorStop(0, rgb(1)); bgg.addColorStop(1, lit(0.85));
  roundRectPath(x, bxx, byy, bw, bh, bh / 2); x.fillStyle = bgg; x.fill();
  x.fillStyle = "#0b0e18";
  x.font = '600 32px "Segoe UI",system-ui,sans-serif';
  x.textAlign = "center"; x.textBaseline = "middle";
  x.fillText("Lue lis\u00e4\u00e4  \u2192", bxx + bw / 2, byy + bh / 2 + 2);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* =====================================================================
   1) LATAUS — esiladataan korttikuvat (ei omaa lataus-UI:ta; 3D-karuselli
   paljastuu automaattisesti kun lataus valmistuu, ks. enter() bootissa)
   ===================================================================== */
function preload() {
  const cardUrls = CARDS.map((c) => c.img);
  let done = 0;
  const texLoader = new THREE.TextureLoader();
  const cardTextures = {};

  return new Promise((resolve) => {
    const bump = () => {
      done++;
      if (done >= cardUrls.length) resolve(cardTextures);
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
  });
}

/* =====================================================================
   SHADERIT
   ===================================================================== */

// --- Tausta: KAAREVA SPIDER-VERSE-AVARUUS (pallon sisäpinta: litteät värit + nebula + tähdet + halftone) ---
const BG_VERT = /* glsl */ `
  varying vec3 vDir;
  void main(){
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vDir = normalize(wp.xyz);           // maailmansuunta origosta → pyörii dome-meshin mukana
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const BG_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vDir;
  uniform vec3  uBase;      // pohjaväri (litteä alavyöhyke)
  uniform vec3  uMid;       // välitaso (litteä ylävyöhyke)
  uniform vec3  uEdge;      // reuna/tummennus (vinjetti)
  uniform vec3  uDotA;      // halftone-pisteen väri 1
  uniform vec3  uDotB;      // halftone-pisteen väri 2
  uniform vec3  uStarCol;   // tähtien väri
  uniform vec3  uNebA;      // nebula litteä väri 1
  uniform vec3  uNebB;      // nebula litteä väri 2
  uniform float uDotScale;  // halftone-pisteitä ruudun korkeudelle
  uniform float uDotStrength;
  uniform float uDotParallax;// pisterasterin parallaksi (kiinnitys kupuun)
  uniform float uDotSharpness;// tasosekoituksen terävyys (päällekkäisyys)
  uniform float uStarDensity;
  uniform float uNebStrength;
  uniform float uNebParallax; // nebulan parallaksi (3D-syvyys)
  uniform float uNebLight;    // nebulan pseudo-valaistus (kohopinta)
  uniform float uStarParallax;// tähtikerrosten parallaksi
  uniform float uCaustic;     // vedenalainen virtaus (nebulan domain-warp)
  uniform float uCausticScale;// virtauskuvion koko
  uniform float uRays;        // valokeilojen voimakkuus
  uniform vec3  uRayColor;    // valokeilojen väri
  uniform float uRayCount;    // valokeilojen tiheys
  uniform float uRaySpeed;    // valokeilojen liukunopeus
  uniform float uDotMode;     // 0 = pyöreä halftone, 1 = neliö/pikseliruudukko (näyttötuntu)
  uniform float uScanlines;   // CRT/digital shimmer voimakkuus
  uniform float uGlitch;      // RGB-split / rivisiirtymä-aksentti
  uniform float uGridOn;      // perspektiivigrid päällä
  uniform vec3  uGridColor;   // gridin väri
  uniform float uGridScale;   // gridin tiheys
  uniform float uGridFade;    // gridin häipyminen horisonttiin
  uniform float uGridScroll;  // gridin vyörymisnopeus
  uniform float uGridOpacity; // gridin näkyvyys
  uniform float uDrift;     // nebulan ajautuma
  uniform float uTime;
  uniform vec2  uResolution;

  float hash3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  // 3D-arvokohina (trilineaarinen) → ei saumaa pallon ympäri
  float vnoise(vec3 p){
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash3(i + vec3(0.0,0.0,0.0));
    float n100 = hash3(i + vec3(1.0,0.0,0.0));
    float n010 = hash3(i + vec3(0.0,1.0,0.0));
    float n110 = hash3(i + vec3(1.0,1.0,0.0));
    float n001 = hash3(i + vec3(0.0,0.0,1.0));
    float n101 = hash3(i + vec3(1.0,0.0,1.0));
    float n011 = hash3(i + vec3(0.0,1.0,1.0));
    float n111 = hash3(i + vec3(1.0,1.0,1.0));
    float x00 = mix(n000, n100, f.x);
    float x10 = mix(n010, n110, f.x);
    float x01 = mix(n001, n101, f.x);
    float x11 = mix(n011, n111, f.x);
    return mix(mix(x00, x10, f.y), mix(x01, x11, f.y), f.z);
  }

  // Yhden tason rasteripeitto: 1 pisteen sisällä, 0 ulkona (säde r). mode 0=pyöreä, 1=neliö (pikseli)
  float htCov(vec2 g, float r, float mode){
    vec2 cell = fract(g) - 0.5;
    float d = mix(length(cell), max(abs(cell.x), abs(cell.y)), step(0.5, mode)) / 0.5;
    return 1.0 - smoothstep(r - 0.08, r + 0.08, d);
  }

  void main(){
    vec3 dir = normalize(vDir);

    // 1) LITTEÄT VÄRITASOT (cel): kvantisoi korkeus (dir.y) → vaakavyöhykkeet, kovat askelmat
    float t = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    float q = floor(t * 3.0) / 2.0;          // 0 / .5 / 1 → 3 litteää tasoa
    vec3 col = mix(uBase, uMid, q);

    // 2) NEBULA — MONIKERROS + PARALLAKSI + PSEUDO-VALAISTUS → 3D-syvyys
    //    cameraPosition (Three.js auto-uniform) tuo kameran liikkeen → kerrokset siirtyvät eri tahtiin
    vec3 camOff = cameraPosition * uNebParallax;
    // vedenalainen VIRTAUS (caustic flow): domain-warp → nebula virtaa ja pyörteilee → lisää ulottuvuutta
    vec3 flow = vec3(
      vnoise(dir * uCausticScale + vec3(uTime * 0.04, 0.0, 1.7)),
      vnoise(dir * uCausticScale + vec3(0.0, uTime * 0.035, 4.2)),
      vnoise(dir * uCausticScale + vec3(2.3, 0.0, uTime * 0.03))
    ) - 0.5;
    vec3 warp = flow * uCaustic;
    vec3 d1 = vec3(uTime * uDrift, 0.0, uTime * uDrift * 0.5);
    vec3 d2 = vec3(-uTime * uDrift * 0.7, uTime * uDrift * 0.4, 0.0);
    vec3 d3 = vec3(uTime * uDrift * 0.3, 0.0, -uTime * uDrift * 0.6);
    // kolme syvyyskerrosta: lähin liikkuu eniten (camOff*1.0), kaukaisin vähiten; warp tuo virtauksen
    float n1 = vnoise(dir * 2.0 + warp        + camOff * 1.0  + d1);
    float n2 = vnoise(dir * 4.0 + warp * 1.4  + camOff * 0.55 + d2);
    float n3 = vnoise(dir * 8.0 + warp * 1.9  + camOff * 0.28 + d3);
    float nb = n1 * 0.55 + n2 * 0.30 + n3 * 0.15;
    // pseudo-valaistus: keskikerroksen kohina-gradientti → varjostus pyöreille pilville
    float e = 0.07;
    float gx = vnoise(dir * 4.0 + warp * 1.4 + camOff * 0.55 + d2 + vec3(e, 0.0, 0.0)) - n2;
    float gy = vnoise(dir * 4.0 + warp * 1.4 + camOff * 0.55 + d2 + vec3(0.0, e, 0.0)) - n2;
    float shade = clamp(0.65 + (gx + gy) * uNebLight * 9.0, 0.25, 1.35);
    float nq = floor(nb * 4.0) / 4.0;        // portaat → litteät palat (cel)
    vec3 neb = mix(uNebA, uNebB, smoothstep(0.35, 0.65, nb)) * shade;
    col = mix(col, neb, nq * uNebStrength);

    // 3) TÄHDET — 3 SYVYYSKERROSTA (parallaksi: lähin kirkas+iso liikkuu eniten)
    vec3 sp = cameraPosition * uStarParallax;
    // kerros 1 (lähin): harva, kirkas, iso, suurin parallaksi
    {
      vec3 sdir = dir * (38.0 * uStarDensity) + sp * 1.0;
      vec3 sc = floor(sdir);
      float star = step(0.985, hash3(sc));
      float sd = step(length(fract(sdir) - 0.5), 0.18);
      col = mix(col, uStarCol, star * sd);
    }
    // kerros 2 (keski): keskitiheys, keskiparallaksi
    {
      vec3 sdir = dir * (68.0 * uStarDensity) + sp * 0.5;
      vec3 sc = floor(sdir);
      float star = step(0.975, hash3(sc + 7.3));
      float sd = step(length(fract(sdir) - 0.5), 0.15);
      col = mix(col, uStarCol * 0.82, star * sd);
    }
    // kerros 3 (kaukana): tiheä, himmeä, pieni, EI parallaksia
    {
      vec3 sdir = dir * (112.0 * uStarDensity);
      vec3 sc = floor(sdir);
      float star = step(0.97, hash3(sc + 19.1));
      float sd = step(length(fract(sdir) - 0.5), 0.12);
      col = mix(col, uStarCol * 0.6, star * sd);
    }

    // 3b) VALOKEILAT (Spider-Verse light shaftit) — diagonaaliset valosäteet ylhäältä → ulottuvuus
    //     sin() suunnasta (saumaton, ei atan-napaa) + caustic-huojunta + cel-kvantisointi
    float shaft = sin((dir.x * 1.7 + dir.y * 2.6 + dir.z * 0.5) * uRayCount + uTime * uRaySpeed
                      + (nb - 0.5) * 3.0);              // virtaus vinouttaa keiloja → vedenalainen väre
    shaft = pow(max(shaft, 0.0), 3.0);                  // terävät, erilliset keilat
    float shaftFade = smoothstep(-0.5, 0.7, dir.y);     // voimakkaammat ylhäällä (valo tulee yläältä)
    col += uRayColor * shaft * shaftFade * uRays;

    // 4) BEN-DAY halftone — AIDOSTI KIINNI KUVUSSA (3D): pehmeästi sekoitettu triplanaari → ei saumaa
    vec2 scr = gl_FragCoord.xy / uResolution;
    float dd = distance(scr, vec2(0.5));
    // pisteruudukko maailmansuunnasta → tarttuu pallon pintaan, kiertyy ja parallaksoi kuvun mukana
    vec3 hp = dir * uDotScale + cameraPosition * uDotParallax;
    float tone = smoothstep(0.9, 0.05, dd);  // printti-vinjetti: isommat pisteet keskellä
    float depth = mix(0.92, 1.22, clamp(nb, 0.0, 1.0)); // nebulan tiheys → ilmaperspektiivi
    float r = tone * depth;
    // sama rasteri kolmella tasolla; sekoitetaan pehmeästi suunnan painoilla → saumaton kaarevalla pinnalla
    float cx = htCov(hp.zy, r, uDotMode);
    float cy = htCov(hp.xz, r, uDotMode);
    float cz = htCov(hp.xy, r, uDotMode);
    vec3 w = pow(abs(dir), vec3(uDotSharpness));
    w /= (w.x + w.y + w.z + 1e-5);
    float dots = cx * w.x + cy * w.y + cz * w.z;
    float swap = mod(floor(hp.x) + floor(hp.y) + floor(hp.z), 2.0); // CMYK-henki (3D-shakki → ei saumaa)
    vec3 dotCol = mix(uDotA, uDotB, swap);
    col = mix(col, dotCol, dots * uDotStrength);

    // 4b) PERSPEKTIIVINEN TRON-GRID (pelillinen syvyys) — lattia + katto, keskelle jää avoin tila
    if (uGridOn > 0.5) {
      float lon = atan(dir.z, dir.x);
      float lat = asin(clamp(dir.y, -1.0, 1.0));
      vec2 guv = vec2(lon, lat) * uGridScale + vec2(uTime * uGridScroll, 0.0); // hidas vyöryminen
      vec2 gg = abs(fract(guv) - 0.5);
      float lw = 0.04;
      float line = max(1.0 - smoothstep(0.0, lw, gg.x), 1.0 - smoothstep(0.0, lw, gg.y));
      // näkyy lattiassa+katossa, häipyy horisonttiin (avoin keskivyöhyke korttien kohdalla)
      float gfade = pow(smoothstep(0.12, 0.62, abs(dir.y)), uGridFade);
      col += uGridColor * line * gfade * uGridOpacity;
    }

    // 5) VIGNETTE (syvennetty draaman vuoksi) + scanlines + glitch-aksentti
    col = mix(uEdge, col, smoothstep(1.15, 0.25, dd));
    if (uScanlines > 0.001) {
      float sl = 0.5 + 0.5 * sin(scr.y * uResolution.y * 1.2 - uTime * 2.0);
      col *= 1.0 - uScanlines * sl;
    }
    if (uGlitch > 0.001) {
      float row = floor(scr.y * 90.0);
      float gch = step(1.0 - uGlitch * 0.3, hash3(vec3(row, floor(uTime * 12.0), 0.0)));
      col.r += gch * uGlitch * 0.6;
      col.b -= gch * uGlitch * 0.4;
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

// --- SISÄKKÄISET PALLOKERROKSET (läpinäkyvät): tähdet/datahiukkaset + nebula-utu + ENERGIA-/DATASAUMAT ---
const LAYER_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vDir;
  uniform float uTime;
  uniform vec3  uStarCol;
  uniform vec3  uNebCol;
  uniform vec3  uCrackCol;
  uniform float uStarDensity;
  uniform float uStarSize;
  uniform float uNeb;
  uniform float uCrack;
  uniform float uOpacity;
  uniform float uDigital;     // 0 = pyöreät tähdet, 1 = digitaaliset hiukkaset (neliöt/bitit)
  uniform float uCrackLayers; // säröjen syvyyskerrokset (1..3)
  uniform float uCrackFlow;   // valon virtausnopeus saumoissa
  uniform float uFlowCount;   // pulssien määrä (1..3)
  uniform float uNodeGlow;    // solmukohtien kirkkaus
  uniform float uNodePulse;   // solmujen sykkeen voimakkuus
  uniform float uCrackWarp;   // domain-warp (orgaanisuus)
  uniform float uEdgeSharp;   // saumareunan terävyys (0 pehmeä → 1 terävä)
  uniform float uCrackFlare;  // satunnaiset energialeimahdukset

  float hash3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float vnoise(vec3 p){
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash3(i), n100 = hash3(i + vec3(1.0,0.0,0.0));
    float n010 = hash3(i + vec3(0.0,1.0,0.0)), n110 = hash3(i + vec3(1.0,1.0,0.0));
    float n001 = hash3(i + vec3(0.0,0.0,1.0)), n101 = hash3(i + vec3(1.0,0.0,1.0));
    float n011 = hash3(i + vec3(0.0,1.0,1.0)), n111 = hash3(i + vec3(1.0,1.0,1.0));
    float x00 = mix(n000, n100, f.x), x10 = mix(n010, n110, f.x);
    float x01 = mix(n001, n101, f.x), x11 = mix(n011, n111, f.x);
    return mix(mix(x00, x10, f.y), mix(x01, x11, f.y), f.z);
  }
  // 3D-voronoi → (F1, F2, F3) + lähimmän solun id. Sauma = F2-F1≈0, solmu = F3-F1≈0
  vec3 voro3(vec3 p, out vec3 cellId){
    vec3 b = floor(p), f = fract(p);
    float f1 = 9.9, f2 = 9.9, f3 = 9.9;
    cellId = b;
    for(int x = -1; x <= 1; x++)
    for(int y = -1; y <= 1; y++)
    for(int z = -1; z <= 1; z++){
      vec3 g = vec3(float(x), float(y), float(z));
      vec3 o = vec3(hash3(b + g), hash3(b + g + 11.5), hash3(b + g + 23.3));
      vec3 r = g + o - f;
      float d = dot(r, r);
      if(d < f1){ f3 = f2; f2 = f1; f1 = d; cellId = b + g; }
      else if(d < f2){ f3 = f2; f2 = d; }
      else if(d < f3){ f3 = d; }
    }
    return vec3(sqrt(f1), sqrt(f2), sqrt(f3));
  }

  void main(){
    vec3 dir = normalize(vDir);
    vec3 col = vec3(0.0);
    float a = 0.0;

    // HIUKKASET — vaihteleva koko JA kirkkaus (koonvaihtelu luetaan etäisyytenä = syvyys)
    vec3 sdir = dir * (52.0 * uStarDensity);
    vec3 sc = floor(sdir);
    float present = step(0.93, hash3(sc));
    float size = mix(0.06, 0.22, hash3(sc + 3.1)) * uStarSize;
    float bright = mix(0.25, 1.0, hash3(sc + 7.7));
    vec3 fc = fract(sdir) - 0.5;
    float shape;
    if (uDigital > 0.5) {
      // DIGITAALINEN hiukkanen: terävä neliö / bitti (näyttötuntu)
      float sq = max(abs(fc.x), abs(fc.y));
      shape = present * (1.0 - smoothstep(size, size * 1.25, sq)) * bright;
    } else {
      float sdis = length(fc);
      shape = present * smoothstep(size, size * 0.35, sdis) * bright;
    }
    col += uStarCol * shape;
    a = max(a, shape);

    // NEBULA-utu (pehmeä additiivinen hehku)
    if (uNeb > 0.001) {
      float nb = vnoise(dir * 3.0 + vec3(uTime * 0.01, 0.0, uTime * 0.006));
      float wisp = smoothstep(0.62, 0.96, nb) * uNeb;
      col += uNebCol * wisp;
      a = max(a, wisp * 0.8);
    }

    // ENERGIA-/DATASAUMAT — monikerros voronoi-verkko, virtaava valo, sykkivät solmut, leimahdukset
    if (uCrack > 0.001) {
      for(int li = 0; li < 3; li++){
        if(float(li) >= uCrackLayers) break;
        float lf = float(li);
        float lscale  = 4.0 * (1.0 + lf * 0.9);      // kaukaisemmat kerrokset tiheämpiä
        float lbright = uCrack * (1.0 - lf * 0.30);  // kaukaisemmat himmeämpiä
        float ew = mix(0.11, 0.025, uEdgeSharp) * (1.0 + lf * 0.6); // kaukana sumeampi
        // domain-warp → saumat eivät näytä liian suorilta/geometrisilta
        vec3 wv = vec3(
          vnoise(dir * 2.0 + vec3(uTime * 0.02, 0.0, lf)),
          vnoise(dir * 2.0 + vec3(0.0, uTime * 0.017, 3.0 + lf)),
          vnoise(dir * 2.0 + vec3(1.7, 0.0, uTime * 0.015 + lf))
        ) - 0.5;
        vec3 q = dir * lscale + wv * uCrackWarp + cameraPosition * (0.025 * (lf + 1.0));
        vec3 cid;
        vec3 ff = voro3(q, cid);
        float edge = 1.0 - smoothstep(0.0, ew, ff.y - ff.x);
        // VIRTAAVA VALO: pulssit kulkevat verkon läpi (data johdoissa)
        float pulse = 0.0;
        for(int pi = 0; pi < 3; pi++){
          if(float(pi) >= uFlowCount) break;
          float along = dot(q, normalize(vec3(1.0, 0.7, 0.3) + float(pi)));
          pulse += 0.5 + 0.5 * sin(along * 1.4 - uTime * uCrackFlow * 6.0 + float(pi) * 2.1);
        }
        pulse /= max(uFlowCount, 1.0);
        float flowBright = mix(0.5, 1.0, pulse);
        // SOLMUT: kulmapisteet (F3≈F1) → pieni hehkuva node joka sykkii
        float node = 1.0 - smoothstep(0.0, 0.12, ff.z - ff.x);
        float nodeP = 0.5 + 0.5 * sin(uTime * 2.5 + hash3(cid) * 6.2831);
        float nodeB = node * uNodeGlow * mix(1.0 - uNodePulse, 1.0, nodeP);
        // LEIMAHDUKSET: satunnainen sauma välähtää kirkkaammin ja vaimenee
        float flare = step(1.0 - uCrackFlare * 0.12, hash3(cid + floor(uTime * 0.6)));
        float flareB = flare * (0.5 + 0.5 * sin(uTime * 8.0)) * edge;
        float c = edge * flowBright * lbright + nodeB + flareB * 0.9;
        col += uCrackCol * c;
        a = max(a, clamp(c, 0.0, 1.0));
      }
    }

    gl_FragColor = vec4(col, a * uOpacity);
  }
`;

// --- Kortti: pyöristetty SDF-suorakaide + KUVA KOMPOSOITU LASIIN (glassmorphism) + fresnel + sukellus ---
const CARD_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uDive;
  uniform float uHover;
  uniform float uHoverLift;    // hover-nosto (CONFIG.card.hoverLift)
  uniform vec2  uMouse;        // hiiren osumakohta kortin UV:ssä
  uniform float uQuadAspect;   // kortin leveys/korkeus
  uniform float uRippleFreq;   // vesiwobble: taajuus
  uniform float uRippleSpeed;  // vesiwobble: nopeus
  uniform float uRippleAmp;    // vesiwobble: amplitudi
  uniform float uRippleRadius; // vesiwobble: vaikutussäde
  varying vec2 vUv;
  varying vec3 vViewNormal;
  varying vec3 vViewPos;
  void main(){
    vUv = uv;
    vec3 pos = position;
    // hover: pieni nosto kohti kameraa
    pos.z += uHover * uHoverLift;
    // VESIWOBBLE hiiren kohdalla (sama taajuus/vaihe kuin fragmentissa → ei tärinää)
    float md = length((uv - uMouse) * vec2(uQuadAspect, 1.0));
    pos.z += sin(md * uRippleFreq - uTime * uRippleSpeed) * uRippleAmp * 2.0 * uHover * smoothstep(uRippleRadius, 0.0, md);
    // sukelluksen aaltoileva pinta (radiaalinen)
    float r = length(uv - 0.5);
    pos.z += sin(r * 28.0 - uTime * 6.0) * 0.14 * uDive;
    // litteä etupinta → normaali ulos (jaettu fresnel/sheeni rungon kanssa = yksi pinta)
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vViewPos = mv.xyz;
    vViewNormal = normalize(normalMatrix * vec3(0.0, 0.0, 1.0));
    gl_Position = projectionMatrix * mv;
  }
`;
const CARD_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uTex;       // korttipohjan sisältö (ikoni+otsikko+teksti+nappi), tausta läpinäkyvä
  uniform vec3  uTint;         // kategoriaväri (neonreuna + aksentit)
  uniform float uFocus;        // 0 = tausta (himmeä), 1 = etukortti
  uniform float uHover;
  uniform float uDive;         // 0..1 sukellus
  uniform float uTime;
  uniform float uOpacity;
  uniform float uQuadAspect;   // kortin leveys/korkeus
  uniform float uCorner;       // kulman pyöristys
  uniform float uContentInset; // sisällön reunamarginaali
  uniform float uGlassOpacity; // lasin läpinäkyvyys (1 = umpinainen)
  uniform float uGradient;     // pystygradientti
  uniform float uInnerGlow;    // sisähehku reunoilla
  uniform float uRimPow;       // fresnelin terävyys
  uniform float uRimStrength;  // fresnelin voima
  uniform float uReflection;   // fake-ympäristöheijastus
  uniform float uSheen;        // animoitu kiilto
  varying vec2 vUv;
  varying vec3 vViewNormal;
  varying vec3 vViewPos;

  // pyöristetyn suorakaiteen etäisyysfunktio
  float roundedBox(vec2 p, vec2 b, float r){
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
  }
  void main(){
    // SDF normalisoidussa tilassa (korkeus = 1, leveys = quadAspect)
    vec2 p = (vUv - 0.5) * vec2(uQuadAspect, 1.0);
    vec2 b = vec2(0.5 * uQuadAspect, 0.5);
    float d = roundedBox(p, b, uCorner);
    float aa = 0.006;
    float alpha = 1.0 - smoothstep(-aa, aa, d);
    if (alpha <= 0.001) discard;

    vec3 N = normalize(vViewNormal);
    vec3 V = normalize(-vViewPos);
    float ndv = clamp(dot(N, V), 0.0, 1.0);

    // === TUMMA NEUTRAALI LASI (navy) + ripaus kategoriaväriä (referenssin tumma lasi) ===
    vec3 baseDark = vec3(0.018, 0.025, 0.045);
    vec3 glass = mix(baseDark, uTint * 0.16, 0.30);
    glass *= mix(1.0 - uGradient, 1.0 + uGradient * 0.55, clamp(vUv.y, 0.0, 1.0)); // pystygradientti
    vec3 Rr = reflect(-V, N); float sky = Rr.y * 0.5 + 0.5;                        // fake-heijastus
    glass += mix(vec3(0.01, 0.015, 0.03), vec3(0.40, 0.45, 0.60), pow(sky, 1.5)) * uReflection;
    glass += uTint * pow(1.0 - ndv, 1.5) * uInnerGlow * 0.25;                      // sisähehku reunoilla

    vec3 col = glass * mix(0.4, 1.0, uFocus); // taustakortit himmeämpiä

    // === SISÄLTÖ (ikoni/otsikko/teksti/nappi) komposoidaan lasin päälle, terävänä ===
    vec2 cuv = (vUv - 0.5) / max(1.0 - 2.0 * uContentInset, 0.001) + 0.5;
    float rr = length(vUv - 0.5);
    cuv += (vUv - 0.5) * sin(rr * 24.0 - uTime * 6.0) * 0.04 * uDive; // sukellusrefraktio
    float inb = step(0.0, cuv.x) * step(cuv.x, 1.0) * step(0.0, cuv.y) * step(cuv.y, 1.0);
    vec4 content = texture2D(uTex, cuv);
    float ca = content.a * inb;
    col = mix(col, content.rgb, ca * (0.4 + 0.6 * uFocus));

    // === LASIVALO (jaettu rungon kanssa) ===
    float fres = pow(1.0 - ndv, uRimPow);
    col += uTint * fres * (uRimStrength * (0.5 + 0.5 * uFocus) + uHover * 0.4);   // fresnel-reuna
    col += uTint * smoothstep(0.012, 0.0, abs(d)) * (0.35 + uHover * 0.5);        // ohut neonreunaviiva
    vec3 L = normalize(vec3(0.45, 0.65, 0.85));
    float spec = pow(max(dot(reflect(-L, N), V), 0.0), 28.0);
    col += vec3(1.0) * spec * uSheen * (0.4 + 0.6 * uFocus);                       // spekulaarikiilto
    float sweep = sin((vViewPos.x - vViewPos.y) * 0.7 + uTime * 0.5);
    col += vec3(0.6, 0.65, 0.85) * smoothstep(0.9, 1.0, sweep) * uSheen * 0.3 * (0.3 + 0.7 * uFocus);

    // sukelluksen loppu → valkoinen läpäisy
    col = mix(col, vec3(1.4), smoothstep(0.72, 1.0, uDive) * 0.7);

    // LÄPINÄKYVYYS: sisältöalueet umpinaisia; ympäröivä lasi uGlassOpacityn mukaan. Sukelluksessa täysi.
    float panelA = mix(uGlassOpacity, 1.0, ca);
    float a = alpha * uOpacity * max(panelA, smoothstep(0.6, 1.0, uDive));
    if (a <= 0.002) discard;
    gl_FragColor = vec4(col, a);
  }
`;

// --- Runko: TUMMA LASIPANEELI (tumma pohja + gradientti + sisähehku + fresnel-reuna + fake-heijastus) ---
const BODY_VERT = /* glsl */ `
  uniform float uHeight;
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  void main(){
    vY = position.y / uHeight + 0.5;        // 0 alhaalla → 1 ylhäällä (pystygradientti)
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = mv.xyz;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;
const BODY_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3  uTint;         // kategoriaväri (aksentti)
  uniform float uDarken;       // pohjan tummennus
  uniform float uGradient;     // pystygradientti
  uniform float uInnerGlow;    // sisähehku reunoilla
  uniform float uRimPow;       // fresnelin terävyys
  uniform float uRimStrength;  // fresnelin voimakkuus
  uniform float uReflection;   // fake-heijastus
  uniform float uSheen;        // animoitu kiilto
  uniform float uEdgeEmissive; // neonreunan perustaso (aina päällä)
  uniform float uOpacity;      // lasin läpinäkyvyys
  uniform float uHover;
  uniform float uFocus;
  uniform float uTime;
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  void main(){
    vec3 N = normalize(vN);
    vec3 V = normalize(-vV);
    float ndv = clamp(dot(N, V), 0.0, 1.0);

    // tumma lasipohja: kategoriaväri voimakkaasti tummennettuna
    vec3 col = mix(uTint, vec3(0.0), uDarken);
    // pystygradientti → tilavuus (ylhäällä vaaleampi)
    col *= mix(1.0 - uGradient, 1.0 + uGradient * 0.6, clamp(vY, 0.0, 1.0));

    // fake-ympäristöheijastus: pseudo-taivasgradientti → kiilto näkyy pimeässäkin
    vec3 R = reflect(-V, N);
    float sky = R.y * 0.5 + 0.5;
    vec3 refl = mix(vec3(0.02, 0.03, 0.06), vec3(0.45, 0.5, 0.65), pow(sky, 1.5));
    col += refl * uReflection;

    // fresnel-reunavalo kategoriavärillä (liikkuu kameran kiertäessä → 3D-vihje) + neonreunan perustaso
    float fres = pow(1.0 - ndv, uRimPow);
    col += uTint * fres * (uRimStrength * (0.6 + 0.6 * uFocus + 0.5 * uHover) + uEdgeEmissive);

    // sisähehku: reunoja kohti hieman kirkastuva
    col += uTint * pow(1.0 - ndv, 1.5) * uInnerGlow * 0.3;

    // hidas diagonaalinen specular-pyyhkäisy → sitoo taustan virtaavaan valoon
    float sweep = sin((vV.x - vV.y) * 0.7 + uTime * 0.5);
    col += vec3(0.6, 0.65, 0.85) * smoothstep(0.9, 1.0, sweep) * uSheen * 0.3 * (0.4 + 0.6 * uFocus);

    gl_FragColor = vec4(col, uOpacity);
  }
`;

// --- Halo: pehmeä additiivinen hehku kortin takana (ankkuroi avaruuteen, bloom nappaa) ---
const HALO_VERT = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const HALO_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform vec3  uColor;
  uniform float uIntensity;
  uniform float uOpacity;
  void main(){
    float d = length(vUv - 0.5) * 2.0;             // 0 keskellä → 1 reunalla
    float a = pow(clamp(1.0 - d, 0.0, 1.0), 2.4);  // pehmeä pyöreä halo
    gl_FragColor = vec4(uColor * uIntensity, a * uOpacity);
  }
`;

// --- Kehys: OHUT NEONREUNA (fresnel-siluetti) — hehkuu vain reunalla, litteät pinnat läpinäkyviä ---
const FRAME_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = mv.xyz;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAME_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vN;
  varying vec3 vV;
  uniform vec3  uTint;
  uniform float uGlow;      // hehkun voimakkuus (hover nostaa)
  uniform float uEdgePow;   // reunan terävyys (suuri → ohut neonviiva)
  uniform float uOpacity;   // intro/etäisyys-paljastus
  void main(){
    vec3 N = normalize(vN);
    vec3 V = normalize(-vV);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    // hehku VAIN siluetissa (grazing) → ohut neonreuna joka kulmasta, ei pastellislabia
    float edge = pow(1.0 - ndv, uEdgePow);
    float a = edge * uOpacity;
    if (a <= 0.002) discard;
    gl_FragColor = vec4(uTint * uGlow * edge, a);
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

// --- UUSI TAUSTA: pelkistetty tumma avaruus-dome (hienovarainen radiaaligradientti + vahva vignette) ---
const BG_DARK_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vDir;
  uniform vec3  uCenter;     // keskiväri (tumma violetti)
  uniform float uVignette;   // reunatummennus
  uniform vec2  uResolution;
  void main(){
    vec2 scr = gl_FragCoord.xy / uResolution;
    float dd = distance(scr, vec2(0.5));
    // hyvin hienovarainen gradientti keskeltä → puhdas musta reunoilla (ääretön tila)
    float g = smoothstep(0.0, max(uVignette, 0.001), dd);
    vec3 col = mix(uCenter, vec3(0.0), g);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// --- HIUKKASVIRTA: pisteet, sijainnit integroidaan CPU:lla (curl-noise-virtaviivat → kaartuvat nauhat) ---
const FLOW_VERT = /* glsl */ `
  attribute float aSize;     // 0..1 (biasoitu: useimmat pieniä, harvat isoja)
  attribute float aType;     // 0 = pehmeä piste, 1 = plus-merkki
  attribute vec3  aColor;
  uniform float uSizeMin;
  uniform float uSizeMax;
  uniform float uSizeScale;
  uniform float uOpacity;
  uniform float uFadeInner;
  uniform float uFadeOuter;
  uniform float uHalf;        // laatikon puolikas (radiaalihäivytystä varten)
  varying vec3  vColor;
  varying float vType;
  varying float vAlpha;
  void main(){
    // sijainnit integroidaan CPU:lla (curl-noise-virtaviivat) → vertex vain projisoi + koko/alpha
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float sz = mix(uSizeMin, uSizeMax, aSize);
    gl_PointSize = clamp(sz * uSizeScale / max(-mv.z, 0.1), 1.0, 64.0); // sizeAttenuation → syvyys
    gl_Position = projectionMatrix * mv;
    vColor = aColor;
    vType = aType;
    // avoimuus: häivytä kaukaiset (origosta) → tyhjät reunat, avara avaruus
    float r = length(position) / uHalf;
    float radial = 1.0 - smoothstep(uFadeInner, uFadeOuter, r);
    vAlpha = uOpacity * radial * mix(0.45, 1.0, aSize);
  }
`;
const FLOW_FRAG = /* glsl */ `
  precision highp float;
  varying vec3  vColor;
  varying float vType;
  varying float vAlpha;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float mask;
    if (vType > 0.5) {
      // plus-merkki (pehmeät reunat)
      float bar = 0.11, arm = 0.46;
      float hbar = (1.0 - smoothstep(bar, bar + 0.06, abs(c.y))) * step(abs(c.x), arm);
      float vbar = (1.0 - smoothstep(bar, bar + 0.06, abs(c.x))) * step(abs(c.y), arm);
      mask = max(hbar, vbar);
    } else {
      // pehmeä pyöreä hehkupiste (radial alpha)
      mask = pow(1.0 - smoothstep(0.0, 0.5, length(c)), 1.6);
    }
    float a = mask * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);  // additiivinen blending → bloom-hehku
  }
`;

/* =====================================================================
   3D-SCENEN RAKENNUS
   ===================================================================== */
let renderer, scene, camera, composer, bloomPass, postPass;
let ringGroup, particleGroup;
let bubbleMeshes = [], bubbleMat = null;  // VAIHE 1: 7 proseduraalista puhekuplaa (korttien paikoilla)
let bgMat = null;             // taustashaderin materiaali (uTime-päivitys)
let bgMesh = null;            // kaareva avaruus-dome (pallon sisäpinta)
let bgLayers = [];            // sisäkkäiset läpinäkyvät pallokerrokset (parallaksi)
let treeGroup = null;         // ladattu GLB-3D-malli (korvaa vanhan piirilevypuun) — kortit kiertävät sitä
let treeMixer = null;         // AnimationMixer, jos GLB sisältää animaatioita (esim. tuulessa heiluminen)
let treeT = 0;                // edellinen aika (dt AnimationMixerille)
let treeReady = Promise.resolve(); // ratkeaa kun puu-GLB on ladattu (tai epäonnistunut) → sivunlataus-overlay odottaa tätä
let gridMesh = null, gridMat = null; // neongridi-lattia puun alla

// KÄÄRME-VALOEFEKTI (KEVYT, TEKSTUURIPOHJAINEN): N hehkuvaa viivaa (CONFIG.grid.snakeCount kpl)
// kulkee ruudukon linjoja pitkin eteenpäin, kääntyen risteyksissä satunnaiseen suuntaan (ei
// koskaan takaisin). Aiempi malli laski JOKAISELLE PIKSELILLE etäisyyden jokaisen käärmeen
// jokaiseen hännän segmenttiin (O(snakeCount * tailLength) per pikseli) — kallista jos käärmeitä
// on paljon (esim. 15). UUSI, HALVEMPI TAPA: jo kuljettu (kiinteä) häntä BAKATAAN CPU:lla pieneen
// tekstuuriin kerran per frame (muutama texel per käärme — halpaa), ja shader tekee sen jälkeen
// VAIN 2 texture2D-hakua per pikseli RIIPPUMATTA käärmeiden määrästä (O(1) GPU-kustannus). Vain
// käärmeen NYKYINEN liikkuva pääsegmentti (sub-cell-tarkka, ei voi bakata ilman nykimistä)
// lasketaan edelleen suoraan per-pikseli-etäisyytenä, mutta se on vain YKSI segmentti per käärme
// eli O(snakeCount) halpaa laskentaa, ei O(snakeCount * tailLength). Ks. buildGroundGrid().
const SNAKE_AXES = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];
const SNAKE_MAX_COUNT = 100;  // sama luku kuin GLSL:n MAX_SNAKES #define (pää-uniformitaulukoiden koko)
const SNAKE_LIFETIME = 10;   // sekuntia (perusarvo) — jokainen käärme lähtee puun kehältä uudelleen tämän ajan jälkeen
const SNAKE_LIFETIME_JITTER = 0.4; // ±40% satunnaisvaihtelu per käärme, jotta lähdöt rytmittyvät epätahtiin
let snakes = [];              // [{ dir, points:[{x,z}], headDist, lastTime }, ...] — yksi per käärme
let snakePalette = [];        // esilasketut LINEAARISET värit (THREE.Color) paletista, kierrätetään
let snakeTexN = 48, snakeTexHalf = 24; // tekstuurin resoluutio + origon offset (lasketaan buildGroundGrid:ssä)
let snakeTexV = null, snakeTexH = null;   // DataTexture: pystyreunat (vakio X) / vaakareunat (vakio Z)
let snakeDataV = null, snakeDataH = null; // Uint8Array-puskurit joita kirjoitetaan CPU:lla joka frame

function clamp01(v) { return Math.min(1, Math.max(0, v)); }
function smoothstep01(t) { return t * t * (3 - 2 * t); }

// Luo yhden käärmeen tiiviisti puun tyven ALUEELTA (lähellä origoa, jossa puu seisoo) —
// käärmeet lähtevät liikkeelle kuin "pulssi" puusta ulospäin, kukin satunnaiseen suuntaansa —
// käytetään sekä alkualustuksessa että kun käärme "poistetaan ja luodaan uudelleen" ylitettyään
// näkyvyysrajan.
function snakeSpawn(G, time) {
  const cell = G.cellSize;
  const spawnR = cell * 2; // tiukasti puun tyven kohdalla/lähellä, ei hajallaan koko kentällä
  const gx = Math.round((Math.random() * 2 - 1) * spawnR / cell);
  const gz = Math.round((Math.random() * 2 - 1) * spawnR / cell);
  const t0 = time == null ? 0 : time;
  // Jokaisella käärmeellä oma, hieman satunnainen elinikä (~10s ±40%) — näin ne eivät kaikki
  // lähde uudelleen liikkeelle täsmälleen samalla hetkellä vaan rytmi hajoaa luonnollisesti ajan myötä.
  const lifetime = SNAKE_LIFETIME * (1 + (Math.random() * 2 - 1) * SNAKE_LIFETIME_JITTER);
  return {
    dir: SNAKE_AXES[Math.floor(Math.random() * SNAKE_AXES.length)],
    points: [{ x: gx * cell, z: gz * cell }],
    headDist: 0,
    lastTime: null,
    straightCount: 0, // kuinka monta solua on jo kuljettu suoraan nykyiseen suuntaan (kiinteä 2+1-kaava)
    birthTime: t0,
    lifetime, // tämän yksilön oma elinikä (sekuntia) ennen uudelleensyntymää
  };
}
// Palauttaa annettuun suuntaan nähden KOHTISUORAT vaihtoehdot (vasen/oikea) — käytetään kiinteässä
// "kaksi eteenpäin, sitten yksi sivulle" -liikekaavassa (ei koskaan suoraan jatkoa eikä peruutusta).
function snakePerp(dir) {
  return dir.x !== 0
    ? [{ x: 0, z: 1 }, { x: 0, z: -1 }]
    : [{ x: 1, z: 0 }, { x: -1, z: 0 }];
}
function snakeInit() {
  const G = CONFIG.grid;
  const n = G.snakeEnabled ? Math.min(G.snakeCount, SNAKE_MAX_COUNT) : 0; // pois käytöstä → 0 käärmettä
  // Alkutilanteessa jokaisen käärmeen "syntymä" siirretään satunnaisesti taaksepäin ajassa
  // (0..lifetime), jotta ensimmäinenkin uudelleensyntymäkierros on heti rytmillisesti hajautettu
  // eikä kaikki 50 käärmettä lähde uudelleen liikkeelle samanaikaisesti.
  snakes = Array.from({ length: n }, () => {
    const s = snakeSpawn(G, 0);
    s.birthTime = -Math.random() * s.lifetime;
    return s;
  });
  snakePalette = G.snakeColors.map(colRGB255); // linear THREE.Color per paletin väri
  if (gridMat) gridMat.uniforms.uSnakeTotal.value = n;
}
// Piirtää yhden (aina tasan yhden solun mittaisen) reunasegmentin oikeaan tekstuuripuskuriin.
// Väri tallennetaan iällä ESIKERROTTUNA (premultiplied) suoraan additiiviseksi — jos kaksi
// käärmettä sattuisi samalle reunalle, kirkkaudet vain lasketaan yhteen (harvinaista, ok).
function snakeWriteEdge(a, b, cell, col, age) {
  if (age <= 0.002) return;
  const dx = Math.round((b.x - a.x) / cell);
  let cx, cy, arr;
  if (dx !== 0) { // vaakareuna (X vaihtuu, Z vakio)
    cx = Math.round(Math.min(a.x, b.x) / cell) + snakeTexHalf;
    cy = Math.round(a.z / cell) + snakeTexHalf;
    arr = snakeDataH;
  } else { // pystyreuna (Z vaihtuu, X vakio)
    cx = Math.round(a.x / cell) + snakeTexHalf;
    cy = Math.round(Math.min(a.z, b.z) / cell) + snakeTexHalf;
    arr = snakeDataV;
  }
  if (cx < 0 || cx >= snakeTexN || cy < 0 || cy >= snakeTexN) return;
  const idx = (cy * snakeTexN + cx) * 4;
  arr[idx]     = Math.min(255, arr[idx]     + col.r * 255 * age);
  arr[idx + 1] = Math.min(255, arr[idx + 1] + col.g * 255 * age);
  arr[idx + 2] = Math.min(255, arr[idx + 2] + col.b * 255 * age);
  arr[idx + 3] = Math.min(255, arr[idx + 3] + 255 * age);
}
// Kutsutaan joka framessa (animate()): siirtää jokaisen käärmeen päätä eteenpäin kiinteän
// "kaksi solua eteenpäin, sitten yksi sivulle (vasen/oikea)" -kaavan mukaan, respawnaa jos
// näkyvyysraja ylittyy, bakkaa kiinteän hännän tekstuuriin (halpaa: enintään ~tailLength
// kirjoitusta per käärme) ja
// päivittää pienen pää-uniformitaulukon (vain nykyinen liikkuva segmentti per käärme).
function snakeUpdate(time) {
  if (!snakes.length || !gridMat) return;
  const G = CONFIG.grid;
  const cell = G.cellSize;
  const visLimit = G.fadeRadius; // gridin oma näkyvyysraja (uFadeRadius) — sen jälkeen ruudukkokin on jo näkymätön
  const softBound = visLimit * 0.85; // suositaan suuntia jotka pysyvät mukavasti näkyvällä alueella
  const tailLen = G.snakeTailLength;
  const capLen = tailLen + 3; // pieni marginaali pehmeälle sisäänhäivytykselle
  snakeDataV.fill(0);
  snakeDataH.fill(0);
  const headA = gridMat.uniforms.uHeadA.value;
  const headB = gridMat.uniforms.uHeadB.value;
  const headColor = gridMat.uniforms.uHeadColor.value;
  for (let s = 0; s < snakes.length; s++) {
    let snake = snakes[s];
    if (snake.lastTime === null) snake.lastTime = time;
    const dt = Math.min(0.1, Math.max(0, time - snake.lastTime));
    snake.lastTime = time;
    snake.headDist += G.snakeSpeed * dt;
    while (snake.headDist >= cell) {
      snake.headDist -= cell;
      const last = snake.points[snake.points.length - 1];
      const nv = { x: last.x + snake.dir.x * cell, z: last.z + snake.dir.z * cell };
      snake.points.push(nv);
      if (snake.points.length > capLen) snake.points.shift(); // varaa tilaa liikkuvalle päälle
      // Kiinteä liikekaava: kaksi solua eteenpäin nykyiseen suuntaan, sitten yksi solu sivulle
      // (aina siihen suuntaan joka vie kauemmas puusta — ei koskaan suoraan jatkoa, peruutusta
      // eikä takaisin puuta kohti kääntymistä).
      snake.straightCount++;
      if (snake.straightCount < 2) {
        continue; // vielä kesken "kaksi eteenpäin" -vaihe, sama suunta jatkuu
      }
      snake.straightCount = 0;
      const perp = snakePerp(snake.dir);
      // Valitaan AINA se kohtisuora vaihtoehto (vasen TAI oikea) joka vie käärmeen KAUEMMAS
      // puun tyvestä (origosta) — ei koskaan sitä joka veisi lähemmäs tai kiertäisi käärmeen
      // takaisin itsensä ympäri. Näin etäisyys origosta kasvaa monotonisesti eikä käärme koskaan
      // palaa takaisinpäin puuta kohti.
      const cands = perp
        .map((d) => ({ d, dist: Math.hypot(nv.x + d.x * cell, nv.z + d.z * cell) }))
        .sort((a, b) => b.dist - a.dist);
      const withinBound = cands.filter((c) => c.dist < softBound);
      const best = (withinBound.length ? withinBound : cands)[0];
      snake.dir = best.d;
    }
    let last = snake.points[snake.points.length - 1];
    let head = { x: last.x + snake.dir.x * snake.headDist, z: last.z + snake.dir.z * snake.headDist };
    // Näkyvyysraja ylittyi (esim. useita käännöksiä ei onnistunut pysymään pehmeän rajan sisällä)
    // → käärme poistetaan ja luodaan uudelleen satunnaiseen kohtaan näkyvällä alueella sen sijaan
    // että se jäisi näkymättömiin kauas horisonttiin.
    // Kiinteä (mutta yksilöllisesti satunnaistettu) elinikä: jokainen käärme elää enintään
    // snake.lifetime sekuntia (~10s ± satunnaisvaihtelu), jonka jälkeen se lähtee puun kehältä
    // uudelleen liikkeelle (uusi satunnaissuunta) — riippumatta siitä ehtikö se ylittää
    // näkyvyysrajan vai ei. Yksilöllinen elinikä pitää lähdöt rytmillisesti hajautettuina.
    if (Math.hypot(head.x, head.z) > visLimit || (time - snake.birthTime) >= snake.lifetime) {
      snake = snakeSpawn(G, time);
      snakes[s] = snake;
      last = snake.points[0];
      head = { x: last.x, z: last.z };
    }
    const col = snakePalette[s % snakePalette.length];
    // Bakkaa kiinteät (jo kuljetut) segmentit tekstuuriin — sama ikä/haalistuvuuslaskenta kuin
    // aiemmin shaderissa, mutta nyt CPU:lla kerran per frame per segmentti (halpaa).
    const n = snake.points.length;
    for (let i = 0; i < n - 1; i++) {
      const ageRaw = (i - (n - 1 - tailLen)) / Math.max(tailLen, 1);
      const age = smoothstep01(clamp01(ageRaw));
      snakeWriteEdge(snake.points[i], snake.points[i + 1], cell, col, age);
    }
    // Käärmeen PÄÄSEGMENTTI (viimeisimmästä kiinteästä pisteestä nykyiseen sub-cell-tarkkaan
    // päähän) piirretään suoraan shaderissa (ei bakata) jotta liike näyttää sulavalta.
    headA[s].set(last.x, last.z);
    headB[s].set(head.x, head.z);
    headColor[s].copy(col);
  }
  snakeTexV.needsUpdate = true;
  snakeTexH.needsUpdate = true;
}
let flowPrev = 0;             // hiukkasvirran edellinen aika (CPU-integroinnin dt)
const cards = [];          // { mesh, mat, index, hover }
const cardMeshes = [];
let textures = {};

// tila
let entered = false, diving = false, modalOpen = false, scrollEnabled = false;
// aloitusnäkymä viimeiseen puhekuplaan (viimeisin kortti näkyy heti aloituksessa)
let tCurrent = CARDS.length - 1, tTarget = CARDS.length - 1, lastWheel = 0;
let camOrbitR = CONFIG.cameraEnterZ;  // kameran kiertoradan säde (intro kasvattaa cameraEnterZ→cameraZ)
let diveCancel = null;       // sukelluksen tweenin peruutus
let diveIndex = -1;          // aktiivisen sukelluksen kortti (paluuanimaatiota varten)
let revealP = 0;           // intron paljastus 0..1
let mouseX = 0, mouseY = 0;
const pointer = new THREE.Vector2(-2, -2);
const raycaster = new THREE.Raycaster();
const _camLocal = new THREE.Vector3();   // kameran rata renkaan paikalliskehyksessä (uudelleenkäyttö)
const _camTarget = new THREE.Vector3();  // kameran katsekohde renkaan paikalliskehyksessä
const _camUp = new THREE.Vector3();      // kameran ylössuunta = renkaan kallistettu ylösakseli (ei rollia)
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
  loadTreeModel();
  buildGroundGrid();
  buildCards();
  buildBubble();
  buildComposer();

  clock = new THREE.Clock();
}

// Tausta: kaareva Spider-Verse-avaruus (ison pallon sisäpinta, kamera sisällä)
function buildBackground() {
  if (!CONFIG.legacyBg) { buildDarkBackground(); return; }
  const C = CONFIG.comicBg;
  const geo = new THREE.SphereGeometry(C.domeRadius, 48, 32);
  const mat = new THREE.ShaderMaterial({
    vertexShader: BG_VERT,
    fragmentShader: BG_FRAG,
    side: THREE.BackSide,        // näytä pallon SISÄpinta (kamera sisällä)
    depthTest: false,
    depthWrite: false,
    fog: false,
    uniforms: {
      uBase: { value: colRGB255(C.baseColor) },
      uMid: { value: colRGB255(C.midColor) },
      uEdge: { value: colRGB255(C.edgeColor) },
      uDotA: { value: colRGB255(C.dotColorA) },
      uDotB: { value: colRGB255(C.dotColorB) },
      uStarCol: { value: colRGB255(C.starColor) },
      uNebA: { value: colRGB255(C.nebulaColorA) },
      uNebB: { value: colRGB255(C.nebulaColorB) },
      uDotScale: { value: C.dotScale },
      uDotStrength: { value: C.dotStrength },
      uDotParallax: { value: C.dotParallax },
      uDotSharpness: { value: C.dotSharpness },
      uStarDensity: { value: C.starDensity },
      uNebStrength: { value: C.nebulaStrength },
      uNebParallax: { value: C.nebulaParallax },
      uNebLight: { value: C.nebulaLight },
      uStarParallax: { value: C.starParallax },
      uCaustic: { value: C.caustic },
      uCausticScale: { value: C.causticScale },
      uRays: { value: C.rays },
      uRayColor: { value: colRGB255(C.rayColor) },
      uRayCount: { value: C.rayCount },
      uRaySpeed: { value: C.raySpeed },
      uDotMode: { value: C.dotMode === "pixel" ? 1 : 0 },
      uScanlines: { value: C.scanlines },
      uGlitch: { value: C.glitch },
      uGridOn: { value: C.grid.enabled ? 1 : 0 },
      uGridColor: { value: colRGB255(C.grid.color) },
      uGridScale: { value: C.grid.scale },
      uGridFade: { value: C.grid.fade },
      uGridScroll: { value: C.grid.scroll },
      uGridOpacity: { value: C.grid.opacity },
      uDrift: { value: C.drift },
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10;        // piirretään ensin → kaiken takana
  mesh.frustumCulled = false;
  scene.add(mesh);
  bgMat = mat;
  bgMesh = mesh;

  // SISÄKKÄISET PALLOKERROKSET (briefin 3-pallo-kokeilu): läpinäkyvät, additiiviset, eri pyörimisnopeus
  bgLayers = [];
  (C.layers || []).forEach((L, i) => {
    const lgeo = new THREE.SphereGeometry(L.radius, 32, 24);
    const lmat = new THREE.ShaderMaterial({
      vertexShader: BG_VERT,
      fragmentShader: LAYER_FRAG,
      side: THREE.BackSide,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uStarCol: { value: colRGB255(C.starColor) },
        uNebCol: { value: colRGB255(C.nebulaColorB) },
        uCrackCol: { value: colRGB255(L.crackColor || "90,230,255") },
        uStarDensity: { value: L.starDensity },
        uStarSize: { value: L.starSize },
        uNeb: { value: L.neb },
        uCrack: { value: L.crack },
        uOpacity: { value: L.opacity },
        uDigital: { value: L.digital ? 1 : 0 },
        uCrackLayers: { value: C.crack.layers },
        uCrackFlow: { value: C.crack.flow },
        uFlowCount: { value: C.crack.flowCount },
        uNodeGlow: { value: C.crack.nodeGlow },
        uNodePulse: { value: C.crack.nodePulse },
        uCrackWarp: { value: C.crack.warp },
        uEdgeSharp: { value: C.crack.edgeSharpness },
        uCrackFlare: { value: C.crack.flare },
      },
    });
    const lmesh = new THREE.Mesh(lgeo, lmat);
    lmesh.renderOrder = -9 + i;   // dome -10, sitten kerrokset uloimmasta sisimpään
    lmesh.frustumCulled = false;
    scene.add(lmesh);
    bgLayers.push({ mesh: lmesh, mat: lmat, speed: L.speed });
  });
}

// UUSI TAUSTA: yksi pelkistetty tumma avaruus-dome (tumma gradientti + vahva vignette, ei muuta)
function buildDarkBackground() {
  const C = CONFIG.bg;
  const geo = new THREE.SphereGeometry(80, 32, 24);
  const mat = new THREE.ShaderMaterial({
    vertexShader: BG_VERT,
    fragmentShader: BG_DARK_FRAG,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    fog: false,
    uniforms: {
      uCenter: { value: colRGB255(C.centerColor) },
      uVignette: { value: C.vignette },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uTime: { value: 0 },
    },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  scene.add(mesh);
  bgMat = mat;
  bgMesh = mesh;
  bgLayers = [];   // ei sisäkkäisiä kerroksia uudessa taustassa
}

// Sarjakuvahiukkaset (terävät CMYK-pisteet/plus-merkit, nykivä ~12fps liike, bloom-hehku)
function buildParticles() {
  if (!CONFIG.legacyBg) { buildFlow(); return; }
  particleGroup = new THREE.Group();
  const C = CONFIG.comicBg;
  const N = reduce ? Math.round(C.particleCount * 0.4) : C.particleCount;
  const positions = new Float32Array(N * 3);
  const sizes = new Float32Array(N);
  const typesArr = new Float32Array(N);     // 0 = piste, 1 = plus-merkki
  const colorArr = new Float32Array(N * 3);
  const palette = C.particleColors.map(colRGB255);
  for (let i = 0; i < N; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 60;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 36;
    positions[i * 3 + 2] = -25 + Math.random() * 30;
    sizes[i] = Math.random();
    typesArr[i] = Math.random() < 0.5 ? 1.0 : 0.0;
    const c = palette[(Math.random() * palette.length) | 0];
    colorArr[i * 3 + 0] = c.r; colorArr[i * 3 + 1] = c.g; colorArr[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aType", new THREE.BufferAttribute(typesArr, 1));
  geo.setAttribute("aColor", new THREE.BufferAttribute(colorArr, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,   // kirkkaat päällekkäiset → bloom-hehku
    uniforms: { uTime: { value: 0 }, uFps: { value: C.particleFps } },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aType;
      attribute vec3 aColor;
      uniform float uTime;
      uniform float uFps;
      varying float vType;
      varying vec3 vColor;
      void main(){
        // NYKIVÄ liike: kvantisoi aika ~12 fps → portaittainen (Spider-Verse-henki)
        float tq = floor(uTime * uFps) / uFps;
        vec3 p = position;
        p.y += sin(tq * 0.6 + position.x * 0.3) * 0.6;
        p.x += cos(tq * 0.5 + position.y * 0.25) * 0.4;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (aSize * 4.0 + 1.5) * (150.0 / -mv.z);  // syvyys: kaukana pienempi
        gl_Position = projectionMatrix * mv;
        vType = aType;
        vColor = aColor;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying float vType;
      varying vec3 vColor;
      void main(){
        vec2 c = abs(gl_PointCoord - 0.5);
        float mask;
        if (vType > 0.5) {
          // PLUS-merkki: kovareunainen risti
          float bar = 0.12;   // varren paksuus
          float arm = 0.46;   // varren pituus
          float h = step(c.x, bar) * step(c.y, arm);
          float v = step(c.y, bar) * step(c.x, arm);
          mask = max(h, v);
        } else {
          // PISTE: kovareunainen ympyrä (EI smoothstep → painettu piste)
          mask = step(length(c), 0.34);
        }
        if (mask < 0.5) discard;   // kovat reunat
        gl_FragColor = vec4(vColor, 1.0);
      }
    `,
  });
  const pts = new THREE.Points(geo, mat);
  particleGroup.add(pts);
  particleGroup.userData.mat = mat;
  scene.add(particleGroup);
}

// UUSI PÄÄELEMENTTI: maailmassa yhteen suuntaan virtaava curl-noise-hiukkasvirta (GPU)
function buildFlow() {
  particleGroup = new THREE.Group();
  const F = CONFIG.flow;
  const N = reduce ? Math.round(F.count * 0.4) : F.count;
  const half = F.boxSize * 0.5;
  const positions = new Float32Array(N * 3);
  const sizes = new Float32Array(N);
  const types = new Float32Array(N);
  const colorArr = new Float32Array(N * 3);
  const palette = F.colors.map(colRGB255);
  for (let i = 0; i < N; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * F.boxSize;
    positions[i * 3 + 1] = (Math.random() - 0.5) * F.boxSize;
    positions[i * 3 + 2] = (Math.random() - 0.5) * F.boxSize;
    // biasoi koko: useimmat pieniä, harvat kirkkaita isoja (avoimuus → kirkkaat harvassa)
    sizes[i] = Math.pow(Math.random(), 1.7);
    types[i] = Math.random() < F.plusRatio ? 1.0 : 0.0;
    const c = palette[(Math.random() * palette.length) | 0];
    colorArr[i * 3 + 0] = c.r; colorArr[i * 3 + 1] = c.g; colorArr[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aType", new THREE.BufferAttribute(types, 1));
  geo.setAttribute("aColor", new THREE.BufferAttribute(colorArr, 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), F.boxSize); // estä frustum-culling

  const dir = new THREE.Vector3(F.dir[0], F.dir[1], F.dir[2]).normalize();
  const pr = Math.min(window.devicePixelRatio, 2);
  const mat = new THREE.ShaderMaterial({
    vertexShader: FLOW_VERT,
    fragmentShader: FLOW_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,   // hehku → kytkeytyy bloomiin
    uniforms: {
      uTime: { value: 0 },              // (varattu; CPU integroi sijainnit)
      uSizeMin: { value: F.sizeMin },
      uSizeMax: { value: F.sizeMax },
      uSizeScale: { value: F.sizeScale * pr },
      uOpacity: { value: F.opacity },
      uFadeInner: { value: F.fadeInner },
      uFadeOuter: { value: F.fadeOuter },
      uHalf: { value: half },
    },
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -5;   // taustan ja korttien välissä (kortit päälle)
  particleGroup.add(pts);
  particleGroup.userData.mat = mat;
  // CPU-integrointia varten: curl-noise-virtaviivat (advektio + wrap)
  particleGroup.userData.flow = {
    positions, posAttr: geo.getAttribute("position"),
    half, box: F.boxSize,
    dirX: dir.x, dirY: dir.y, dirZ: dir.z,
    speed: F.speed, curlStrength: F.curlStrength, curlScale: F.curlScale,
  };
  scene.add(particleGroup);
}

// --- CPU curl-noise: nopea kokonaislukuhash + arvokohina + äärelliserotus (divergenssitön kenttä) ---
function fhash(x, y, z) {
  let n = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  n = ((n ^ (n >>> 13)) * 1274126177) | 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function fvnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const c000 = fhash(xi, yi, zi),         c100 = fhash(xi + 1, yi, zi);
  const c010 = fhash(xi, yi + 1, zi),     c110 = fhash(xi + 1, yi + 1, zi);
  const c001 = fhash(xi, yi, zi + 1),     c101 = fhash(xi + 1, yi, zi + 1);
  const c011 = fhash(xi, yi + 1, zi + 1), c111 = fhash(xi + 1, yi + 1, zi + 1);
  const x00 = c000 + (c100 - c000) * u, x10 = c010 + (c110 - c010) * u;
  const x01 = c001 + (c101 - c001) * u, x11 = c011 + (c111 - c011) * u;
  const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}
const _pa = [0, 0, 0], _pb = [0, 0, 0], _curl = [0, 0, 0];
function potential(x, y, z, out) {
  out[0] = fvnoise(x, y, z);
  out[1] = fvnoise(y - 19.1, z + 33.4, x + 47.2);
  out[2] = fvnoise(z + 74.2, x - 124.5, y + 99.4);
}
// curl(P) = (∂P2/∂y - ∂P1/∂z, ∂P0/∂z - ∂P2/∂x, ∂P1/∂x - ∂P0/∂y)
function curlNoiseJS(x, y, z, out) {
  const e = 0.5, inv = 1 / (2 * e);
  potential(x - e, y, z, _pa); potential(x + e, y, z, _pb);
  const dpx1 = _pb[1] - _pa[1], dpx2 = _pb[2] - _pa[2];
  potential(x, y - e, z, _pa); potential(x, y + e, z, _pb);
  const dpy0 = _pb[0] - _pa[0], dpy2 = _pb[2] - _pa[2];
  potential(x, y, z - e, _pa); potential(x, y, z + e, _pb);
  const dpz0 = _pb[0] - _pa[0], dpz1 = _pb[1] - _pa[1];
  out[0] = (dpy2 - dpz1) * inv;
  out[1] = (dpz0 - dpx2) * inv;
  out[2] = (dpx1 - dpy0) * inv;
}
// Integroi hiukkasvirta: advektio (yhteinen suunta + curl) + wrap → loputon kaartuva virta
function updateFlow(dt) {
  const g = particleGroup.userData.flow;
  if (!g) return;
  dt = Math.min(dt, 0.05);   // vakaa integrointi (estä hyppy framepiikissä)
  const pos = g.positions, half = g.half, box = g.box;
  const cs = g.curlScale, cst = g.curlStrength, sp = g.speed;
  const dx = g.dirX * sp, dy = g.dirY * sp, dz = g.dirZ * sp;
  const out = _curl;
  for (let i = 0; i < pos.length; i += 3) {
    let x = pos[i], y = pos[i + 1], z = pos[i + 2];
    curlNoiseJS(x * cs, y * cs, z * cs, out);
    x += (dx + out[0] * cst) * dt;
    y += (dy + out[1] * cst) * dt;
    z += (dz + out[2] * cst) * dt;
    if (x > half) x -= box; else if (x < -half) x += box;
    if (y > half) y -= box; else if (y < -half) y += box;
    if (z > half) z -= box; else if (z < -half) z += box;
    pos[i] = x; pos[i + 1] = y; pos[i + 2] = z;
  }
  g.posAttr.needsUpdate = true;
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
   UUSI 3D-MALLI (GLB) keskellä — korvaa vanhan proseduraalisen piirilevypuun
   ===================================================================== */
function loadTreeModel() {
  if (!CONFIG.tree.enabled) return;
  const T = CONFIG.tree;
  // treeReady ratkeaa kun malli on scenessä — sivunlataus-overlay (sarjakuva.html) odottaa tätä
  // ennen kuin se feidaa pois, jotta puu on aina näkyvissä heti kun latausruutu poistuu.
  treeReady = new Promise((resolve) => {
    new GLTFLoader().load(
      T.url,
      (gltf) => {
        treeGroup = gltf.scene;
        // Puu laskeutuu hieman baseY:n alle, jotta tyvi istuu ruudukon painovoimakuopan (uWellDepth)
        // pohjalla eikä jää "kelluman" kuopan reunan yläpuolelle.
        treeGroup.position.y = T.baseY - (T.sinkIntoWell || 0);
        treeGroup.scale.setScalar(T.scale);
        treeGroup.visible = entered;         // jos enter() jo ajettu ennen latauksen valmistumista → näytä heti
        if (gltf.animations && gltf.animations.length) {
          treeMixer = new THREE.AnimationMixer(treeGroup);
          gltf.animations.forEach((clip) => treeMixer.clipAction(clip).play());
        }
        scene.add(treeGroup);
        resolve();
      },
      undefined,
      (err) => {
        console.error("3D-mallin (puu) lataus epäonnistui:", err);
        resolve(); // ratkaistaan silti, ettei latausruutu jää jumiin puun latausvirheeseen
      }
    );
  });
}

/* =====================================================================
   NEONGRIDI-ALUSTA puun alla (staattinen proseduraalinen lattia)
   - hehkuva ruudukko (grid) + kirkas rengas puun tyven ympärillä
   - häipyy horisonttiin (uFadeRadius), feidaa sisään revealP:n mukaan (kuten muu UI)
   ===================================================================== */
const GRID_VERT = /* glsl */ `
  varying vec2 vXZ;
  uniform float uWellDepth;
  uniform float uWellRadius;
  void main(){
    vXZ = position.xy; // ennen rotaatiota plane on XY-tasossa → tämä vastaa maailman XZ:tä pyörityksen jälkeen

    // Painovoimakuoppa (kuten planeetta kangaslattialla): paikallinen Z vastaa maailman Y:tä
    // (ylös/alas) sen jälkeen kun mesh on kierretty -90° X-akselin ympäri. Painamalla Z:aa
    // negatiiviseksi keskustan lähellä ruudukko "uppoaa" puun tyven kohdalla ja tasoittuu reunoilla.
    float d = length(vXZ);
    float dip = uWellDepth / (1.0 + (d * d) / (uWellRadius * uWellRadius));
    vec3 pos = position;
    pos.z -= dip;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;
const GRID_FRAG = /* glsl */ `
  precision highp float;
  #define MAX_SNAKES 100
  varying vec2 vXZ;
  uniform vec3  uColor;
  uniform vec3  uRingColor;
  uniform float uCellSize;
  uniform float uLineWidth;
  uniform float uGlow;
  uniform float uRingRadius;
  uniform float uRingWidth;
  uniform float uRing2Radius;
  uniform float uRing2Width;
  uniform float uFadeRadius;
  uniform float uGradientRadius;
  uniform float uPulseSpeed;
  uniform float uPulseAmount;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uEffectsOn; // 0/1 — prefers-reduced-motion sammuttaa virtauksen + renkaiden hengityksen (staattinen grid)
  uniform sampler2D uSnakeTexV;   // bakattu pystyreunojen (vakio X) hehku: rgb = väri*ikä, a = ikä
  uniform sampler2D uSnakeTexH;   // bakattu vaakareunojen (vakio Z) hehku
  uniform float uSnakeTexN;       // tekstuurin resoluutio (NxN)
  uniform float uSnakeTexHalf;    // origon offset tekstuurikoordinaateissa
  uniform vec2  uHeadA[MAX_SNAKES];     // käärmeen viimeisin KIINTEÄ piste ennen liikkuvaa päätä
  uniform vec2  uHeadB[MAX_SNAKES];     // käärmeen nykyinen (sub-cell-tarkka) pää
  uniform vec3  uHeadColor[MAX_SNAKES]; // käärmeen väri (pääsegmentille, aina täysi kirkkaus)
  uniform float uSnakeTotal;      // kuinka monta käärmettä on käytössä (<= MAX_SNAKES)
  uniform float uSnakeThickness;  // hehkun puoliskoleveys (world-yksikköä) — jaettu kaikille

  // Robusti derivaatta-pohjainen ruudukkoviiva (ei "räjähdä" loivissa kulmissa/horisontissa,
  // koska fwidth() skaalaa viivan leveyden aina näytön yhden pikselin mukaiseksi).
  float gridLine(vec2 p, float cell, float lineW){
    vec2 coord = p / cell;
    vec2 g = abs(fract(coord - 0.5) - 0.5) / (fwidth(coord) * max(lineW, 0.6));
    return 1.0 - clamp(min(g.x, g.y), 0.0, 1.0);
  }

  void main(){
    float dist = length(vXZ);
    // Ulkoreunan häivytys OKTAGONIN (8-kulmion) muotoisena piirin sijaan: sekoitetaan L∞-normi
    // (neliö, akselien suuntaiset sivut) ja L1-normi/sqrt(2) (timantti, viistot kulmat) — niiden
    // maksimi tuottaa säännöllisen 8-kulmion tasa-arvokäyrät. Renkaat/väriliuku puun ympärillä
    // pysyvät pyöreinä (dist), vain koko gridin näkyvyysreuna on oktagoninen.
    vec2 aXZ = abs(vXZ);
    float distOct = max(aXZ.x, aXZ.y);
    distOct = max(distOct, (aXZ.x + aXZ.y) * 0.7071067812);
    float fade = 1.0 - smoothstep(uFadeRadius * 0.35, uFadeRadius, distOct);

    // Väriliuku: rengasväri (pinkki) lähellä keskustä/kuoppaa → perusväri (syaani) kauempana
    // (referenssikuvan liukuvärinen lattia).
    float grad = smoothstep(0.0, uGradientRadius, dist);
    vec3 gridColor = mix(uRingColor, uColor, grad);

    float grid = gridLine(vXZ, uCellSize, uLineWidth);

    // Sykkivä (hengittävä) hehku renkaille (jäätyy tasaiseksi, jos prefers-reduced-motion).
    float pulse = 1.0 + uPulseAmount * sin(uTime * uPulseSpeed) * uEffectsOn;

    // HUOM: puun tyven ympärillä olevat hehkurenkaat (ring1/ring2) on POISTETTU käytöstä
    // (käyttäjän pyynnöstä) — muuttujat lasketaan edelleen (uniformit pysyvät ennallaan
    // buildGroundGrid():ssä), mutta niitä ei enää lisätä lopulliseen väriin/alphaan alla.
    float ring1 = 1.0 - smoothstep(0.0, uRingWidth, abs(dist - uRingRadius));
    float ring2 = 1.0 - smoothstep(0.0, uRing2Width, abs(dist - uRing2Radius));
    float ring = 0.0; // max(ring1, ring2 * 0.8) * pulse; — pois käytöstä

    // VALOEFEKTI (KEVYT): kiinteä (jo kuljettu) häntä on BAKATTU CPU:lla pieneen tekstuuriin —
    // TÄSSÄ vain 2 texture2D-hakua, O(1) kustannus RIIPPUMATTA käärmeiden määrästä. Vain
    // käärmeiden NYKYISET liikkuvat pääsegmentit lasketaan vielä suoraan (halpaa: yksi segmentti
    // per käärme, O(snakeCount) ei O(snakeCount * tailLength)).
    vec2 coord = vXZ / uCellSize;
    float colIdx = floor(coord.x + 0.5);
    float rowIdx = floor(coord.y + 0.5);
    vec2 vUV = (vec2(colIdx, floor(coord.y)) + uSnakeTexHalf + 0.5) / uSnakeTexN;
    vec2 hUV = (vec2(floor(coord.x), rowIdx) + uSnakeTexHalf + 0.5) / uSnakeTexN;
    vec4 vSample = texture2D(uSnakeTexV, vUV);
    vec4 hSample = texture2D(uSnakeTexH, hUV);
    float distV = abs(vXZ.x - colIdx * uCellSize);
    float distH = abs(vXZ.y - rowIdx * uCellSize);
    float maskV = 1.0 - smoothstep(0.0, uSnakeThickness, distV);
    float maskH = 1.0 - smoothstep(0.0, uSnakeThickness, distH);
    vec3 flowGlow = vSample.rgb * maskV + hSample.rgb * maskH;
    float flowMask = vSample.a * maskV + hSample.a * maskH;

    int total = int(uSnakeTotal);
    for (int s = 0; s < MAX_SNAKES; s++) {
      if (s >= total) break;
      vec2 a = uHeadA[s];
      vec2 b = uHeadB[s];
      vec2 pa = vXZ - a, ba = b - a;
      float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
      float d = length(pa - ba * h);
      float m = 1.0 - smoothstep(0.0, uSnakeThickness, d);
      flowGlow += uHeadColor[s] * m;
      flowMask += m;
    }
    flowGlow *= uEffectsOn;
    flowMask *= uEffectsOn;

    // Yhdistelmä: perusviiva + kaikkien käärmeiden hehku (additiivinen lisävalo) + hengittävä rengas.
    vec3 col = gridColor * grid * uGlow * fade + flowGlow * fade * 1.8 + uRingColor * ring * 1.2;
    float alpha = clamp(grid * fade * 0.85 + flowMask * fade + ring, 0.0, 1.0) * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

function buildGroundGrid() {
  const G = CONFIG.grid;
  if (!G.enabled) return;
  // Riittävästi segmenttejä, jotta painovoimakuoppa (uWellDepth/uWellRadius) taipuu pehmeästi
  // eikä jää kulmikkaaksi (litteä 1x1-taso ei voisi taipua ollenkaan).
  const segs = Math.max(64, Math.round(G.size / 0.6));
  const geo = new THREE.PlaneGeometry(G.size, G.size, segs, segs);

  // Käärmeiden bakattu hännän tekstuuri (ks. kommentit snakeUpdate():n yllä): resoluutio riittää
  // kattamaan koko näkyvyysalueen (fadeRadius) + pieni marginaali, origon offset (HALF) hoitaa
  // negatiiviset ruudukkokoordinaatit.
  snakeTexN = Math.max(16, 2 * Math.ceil(G.fadeRadius / G.cellSize) + 8);
  snakeTexHalf = Math.floor(snakeTexN / 2);
  snakeDataV = new Uint8Array(snakeTexN * snakeTexN * 4);
  snakeDataH = new Uint8Array(snakeTexN * snakeTexN * 4);
  snakeTexV = new THREE.DataTexture(snakeDataV, snakeTexN, snakeTexN, THREE.RGBAFormat, THREE.UnsignedByteType);
  snakeTexH = new THREE.DataTexture(snakeDataH, snakeTexN, snakeTexN, THREE.RGBAFormat, THREE.UnsignedByteType);
  for (const tex of [snakeTexV, snakeTexH]) {
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
  }

  gridMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: colRGB255(G.color) },
      uRingColor: { value: colRGB255(G.ringColor) },
      uCellSize: { value: G.cellSize },
      uLineWidth: { value: G.lineWidth },
      uGlow: { value: G.glow },
      uRingRadius: { value: G.ringRadius },
      uRingWidth: { value: G.ringWidth },
      uRing2Radius: { value: G.ring2Radius },
      uRing2Width: { value: G.ring2Width },
      uFadeRadius: { value: G.fadeRadius },
      uGradientRadius: { value: G.gradientRadius },
      uPulseSpeed: { value: G.pulseSpeed },
      uPulseAmount: { value: G.pulseAmount },
      uTime: { value: 0 },
      uWellDepth: { value: G.wellDepth },
      uWellRadius: { value: G.wellRadius },
      uOpacity: { value: 0 },
      uSnakeTexV: { value: snakeTexV },
      uSnakeTexH: { value: snakeTexH },
      uSnakeTexN: { value: snakeTexN },
      uSnakeTexHalf: { value: snakeTexHalf },
      uHeadA: { value: Array.from({ length: SNAKE_MAX_COUNT }, () => new THREE.Vector2(0, 0)) },
      uHeadB: { value: Array.from({ length: SNAKE_MAX_COUNT }, () => new THREE.Vector2(0, 0)) },
      uHeadColor: { value: Array.from({ length: SNAKE_MAX_COUNT }, () => new THREE.Color(0, 0, 0)) },
      uSnakeTotal: { value: 0 },
      uSnakeThickness: { value: G.snakeThickness },
      uEffectsOn: { value: reduce ? 0 : 1 }, // prefers-reduced-motion → staattinen grid
    },
    vertexShader: GRID_VERT,
    fragmentShader: GRID_FRAG,
  });
  gridMesh = new THREE.Mesh(geo, gridMat);
  gridMesh.rotation.x = -Math.PI / 2;     // makaamaan XZ-tasoon
  gridMesh.position.y = CONFIG.tree.baseY + G.yOffset; // sama korkeus kuin puun tyvi (+ pieni oma lasku)
  gridMesh.renderOrder = -1;
  scene.add(gridMesh);
  snakeInit();
}

// Kortit sylinterin kehälle — paksuja (3D-runko + tekstuuripinta)
function buildCards() {
  ringGroup = new THREE.Group();
  ringGroup.rotation.x = -0.07;
  ringGroup.visible = false;          // näkyviin vasta introsta (enter)
  scene.add(ringGroup);

  // ====================================================================
  // TYHJÄT KORTTIPAIKAT — korttien VANHA ulkoasu poistettu.
  // Jäljellä tarkoituksella:
  //   • positiot: layoutCarousel sijoittaa group:t radalle (kamera kiertää)
  //   • näkymätön osumapinta (hit): raycast → hover + dive toimivat ennallaan
  //   • otsikot: CARDS-data säilyy (DOM-label näyttää otsikon)
  // "Stub"-materiaalit (pelkkiä JS-olioita) pitävät intro/hover/dive/layout-
  // koodin muuttumattomana: ne kirjoittavat harmittomiin uniform-stubeihin
  // eikä mitään renderöidy. → UUSI korttiulkoasu rakennetaan tähän SEURAAVAKSI.
  // ====================================================================
  const W = CONFIG.card.w, H = CONFIG.card.h, D = CONFIG.card.depth;
  const hitGeo = new THREE.PlaneGeometry(W, H);
  const u = (v) => ({ value: v });   // pikku-apuri uniform-stubeille

  CARDS.forEach((c, i) => {
    const group = new THREE.Group();
    group.userData.index = i;

    // näkymätön osumapinta raycastille (ei renderöidy, mutta raycast osuu siihen)
    const hit = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.z = D / 2 + 0.005;
    hit.userData.index = i;            // raycast → kortin indeksi
    group.add(hit);

    ringGroup.add(group);

    // stub-"materiaalit": sama muoto kuin ennen → animate/layout/dive toimivat ilman muutoksia
    const tcol = colRGB255(c.tint);
    const mat = { uniforms: {
      uTex: u(null), uTint: u(tcol), uFocus: u(0), uHover: u(0), uDive: u(0),
      uTime: u(0), uOpacity: u(0), uMouse: u(new THREE.Vector2(0.5, 0.5)),
    } };
    const bodyMat = { opacity: 0, transparent: true, needsUpdate: false,
      uniforms: { uTime: u(0), uHover: u(0), uFocus: u(0), uOpacity: u(0) } };
    const frameMat = { uniforms: { uGlow: u(0), uOpacity: u(0) } };
    const haloMat = { uniforms: { uOpacity: u(0), uIntensity: u(0) } };

    cards.push({ mesh: group, mat, body: hit, bodyMat, frameMat, haloMat, index: i, hover: 0 });
    cardMeshes.push(hit);             // raycast osuu näkymättömään pintaan
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
   PUHEKUPLA (VAIHE 1) — yksi proseduraalinen kupla shaderilla (ei PNG:tä)
   Fragmentissa: SDF-muoto (pyöristetty runko + alaspäin osoittava häntä,
   sulautettu smin:llä) + halftone-pisterasteri + hohtava ääriviiva.
   Ulkopuoli alpha 0 → hiukkastausta näkyy ympärillä.
   ===================================================================== */
const BUBBLE_VERT = `
  uniform float uBendRadius;   // renkaan säde → kupla kaartuu tämän sylinterin pinnalle
  uniform float uBend;         // kaarevuuden määrä (0 = litteä, 1 = täysi renkaan kaarevuus)
  varying vec2 vUv;
  void main(){
    vUv = uv;
    vec3 p = position;
    // taivuta laatta renkaan kaarelle: x kaareksi, z sisäänpäin (sagitta) → istuu ympärän
    if (uBendRadius > 0.001) {
      float theta = p.x / uBendRadius;
      p.x = mix(p.x, uBendRadius * sin(theta), uBend);
      p.z = mix(p.z, p.z - uBendRadius * (1.0 - cos(theta)), uBend);
    }
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const BUBBLE_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3  uCatColor;
  uniform float uHalftoneScale;
  uniform float uHalftoneStrength;
  uniform float uOutlineWidth;
  uniform vec3  uOutlineColor;
  uniform float uOpacity;
  uniform float uQuadAspect;
  uniform float uHover;          // 0..1 hiiri kuplan päällä (pehmennetty)
  uniform vec2  uHitUv;          // hiiren osumakohta kuplan UV:ssä → ripplen keskipiste
  uniform float uRippleFreq;
  uniform float uRippleSpeed;
  uniform float uRippleAmp;
  uniform float uRippleFalloff;

  // SDF: pyöristetty laatikko → kuplan soikea runko
  float sdRoundBox(vec2 p, vec2 b, float r){
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
  }

  // SDF: kolmio kolmesta pisteestä → häntä
  float sdTriangle(vec2 p, vec2 p0, vec2 p1, vec2 p2){
    vec2 e0 = p1 - p0, e1 = p2 - p1, e2 = p0 - p2;
    vec2 v0 = p - p0,  v1 = p - p1,  v2 = p - p2;
    vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
    vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
    vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
    float s = sign(e0.x * e2.y - e0.y * e2.x);
    vec2 d = min(min(vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)),
                     vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))),
                     vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
    return -sqrt(d.x) * sign(d.y);
  }

  // pehmeä minimi → sulauttaa rungon ja hännän orgaaniseksi muodoksi
  float smin(float a, float b, float k){
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  void main(){
    // keskitetyt koordinaatit (-1..1), aspect-korjaus (neliölaatta → 1.0)
    vec2 p = (vUv - 0.5) * 2.0;
    p.x *= uQuadAspect;

    // runko + alaspäin osoittava häntä, sulautettuna
    float body = sdRoundBox(p - vec2(0.0, 0.14), vec2(0.60, 0.40), 0.34);
    float tail = sdTriangle(p, vec2(-0.22, -0.16), vec2(0.10, -0.16), vec2(-0.04, -0.82));
    float d = smin(body, tail, 0.10);

    // reunan antialiasointi
    float aa = fwidth(d) + 1e-4;
    float fill = 1.0 - smoothstep(-aa, aa, d);          // 1 sisällä, 0 ulkona

    // HOVER PIXEL-RIPPLE: osumakohdasta ulospäin etenevä aalto (pikselöity halftone)
    vec2 rp = vUv - uHitUv;
    rp.x *= uQuadAspect;
    float rd = length(rp);
    float wave = sin(rd * uRippleFreq - uTime * uRippleSpeed);   // etenevä rengasaalto
    float env  = exp(-rd * uRippleFalloff) * uHover;             // vaimenee + vain hoverissa
    float ring = wave * env;                                     // -1..1, voimakkain osuman lähellä

    // halftone-ruudukkoa työnnetään radiaalisesti aallon mukaan → "pikselit" väreilevät renkaittain
    vec2 huv = vUv + normalize(rp + 1e-5) * ring * uRippleAmp;
    vec2 g = fract(huv * uHalftoneScale) - 0.5;
    float dlen = length(g);
    float dotsz = 0.31 - ring * 0.20;                           // pisteet kasvavat aallon harjalla
    float dots = smoothstep(dotsz + 0.05, dotsz, dlen);
    vec3 col = mix(uCatColor, uCatColor * 0.55, dots * uHalftoneStrength);
    // aallon harjalle hohtoa (bloom nappaa)
    col += uOutlineColor * max(ring, 0.0) * 0.9;

    // hohtava ääriviiva: kaista SDF-reunan ympärillä (puoliksi sisä/ulko)
    float outline = smoothstep(uOutlineWidth, 0.0, abs(d));
    col = mix(col, uOutlineColor, outline);

    // alpha: sisus läpikuultava, ulkona 0 (paitsi hohtava ääriviiva)
    float a = max(fill * uOpacity, outline);
    a = clamp(a, 0.0, 1.0);
    if (a < 0.003) discard;

    gl_FragColor = vec4(col, a);
  }
`;

function buildBubble() {
  const B = CONFIG.bubble;
  const geo = new THREE.PlaneGeometry(B.size, B.size, 40, 40);  // jaettu geometria kaikille kuplille
  bubbleMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,         // läpikuultava → ei kirjoita syvyyttä (oikea läpikuultavuus puun/kuplien kanssa)
    side: THREE.DoubleSide,    // näkyy myös takaa → renkaan taustapuolen kuplat piirtyvät
    vertexShader: BUBBLE_VERT,
    fragmentShader: BUBBLE_FRAG,
    uniforms: {
      uTime:             { value: 0 },
      uCatColor:         { value: new THREE.Color(B.catColor[0], B.catColor[1], B.catColor[2]) },
      uHalftoneScale:    { value: B.halftoneScale },
      uHalftoneStrength: { value: B.halftoneStrength },
      uOutlineWidth:     { value: B.outlineWidth },
      uOutlineColor:     { value: new THREE.Color(B.outlineColor[0], B.outlineColor[1], B.outlineColor[2]) },
      uOpacity:          { value: B.opacity },
      uQuadAspect:       { value: 1.0 },
      uBendRadius:       { value: CONFIG.radius + B.radiusOffset },   // taivutus renkaan säteen mukaan (kuplien todellinen etäisyys)
      uBend:             { value: B.bend },
      uHover:            { value: 0 },
      uHitUv:            { value: new THREE.Vector2(0.5, 0.5) },
      uRippleFreq:       { value: B.rippleFreq },
      uRippleSpeed:      { value: B.rippleSpeed },
      uRippleAmp:        { value: B.rippleAmp },
      uRippleFalloff:    { value: B.rippleFalloff },
    },
  });
  // porrastetusti ylöspäin korttien/tekstien paikoille (sama spiraali kuin korteilla)
  // → näkyvät taustalla kun kamera etenee ylös spiraalia pitkin (DoubleSide + ei sumua)
  const A = THREE.MathUtils.degToRad(CONFIG.anglePerCard);
  const bR = CONFIG.radius + B.radiusOffset; // kuplat hieman kauempana kuin kortit/puu
  for (let i = 0; i < CARDS.length; i++) {
    const ang = i * A;
    const m = new THREE.Mesh(geo, bubbleMat);
    m.position.set(Math.sin(ang) * bR, i * CONFIG.helix + B.ringY + CONFIG.ringYOffset + B.yRestore, Math.cos(ang) * bR);
    m.rotation.y = ang;        // sama orientaatio kuin korteilla (osoittaa ulos), EI billboardia
    // per-mesh hover-tila (jaettu materiaali → asetetaan uniformit juuri ennen tämän piirtoa)
    m.userData.hover = 0;
    m.userData.hitUv = new THREE.Vector2(0.5, 0.5);
    m.onBeforeRender = () => {
      bubbleMat.uniforms.uHover.value = m.userData.hover;
      bubbleMat.uniforms.uHitUv.value.copy(m.userData.hitUv);
    };
    ringGroup.add(m);          // renkaaseen → kiinteä paikka; kamera kiertää ympäri
    bubbleMeshes.push(m);
  }
}

/* =====================================================================
   KARUSELLIN ASETTELU (joka frame, paitsi sukelluksen/modaalin aikana)
   ===================================================================== */
function layoutCarousel(force) {
  if (!force && (diving || modalOpen)) return;
  const angleRad = THREE.MathUtils.degToRad(CONFIG.anglePerCard);
  for (const c of cards) {
    // kortit KIINTEÄSTI radallaan (kamera kiertää niiden ympäri, eivät kortit liiku)
    const ang = c.index * angleRad;
    c.mesh.position.set(Math.sin(ang) * CONFIG.radius, c.index * CONFIG.helix + CONFIG.ringYOffset + CONFIG.slotYOffset, Math.cos(ang) * CONFIG.radius);
    c.mesh.rotation.y = ang;
    // fokus/läpinäkyvyys edelleen etäisyydestä katselukulmaan (tCurrent)
    const dist = Math.abs(c.index - tCurrent);
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
  const _dir = new THREE.Vector3(); camera.getWorldDirection(_dir);
  const camFront = camera.position.clone().add(_dir.multiplyScalar(3.2)); // 3.2 yks. kameran edessä
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
  const _dir = new THREE.Vector3(); camera.getWorldDirection(_dir);
  const camFront = camera.position.clone().add(_dir.multiplyScalar(3.2));
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
   ENTER — paljastaa 3D-karusellin (kutsutaan automaattisesti bootissa,
   heti kun lataus on valmis; ei enää erillistä klikattavaa intro-porttia,
   sillä aloitusanimaatio näytetään nykyään etusivulla index.html)
   ===================================================================== */
function enter() {
  if (entered) return;
  entered = true;
  document.body.classList.add("entered");
  ringGroup.visible = true;           // kortit näkyviin (emergoituvat sumusta kameran lentäessä)
  if (treeGroup) treeGroup.visible = true; // GLB-malli näkyviin (jos jo ladattu)
  if (reduce) {
    revealP = 1; camOrbitR = CONFIG.cameraZ; camera.position.z = CONFIG.cameraZ; scrollEnabled = true; layoutCarousel(true); return;
  }
  tween({
    dur: 1700, ease: easeOutExpo,
    onUpdate: (e) => {
      revealP = e;
      camOrbitR = lerp(CONFIG.cameraEnterZ, CONFIG.cameraZ, e); // kamera lentää sisään kiertoradalle
    },
    onDone: () => { scrollEnabled = true; },
  });
}

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

  // KAMERA KIERTÄÄ korttien ympäri (kortit kiinteät) → tausta-dome parallaksoi luonnostaan
  if (!reduce) {
    ringGroup.rotation.x = -0.07;   // renkaan kallistus (kamera kiertää tässä kehyksessä)
    ringGroup.rotation.y = 0;
    if (!diving) {
      const A = THREE.MathUtils.degToRad(CONFIG.anglePerCard);
      const v = tCurrent * A;                 // katselukulma = fokusoitu kortti
      const h = tCurrent * CONFIG.helix + CONFIG.ringYOffset; // fokusoidun kortin korkeus (sama lasku kuin korteilla/kuplilla)
      // kameran rata lasketaan RENKAAN paikallisessa kehyksessä → sama kallistus kuin korteilla
      _camLocal.set(Math.sin(v) * camOrbitR, h + 0.4, Math.cos(v) * camOrbitR);
      _camTarget.set(0, h + 0.2, 0);
      ringGroup.updateMatrixWorld();
      // kameran ylössuunta seuraa renkaan kallistusta → kortit pysyvät suorassa joka kulmassa (ei rollia)
      _camUp.set(0, 1, 0).transformDirection(ringGroup.matrixWorld);
      camera.up.copy(_camUp);
      camera.position.copy(_camLocal.applyMatrix4(ringGroup.matrixWorld));
      camera.lookAt(_camTarget.applyMatrix4(ringGroup.matrixWorld));
    }
    particleGroup.rotation.y = CONFIG.legacyBg ? time * 0.01 : 0; // uusi virta: suunta maailmassa, ei ryhmäkiertoa
    // tausta-dome: parallaksi tulee kameran kierrosta; tässä vain valinnainen hidas oma pyörintä
    if (bgMesh) {
      bgMesh.rotation.y = tCurrent * CONFIG.comicBg.rotateWithScroll + time * CONFIG.comicBg.spin;
    }
    // sisäkkäiset pallokerrokset pyörivät eri nopeuksilla → parallaksi
    for (const L of bgLayers) L.mesh.rotation.y = time * L.speed;
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
  // puhekuplien hover → pixel-ripple juuri osumakohdasta (raycast suoraan kupliin)
  {
    let bHover = null;
    if (entered && !diving && !modalOpen && bubbleMeshes.length) {
      const bHits = raycaster.intersectObjects(bubbleMeshes, false);
      // Kuplat ovat DoubleSide (jotta renkaan TAKAPUOLEN kuplat näkyvät taustakoristeena),
      // mutta hover-ripple on tarkoitettu vain etupuolelle — takapuolelta katsottuna UV on
      // peilikuva, jolloin aalto tuntuisi etenevän "väärään suuntaan" hiireen nähden (outo efekti).
      // Siksi hylätään osumat joissa säde tulee kuplan takaa (normaali osoittaa säteen suuntaan).
      const frontHit = bHits.find((h) => {
        if (!h.face) return true;
        const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
        return raycaster.ray.direction.dot(n) < 0;   // < 0 = säde osuu etupuolelle
      });
      if (frontHit) {
        bHover = frontHit.object;
        if (frontHit.uv) bHover.userData.hitUv.copy(frontHit.uv);
      }
    }
    for (const m of bubbleMeshes) {
      const t = m === bHover ? 1 : 0;
      m.userData.hover += (t - m.userData.hover) * 0.18;   // pehmennä sisään/ulos
      m.scale.setScalar(1 + m.userData.hover * CONFIG.bubble.hoverScale);  // hover → kupla kasvaa hieman
    }
  }
  for (const c of cards) {
    const target = c.index === hovered ? 1 : 0;
    c.hover += (target - c.hover) * 0.15;
    c.mat.uniforms.uHover.value = c.hover;
    c.mat.uniforms.uTime.value = time;
    // tumma lasipaneeli (runko): seuraa fokusta/läpinäkyvyyttä + hover-reunavaloa
    const bu = c.bodyMat.uniforms;
    bu.uTime.value = time;
    bu.uHover.value = c.hover;
    bu.uFocus.value = c.mat.uniforms.uFocus.value;
    bu.uOpacity.value = CONFIG.card.glass.opacity * c.mat.uniforms.uOpacity.value;
    // neonkehys: ohut reunahehku, perustaso aina päällä, hover voimistaa
    const fu = c.frameMat.uniforms;
    fu.uGlow.value = CONFIG.card.frame.glow +
      (CONFIG.card.frame.hoverGlow - CONFIG.card.frame.glow) * c.hover;
    fu.uOpacity.value = c.mat.uniforms.uOpacity.value;
    // hehkuhalo seuraa paljastusta/etäisyyttä, voimistuu hoverissa
    const hu = c.haloMat.uniforms;
    hu.uOpacity.value = c.mat.uniforms.uOpacity.value;
    hu.uIntensity.value = CONFIG.card.halo.intensity * (1.0 + 0.8 * c.hover);
  }

  // post + hiukkasten aika (reduce → tausta + hiukkaset jäätyvät)
  postPass.uniforms.uTime.value = time;
  if (bgMat && !reduce) bgMat.uniforms.uTime.value = time;
  if (!reduce) for (const L of bgLayers) L.mat.uniforms.uTime.value = time;
  if (particleGroup.userData.mat && !reduce) particleGroup.userData.mat.uniforms.uTime.value = time;
  // VAIHE 1: puhekuplat – kiinteät paikat renkaassa (EI seuraa kameraa); vain jaettu aika-uniform päivittyy
  if (bubbleMat) bubbleMat.uniforms.uTime.value = time;
  if (!CONFIG.legacyBg && !reduce) updateFlow(time - flowPrev);  // CPU-integroitu curl-virta
  flowPrev = time;

  // GLB-malli: hidas pyörintä + animaatiomixer (jos GLB:ssä on animaatioita)
  if (treeGroup) treeGroup.rotation.y = time * CONFIG.tree.rotSpeed;
  if (treeMixer) treeMixer.update(Math.min(0.05, Math.max(0, time - treeT)));
  treeT = time;
  if (gridMat) {
    gridMat.uniforms.uOpacity.value = revealP; // neongridi feidaa sisään introssa
    gridMat.uniforms.uTime.value = time;        // renkaiden sykintä
    if (!reduce && CONFIG.grid.snakeEnabled) snakeUpdate(time); // käärme-valoefekti (pois käytöstä tähän versioon)
  }

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
  if (bgMat) bgMat.uniforms.uResolution.value.set(w, h);
  if (postPass) postPass.uniforms.uAspect.value = w / h;
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

    // lataus valmis → paljastetaan 3D-karuselli automaattisesti
    enter();

    // Debug-koukku (testausta varten; vaaraton tuotannossa).
    window.__duo = {
      enter,
      reveal(v) { revealP = clamp(v, 0, 1); },
      setCam(z) { camera.position.z = z; },
      frame() { layoutCarousel(true); composer.render(); },
      goto(i) { tCurrent = tTarget = clamp(i, 0, CARDS.length - 1); layoutCarousel(true); composer.render(); },
      tree(v) { if (treeGroup) treeGroup.visible = v !== false; },
      treeBBox() {
        if (!treeGroup) return null;
        const box = new THREE.Box3().setFromObject(treeGroup);
        const size = new THREE.Vector3();
        box.getSize(size);
        return { min: box.min, max: box.max, size, baseY: treeGroup.position.y };
      },
      treeFootprint(frac = 0.08) {
        if (!treeGroup) return null;
        const box = new THREE.Box3().setFromObject(treeGroup);
        const yThresh = box.min.y + (box.max.y - box.min.y) * frac;
        let maxR = 0, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, n = 0;
        const v = new THREE.Vector3();
        treeGroup.updateMatrixWorld(true);
        treeGroup.traverse((o) => {
          if (!o.isMesh || !o.geometry) return;
          const pos = o.geometry.attributes.position;
          if (!pos) return;
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
            if (v.y > yThresh) continue;
            n++;
            const r = Math.hypot(v.x, v.z);
            if (r > maxR) maxR = r;
            if (v.x < minX) minX = v.x;
            if (v.x > maxX) maxX = v.x;
            if (v.z < minZ) minZ = v.z;
            if (v.z > maxZ) maxZ = v.z;
          }
        });
        return { yThresh, maxR, width: maxX - minX, depth: maxZ - minZ, sampleCount: n };
      },
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

    // Ilmoittaa sivunlataus-overlaylle (index.html/sarjakuva.html-tyyppinen #pageLoader-skripti)
    // että 3D-scene on valmis piirtämään, jotta overlay ei feidaa pois liian aikaisin.
    // Odotetaan LISÄKSI että keskellä oleva puu-GLB on ladattu, jottei latausruutu poistu ennen
    // kuin puu on näkyvissä.
    await treeReady;
    window.__APP_READY = true;
    window.dispatchEvent(new Event("duo:ready"));
  } catch (err) {
    window.__APP_ERROR = String(err && err.stack || err);
    console.error(err);
    const msg = document.createElement("div");
    msg.style.cssText = "position:fixed;inset:0;z-index:999;display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;color:#ff9;background:#05060c;font-family:sans-serif;";
    msg.innerHTML = "Virhe ladattaessa 3D-näkymää.<br>" + escapeHtml(String(err));
    document.body.appendChild(msg);
    // Sama tapahtuma virheestä, ettei sivunlataus-overlay jää ikuisesti näkyviin virhetilanteessa
    // (turvaverkko FORCE_MS hoitaisi tämän joka tapauksessa 10s viiveellä, tämä on nopeampi reitti).
    window.dispatchEvent(new Event("duo:error"));
  }
}
boot();
