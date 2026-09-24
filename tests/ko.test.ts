/** PKG-014 / P25 — Q-FIS-11: pełna drabinka KO na jawnych fixtures (bez losowania). */
import { describe, expect, it } from 'vitest'
import {
  competitionStandings,
  createStandardCompetition,
  currentParticipantId,
  currentRound,
  recordAttempt,
  type CompetitionAttempt,
  type CompetitionEntrant,
  type CompetitionState,
} from '../src/sport/competition'
import {
  createKoBracket,
  koFinalStartOrder,
  koFirstRoundStartOrder,
  koPairWinner,
  koQualificationRanking,
  koStartNumberForRank,
  resolveKoFirstRound,
  type KoAttempt,
} from '../src/sport/ko'

const entrants: CompetitionEntrant[] = Array.from({ length: 75 }, (_, index) => ({
  id: `p-${index + 1}`,
  name: `Zawodnik ${String(index + 1).padStart(2, '0')}`,
  startNumber: index + 1,
  controller: { kind: 'ai', difficulty: 'normal' },
}))

function scored(participantId: string, totalTenths: number): KoAttempt {
  return { kind: 'score', participantId, totalTenths }
}

function attemptsOf(list: readonly KoAttempt[]): Record<string, KoAttempt> {
  return Object.fromEntries(list.map((attempt) => [attempt.participantId, attempt]))
}

/** Kwalifikacje: miejsce r ma id `q-r` (r = 1…50). */
const rankedIds = Array.from({ length: 50 }, (_, index) => `q-${index + 1}`)

describe('Q-FIS-11 — numery startowe i pary (F03 §4.3.2.4–4.3.2.5)', () => {
  it('mapuje miejsca kwalifikacji na numery serii KO według tabeli', () => {
    expect([1, 2, 3, 23, 24, 25].map(koStartNumberForRank)).toEqual([50, 48, 46, 6, 4, 2])
    expect([26, 27, 28, 48, 49, 50].map(koStartNumberForRank)).toEqual([1, 3, 5, 45, 47, 49])
    const all = Array.from({ length: 50 }, (_, index) => koStartNumberForRank(index + 1))
    expect(new Set(all).size).toBe(50)
    expect(() => koStartNumberForRank(51)).toThrow()
  })

  it('tworzy 25 par numerów 26–25 … 50–1, czyli miejsca k oraz k+25', () => {
    const bracket = createKoBracket(rankedIds)
    expect(bracket.pairs).toHaveLength(25)
    const byStart = (start: number) => Object.entries(bracket.startNumbers).find(([, value]) => value === start)?.[0]
    bracket.pairs.forEach((pair) => {
      const numbers = [bracket.startNumbers[pair.first!], bracket.startNumbers[pair.second!]].sort((a, b) => b! - a!)
      expect(numbers).toEqual([25 + pair.index, 26 - pair.index])
      const firstRank = rankedIds.indexOf(pair.first!) + 1
      const secondRank = rankedIds.indexOf(pair.second!) + 1
      expect(firstRank - secondRank).toBe(25)
    })
    // Para 1: numery 26 (miejsce 13) i 25 (miejsce 38); para 25: 50 (miejsce 1) i 1 (miejsce 26).
    expect(bracket.pairs[0]).toEqual({ index: 1, first: 'q-38', second: 'q-13' })
    expect(bracket.pairs[24]).toEqual({ index: 25, first: 'q-26', second: 'q-1' })
    expect(byStart(26)).toBe('q-13')
    expect(koFirstRoundStartOrder(bracket).slice(0, 4)).toEqual(['q-38', 'q-13', 'q-39', 'q-14'])
    expect(koFirstRoundStartOrder(bracket).at(-1)).toBe('q-1')
  })

  it('nie przyjmuje więcej niż 50 miejsc i nie wymyśla par przy brakach', () => {
    expect(() => createKoBracket([...rankedIds, 'q-51'])).toThrow()
    const short = createKoBracket(rankedIds.slice(0, 48))
    // Brak miejsc 49 i 50: pary numerów 47–4 i 49–2 mają po jednym zawodniku.
    const incomplete = short.pairs.filter((pair) => pair.first === null || pair.second === null)
    expect(incomplete.map((pair) => pair.index)).toEqual([22, 24])
  })
})

