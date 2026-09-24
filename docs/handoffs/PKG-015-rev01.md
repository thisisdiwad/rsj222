# PKG-015 — P26, P27, P28: drużyny, Super Team i King of the Hill

Repozytorium: **GitHub `thisisdiwad/rsj222`** — gra przeglądarkowa TypeScript + Vite +
Canvas2D, sterowana klawiaturą, styl DOS pixel-art (**nie Godot**). Pracujesz w klonie
repozytorium na gałęzi roboczej wskazanej przez środowisko; zmiany commitujesz i wypychasz,
a pracę oddajesz jako PR. Dawne wzmianki o `C:\retro-ski-jumping`, backupie i zakazie Git
w starszych raportach są historyczne (praca lokalna przed 24.09.2026) — nie dotyczą tej sesji.
Pakiet docelowy: PKG-015
Zakres: P26, P27, P28
Z `docs/IMPLEMENTATION_PLAN.md`: drużyny czteroosobowe, Super Team i King of the Hill.
Nie zaczynaj P29+, H05–H20 ani nowych skoczni.

## Przygotowanie środowiska

- `npm ci` (node_modules nie jest w repozytorium; binaria zależą od systemu).
- Playwright: jeśli pobrana przez Playwright przeglądarka nie istnieje, ustaw
  `PW_CHROMIUM_EXECUTABLE` na dostępny Chromium (w chmurze Claude: `/opt/pw-browsers/chromium`);
  nie uruchamiaj `playwright install`.

## Lektura (tylko potrzebna)

1. `AGENTS.md` (prostota, jedno review po pakiecie, zamrożenie zawartości, obowiązkowe
   przekazanie, praca w repozytorium), `docs/README.md`, ten prompt, `docs/PACKAGE_WORKFLOW.md` §§3–5.
2. `docs/IMPLEMENTATION_PLAN.md` — „P26”, „P27”, „P28” i „Bramka C”.
3. `docs/GAMEPLAY_SPEC.md` §6 (drużynowy, Super Team, King of the Hill, obsada ludzie/boty),
   `docs/TECHNICAL_DESIGN.md` §6 (zapis, migracje), `docs/ART_UI_AUDIO.md` §7 (ekrany: drużyny,
   King of the Hill), `docs/QA_ACCEPTANCE.md` Q-FIS-12.
4. Reguły źródłowe: lokalny `docs/research/reference-pdf/fis-wc-men-2026-27.pdf` (F03) — §2.2.2
   (obsady), §3.2.3 (kolejność startu drużyn), §3.2.4 (Super Team: 3 serie, 12→8). Tekst wyciągniesz
   `pdf-parse` z devDependencies. Graniczny remis drużyn rozstrzygnij źródłowo przed fixture'em.
5. Router `.agents/skills/retro-ski-support/SKILL.md`; z niego tylko potrzebne skille.
   Starych raportów nie czytaj, chyba że przy konkretnym pytaniu.

## Stan wejściowy (24.09.2026)

- PKG-001–014 COMPLETE. Grywalne: techniczna K120/HS134, H01 Lillehammer K90/HS98,
  H02 Zakopane K125/HS140, H03 Oberstdorf K120/HS137, H04 Planica K200/HS240 (inspirowane,
  VISUAL USER PASS). Trening, konkurs standardowy (75 miejsc, boty, hotseat 1–10), punktacja
  Modern 2026.1, replay, ustawienia/remap (P22).
- **PKG-014 (P23–P25):** puchar sezonu (punkty 1–30, remisy F03 §3.1), własny kalendarz 1–40
  z kluczem zestawu, silnik KO F03 §4.3.2 (`src/sport/ko.ts`, `format: 'ko'` w reducerze),
  turniej KO na „ZESTAWIE TESTOWYM” H01–H04 (suma punktów skoków), ekrany hub/edytor/drabinka
  (`src/render/seasonView.ts`). Menu: TRENING, KONKURS, POWTÓRKA, USTAWIENIA, PUCHAR SEZONU,
  TURNIEJ KO (nowe tryby dopisuj na końcu — testy E2E nawigują ↓×2/↓×3). Zapis IndexedDB
  **DB v3**: sessions, results, records, replays, leases, settings, **seasons, calendars**.
  Konkurs sezonu = zwykła `CompetitionSession` z własnym `sessionId`/seed; wynik konkursu
  trafia do sezonu w tej samej transakcji co ostatni skok (`CommitRequest.season`).
- Ekrany PKG-014 (hub pucharu/turnieju, edytor kalendarza, drabinka KO) mają
  **VISUAL USER PASS 24.09.2026** („Akceptuję wygląd ekranów, zamknij PKG-014”); zrzuty w `docs/evidence/PKG-014/screens/`
  są wzorcem stylu dla nowych ekranów drużyn i King of the Hill.
