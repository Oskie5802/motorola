# CrossGuard — Symulator Pieszego

Edukacyjna gra 3D w przeglądarce — Motorola Solutions Science Cup 2026.

Implementacja pełnego prototypu na bazie Game Design Document v1.0:

* Sterowanie pieszym (WASD/strzałki, Shift = bieg, Spacja = stop, mysz = kamera)
* 5 dzielnic o rosnącej trudności (mieszkalna → szkolna → centrum → przemysłowa → autostrada)
* AI ruchu drogowego: samochody, autobusy, TIR-y, tramwaje, pojazdy uprzywilejowane
* Sygnalizacja świetlna pieszych i samochodów (zsynchronizowane skrzyżowania)
* System punktacji Safety Score z ocenami A–F + odznaką *Certified Safe Citizen*
* HUD inspirowany Motorola Command Center: mini-mapa, panel Assist AI, radio APX P25, alerty LPR
* Kamery Avigilon (fizyczne obiekty + zaznaczenia na mini-mapie)
* Dynamiczne eventy: pojazd na czerwonym, awarie sygnalizacji, syrena, korki, alerty LPR
* Cykl dnia/nocy, pogoda (deszcz / mgła), oświetlenie uliczne
* Audio: ambient synth + sygnały dźwiękowe (WebAudio, bez zewnętrznych plików)
* Progres zapisywany w `localStorage`

## Uruchomienie

Wymaga lokalnego serwera (przeglądarki blokują moduły ES z `file://`).

```bash
# Najprościej (Python 3):
cd crossguard
python3 -m http.server 8080
# Otwórz: http://localhost:8080

# Albo Node:
npx serve crossguard
```

## Struktura

```
crossguard/
├── index.html          ekrany: menu, HUD, results, pause
├── styles.css          paleta Motorola, layout HUD
├── src/
│   ├── main.js         bootstrap, menu, render loop, progres
│   ├── config.js       dzielnice, punktacja, kolory, komunikaty
│   ├── city.js         generacja miasta: drogi, chodniki, przejścia, światła, kamery
│   ├── player.js       Alex Nawigant: ruch, animacja, kamera 3rd-person
│   ├── traffic.js      AI pojazdów, NPC piesi, pojazdy uprzywilejowane
│   ├── environment.js  niebo, słońce/księżyc, gwiazdy, deszcz, mgła
│   ├── hud.js          mini-mapa Canvas2D, alerty, mission timer, score
│   ├── game.js         logika misji, punktacja, eventy, win/lose
│   └── audio.js        WebAudio: SFX + ambient
```

## Sterowanie

| Klawisz | Akcja |
|---------|-------|
| W A S D / ↑ ← ↓ → | Ruch |
| Shift | Bieg |
| Spacja | Zatrzymanie |
| Mysz (LMB+drag) | Obrót kamery |
| Kółko | Zoom kamery |
| P | Telefon (-10 na przejściu) |
| R | Pokaż/ukryj radio APX |
| Esc | Pauza |

## Stos technologiczny

- **Three.js** r170 (CDN, ES modules + importmap)
- Vanilla JS (zgodnie z planem awaryjnym z GDD — bez build-stepu, szybsze odpalenie)
- WebAudio API zamiast Howler.js (zero zewnętrznych pakietów)
- Canvas2D dla mini-mapy

## Mapowanie do GDD

| Sekcja GDD | Implementacja |
|-----------|---------------|
| 02 · Integracja Public Safety | kamery Avigilon (`city.js`), Command Center HUD (`index.html`, `styles.css`), Radio APX P25 (`hud.js`), Assist AI panel, LPR (alerty + licznik) |
| 03 · Pętla rozgrywki | Mission/Analyze/Walk/React/Report wszystkie pokryte (`game.js`, `main.js` results screen) |
| 04 · Mechaniki | Ruch (`player.js`), AI pojazdów (`traffic.js`), światła, pogoda (`environment.js`), Safety Score (`game.js`, `config.js`) |
| 05 · Fabuła | SafeCity, Alex Nawigant, status Certified Safe Citizen w wynikach |
| 05 · Strefy | 5 dzielnic w `config.js`, rosnąca trudność, system odblokowywania |
| 06 · Styl | Low-poly geometria, paleta Motorola (#003DA5, #00A3E0) |
| 07 · Stos | Three.js + JS/TS-ready, brak build-stepu |

Plan awaryjny z GDD świadomie zastosowany: 5 map ✓ (powyżej minimum 2), pogoda częściowo (deszcz/mgła zamiast pełnego systemu).
