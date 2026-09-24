# PKG-014 / P23–P25 — raport: puchar sezonu, własny kalendarz i silnik KO

**Status: COMPLETE (24.09.2026) — zakres P23, P24, P25 wykonany; jedno końcowe review zamknięte.**
**VISUAL USER PASS 24.09.2026** — użytkownik: „Akceptuję wygląd ekranów, zamknij PKG-014” (ekrany hubu pucharu/turnieju, edytora kalendarza i drabinki KO ze zrzutów `screens/`). Zewnętrzny PLAYABILITY NOT RUN.

Pierwszy pakiet prowadzony bezpośrednio w repozytorium GitHub `thisisdiwad/rsj222` (gałąź robocza + PR),
zgodnie z nowym poleceniem użytkownika; zakaz Git z 23.09.2026 i ścieżki `C:\retro-ski-jumping` są nieaktualne.

## Status zadań

| Wynik pakietu | Stan | Dowód |
| --- | --- | --- |
| P23: puchar — punkty za miejsca 1–30 (F03 §3.1), nie suma; remisy konkursu (wspólne miejsce, następne pominięte) i pucharu (zwycięstwa, 2. miejsca…; pełna równość → wspólne miejsce, ADAPT) | wykonane | `src/sport/season.ts`, `tests/season.test.ts` |
| P23: wznowienie między konkursami i zakończenie sezonu | wykonane | kontrolny sezon z restartem (JSON) w `tests/season.test.ts`; reload w `season.spec.ts` |
| P24: kalendarz 1–40, wstaw/usuń/przesuń, zapis/wczytanie, brak widmowych skoczni | wykonane | `calendarProblems`, edytor w `main.ts`, `tests/season.test.ts`, `tests/seasonPersistence.test.ts`, `season.spec.ts` |
| P24: klucz zestawu rozróżnia kolejność, wersje skoczni/zasad/fizyki, format i obsadę | wykonane | `seasonSetKey` (FNV-1a kanonicznego opisu), test wariantów; E2E: `]` zmienia klucz, `[` przywraca |
| P24: powtórzenie tego samego zestawu | wykonane | E2E: dwa sezony tego samego kalendarza → ten sam klucz, „UKOŃCZONE 2”, identyczna tabela (seed = klucz + nr konkursu) |
| P25: KO — dokładnie 50, numery serii KO wg tabeli F03 §4.3.2.4, pary 26–25…50–1, remis kwalifikacji → wyższy numer, remis pary → niższy numer KO, 25 + 5, para bez wyniku zwiększa przegranych, remis ostatniego przegranego i 95% upadku powiększają finał, finał w odwrotnej kolejności (remis → wyższy numer wcześniej) | wykonane | `src/sport/ko.ts`, `tests/ko.test.ts` (fixtures całej drabinki), reducer `competition.ts` (`format: 'ko'`) |
| P25: cztery konkursy sumują punkty skoków | wykonane | format `four-hills` w `season.ts`; Q-FIS-13 (puchar vs suma) w `tests/season.test.ts` |
| P25: zestaw testowy bez udawania Innsbrucka, bez zależności P25→P32 | wykonane | „ZESTAW TESTOWY KO” = H01–H04 inspirowane, jawnie „TURNIEJ KO (TEST)” |
| Ekrany DOS: hub sezonu/turnieju, edycja kalendarza, drabinka KO (w konkursie i z huba) — jawny fokus, Enter/Wstecz | wykonane | `src/render/seasonView.ts`, zrzuty poniżej |
| Zapis: IndexedDB v2→v3 (`seasons`, `calendars`), wynik konkursu i sezon w jednej transakcji; `settings` i dane P19–P22 nienaruszone | wykonane | `schema.ts`/`db.ts`, `tests/seasonPersistence.test.ts`, `tests/persistence.test.ts` |
| Fizyka, punktacja skoku i wersje skoczni bez zmian | wykonane | brak zmian w `src/simulation/*`, `scoring.ts`, specach skoczni |

## Istotne zmiany

- **Źródło reguł KO:** lokalny `docs/research/reference-pdf/fis-wc-men-2026-27.pdf` (F03 §4.3.2). Tabela §4.3.2.4 daje pary
  miejsc k i k+25 (np. para 1 = miejsca 13 i 38, para 25 = miejsca 1 i 26); w parze skacze najpierw gorzej sklasyfikowany (ADAPT —
  F03 nie określa kolejności w parze). Doprecyzowano `GAMEPLAY_SPEC.md` §6.
- `src/sport/competition.ts`: opcjonalne `format`/`ko` w stanie (brak pola = stary zapis standardowy); KO wpięte w zamknięcie serii.
- `src/app/competitionSession.ts`: wariant sezonowy (`sessionId`, `seed`, `format`, etykieta); `seeds.ai` zapisywany i wznawiany;
  drabinka w snapshotcie (`buildKoBracketView`). Standardowy konkurs używa tych samych seedów co dotąd.
