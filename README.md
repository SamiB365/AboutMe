# Duobotit — etusivun frame-animaatio

Etusivun keskellä on kuvapaikka, johon vaihtuu kuvia (framet) järjestyksessä.
Eri tilanteilla on oma kuvasarjansa, ja koodi vaihtaa oikean automaattisesti:

```
intro → idle ⇄ wave → (click here) → hiding → hidden → peeking → intro
```

- **intro** – hahmot tulevat esiin (pyörähtää kerran)
- **idle** – kevyt looppi, jää pyörimään
- **wave** – satunnainen kädenheilautus, sitten takaisin idleen
- **hiding** – "click here" -klikkaus piilottaa hahmot
- **hidden** – lyhyt tauko piilossa
- **peeking** – hahmot kurkkaavat ja palaavat → intro alkaa alusta

## Kansiorakenne

```
duobotit/
├─ index.html          ← ETUSIVU: kevyt 2D-sivu (hero, nostot, ei WebGL:ää)
├─ sarjakuva.html      ← 3D-karuselli/sarjakuvakokemus (entinen index.html)
├─ styles.css          ← ulkoasu (molemmat sivut)
├─ app.js              ← 3D-sovellus (Three.js), käytössä vain sarjakuva.html:ssä
├─ frame-player.js     ← jaettu robotin frame-soitin (ANIM + framePlayer),
│                         käytössä sekä index.html:ssä että app.js:ssä
├─ mobile.html         ← mobiiliesikatselu (iframettaa sarjakuva.html)
├─ assets/
│  └─ duobotit/
│     ├─ intro/        001.webp 002.webp ...
│     ├─ idle/
│     ├─ wave/
│     ├─ hiding/
│     └─ peeking/
├─ aboutme/            ← (ennallaan, oma alasivu)
└─ .github/            ← (ennallaan, deploy-workflow)
```

## Omien kuvien lisääminen

1. Vie kunkin animaation framet yksittäisinä kuvina oikeaan kansioon.
2. Nimeä ne juoksevasti **001, 002, 003 …** (kolme numeroa, sama pääte).
3. Avaa `animation.js` ja tarkista `CONFIG.states`:
   - `count` = montako framea kansiossa on
   - `fps`   = nopeus (frames/sekunti)
   - `loop`  = jääkö pyörimään (vain idle on `true`)
4. Suositus: käytä **.webp**-kuvia (läpinäkyvyys + pieni koko).
   Jos käytät PNG:tä, vaihda `CONFIG.ext` arvoksi `"png"`.

Mukana tulevat valmiit placeholder-robotit, jotta näet animaation toimivan
heti. Korvaa ne omilla — yksi kansio kerrallaan jos haluat.

## Esikatselu omalla koneella

`index.html` (2D-etusivu) toimii suoraan tiedostona selaimessa.
`sarjakuva.html` (3D-karuselli, ES-moduulit) vaatii HTTP-palvelimen — pelkkä
`file://` ei lataa moduuleja. Käynnistä esim. `python -m http.server 8000`
projektin juuressa ja avaa `http://localhost:8000/`. VS Codessa käy myös
**Live Server**-laajennus (oikea klikkaus tiedostoon → *Open with Live Server*).

## Julkaisu (git)

VS Coden **Source Control** -välilehdeltä, tai komentoriviltä kansiossa:

```
git add .
git commit -m "Lisää etusivun frame-animaatio"
git push
```

GitHub Pages -workflow (.github) julkaisee muutokset automaattisesti
osoitteeseen duobotit.fi.

## Säätökohdat (animation.js)

| Asetus            | Mitä tekee                                   |
|-------------------|----------------------------------------------|
| `fps`             | animaation nopeus per tila                   |
| `hiddenPauseMs`   | kuinka kauan hahmot ovat piilossa            |
| `waveDelayMin/Max`| kuinka usein idle-tilassa heilautetaan kättä |
