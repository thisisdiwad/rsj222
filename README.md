# Retro Ski Jumping (rsj222)

Przeglądarkowa gra o skokach narciarskich w stylu DOS pixel-art: TypeScript + Vite + Canvas2D,
sterowanie wyłącznie klawiaturą, logiczna siatka 480×270 skalowana całkowicie.

## Szybki start

```bash
npm ci            # zależności (node_modules nie jest w repozytorium)
npm run dev       # serwer deweloperski Vite
npm run typecheck
npm test          # testy jednostkowe (Vitest)
npm run build
npx playwright test tests/browser/shell.spec.ts tests/browser/season.spec.ts tests/browser/modes.spec.ts tests/browser/gateC.spec.ts
```

Jeśli Playwright nie ma pobranej przeglądarki, wskaż istniejący Chromium:
`PW_CHROMIUM_EXECUTABLE=/ścieżka/do/chromium npx playwright test …`.

## Dokumentacja i praca pakietami

- Zasady pracy: [AGENTS.md](AGENTS.md) (prostota, jedno review po pakiecie, zamrożenie zawartości, przekazanie).
- Mapa dokumentacji i stan projektu: [docs/README.md](docs/README.md).
- Aktywny pakiet dla kolejnej sesji: [docs/NEXT_SESSION_PROMPT.md](docs/NEXT_SESSION_PROMPT.md).
- Raporty i dowody pakietów: `docs/evidence/PKG-NNN/`.