- Ostatnia bramka: `npm run typecheck` PASS, `npm test` 41 plików/355 PASS, `npm run build` PASS,
  Playwright `season.spec.ts` 3/3 i `shell.spec.ts` 5/5 PASS. Dowody: `docs/evidence/PKG-014/REPORT.md`.
  Zewnętrzny PLAYABILITY NOT RUN.

## Wynik pakietu (P26 + P27 + P28)

1. P26: drużyny czteroosobowe — obsada 4 miejsc, dwie serie, finał 8 drużyn; kolejność każdej
   grupy finałowej według aktualnego wyniku; suma skoków. Mieszana obsada ludzie/boty z jawnym
   „kto steruje którym miejscem”; walidacja braku duplikatów zawodników.
2. P27: Super Team — 2 zawodników na zespół, trzy serie, awans wszyscy→12→8, suma wszystkich
   zaliczonych skoków; odświeżana kolejność grup; można sterować oboma skoczkami jednego zespołu.
3. P28: King of the Hill (jawnie rozrywkowy) — 2–10 graczy i/lub botów, najgorszy odpada;
   remis ostatnich → jedna dogrywka tych osób, kolejny remis eliminuje grupę; remis wszystkich
   pozostałych → wspólne zwycięstwo (ADAPT); brak nieskończonej pętli; wyjście ostatniego człowieka.
4. Ekrany DOS (font bitmapowy, siatka 480×270): konfiguracja/obsada drużyn, tabela drużynowa,
   eliminacje King of the Hill — jawny fokus, Enter/Wstecz; wpisy w menu dopisane na końcu.
5. Zapis/wznowienie między grupami i seriami (nowy magazyn tylko jeśli naprawdę potrzebny;
   migracja DB z testem na v3, nie niszcząc `settings`, `seasons`, `calendars` ani wyników).
   Fizyka, punktacja skoku i wersje skoczni bez zmian.

## Kolejność

Najpierw model drużyny i reducer + testy (P26), potem wariant Super Team (P27) na tym samym
modelu, potem King of the Hill (P28), na końcu ekrany i spec E2E. Po całym zakresie: jedno
końcowe review. Najprostsze rozwiązanie dające dobry efekt: zwykłe obiekty i funkcje, bez
frameworka UI, event busa czy warstw adapterów; wykorzystaj istniejące `recordAttempt`,
`advancersFromRound`, `CompetitionSession` i widoki tam, gdzie pasują.

## Weryfikacja (kryteria odbioru)

- Q-FIS-12: grupy i awans 8 (drużyny) oraz 12→8 (Super Team); prawidłowa kolejność finału i suma;
  fixture granicznego remisu drużyn zgodny ze źródłem.
- Pełny Super Team 16 zespołów z eliminacjami i wznowieniem między grupami (test jednostkowy).
- King of the Hill: 2, 3 i 10 uczestników, remis wszystkich, wyjście ostatniego człowieka,
  brak nieskończonej pętli (testy jednostkowe).
- `npm run typecheck`, `npm test`, `npm run build`; nowy spec Playwright drużyn/Super Team/KotH
  samymi klawiszami oraz regresja `tests/browser/shell.spec.ts` i `tests/browser/season.spec.ts`
  z unikalnym `--output=docs/evidence/PKG-015/tmp-…` (najpierw sprawdź, że katalog nie istnieje;
  nic nie nadpisuj; zrzuty przenieś do `docs/evidence/PKG-015/screens/`, tymczasowe usuń).
- Zrzuty ekranów drużyn/Super Team/KotH do odbioru; **VISUAL wydaje wyłącznie użytkownik**.

## Zamknięcie i następna sesja (prostota, review, przekazanie)

Testy w trakcie to nie review; **jedno końcowe review** po całym P26–P28, potem celowane
poprawki i sprawdzenie zmienionych ścieżek. Wznowienie po przerwaniu: sprawdź stan gałęzi,
`git log` i raport, kontynuuj brakujące kroki; nie przepisuj cudzych commitów. Zapisz krótki
`docs/evidence/PKG-015/REPORT.md` (statusy, polecenia i wyniki, dowody, „Końcowe review”,
ograniczenia). Po zamknięciu napisz prompt **PKG-016 (P29, P30, P31 — rekordy/statystyki,
komplet sprite/UI i dźwięk; bramka C po P29)** w `docs/handoffs/PKG-016.md` i bajtowo
identycznie w `docs/NEXT_SESSION_PROMPT.md`; zaktualizuj statusy w `docs/README.md`,
`docs/PACKAGE_WORKFLOW.md`, `docs/IMPLEMENTATION_PLAN.md`. Przy niespełnionych kryteriach:
PKG-015 INCOMPLETE i kontynuacja tego samego pakietu (poprzedni prompt archiwizuj jako
`PKG-015-CONTINUE-01.md`). Commituj z jasnymi opisami, wypchnij gałąź i utwórz/aktualizuj PR.
Nie publikuj gry i nie wysyłaj wiadomości do osób trzecich bez polecenia.
