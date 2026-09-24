/**
 * PKG-014 / P25 — system KO (FIS WC Men 2026/27 §4.3.2, lokalna kopia F03).
 *
 * Czyste funkcje bez DOM i zegara. Reducer konkursu wywołuje je przy
 * zamknięciu kwalifikacji i pierwszej serii. Żadnego losowania: pary wynikają
 * wyłącznie z rankingu kwalifikacji.
 *
 * - §4.3.2.2: dokładnie 50 zawodników, bez powiększania listy przy remisie;
 *   remis w kwalifikacjach — wyżej wyższy numer startowy (§4.3.2.2.1).
 * - §4.3.2.4: numer startowy serii KO z miejsca w kwalifikacjach
 *   (1→50, 2→48 … 25→2; 26→1, 27→3 … 50→49).
 * - §4.3.2.5: pary numerów 26–25, 27–24 … 50–1 (czyli miejsca k i k+25).
 * - §4.3.2.6: w parze lepszy wynik; remis — awansuje niższy numer startowy.
 * - §4.3.2.7: 25 zwycięzców + 5 najlepszych przegranych; mniej zwycięzców
 *   zwiększa liczbę przegranych; remis na ostatnim miejscu i reguła 95%
 *   upadku mogą powiększyć finał.
 * - §4.3.2.8: finał w odwróconej kolejności wyniku I serii; remis — wyższy
 *   numer startowy skacze wcześniej.
 */

/** Minimalny kształt próby potrzebny KO (zgodny z `CompetitionAttempt`). */
export type KoAttempt =
  | { readonly kind: 'score'; readonly participantId: string; readonly totalTenths: number }
  | { readonly kind: 'administrative'; readonly participantId: string }

export type KoPair = {
  /** 1–25 w kolejności startu par. */
  readonly index: number
  /** Skacze pierwszy: gorzej sklasyfikowany w kwalifikacjach (miejsce k+25). */
  readonly first: string | null
  /** Skacze drugi: lepszy z kwalifikacji (miejsce k). */
  readonly second: string | null
}

export type KoBracket = {
  /** Zakwalifikowani w kolejności miejsc 1–50 (mniej, jeśli brak wyników). */
  readonly qualified: readonly string[]
  /** Numer startowy serii KO (§4.3.2.4) dla każdego zakwalifikowanego. */
  readonly startNumbers: Readonly<Record<string, number>>
  readonly pairs: readonly KoPair[]
  /** Uzupełniane po I serii; pusty przed jej zakończeniem. */
  readonly winners: readonly string[]
  readonly luckyLosers: readonly string[]
  /** Awans spoza par: upadek z ≥95% najdłuższej skompensowanej odległości. */
  readonly longFallAdvancers: readonly string[]
}

export const KO_QUALIFIERS = 50
export const KO_PAIRS = 25
export const KO_LUCKY_LOSERS = 5

/** §4.3.2.4 — miejsce w kwalifikacjach (1–50) → numer startowy serii KO. */
export function koStartNumberForRank(rank: number): number {
  if (!Number.isInteger(rank) || rank < 1 || rank > KO_QUALIFIERS) throw new Error(`Miejsce KO poza 1–50: ${rank}.`)
  return rank <= KO_PAIRS ? 52 - 2 * rank : 2 * rank - 51
}

function scoreOf(attempts: Readonly<Record<string, KoAttempt>>, participantId: string | null): number | null {
  if (!participantId) return null
  const attempt = attempts[participantId]
  return attempt?.kind === 'score' ? attempt.totalTenths : null
}

/**
 * §4.3.2.2.1 — ranking kwalifikacji: wynik malejąco, remis → wyższy numer
 * startowy wyżej. Zwraca co najwyżej 50 zawodników z wynikiem; statusy
 * administracyjne nie awansują.
 */
export function koQualificationRanking(
  attempts: Readonly<Record<string, KoAttempt>>,
  startNumberOf: (participantId: string) => number,
): readonly string[] {
  return Object.values(attempts)
    .filter((attempt): attempt is Extract<KoAttempt, { kind: 'score' }> => attempt.kind === 'score')
    .sort((left, right) =>
      right.totalTenths - left.totalTenths || startNumberOf(right.participantId) - startNumberOf(left.participantId),
    )
    .slice(0, KO_QUALIFIERS)
    .map((attempt) => attempt.participantId)
}

