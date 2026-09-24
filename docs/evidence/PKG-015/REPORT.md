# PKG-015 / P26–P28 — raport: drużyny, Super Team i King of the Hill

**Status: COMPLETE (24.09.2026) — zakres P26, P27, P28 wykonany; jedno końcowe review zamknięte.**
**VISUAL USER PASS 24.09.2026** — użytkownik po scaleniu PR 2: „akceptuje” (ekrany obsady drużyn, tabeli drużynowej, konfiguracji i eliminacji King of the Hill ze zrzutów `screens/`). Zewnętrzny PLAYABILITY NOT RUN.

## Status zadań

| Wynik pakietu | Stan | Dowód |
| --- | --- | --- |
| P26: drużynowy — 12 × 4, grupy I–IV (ICR 453.4), dwie serie, finał 8; przed **każdą** grupą finału odwrócona bieżąca klasyfikacja (F03 §3.2.3.1); suma wszystkich skoków, DNS/DSQ = 0 za skok | wykonane | `src/sport/team.ts`, reducer `competition.ts` (`format: 'team'`), `tests/team.test.ts` |
| P26: graniczny remis drużyn rozstrzygnięty źródłowo **przed** fixture'em: ICR 433.4 (równa nota → to samo miejsce) + F03 §3.2.3.1 („leading eight”) → wszystkie drużyny ze wspólnym 8. miejscem awansują | wykonane | fixture „remis na 8. miejscu” (9 drużyn w finale, wspólne 8. miejsce); `GAMEPLAY_SPEC.md` §6 |
| P26: mieszana obsada ludzie/boty z jawnym „kto steruje którym miejscem”; brak duplikatów zawodnika (UI pomija zajęte profile, model i zapis odrzucają duplikat); start wymaga gracza | wykonane | `src/app/modes.ts`, `tests/team.test.ts`, E2E `modes.spec.ts` |
| P27: Super Team — 16 × 2, trzy serie, wszyscy → 12 → 8, suma wszystkich zaliczonych skoków; odświeżana kolejność grup finału; oba skoczki zespołu mogą być ludzcy | wykonane | `tests/team.test.ts` (pełny konkurs 16 zespołów), `tests/teamSession.test.ts` (prawdziwa fizyka i boty) |
| P27: wznowienie między grupami i seriami | wykonane | unit: JSON w połowie finału = wynik bez przerwy; sesja z DB v3 po I serii = ta sama tabela i wynik; E2E: reload po I serii → Enter wznawia |
| P28: King of the Hill (rozrywkowy, ADAPT) — 2–10 ludzi/botów, najgorszy odpada; remis ostatnich → jedna dogrywka; ponowny remis → odpada grupa; remis wszystkich → wspólne zwycięstwo; rezygnacja = wyjście | wykonane | `src/sport/koth.ts`, `tests/koth.test.ts` (2, 3, 10 uczestników, remisy, brak pętli ≤ 2·(n−1)) |
| P28: wyjście ostatniego człowieka — boty kończą bez zatrzymań, jest wynik | wykonane | `tests/koth.test.ts`, `tests/teamSession.test.ts`, E2E (NPS obu graczy → dogrywka → rezygnacja → koniec) |
| Ekrany DOS 480×270: obsada drużyn, tabela drużynowa (sumy serii, linia awansu, skład), konfiguracja i plansza eliminacji KotH; jawny fokus, Enter/Wstecz; menu dopisane na końcu | wykonane | `src/render/teamView.ts`, `main.ts`, zrzuty niżej |
| Zapis: bez nowego magazynu i migracji — sesje trybów w `sessions` (DB v3); `settings`, `seasons`, `calendars` nienaruszone; walidacja zapisu sprawdza `teams`/`koth` | wykonane | `tests/teamSession.test.ts`, `schema.ts` |
| Fizyka, punktacja skoku i wersje skoczni bez zmian | wykonane | brak zmian w `src/simulation/*`, `scoring.ts`, specach skoczni; dodatkowe serie (II seria, rundy KotH) dostają deterministyczny seed wiatru w sesji |

## Istotne decyzje (ADAPT)

