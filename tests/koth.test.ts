/** PKG-015 / P28 — King of the Hill: 2, 3 i 10 uczestników, remisy, wyjście człowieka, brak pętli. */
import { describe, expect, it } from 'vitest'
import {
  confirmWithdrawal,
  createKothCompetition,
  currentParticipantId,
  currentRound,
  recordAttempt,
  requestWithdrawal,
  type CompetitionAttempt,
  type CompetitionEntrant,
  type CompetitionState,
} from '../src/sport/competition'
import { kothStandingRows } from '../src/sport/koth'
import { buildKothEntrants } from '../src/app/modes'
import { LOCAL_PROFILES } from '../src/player/profiles'

function entrants(count: number, humans = 0): CompetitionEntrant[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index < humans ? `local-${index + 1}` : `p${index + 1}`,
    name: `Uczestnik ${index + 1}`,
    startNumber: index + 1,
    controller: index < humans
      ? { kind: 'human', profileId: `local-${index + 1}` }
      : { kind: 'ai', difficulty: 'normal' },
  }))
}

function create(count: number, humans = 0): CompetitionState {
  return createKothCompetition({
    id: 'koth-test',
    entrants: entrants(count, humans),
    hillClass: 'normal',
    juryGateNumber: 8,
    seed: 3,
    rulesVersion: 'test',
    hillVersion: 'test',
  })
}

let resultCounter = 0
function scored(participantId: string, totalTenths: number): CompetitionAttempt {
  resultCounter += 1
  return {
    kind: 'score',
    resultId: `r-${resultCounter}`,
    participantId,
    status: 'landed',
    distanceHalfMeters: 180,
    totalTenths,
    componentTenths: { distance: 0, style: 0, wind: 0, juryGate: 0, coachGate: 0 },
    meterValueTenths: 20,
  }
}

type Scorer = (participantId: string, roundNumber: number) => number

/** Gra do końca z ogranicznikiem pętli; zwraca stan i liczbę serii. */
function playToEnd(state: CompetitionState, scorer: Scorer, limit = 200): CompetitionState {
  let current = state
  for (let step = 0; current.status === 'active'; step += 1) {
    if (step > limit) throw new Error('pętla King of the Hill')
    const id = currentParticipantId(current)!
    current = recordAttempt(current, scored(id, scorer(id, current.rounds.length))).state
  }
  return current
}

const number = (id: string) => Number(id.replace(/\D/g, ''))

