# PKG-016 — P29, P30, P31: rekordy i statystyki, komplet sprite/UI, pełny dźwięk

Repozytorium: **GitHub `thisisdiwad/rsj222`** — gra przeglądarkowa TypeScript + Vite +
Canvas2D, sterowana klawiaturą, styl DOS pixel-art (**nie Godot**). Pracujesz w klonie
repozytorium na gałęzi roboczej wskazanej przez środowisko; zmiany commitujesz i wypychasz,
a pracę oddajesz jako PR. Dawne wzmianki o `C:\retro-ski-jumping`, backupie i zakazie Git
w starszych raportach są historyczne (praca lokalna przed 24.09.2026) — nie dotyczą tej sesji.
Pakiet docelowy: PKG-016
Zakres: P29, P30, P31 (bramka C po P29)
Z `docs/IMPLEMENTATION_PLAN.md`: rekordy i statystyki, kompletna animacja i interfejs, pełny dźwięk.
Nie zaczynaj P32+, P43, H05–H32 ani nowych skoczni.

## Przygotowanie środowiska

- `npm ci` (node_modules nie jest w repozytorium; binaria zależą od systemu; świeży kontener
  może mieć niepełny katalog — wtedy `npm ci` ponownie).
- Playwright: jeśli pobrana przez Playwright przeglądarka nie istnieje, ustaw
  `PW_CHROMIUM_EXECUTABLE` na dostępny Chromium (w chmurze Claude: `/opt/pw-browsers/chromium`);
  nie uruchamiaj `playwright install`.

## Lektura (tylko potrzebna)

1. `AGENTS.md` (prostota, jedno review po pakiecie, zamrożenie zawartości, VISUAL tylko od
   użytkownika, obowiązkowe przekazanie, praca w repozytorium), `docs/README.md`, ten prompt,
   `docs/PACKAGE_WORKFLOW.md` §§3–5.
2. `docs/IMPLEMENTATION_PLAN.md` — „P29”, „Bramka C”, „P30”, „P31” oraz akapit o P19/P29
   (jedna polityka rekordu, bez drugiej sprzecznej).
3. `docs/GAMEPLAY_SPEC.md` §9 (rekordy), `docs/ART_UI_AUDIO.md` §6 (assety i animacja),
   §7 (UI DOS), §8 (dostępność), §9 (dźwięk), §10 (odbiór grafiki), `docs/TECHNICAL_DESIGN.md` §6
   (zapis, migracje), `docs/QA_ACCEPTANCE.md` Q-FIS-15 i wiersz o blokadzie autoplay.
4. Referencje oprawy: `docs/research/reference-images/` (SJ3/DSJ2 — podział ról w `AGENTS.md`).
5. Router `.agents/skills/retro-ski-support/SKILL.md`; z niego tylko potrzebne skille.
   Starych raportów nie czytaj, chyba że przy konkretnym pytaniu.

## Stan wejściowy (24.09.2026)

- PKG-001–015 COMPLETE. Grywalne: techniczna K120/HS134, H01 Lillehammer K90/HS98,
  H02 Zakopane K125/HS140, H03 Oberstdorf K120/HS137, H04 Planica K200/HS240 (inspirowane,
  VISUAL USER PASS). Tryby: trening, konkurs standardowy (75, boty, hotseat 1–10), puchar sezonu
  i własny kalendarz, turniej KO (zestaw testowy H01–H04), **konkurs drużynowy (12×4, finał 8),
  Super Team (16×2, wszyscy → 12 → 8) i King of the Hill (2–10, najgorszy odpada)**; punktacja
  Modern 2026.1, replay, ustawienia/remap (P22).
- **PKG-015 (P26–P28):** formaty `team`/`superteam`/`koth` tego samego reducera
  (`src/sport/competition.ts`, logika w `team.ts` i `koth.ts`), obsady w `src/app/modes.ts`,
  ekrany w `src/render/teamView.ts`, sesje `team|superteam|koth-<skocznia>` w magazynie `sessions`.
  Menu (kolejność stała, nowe pozycje dopisuj na końcu — specy nawigują ↓/↑ z „trening”):
  TRENING, KONKURS, POWTÓRKA, USTAWIENIA, PUCHAR SEZONU, TURNIEJ KO, DRUŻYNOWY, SUPER TEAM,
  KING OF THE HILL. **DB v3** bez zmian: sessions, results, records, replays, leases, settings,
  seasons, calendars.
- Ekrany PKG-015 (obsada drużyn, tabela drużynowa, King of the Hill) i PKG-014 (hub sezonu,
  kalendarz, drabinka KO) mają **VISUAL USER PASS 24.09.2026** (PKG-015: „akceptuje”); zrzuty
  w `docs/evidence/PKG-015/screens/` i `PKG-014/screens/` są wzorcem stylu dla nowych ekranów.
- Rekordy dziś: jedna polityka rekordu konkursowego z P19 (`recordKey` z wersji, `RecordCandidate`
  w transakcji skoku) i licznik ukończonych sezonów danego klucza zestawu (P24). Brak ekranów
  rekordów/statystyk, brak osobnych rekordów treningu, zestawu i wariantów rozrywkowych.
- Dźwięk dziś: proste SFX skoku w `main.ts` (`playJumpAudio`, `playResultAudio`) i suwak głośności
  z P22; brak managera audio, muzyki i manifestu licencji.