describe('Q-FIS-11 — ranking kwalifikacji: dokładnie 50, remis → wyższy numer startowy', () => {
  it('odcina dokładnie 50 nawet przy remisie na granicy', () => {
    // 60 zawodników; miejsca 49–52 mają identyczny wynik.
    const attempts = attemptsOf(Array.from({ length: 60 }, (_, index) => {
      const id = `p-${index + 1}`
      const total = index < 48 ? 1000 - index * 5 : index <= 51 ? 500 : 400 - index
      return scored(id, total)
    }))
    const ranking = koQualificationRanking(attempts, (id) => Number(id.slice(2)))
    expect(ranking).toHaveLength(50)
    // Z remisujących p-49…p-52 awansują dwaj z wyższym numerem startowym.
    expect(ranking.slice(48)).toEqual(['p-52', 'p-51'])
    expect(ranking).not.toContain('p-49')
  })

  it('statusy administracyjne nie awansują jako wynik zero', () => {
    const attempts = attemptsOf([scored('p-1', 900), { kind: 'administrative', participantId: 'p-2' }, scored('p-3', 0)])
    expect(koQualificationRanking(attempts, (id) => Number(id.slice(2)))).toEqual(['p-1', 'p-3'])
  })
})

describe('Q-FIS-11 — pojedynki, najlepsi przegrani i finał (§4.3.2.6–4.3.2.8)', () => {
  const bracket = createKoBracket(rankedIds)

  it('remis w parze: awansuje niższy numer startowy', () => {
    const pair = bracket.pairs[0]! // numery 25 (q-38) i 26 (q-13)
    const tie = attemptsOf([scored('q-38', 1200), scored('q-13', 1200)])
    expect(koPairWinner(pair, tie, bracket.startNumbers)).toBe('q-38')
    const last = bracket.pairs[24]! // numery 1 (q-26) i 50 (q-1)
    expect(koPairWinner(last, attemptsOf([scored('q-26', 900), scored('q-1', 900)]), bracket.startNumbers)).toBe('q-26')
  })

  it('DNS/DSQ nie jest zerem: jedyny wynik wygrywa, podwójny brak nie tworzy zwycięzcy', () => {
    const pair = bracket.pairs[3]!
    const single = attemptsOf([{ kind: 'administrative', participantId: pair.first! }, scored(pair.second!, 10)])
    expect(koPairWinner(pair, single, bracket.startNumbers)).toBe(pair.second)
    const none = attemptsOf([
      { kind: 'administrative', participantId: pair.first! },
      { kind: 'administrative', participantId: pair.second! },
    ])
    expect(koPairWinner(pair, none, bracket.startNumbers)).toBeNull()
  })

  /** Wynik I serii: miejsce kwalifikacji r → 2000 − 10r, więc lepszy z pary zawsze wygrywa. */
  function firstRound(overrides: Record<string, KoAttempt> = {}): Record<string, KoAttempt> {
    return { ...attemptsOf(rankedIds.map((id, index) => scored(id, 2000 - 10 * (index + 1)))), ...overrides }
  }

  it('25 zwycięzców + 5 najlepszych przegranych = 30 finalistów', () => {
    const resolved = resolveKoFirstRound(bracket, firstRound())
    expect(resolved.winners).toHaveLength(25)
    expect(new Set(resolved.winners)).toEqual(new Set(rankedIds.slice(0, 25)))
    expect(resolved.luckyLosers).toEqual(['q-26', 'q-27', 'q-28', 'q-29', 'q-30'])
    expect(resolved.longFallAdvancers).toEqual([])
  })

  it('para bez zwycięzcy zwiększa liczbę najlepszych przegranych', () => {
    const pair = bracket.pairs.find((candidate) => candidate.second === 'q-5')!
    const resolved = resolveKoFirstRound(bracket, firstRound({
      [pair.first!]: { kind: 'administrative', participantId: pair.first! },
      [pair.second!]: { kind: 'administrative', participantId: pair.second! },
    }))
    expect(resolved.winners).toHaveLength(24)
    expect(resolved.luckyLosers).toHaveLength(6)
    expect(resolved.luckyLosers).not.toContain('q-30')
    expect(resolved.luckyLosers).toEqual(['q-26', 'q-27', 'q-28', 'q-29', 'q-31', 'q-32'])
  })

  it('remis na ostatnim miejscu przegranych powiększa finał', () => {
    const resolved = resolveKoFirstRound(bracket, firstRound({ 'q-31': scored('q-31', 2000 - 300) }))
    expect(resolved.luckyLosers).toEqual(['q-26', 'q-27', 'q-28', 'q-29', 'q-31', 'q-30'])
  })

  it('finał startuje w odwróconej kolejności I serii; remis — wyższy numer wcześniej', () => {
    const attempts = firstRound({ 'q-2': scored('q-2', 1990) }) // q-1 i q-2 remisują (1990)
    const order = koFinalStartOrder(resolveKoFirstRound(bracket, attempts), attempts)
    expect(order).toHaveLength(30)
    expect(order[0]).toBe('q-30')
    // Numer q-1 = 50 > numer q-2 = 48 → q-1 skacze przed q-2.
    expect(order.slice(-2)).toEqual(['q-1', 'q-2'])
  })
})

