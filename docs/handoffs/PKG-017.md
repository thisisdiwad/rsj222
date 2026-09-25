# PKG-017 — P43: źródłowa weryfikacja listy skoczni PŚ 2023/24–2025/26 i K/HS

Repozytorium: **GitHub `thisisdiwad/rsj222`** — gra przeglądarkowa TypeScript + Vite +
Canvas2D, sterowana klawiaturą, styl DOS pixel-art (**nie Godot**). Pracujesz w klonie
repozytorium na gałęzi roboczej wskazanej przez środowisko; zmiany commitujesz i wypychasz,
a pracę oddajesz jako PR. Dawne wzmianki o `C:\retro-ski-jumping`, backupie i zakazie Git
w starszych raportach są historyczne (praca lokalna przed 24.09.2026) — nie dotyczą tej sesji.
Pakiet docelowy: PKG-017
Zakres: P43
Z `docs/IMPLEMENTATION_PLAN.md`: zamknięcie listy obiektów PŚ na podstawie źródeł FIS przed pierwszą nową kartą skoczni.
Nie zaczynaj P32 (H05+), P33+ ani nowych skoczni; to pakiet dokumentacyjno-researchowy bez zmian w grze.

## Przygotowanie środowiska

- `npm ci` tylko jeśli uruchamiasz testy (pakiet zmienia dokumentację; walidator dokumentacji jest w PowerShell —
  jeśli brak `pwsh`, odtwórz jego kluczowe reguły skryptem, jak w PR z 24.09.2026, i napisz to jawnie).
- **Sieć:** w chmurze Claude hosty `fis-ski.com`, `assets.fis-ski.com`, `medias*.fis-ski.com` i `wikipedia.org`
  bywały blokowane. Najpierw sprawdź dostęp (np. pobranie kalendarza FIS). Jeśli jest zablokowany, nazwij blokadę
  użytkownikowi (dostęp ustawia w konfiguracji środowiska: Network access) i pracuj na tym, co dostępne
  (wyszukiwarka, komunikaty FIS); **nie wpisuj „potwierdzone” bez źródła FIS**.

## Lektura (tylko potrzebna)

1. `AGENTS.md` (zasada wszystkich skoczni PŚ z trzech ostatnich sezonów, skocznie inspirowane: K/HS zgodne,
   jedno review po pakiecie, obowiązkowe przekazanie), `docs/README.md`, ten prompt, `docs/PACKAGE_WORKFLOW.md` §§3–5.
2. `docs/IMPLEMENTATION_PLAN.md` — „P43” i „P32”; `docs/CONTENT_PLAN.md` §1 (robocza lista H01–H32 z uwagami),
   `docs/research/SOURCES.md` (format wpisów źródeł), `docs/DECISIONS_RISKS.md` D20, R14, Q04.
3. `docs/tools/validate-documentation.ps1` — liczby zadań/pakietów/skoczni, które musisz uzgodnić po zmianie listy.

## Stan wejściowy (25.09.2026)

- PKG-001–016 COMPLETE, bramka C PASS. Grywalne: techniczna K120/HS134, H01 Lillehammer K90/HS98, H02 Zakopane K125/HS140,
  H03 Oberstdorf K120/HS137, H04 Planica K200/HS240 (inspirowane, VISUAL USER PASS). Tryby: trening, konkurs, puchar i własny
  kalendarz, turniej KO, drużyny, Super Team, King of the Hill, rekordy i statystyki (menu: 10 pozycji, „REKORDY I STATYSTYKI” ostatnia).
- **PKG-016 (P29–P31):** rekordy w kategoriach trening/konkurs/rozrywka/zestaw z archiwum wersji i replayem rekordu,
  statystyki, dźwięk syntezowany w kodzie (`src/audio/`) z suwakami efektów/publiczności/muzyki (ustawienia v2), font
  z pełną interpunkcją, duży tekst w tabelach, poza hamowania, `docs/ASSETS_MANIFEST.md`. DB v3 bez zmian.
- **Odbiór PKG-016:** VISUAL P30 (oprawa, ekran rekordów, duży tekst, hamowanie) i odsłuch P31 mają
  **VISUAL USER PASS 25.09.2026** („akceptuje”); zrzuty i nagranie w `docs/evidence/PKG-016/screens/`.
