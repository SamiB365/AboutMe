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
├─ index.html          ← etusivu
├─ styles.css          ← ulkoasu
├─ animation.js        ← frame-soitin + tilakone (asetukset täällä)
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

Avaa `index.html` selaimessa. (VS Codessa kätevin on **Live Server**
-laajennus: oikea klikkaus `index.html` → *Open with Live Server*.)

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