- **Plan rozszerzony 24.09.2026 (D20):** pełne v1 obejmuje wszystkie skocznie PŚ 2023/24–2025/26
  (robocza lista H01–H32 w `docs/CONTENT_PLAN.md` §1). Mapa: **PKG-017 = P43** (źródłowa
  weryfikacja listy i K/HS), PKG-018–045 = H05–H32, PKG-046–048 = P33–P40. Ten pakiet tego nie realizuje.
- Ostatnia bramka: `npm run typecheck` PASS, `npm test` 44 pliki/380 PASS, `npm run build` PASS,
  Playwright `modes.spec.ts` 3/3, `season.spec.ts` 3/3 i `shell.spec.ts` 5/5 PASS.
  Dowody: `docs/evidence/PKG-015/REPORT.md`. Zewnętrzny PLAYABILITY NOT RUN.

## Wynik pakietu (P29 + P30 + P31)

1. P29: osobne rekordy treningu, konkursu, zestawu (klucz własnego kalendarza/pucharu) i wariantów
   rozrywkowych (KotH, drużyny) według **jednej** polityki z GAMEPLAY_SPEC §9 rozszerzającej P19;
   DSQ/upadek/trening nie aktualizują oficjalnego rekordu; remis długości nie nadpisuje daty
   (współposiadacz); zmiana wersji archiwizuje, nie kasuje i nie miesza; automatyczny replay
   rekordu; statystyki sezonu i skoków; ekran rekordów/historii (DOS, fokus, Enter/Wstecz).
2. Bramka C po P29: każdy tryb ma pełną drogę wejście → gra → wynik → powrót, poprawną obsadę
   i zapis; menu bez „coming soon”.
3. P30: kompletne animacje wszystkich faz i błędów skoczka (bez placeholderów na zwykłej
   ścieżce, lepsze przejścia niż SJ3/DSJ2), spójny styl wszystkich menu i tabel, duży tekst
   i polskie znaki; manifest assetów z pochodzeniem. **VISUAL wydaje wyłącznie użytkownik.**
4. P31: manager dźwięku z kategoriami (efekty/muzyka/interfejs) i niezależnymi suwakami,
   pętle i efekty wszystkich faz, wyciszenie w pauzie, obsługa blokady autoplay i powrotu
   z tła; każdy utwór/efekt z autorem i licencją w manifeście; zasady czytelne bez dźwięku.
5. Zapis: nowy magazyn/migracja tylko jeśli naprawdę potrzebne (test migracji z v3, bez utraty
   `settings`, `seasons`, `calendars`, sesji i wyników). Fizyka, punktacja skoku i wersje
   skoczni bez zmian.

## Kolejność

Najpierw P29 (polityka rekordów + testy Q-FIS-15, potem ekran), sprawdzenie bramki C, potem P30
(sprite/UI; zrzuty i nagranie do odbioru), na końcu P31 (audio + testy cyklu życia). Po całym
zakresie: jedno końcowe review. Najprostsze rozwiązanie dające dobry efekt: zwykłe obiekty
i funkcje, bez frameworka UI/audio, event busa czy warstw adapterów; rozszerzaj istniejące
`recordKey`/`commitAttempt`, `JumpRecorder` i widoki.

## Weryfikacja (kryteria odbioru)

- Q-FIS-15: brak aktualizacji rekordu dla treningu, DSQ, upadku i starych wersji zasad; remis
  rekordu, powtórne zatwierdzenie tego samego wyniku (idempotencja), archiwizacja przy zmianie wersji.
- Bramka C: spec E2E przechodzący wszystkie tryby menu do wyniku i z powrotem.
- P30: zrzuty 1:1/2× i nagranie wybicia oraz kontaktu; tabele w kilku rozmiarach okna i z dużym tekstem.
- P31: 50 prób bez narastania liczby głosów, autoplay denied → audio po nowej akcji, pauza wycisza.
- `npm run typecheck`, `npm test`, `npm run build`; regresja Playwright `shell.spec.ts`,
  `season.spec.ts`, `modes.spec.ts` z unikalnym `--output=docs/evidence/PKG-016/tmp-…`
  (najpierw sprawdź, że katalog nie istnieje; nic nie nadpisuj; zrzuty przenieś do
  `docs/evidence/PKG-016/screens/`, tymczasowe usuń).

## Zamknięcie i następna sesja (prostota, review, przekazanie)

Testy w trakcie to nie review; **jedno końcowe review** po całym P29–P31, potem celowane
poprawki i sprawdzenie zmienionych ścieżek. Wznowienie po przerwaniu: sprawdź stan gałęzi,
`git log` i raport, kontynuuj brakujące kroki; nie przepisuj cudzych commitów. Zapisz krótki
`docs/evidence/PKG-016/REPORT.md` (statusy, polecenia i wyniki, dowody, „Końcowe review”,
ograniczenia). Po zamknięciu napisz prompt **PKG-017 (P43 — źródłowa weryfikacja listy skoczni
PŚ 2023/24–2025/26 i ich K/HS, aktualizacja mapy PKG-018–045)** w `docs/handoffs/PKG-017.md`
i bajtowo identycznie w `docs/NEXT_SESSION_PROMPT.md`; zaktualizuj statusy w `docs/README.md`,
`docs/PACKAGE_WORKFLOW.md`, `docs/IMPLEMENTATION_PLAN.md`. Przy niespełnionych kryteriach
(np. P30 bez odbioru VISUAL): PKG-016 INCOMPLETE i kontynuacja tego samego pakietu (poprzedni
prompt archiwizuj jako `PKG-016-CONTINUE-01.md`). Commituj z jasnymi opisami, wypchnij gałąź
i utwórz/aktualizuj PR. Nie publikuj gry i nie wysyłaj wiadomości do osób trzecich bez polecenia.