- Robocza lista w `docs/CONTENT_PLAN.md` §1: H01–H32 z wątpliwościami: Szczyrk (konkurs mógł zostać odwołany po
  kwalifikacjach), Trondheim normalna, Oberstdorf mamut, Planica duża, Zhangjiakou. Mapa: PKG-018–045 = P32-H05…H32,
  PKG-046–048 = P33–P40.
- Ostatnia bramka: `npm run typecheck` PASS, `npm test` 47 plików/399 PASS, `npm run build` PASS, Playwright `gateC`,
  `shell`, `season`, `modes`, `competition`, `persistence`, `settings` PASS. Dowody: `docs/evidence/PKG-016/REPORT.md`.

## Wynik pakietu (P43)

1. Dla każdego sezonu 2023/24, 2024/25, 2025/26 i każdej serii (mężczyźni, kobiety; skoki i loty) lista skoczni,
   na których **rozegrano** co najmniej jeden konkurs PŚ (konkurs odwołany w całości się nie liczy; odwołany po
   kwalifikacjach — rozstrzygnij według protokołu FIS i zapisz regułę), z datą i źródłem FIS.
2. Dla każdego obiektu aktualne K i HS wariantu użytego w PŚ (certyfikat/protokół FIS); rozbieżności opisane.
3. `docs/CONTENT_PLAN.md` §1 bez statusu „robocze/do weryfikacji”: każdy wiersz ze źródłem; obiekty bez konkursu PŚ
   usunięte z uzasadnieniem, pominięte dopisane jako H33+ (bez przenumerowania H01–H04).
4. Aktualizacja mapy pakietów (`PACKAGE_WORKFLOW.md`: jeden obiekt na pakiet, P43 przed pierwszym P32), liczb
   w walidatorze dokumentacji, `IMPLEMENTATION_PLAN.md` (P32, bramka D), `docs/research/SOURCES.md` i krótki raport.
5. Kolejność tworzenia H05+ w P32: najpierw obiekty turnieju czterech skoczni (H05–H07), potem pozostałe.

## Kolejność

Najpierw dostęp do źródeł FIS (kalendarze sezonów, wyniki/protokoły), potem tabela sezon × obiekt, potem K/HS,
na końcu aktualizacja dokumentów i walidatora. Jedno końcowe review po całości. Bez kodu gry.

## Weryfikacja (kryteria odbioru)

- Każdy obiekt w §1 ma sezon(y), datę konkursu i odnośnik FIS; K/HS z dokumentu FIS.
- Liczba pakietów P32 = liczba obiektów H05+; walidator (lub jego jawne odtworzenie) PASS: liczba zadań 43,
  pakiety bez luk i duplikatów, liczba skoczni zgodna z §1, P43 przed pierwszym P32.
- Jawne ograniczenia: każdy fakt, którego nie dało się potwierdzić źródłem FIS, oznaczony i opisany.

## Zamknięcie i następna sesja (prostota, review, przekazanie)

Testy w trakcie to nie review; **jedno końcowe review** po całym P43, potem celowane poprawki. Wznowienie po
przerwaniu: sprawdź stan gałęzi, `git log` i raport, kontynuuj brakujące kroki; nie przepisuj cudzych commitów.
Zapisz krótki `docs/evidence/PKG-017/REPORT.md` (statusy, źródła, wyniki, „Końcowe review”, ograniczenia). Po
zamknięciu napisz prompt **PKG-018 (P32-H05 — pierwsza nowa skocznia z listy, pełny cykl D/G/A/V jak H01–H04)**
w `docs/handoffs/PKG-018.md` i bajtowo identycznie w `docs/NEXT_SESSION_PROMPT.md`; zaktualizuj statusy w
`docs/README.md`, `docs/PACKAGE_WORKFLOW.md`, `docs/IMPLEMENTATION_PLAN.md`. Przy niespełnionych kryteriach
(np. brak dostępu do źródeł FIS): PKG-017 INCOMPLETE i kontynuacja tego samego pakietu (poprzedni prompt archiwizuj
jako `PKG-017-CONTINUE-01.md`). Commituj z jasnymi opisami, wypchnij gałąź i utwórz/aktualizuj PR. Nie publikuj
gry i nie wysyłaj wiadomości do osób trzecich bez polecenia.