/** Pary i numery startowe z rankingu kwalifikacji (§4.3.2.4–4.3.2.5). */
export function createKoBracket(qualified: readonly string[]): KoBracket {
  if (qualified.length > KO_QUALIFIERS) throw new Error('KO przyjmuje dokładnie 50 miejsc, nie więcej.')
  if (new Set(qualified).size !== qualified.length) throw new Error('Duplikat zawodnika w rankingu KO.')
  const startNumbers: Record<string, number> = {}
  qualified.forEach((participantId, index) => {
    startNumbers[participantId] = koStartNumberForRank(index + 1)
  })
  const byStart = new Map(Object.entries(startNumbers).map(([participantId, start]) => [start, participantId]))
  const pairs: KoPair[] = []
  for (let index = 1; index <= KO_PAIRS; index += 1) {
    // Para `index`: numery 25+index (lepszy z kwalifikacji przy parzystym
    // numerze) i 26−index. Gorzej sklasyfikowany (miejsce k+25) skacze pierwszy.
    const high = byStart.get(25 + index) ?? null
    const low = byStart.get(26 - index) ?? null
    const highRank = high ? qualified.indexOf(high) : Number.POSITIVE_INFINITY
    const lowRank = low ? qualified.indexOf(low) : Number.POSITIVE_INFINITY
    const [better, worse] = highRank <= lowRank ? [high, low] : [low, high]
    pairs.push({ index, first: worse, second: better })
  }
  return { qualified, startNumbers, pairs, winners: [], luckyLosers: [], longFallAdvancers: [] }
}

/** Kolejność I serii: pary 1→25, w parze najpierw gorzej sklasyfikowany. */
export function koFirstRoundStartOrder(bracket: KoBracket): readonly string[] {
  return bracket.pairs.flatMap((pair) => [pair.first, pair.second].filter((id): id is string => id !== null))
}

/**
 * §4.3.2.6 — zwycięzca pary. Brak wyniku (DNS/NPS/DSQ/rezygnacja) nie jest
 * zerem: wygrywa jedyny zawodnik z wynikiem, a para bez wyników nie ma
 * zwycięzcy (jego miejsce przejmuje dodatkowy najlepszy przegrany).
 */
export function koPairWinner(
  pair: KoPair,
  attempts: Readonly<Record<string, KoAttempt>>,
  startNumbers: Readonly<Record<string, number>>,
): string | null {
  const firstScore = scoreOf(attempts, pair.first)
  const secondScore = scoreOf(attempts, pair.second)
  if (firstScore === null && secondScore === null) return null
  if (firstScore === null) return pair.second
  if (secondScore === null) return pair.first
  if (firstScore !== secondScore) return firstScore > secondScore ? pair.first : pair.second
  const firstStart = startNumbers[pair.first ?? ''] ?? Number.POSITIVE_INFINITY
  const secondStart = startNumbers[pair.second ?? ''] ?? Number.POSITIVE_INFINITY
  return firstStart < secondStart ? pair.first : pair.second
}

/**
 * §4.3.2.7 — finaliści po I serii: zwycięzcy par + najlepsi przegrani.
 * `longFallIds` to zawodnicy spełniający regułę 95% (liczona w reducerze).
 */
export function resolveKoFirstRound(
  bracket: KoBracket,
  attempts: Readonly<Record<string, KoAttempt>>,
  longFallIds: ReadonlySet<string> = new Set(),
): KoBracket {
  const winners = bracket.pairs
    .map((pair) => koPairWinner(pair, attempts, bracket.startNumbers))
    .filter((id): id is string => id !== null)
  const winnerSet = new Set(winners)
  const missingWinners = bracket.pairs.length - winners.length
  const losers = koFirstRoundStartOrder(bracket)
    .filter((id) => !winnerSet.has(id) && scoreOf(attempts, id) !== null)
    .sort((left, right) =>
      (scoreOf(attempts, right) ?? 0) - (scoreOf(attempts, left) ?? 0)
        || (bracket.startNumbers[right] ?? 0) - (bracket.startNumbers[left] ?? 0),
    )
  const slots = Math.min(losers.length, KO_LUCKY_LOSERS + missingWinners)
  const boundary = slots > 0 ? scoreOf(attempts, losers[slots - 1] ?? null) : null
  // Remis na ostatnim miejscu najlepszych przegranych powiększa finał.
  const luckyLosers = boundary === null
    ? []
    : losers.filter((id, index) => index < slots || scoreOf(attempts, id) === boundary)
  const advancing = new Set([...winners, ...luckyLosers])
  const longFallAdvancers = koFirstRoundStartOrder(bracket)
    .filter((id) => longFallIds.has(id) && !advancing.has(id))
  return { ...bracket, winners, luckyLosers, longFallAdvancers }
}

export function koFinalists(bracket: KoBracket): readonly string[] {
  return [...bracket.winners, ...bracket.luckyLosers, ...bracket.longFallAdvancers]
}

/** §4.3.2.8 — odwrócony wynik I serii; remis → wyższy numer startowy wcześniej. */
export function koFinalStartOrder(
  bracket: KoBracket,
  attempts: Readonly<Record<string, KoAttempt>>,
): readonly string[] {
  return [...koFinalists(bracket)].sort((left, right) =>
    (scoreOf(attempts, left) ?? 0) - (scoreOf(attempts, right) ?? 0)
      || (bracket.startNumbers[right] ?? 0) - (bracket.startNumbers[left] ?? 0),
  )
}