- `src/app/main.ts`: menu + PUCHAR SEZONU i TURNIEJ KO (dopisane na końcu — stare skróty menu bez zmian), hub, edytor,
  ekran drabinki, lease sesji konkursu sezonu, uzgodnienie sezonu po awarii, zapis sezonu w transakcji ostatniego skoku.
- Repozytorium: `.gitignore`, z indeksu usunięto `node_modules` (binaria Windows), `dist/`, `test-results/`, `logs/`.
  Zależności: `npm ci`. `playwright.config.ts` przyjmuje `PW_CHROMIUM_EXECUTABLE` (Chromium spoza wersji Playwright).
- Naprawiono przestarzałe fixtures E2E (`indexedDB.open(..., 1)` psuło się od DB v2 z P22) w `persistence/h01/h02/h03` (+2 skrypty capture).

## Polecenia i wyniki (kod finalny)

- `npm ci` — PASS (Linux).
- `npm run typecheck` — PASS.
- `npm test` — **41 plików / 355 testów PASS** (było 38/330; nowe: `ko`, `season`, `seasonPersistence`).
- `npm run build` — PASS.
- `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test tests/browser/season.spec.ts --output=docs/evidence/PKG-014/tmp-season-final` — **3/3 PASS** (puchar + reload; kalendarz + powtórzenie zestawu; KO + drabinka).
- To samo dla `tests/browser/shell.spec.ts --output=docs/evidence/PKG-014/tmp-shell-final` — **5/5 PASS**.
- Ścieżki zmienione w pakiecie, sprawdzone na kodzie przed ostatnimi kosmetykami tekstu: `persistence.spec.ts` 3/4 PASS
  i FAIL testu archiwalnego replaya (`VersionError`: fixture otwierał bazę w wersji 1) → po naprawie fixture ten test PASS;
  `settings.spec.ts` 4/4 PASS; testy `h01/h02/h03.spec.ts` z tym samym fixture (3 testy) PASS.
- Katalogi `tmp-*` sprawdzono przed uruchomieniem (nie istniały); zrzuty przeniesiono do `screens/`, katalogi tymczasowe usunięto.

## Zrzuty odebrane przez użytkownika (VISUAL USER PASS 24.09.2026)

`screens/`: `menu-1280x720.png`, `cup-hub-new.png`, `cup-hub-after-event-1.png`, `cup-event-finished.png`,
`calendar-editor.png`, `cup-hub-set-repeated.png` (wspólne 4. miejsce przy remisie, 6. pominięte), `ko-hub-new.png`,
`ko-bracket-pairs.png`, `ko-bracket-results.png`, `four-hills-event-finished.png`, `ko-hub-after-event-1.png`, `ko-bracket-from-hub.png`.

## Końcowe review (jedno, po całym P23–P25)

Przegląd diffu względem kryteriów pakietu. Poprawiono:
1. Brak glifów w foncie (`–`, `„”`) dawał `?` na ekranach sezonu — zamienione na znaki fontu.
2. Za długie etykiety (tytuł KO, wiersz startu, kalendarz, drabinka) — skrócone; miejsce z kwalifikacji tylko w widoku par.
3. Start konkursu mógł wyprzedzić wczytanie/uzgodnienie sezonu z bazy — blokada do końca odczytu huba.
4. Nieudany zapis ostatniego skoku: sezon w RAM nie jest cofany starszym stanem z dysku, a przy odczycie huba jest dopisywany.
Sprawdzono ponownie zmienione ścieżki (typecheck, unit, build, `season.spec`, `shell.spec`). Bez drugiej pełnej rundy.

## Ograniczenia i jawne decyzje

- VISUAL nowych ekranów: USER PASS 24.09.2026 („Akceptuję wygląd ekranów, zamknij PKG-014”). PLAYABILITY NOT RUN.
- Kolejność startu w konkursach sezonu pozostaje stała (lista 75), bez odwrotnej kolejności pucharu — poza zakresem P23.
- Cztery obiekty testowe to H01–H04 (także w KO); docelowe H03/H05/H06/H07 dopiero po P32.
- Rekordy/statystyki zestawu ograniczają się do licznika ukończonych sezonów danego klucza; pełne rekordy zestawu to P29.
- Drabinka z huba pokazuje ostatni konkurs KO z zapisaną drabinką (bieżący lub poprzedni).
- Porzucony sezon pozostaje w bazie ze statusem `abandoned`; jego niedokończona sesja konkursu nie jest kasowana.

Następny pakiet: [PKG-015 — P26, P27, P28](../../handoffs/PKG-015.md) (aktywny w [NEXT_SESSION_PROMPT.md](../../NEXT_SESSION_PROMPT.md)).
