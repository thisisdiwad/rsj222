# PKG-016 / P29–P31 — raport: rekordy i statystyki, komplet sprite/UI, pełny dźwięk

**Status: COMPLETE (25.09.2026) — zakres P29, P30, P31 wykonany; bramka C PASS; jedno końcowe review zamknięte.**
**VISUAL USER PASS 25.09.2026** — użytkownik po scaleniu PR 3, zapytany o ocenę grafiki P30 i odsłuch dźwięku P31:
„akceptuje” (zrzuty i nagranie z `screens/`). Pakiet formalnie zamknięty. Zewnętrzny PLAYABILITY NOT RUN.

## Status zadań

| Wynik pakietu | Stan | Dowód |
| --- | --- | --- |
| P29: jedna polityka rekordu dla kategorii trening / konkurs (oficjalny) / rozrywka (KotH) / zestaw (klucz kalendarza) | wykonane | `schema.ts` (`recordTargets`, `nextRecord`, `isRecordEligible`), `db.ts` (`applyRecords`), `tests/records.test.ts` |
| P29: Q-FIS-15 — trening, DSQ, upadek i stare wersje nie zmieniają oficjalnego rekordu; remis = współposiadacz bez zmiany daty; ponowne zatwierdzenie wyniku bez zmian | wykonane | `tests/records.test.ts` (9 testów) |
| P29: zmiana wersji archiwizuje (nowy klucz, stary rekord zostaje; zakładka ARCHIWUM) | wykonane | test „zmiana wersji skoczni archiwizuje”, ekran `records` |
| P29: automat replaya rekordu — kopia `kind: 'record'` poza rotacją; skoki treningowe są teraz nagrywane | wykonane | `recordReplayId`, `saveTrainingRecord`, test kopii replaya |
| P29: statystyki skoków graczy (skoki, ustane, upadki, najdłuższy, maks./średnia nota) i sezonów (rozpoczęte, ukończone, porzucone, wygrane, podia) | wykonane | `src/sport/stats.ts`, testy statystyk, E2E: 1 skok człowieka → wiersz statystyk |
| P29: ekran REKORDY I STATYSTYKI (zakładki ←/→, Enter odtwarza replay rekordu, Backspace) — ostatnia pozycja menu | wykonane | `src/render/recordsView.ts`, `main.ts`, zrzuty |
| Bramka C: każda z 10 pozycji menu prowadzi do działającego ekranu i wraca; pełne drogi wejście → gra → wynik → powrót wszystkich trybów | PASS | `gateC.spec.ts` (3), `competition.spec.ts` (konkurs + rekordy), `season.spec.ts`, `modes.spec.ts` |
| P30: animacje wszystkich faz bez placeholderów — bank P42 (41 klatek) + końcowa poza `brake` (zamiast zamrożonej klatki cyklu odjazdu) | wykonane; VISUAL czeka | `hillView.ts`, `screens/pose-sheet-outrun-brake-fall.png`, nagranie skoku |
| P30: font — dodane `= ; " „ ” – … _ * & \| @`; test: każdy napis UI wielkimi literami w `src/render` i `src/app` ma glify (wcześniej `=` i `…` dawały „?”) | wykonane | `pixelFont.ts`, `tests/pixelFont.test.ts` |
| P30: duży tekst w tabelach wyników: drużynowa, King of the Hill, rekordy/statystyki, klasyfikacja sezonu, drabinka KO (skala 2×, mniej kolumn) | wykonane; VISUAL czeka | `teamView.ts`, `recordsView.ts`, `seasonView.ts`, zrzuty `*-large-*` |
| P30: manifest assetów z pochodzeniem | wykonane | `docs/ASSETS_MANIFEST.md` |
| P31: manager dźwięku — szyny efekty / publiczność / muzyka pod masterem; suwaki w ustawieniach (v2, zapis v1 podnoszony) | wykonane | `src/audio/audioDirector.ts`, `settings.ts`, `tests/settings.test.ts` |
| P31: efekty wszystkich faz (światła startu, wybicie, telemark/równoległe, podpórka, upadek, hamowanie, wynik, rekord, podium, owacja), pętle ślizgu/wiatru od prędkości, tło publiczności, 3 pętle muzyczne (menu, konfiguracja, podium; w skoku cisza) | wykonane | `src/audio/synth.ts`, `main.ts` (`updateAudio`), E2E dźwięku w `gateC.spec.ts` |
| P31: 50 prób bez narastania głosów (limit 12), pauza wycisza, odmowa autoplay nie psuje gry i jest ponawiana przy kolejnej akcji, powrót z tła | wykonane | `tests/audio.test.ts` (7), `shell.spec.ts` (atrapa z odmową) |
| P31: autor i licencja każdego efektu/utworu | wykonane | `docs/ASSETS_MANIFEST.md` (synteza w kodzie projektu, bez próbek zewnętrznych) |
| Zapis: bez nowej wersji bazy (DB v3); fizyka, punktacja skoku i wersje skoczni bez zmian | wykonane | brak zmian w `src/simulation/*`, `scoring.ts` |

