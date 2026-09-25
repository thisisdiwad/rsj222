# Manifest assetów gry — pochodzenie i licencje

Stan: PKG-016 / P30–P31 (25.09.2026). Obejmuje wszystko, co trafia do runtime gry.

**Gra nie zawiera żadnych plików graficznych, fontów ani próbek dźwięku z zewnątrz.** Cała oprawa
jest rysowana lub syntetyzowana przez kod projektu w chwili uruchomienia (Canvas2D i Web Audio).
Autor: projekt Retro Ski Jumping (repozytorium `thisisdiwad/rsj222`). Licencja: taka sama jak kod
repozytorium. Materiały referencyjne z `docs/research/` (zrzuty SJ3/DSJ2, strony PDF FIS) służą
wyłącznie do porównań i **nie są** ładowane przez grę; nie kopiujemy z nich pikseli ani dźwięków.

## Grafika

| Asset | Plik źródłowy (master) | Wersja / eksport | Pochodzenie |
| --- | --- | --- | --- |
| Skoczek: bank póz i klatek (belka, ruszenie, najazd, wybicie, lot, przygotowanie i lądowanie telemark/równoległe, głębokie lądowanie, podpórki, odjazd, hamowanie, upadek) | `src/render/hillView.ts` (`POSE_FRAMES`, `SUPPORT_TWO_BACK`, `renderJumperFrame`) | `JUMPER_ART_VERSION`; klatki rasteryzowane bez wygładzania do pamięci podręcznej 72×72 | autorski pixel art w danych (P42, P30: dodana poza `brake`) |
| Skocznie H01–H04 i techniczna: konstrukcje, otoczenie, palety, landmarki | `src/render/hillView.ts`, `src/simulation/hill.ts`, `src/simulation/hills/` (geometria) | `hillVersion` każdej skoczni | autorskie, inspirowane realnymi obiektami (bez zdjęć w runtime) |
| Font bitmapowy 5×7 z polskimi znakami i interpunkcją | `src/render/pixelFont.ts` | P30: dodane `= ; " „ ” – … _ * & \| @` | autorski |
| Ekrany DOS (menu, konkurs, sezon, KO, drużyny, KotH, rekordy, ustawienia, replay) | `src/render/*View.ts`, `src/app/main.ts` | — | autorskie, rysowane prostokątami i fontem bitmapowym |

## Dźwięk (P31)

Wszystkie efekty i utwory to bufory PCM liczone deterministycznie w `src/audio/synth.ts`
(fala prostokątna, trójkątna, szum xorshift, obwiednie), odtwarzane przez `src/audio/audioDirector.ts`.

| Dźwięk | Kategoria suwaka | Identyfikator | Autor / licencja |
| --- | --- | --- | --- |
| Menu: wybór, zatwierdzenie, wstecz | efekty | `select`, `confirm`, `back` | projekt / licencja repozytorium |
| Światła startu: czerwone, żółte, zielone | efekty | `lightRed`, `lightYellow`, `lightGreen` | jw. |
| Wybicie, lądowanie telemark, lądowanie równoległe, kontakt/podpórka, upadek, hamowanie | efekty | `takeoff`, `telemark`, `parallel`, `contact`, `fall`, `brake` | jw. |
| Wynik, rekord, podium | efekty | `result`, `record`, `podium` | jw. |
| Owacja publiczności | publiczność | `cheer` | jw. |
| Pętla ślizgu (najazd, odjazd) — filtr i głośność od prędkości | efekty | `slide` | jw. |
| Pętla powietrza w locie — filtr i głośność od prędkości | efekty | `wind` | jw. |
| Tło publiczności w konkursie | publiczność | `crowd` | jw. |
| Muzyka: menu, konfiguracja, podium (pętle dwutaktowe) | muzyka | `menu`, `setup`, `podium` | jw. |

Zasady: dźwięk startuje dopiero po działaniu gracza (autoplay), gra działa przy odmowie; pauza
wycisza całość; muzyka w trakcie skoku jest domyślnie wyciszona; limit 12 jednoczesnych efektów.
Nie kopiujemy odgłosów SJ3 (ART_UI_AUDIO §9).