- Kolejność drużyn w I serii to stała kolejność konfiguracji (brak rankingu narodów z F03 §3.2.3). II seria Super Team: grupami, w kolejności I serii (F03 jej nie określa). Remis przy ustalaniu kolejności grupy finału: zachowana poprzednia kolejność.
- Tabela drużynowa: najpierw drużyny, które doszły dalej (finaliści), potem suma; równa suma na tym samym etapie → wspólne miejsce.
- Kody drużyn to kody narodowe (AUT, GER…); zawodnicy botów są fikcyjni, dobrani tak, by w drużynie nie powtarzało się imię ani nazwisko.
- KotH: gracze przed botami na liście startowej; kolejna runda — najsłabsi z poprzedniej rundy eliminacyjnej skaczą pierwsi. Gdy w grze nie ma już człowieka, plansze rund są pomijane.
- Sesje: `team-<skocznia>`, `superteam-<skocznia>`, `koth-<skocznia>` (po jednej wznawialnej na tryb i skocznię), stały seed trybu → ta sama obsada daje te same warunki.

## Polecenia i wyniki (kod finalny)

- `npm ci` — PASS (Linux; świeży kontener miał niepełne `node_modules`).
- `npm run typecheck` — PASS.
- `npm test` — **44 pliki / 380 testów PASS** (było 41/355; nowe: `team` 11, `koth` 10, `teamSession` 4).
- `npm run build` — PASS.
- `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test tests/browser/modes.spec.ts --output=docs/evidence/PKG-015/tmp-modes-final` — **3/3 PASS** (drużynowy, Super Team z reloadem, KotH).
- Regresja przed ostatnimi poprawkami review (zmieniony tylko widok końcowej tabeli i walidacja zapisu): `shell.spec.ts` **5/5 PASS**, `season.spec.ts` **3/3 PASS** (`--output=docs/evidence/PKG-015/tmp-shell-final`, `tmp-season-final`). `season.spec.ts` dostał poprawkę nawigacji menu (↑ z „trening” zawija teraz na KotH).
- Katalogi `tmp-*` sprawdzono przed uruchomieniem (nie istniały); zrzuty przeniesiono do `screens/`, katalogi tymczasowe usunięto. `test:e2e` obejmuje teraz `modes.spec.ts`.

## Zrzuty odebrane przez użytkownika (VISUAL USER PASS 24.09.2026)

`screens/`: `menu-modes.png`, `team-setup.png`, `team-table-after-first.png`, `team-final.png`, `superteam-setup.png`,
`superteam-after-first.png`, `superteam-after-second.png`, `superteam-final.png`, `koth-setup.png`,
`koth-round-1-playoff.png`, `koth-finished.png`.

## Końcowe review (jedno, po całym P26–P28)

Przegląd diffu względem kryteriów pakietu (po drodze, jeszcze przed review, poprawiono nachodzenie kolumn tabeli, za długie
napisy, brak glifu `=`, powtarzające się nazwiska botów i „0,0” w serii bez skoków). Review wskazało i poprawiono:
1. Walidacja zapisu nie sprawdzała nowych pól `teams`/`koth` — uszkodzony zapis mógł wywrócić wznowienie; dodano walidację i test.
2. Końcowa tabela drużynowa przewijała się do drużyny gracza i chowała zwycięzcę (na ekranie końcowym nie ma przewijania) — tabela końcowa od 1. miejsca, skład gracza w dolnym panelu.
3. `test:e2e` nie obejmował nowego speca — dopisany.
Sprawdzono ponownie zmienione ścieżki (typecheck, unit, build, `modes.spec`). Bez drugiej pełnej rundy.

## Ograniczenia

- VISUAL nowych ekranów: USER PASS 24.09.2026 („akceptuje”). PLAYABILITY NOT RUN.
- Linia prowadzenia w drużynach pokazuje cel względem najlepszego zawodnika indywidualnie (nie drużyny); w KotH — względem najlepszej noty bieżącej rundy.
- Drużynowy i Super Team nie trafiają do pucharu/Pucharu Narodów (punkty drużynowe F03 §3.2 poza zakresem P26–P27).
- Po wyeliminowaniu ostatniego człowieka gracz nie widzi plansz kolejnych rund, tylko wynik końcowy (świadomie, by nie czekać na boty).

Następny pakiet: [PKG-016 — P29, P30, P31](../../handoffs/PKG-016.md) (aktywny w [NEXT_SESSION_PROMPT.md](../../NEXT_SESSION_PROMPT.md)).