describe('P28 — King of the Hill (ADAPT, tryb rozrywkowy)', () => {
  it('2 uczestników: jedna seria, gorszy odpada, zwycięzca na 1. miejscu', () => {
    const done = playToEnd(create(2), (id) => (id === 'p1' ? 1200 : 1100))
    expect(done.status).toBe('complete')
    expect(done.rounds).toHaveLength(1)
    expect(done.koth!.winners).toEqual(['p1'])
    expect(kothStandingRows(done.koth!).map((row) => [row.participantId, row.rank])).toEqual([['p1', 1], ['p2', 2]])
  })

  it('3 uczestników: dwie serie, lider skacze ostatni, miejsca wg kolejności odpadania', () => {
    const done = playToEnd(create(3), (id, round) => 1000 + number(id) * 10 + round)
    expect(done.rounds.map((round) => round.id)).toEqual(['koth-1', 'koth-2'])
    expect(done.rounds[1]!.startOrder).toEqual(['p2', 'p3'])
    expect(done.koth!.eliminations.map((item) => item.ids)).toEqual([['p1'], ['p2']])
    expect(kothStandingRows(done.koth!).map((row) => row.rank)).toEqual([1, 2, 3])
  })

  it('10 uczestników: 9 eliminacji w 9 seriach, każdy dostaje miejsce 1–10', () => {
    const done = playToEnd(create(10), (id, round) => 900 + number(id) * 13 + (round % 3))
    expect(done.status).toBe('complete')
    expect(done.rounds).toHaveLength(9)
    expect(done.koth!.winners).toEqual(['p10'])
    expect(kothStandingRows(done.koth!).map((row) => row.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('remis ostatnich → jedna dogrywka tylko tych osób, potem powrót do eliminacji', () => {
    // Seria 1: p1 i p2 remisują najniżej; dogrywka: p2 gorszy.
    const done = playToEnd(create(4), (id, round) => {
      if (round === 1) return id === 'p1' || id === 'p2' ? 900 : 1000 + number(id)
      if (round === 2) return id === 'p1' ? 950 : 940
      return 1000 + number(id)
    })
    expect(done.koth!.kinds.slice(0, 3)).toEqual(['elimination', 'playoff', 'elimination'])
    expect(done.rounds[1]!.startOrder).toEqual(['p1', 'p2'])
    expect(done.koth!.eliminations[0]).toEqual({ roundNumber: 2, ids: ['p2'], reason: 'playoff' })
    expect([...done.rounds[2]!.startOrder].sort()).toEqual(['p1', 'p3', 'p4'])
    expect(done.koth!.winners).toEqual(['p4'])
  })

  it('ponowny remis w dogrywce eliminuje całą remisową grupę (wspólne miejsce)', () => {
    const done = playToEnd(create(4), (id, round) => {
      if (round <= 2) return id === 'p1' || id === 'p2' || id === 'p3' ? 900 : 1100
      return 1000
    })
    expect(done.koth!.eliminations[0]).toEqual({ roundNumber: 2, ids: ['p1', 'p2', 'p3'], reason: 'playoff' })
    expect(done.koth!.winners).toEqual(['p4'])
    expect(kothStandingRows(done.koth!).map((row) => row.rank)).toEqual([1, 2, 2, 2])
  })

  it('remis wszystkich pozostałych → wspólne zwycięstwo, bez dogrywki i pętli', () => {
    const done = playToEnd(create(5), () => 1000)
    expect(done.rounds).toHaveLength(1)
    expect(done.koth!.winners).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
    expect(kothStandingRows(done.koth!).every((row) => row.rank === 1)).toBe(true)
  })

  it('statusy administracyjne są gorsze od każdej noty', () => {
    let state = create(3)
    state = recordAttempt(state, { kind: 'administrative', resultId: 'dns', participantId: 'p1', status: 'dns', reason: 'test' }).state
    state = recordAttempt(state, scored('p2', 0)).state
    state = recordAttempt(state, scored('p3', 1200)).state
    expect(state.koth!.eliminations[0]!.ids).toEqual(['p1'])
  })

  it('wyjście ostatniego człowieka: odpada od razu, boty kończą turniej w skończonej liczbie serii', () => {
    let state = create(4, 1)
    expect(currentParticipantId(state)).toBe('local-1')
    state = confirmWithdrawal(requestWithdrawal(state, 'local-1')).state
    // Reszta serii 1 się rozgrywa; rezygnacja zastępuje eliminację najsłabszego.
    for (const id of ['p2', 'p3', 'p4']) state = recordAttempt(state, scored(id, 1000 + number(id))).state
    expect(state.koth!.eliminations[0]).toEqual({ roundNumber: 1, ids: ['local-1'], reason: 'withdrawn' })
    expect(currentRound(state).startOrder).not.toContain('local-1')
    const done = playToEnd(state, (id) => 1000 + number(id))
    expect(done.koth!.winners).toEqual(['p4'])
    expect(done.rounds.length).toBeLessThanOrEqual(2 * 3)
  })

  it('brak nieskończonej pętli: stałe remisy na dole wciąż kończą turniej ≤ 2·(n−1) serii', () => {
    // Zawsze trzech najsłabszych remisuje — każda dogrywka usuwa całą grupę.
    const done = playToEnd(create(10), (id) => (number(id) <= 7 ? 500 : 1000 + number(id)))
    expect(done.status).toBe('complete')
    expect(done.rounds.length).toBeLessThanOrEqual(18)
    expect(done.koth!.winners).toEqual(['p10'])
  })

  it('walidacja 2–10 i obsada: gracze najpierw, boty potem', () => {
    expect(() => create(1)).toThrow(/2–10/)
    expect(() => create(11)).toThrow(/2–10/)
    const list = buildKothEntrants(LOCAL_PROFILES.slice(0, 2), 3, 'hard')
    expect(list.map((entrant) => entrant.controller.kind)).toEqual(['human', 'human', 'ai', 'ai', 'ai'])
    expect(list.map((entrant) => entrant.startNumber)).toEqual([1, 2, 3, 4, 5])
    expect(() => buildKothEntrants(LOCAL_PROFILES.slice(0, 1), 0, 'normal')).toThrow()
    expect(() => buildKothEntrants(LOCAL_PROFILES.slice(0, 10), 1, 'normal')).toThrow()
  })
})