function score(participantId: string, totalTenths: number, round: string, status: 'landed' | 'fall' = 'landed', distanceHalfMeters = 240): CompetitionAttempt {
  return {
    kind: 'score',
    resultId: `${round}-${participantId}`,
    participantId,
    status,
    distanceHalfMeters,
    totalTenths,
    componentTenths: { distance: 600, style: 540, wind: 0, juryGate: 0, coachGate: 0 },
    meterValueTenths: 18,
  }
}

function playRound(state: CompetitionState, attempt: (participantId: string, index: number) => CompetitionAttempt): CompetitionState {
  let next = state
  const count = currentRound(next).startOrder.length
  for (let index = 0; index < count; index += 1) {
    const participantId = currentParticipantId(next)!
    next = recordAttempt(next, attempt(participantId, index)).state
  }
  return next
}

describe('Q-FIS-11 — konkurs KO w reducerze: 75 → 50 → 25 par → 30', () => {
  it('prowadzi pełny konkurs przez drabinkę i sumuje I serię z finałem', () => {
    let state = createStandardCompetition({
      id: 'ko-fixture', entrants, hillClass: 'flying', juryGateNumber: 8, seed: 1,
      rulesVersion: 'r', hillVersion: 'h', format: 'ko',
    })
    // Kwalifikacje: p-n dostaje 1000 − 5n, a p-70…p-75 mają DNS.
    state = playRound(state, (id) => Number(id.slice(2)) >= 70
      ? { kind: 'administrative', resultId: `q-${id}`, participantId: id, status: 'dns', reason: 'fixture' }
      : score(id, 1000 - 5 * Number(id.slice(2)), 'q'))
    expect(state.ko?.qualified).toHaveLength(50) // mamut w KO nie zmienia limitu na 40
    expect(currentRound(state).id).toBe('first')
    expect(currentRound(state).startOrder).toHaveLength(50)
    expect(currentRound(state).startOrder.slice(0, 2)).toEqual(['p-38', 'p-13'])

    // I seria: wynik 2000 − 10n (lepszy z kwalifikacji wygrywa parę).
    state = playRound(state, (id) => score(id, 2000 - 10 * Number(id.slice(2)), 'f'))
    expect(state.ko?.winners).toHaveLength(25)
    expect(state.ko?.luckyLosers).toEqual(['p-26', 'p-27', 'p-28', 'p-29', 'p-30'])
    expect(currentRound(state).id).toBe('final')
    expect(currentRound(state).startOrder[0]).toBe('p-30')
    expect(currentRound(state).startOrder.at(-1)).toBe('p-1')

    state = playRound(state, (id) => score(id, 1000, 'final'))
    expect(state.status).toBe('complete')
    const standings = competitionStandings(state)
    expect(standings[0]).toMatchObject({ participantId: 'p-1', rank: 1, totalTenths: 1990 + 1000 })
    // Przegrany spoza finału ma tylko wynik I serii.
    expect(standings.find((entry) => entry.participantId === 'p-31')?.totalTenths).toBe(2000 - 310)
  })
})