## Polecenia i wyniki (kod finalny)

- `npm run typecheck` — PASS.
- `npm test` — **47 plików / 399 testów PASS** (było 44/380; nowe: `records` 9, `audio` 7, `pixelFont` 2, `settings` +1).
- `npm run build` — PASS.
- Playwright (`PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`, `--output=docs/evidence/PKG-016/tmp-…`):
  `gateC.spec.ts` 3/3, `shell.spec.ts` 5/5, `season.spec.ts` 3/3, `modes.spec.ts` 3/3, `competition.spec.ts` 4/4,
  `persistence.spec.ts` 4/4, `settings.spec.ts` 4/4 (dwa kolejne przebiegi po poprawce), `z_capture_pose_evidence.spec.ts` 2/2,
  `z_capture_pkg016.spec.ts` 4/4, nagranie `jump.spec.ts` „pełny skok” 1/1.
- `settings.spec.ts`: w pierwszym przebiegu bramki test „pre-remap replay” padł raz (`right` = `ArrowRight` po przeładowaniu).
  Przyczyna: test przeładowywał stronę przed końcem asynchronicznego zapisu ustawień do IndexedDB. Poprawka w teście:
  `rebind` czeka na komunikat gry „USTAWIENIA ZAPISANE”; potem 2 × 4/4.
- `z_capture_pkg008_video.spec.ts` (archiwalny skrypt nagrań P42) nie przeszedł — wybicie za wcześnie przy nagrywaniu,
  upadek przy 25 m. Nie należy do regresji; nagranie skoku zrobiono stabilnym testem `jump.spec.ts` z tymczasową konfiguracją
  z wideo (plik konfiguracji usunięty).
- Katalogi `tmp-*` przed uruchomieniem nie istniały; zrzuty i nagranie przeniesiono do `screens/`, katalogi tymczasowe usunięto.

## Zrzuty i nagranie odebrane przez użytkownika (VISUAL USER PASS 25.09.2026)

`screens/`: `menu-480x270.png`, `menu-960x540.png`, `settings-480x270.png`, `settings-960x540.png`, `settings-large-on-960x540.png`,
`records-480x270.png`, `records-960x540.png`, `records-tab-960x540.png` (rekord konkursu po pełnym konkursie), `records-stats-960x540.png`,
`team-table-large-960x540.png`, `pose-sheet-outrun-brake-fall.png`, `landing-telemark-960x540.png`, `gate-c-training-result-960x540.png`,
`training-full-jump-960x540.webm` (pełny skok: belka → wybicie → lot → telemark → odjazd).

## Końcowe review (jedno, po całym P29–P31)

Przegląd diffu pakietu względem kryteriów. Poprawiono:
1. Kopie replayów rekordów mogły zostać wybrane jako „OSTATNIA POWTÓRKA” (np. rekord treningu) — `loadLatestReplay` pomija `kind: 'record'`; test.
2. Specy `season`/`modes` nawigowały ↑ od „trening” z założeniem, że pierwsza pozycja od końca to KotH (teraz REKORDY) — dopisany krok.
3. Spec dowodów póz liczył 41 klatek (teraz 42 z hamowaniem) — zaktualizowany.
4. Przypis ekranu rekordów był ucięty — skrócony.
Sprawdzono ponownie zmienione ścieżki (typecheck, unit, build, specy wyżej). Bez drugiej pełnej rundy.

## Ograniczenia i jawne decyzje

- VISUAL P30 i odsłuch P31: USER PASS 25.09.2026 („akceptuje”). Brzmienie to prosta synteza w stylu kart dźwiękowych epoki DOS;
  łatwo ją stroić w `synth.ts`, jeśli późniejszy odsłuch wskaże zmiany.
- Drużyny i Super Team liczą się do oficjalnego rekordu konkursu (to formaty FIS); King of the Hill — osobna kategoria rozrywki.
- Rekord zestawu dotyczy konkursów sezonu (puchar, własny kalendarz, turniej KO); nazwa kategorii pokazuje klucz zestawu.
- Kopia replaya rekordu powstaje tylko dla skoków z nagraniem (skoki ludzi); rekord bota nie ma powtórki (ekran to mówi).
- Duży tekst obejmuje tabele wyników; listy menu i panele pomocnicze (np. skład drużyny) zostają w 1×, jak w dotychczasowych ekranach.
- Poza hamowania to jedna klatka: symulacja kończy się w chwili zatrzymania, więc widać ją jako końcową sylwetkę pod planszą wyniku.

Następny pakiet: [PKG-017 — P43](../../handoffs/PKG-017.md) (aktywny w [NEXT_SESSION_PROMPT.md](../../NEXT_SESSION_PROMPT.md)).
