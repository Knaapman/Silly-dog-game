# Silly Dog Game

Een 3D hondenpark-game gebouwd met Vite, React, Three.js en Rapier.

## Starten

1. Installeer dependencies:
   `npm install`
2. Start de ontwikkelserver:
   `npm run dev`
3. Maak een productiebuild:
   `npm run build`

## Bediening

De controller is de hoofdmanier om te spelen.

- `Left Stick`: bewegen
- `RT`: rennen
- `A`: springen
- `B`: blaffen
- `X`: pakken / gooien
- `Y`: eten / drinken
- `LB`: snuffelen
- `RB`: graven
- `D-Pad Up`: zitten
- `D-Pad Right`: rollen
- `LT`: liggen
- `D-Pad Down`: poepen

Toetsenbordbediening blijft beschikbaar als fallback en voor een tweede speler.

## Technische notities

- Rendering via `@react-three/fiber`
- Physics en collisions via `@react-three/rapier`
- Gameplaystate via Zustand
