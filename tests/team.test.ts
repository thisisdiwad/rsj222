/** PKG-015 / P26–P27 — Q-FIS-12: drużyny (finał 8) i Super Team (wszyscy→12→8). */
import { describe, expect, it } from 'vitest'
import {
  cancelCurrentRound,
  createTeamCompetition,
  currentParticipantId,
  currentRound,
  recordAttempt,
  type CompetitionAttempt,
  type CompetitionEntrant,
  type CompetitionState,
} from '../src/sport/competition'
import { teamStandings, teamTotalTenths, validateTeams, type CompetitionTeam, type TeamFormat } from '../src/sport/team'
import {
  buildTeamRoster,
  cycleLineupSlot,
  defaultLineup,
  lineupProblems,
  TEAM_COUNT,
} from '../src/app/modes'
import { LOCAL_PROFILES } from '../src/player/profiles'

function roster(format: TeamFormat, teamCount: number): { entrants: CompetitionEntrant[]; teams: CompetitionTeam[] } {
  const size = format === 'team' ? 4 : 2
  const entrants: CompetitionEntrant[] = []
  const teams: CompetitionTeam[] = []
  for (let team = 1; team <= teamCount; team += 1) {
    const memberIds: string[] = []
    for (let group = 1; group <= size; group += 1) {
      const id = `t${team}-g${group}`
      entrants.push({ id, name: `D${team} G${group}`, startNumber: team * 10 + group, controller: { kind: 'ai', difficulty: 'normal' } })
      memberIds.push(id)
    }
    teams.push({ id: `T${team}`, name: `DRUŻYNA ${team}`, memberIds })
  }
  return { entrants, teams }
}

function create(format: TeamFormat, teamCount: number): CompetitionState {
  const { entrants, teams } = roster(format, teamCount)
  return createTeamCompetition({
    id: `${format}-test`,
    format,
    entrants,
    teams,
    hillClass: 'large',
    juryGateNumber: 10,
    seed: 7,
    rulesVersion: 'test',
    hillVersion: 'test',
  })
}

function scoreAttempt(state: CompetitionState, participantId: string, totalTenths: number): CompetitionAttempt {
  return {
    kind: 'score',
    resultId: `${state.id}-${currentRound(state).id}-${participantId}`,
    participantId,
    status: 'landed',
    distanceHalfMeters: 250,
    totalTenths,
    componentTenths: { distance: 0, style: 0, wind: 0, juryGate: 0, coachGate: 0 },
    meterValueTenths: 18,
  }
}

type Scorer = (participantId: string, roundId: string) => number

/** Rozgrywa aktywną serię do końca; zwraca kolejność skoków. */
function playRound(state: CompetitionState, scorer: Scorer): { state: CompetitionState; jumped: string[] } {
  const roundIndex = state.currentRoundIndex
  const jumped: string[] = []
  let current = state
  while (current.status === 'active' && current.currentRoundIndex === roundIndex) {
    const participantId = currentParticipantId(current)!
    jumped.push(participantId)
    current = recordAttempt(current, scoreAttempt(current, participantId, scorer(participantId, currentRound(current).id))).state
  }
  return { state: current, jumped }
}

const teamOf = (participantId: string) => Number(participantId.split('-')[0]!.slice(1))

describe('P26 — konkurs drużynowy (F03 §3.2.3, ICR 453)', () => {
  it('I seria idzie grupami: najpierw wszyscy z grupy 1, potem 2, 3, 4', () => {
    const state = create('team', 12)
    const order = currentRound(state).startOrder
    expect(order).toHaveLength(48)
    expect(order.slice(0, 12)).toEqual(Array.from({ length: 12 }, (_, index) => `t${index + 1}-g1`))
    expect(order.slice(36)).toEqual(Array.from({ length: 12 }, (_, index) => `t${index + 1}-g4`))
  })

  it('finał 8, odwrócona klasyfikacja przed każdą grupą, suma wszystkich skoków', () => {
    let state = create('team', 12)
    // I seria: drużyna n ma 100·n + grupa (T12 najlepsza).
    state = playRound(state, (id) => 1000 + teamOf(id) * 10 + Number(id.at(-1))).state
    expect(currentRound(state).id).toBe('final')
    const final = currentRound(state).startOrder
    expect(final).toHaveLength(32)
    // Przed grupą 1 najsłabsza z ośmiu (T5) skacze pierwsza, lider (T12) ostatni.
    expect(final.slice(0, 8).map(teamOf)).toEqual([5, 6, 7, 8, 9, 10, 11, 12])

    // Grupa 1 finału odwraca układ: T5 dostaje ogromną notę, T12 bardzo słabą.
    const finalScore: Scorer = (id, roundId) => {
      if (roundId !== 'final') return 0
      const team = teamOf(id)
      const group = Number(id.at(-1))
      if (group === 1) return team === 5 ? 2000 : team === 12 ? 10 : 1000
      return 1000
    }
    const firstGroup = final.slice(0, 8)
    for (const participantId of firstGroup) {
      expect(currentParticipantId(state)).toBe(participantId)
      state = recordAttempt(state, scoreAttempt(state, participantId, finalScore(participantId, 'final'))).state
    }
    // Grupa 2 według nowej bieżącej klasyfikacji: T12 spadła na koniec tabeli, T5 prowadzi.
    const secondGroup = currentRound(state).startOrder.slice(8, 16).map(teamOf)
    expect(secondGroup[0]).toBe(12)
    expect(secondGroup.at(-1)).toBe(5)
    expect(currentRound(state).startOrder.slice(0, 8)).toEqual(firstGroup)

    const { state: done } = playRound(state, finalScore)
    expect(done.status).toBe('complete')
    const standings = teamStandings(done)
    expect(standings[0]!.name).toBe('DRUŻYNA 5')
    const t5 = done.teams!.find((team) => team.id === 'T5')!
    // Suma: 4 skoki I serii (1050+g) + 2000 + 3×1000.
    expect(teamTotalTenths(done, t5)).toBe(4 * 1050 + 1 + 2 + 3 + 4 + 2000 + 3000)
    // Finaliści (2 serie) przed drużynami z samą I serią.
    expect(standings.slice(0, 8).every((row) => row.roundsReached === 2)).toBe(true)
    expect(standings.slice(8).map((row) => row.name)).toEqual(['DRUŻYNA 4', 'DRUŻYNA 3', 'DRUŻYNA 2', 'DRUŻYNA 1'])
    expect(standings.slice(8).map((row) => row.rank)).toEqual([9, 10, 11, 12])
  })

  it('remis na 8. miejscu po I serii: obie drużyny ze wspólnym miejscem awansują (ICR 433.4)', () => {
    let state = create('team', 12)
    // T1–T3 słabe, T4 i T5 remisują na granicy (8. i 9. od góry).
    state = playRound(state, (id) => {
      const team = teamOf(id)
      if (team <= 3) return 500
      if (team === 4 || team === 5) return 900
      return 1000 + team
    }).state
    const finalTeams = new Set(currentRound(state).startOrder.map(teamOf))
    expect(finalTeams.size).toBe(9)
    expect(finalTeams.has(4) && finalTeams.has(5)).toBe(true)
    const tied = teamStandings(state).filter((row) => row.name === 'DRUŻYNA 4' || row.name === 'DRUŻYNA 5')
    expect(tied.map((row) => row.rank)).toEqual([8, 8])
    // Remis w kolejności finału: zachowana kolejność startu I serii.
    expect(currentRound(state).startOrder.slice(0, 2).map(teamOf)).toEqual([4, 5])
  })

  it('DNS/DSQ nie udaje noty: drużyna dostaje 0 za ten skok, konkurs trwa', () => {
    let state = create('team', 8)
    const first = currentParticipantId(state)!
    state = recordAttempt(state, {
      kind: 'administrative', resultId: 'dsq-1', participantId: first, status: 'dsq', reason: 'test',
    }).state
    state = playRound(state, () => 1000).state
    const team = state.teams!.find((candidate) => candidate.memberIds.includes(first))!
    expect(teamTotalTenths(state, team)).toBe(3 * 1000)
    expect(teamStandings(state).find((row) => row.teamId === team.id)!.members[0]!.rounds[0]).toBe('dsq')
  })

  it('walidacja: zawodnik w dwóch drużynach, zła liczność i nieznany zawodnik', () => {
    const { entrants, teams } = roster('team', 3)
    const duplicate = teams.map((team, index) => (index === 1 ? { ...team, memberIds: [teams[0]!.memberIds[0]!, ...team.memberIds.slice(1)] } : team))
    expect(() => validateTeams('team', duplicate, entrants)).toThrow(/więcej niż raz/)
    expect(() => validateTeams('superteam', teams, entrants)).toThrow(/wymaga 2/)
    expect(() => validateTeams('team', [...teams, { id: 'X', name: 'X', memberIds: ['a', 'b', 'c', 'd'] }], entrants)).toThrow(/nieznanego/)
  })
})

describe('P26 — obsada ludzie/boty (jawne sterowanie, bez duplikatów)', () => {
  const profiles = LOCAL_PROFILES.slice(0, 3)

  it('domyślnie gracze zajmują kolejne miejsca pierwszej drużyny; reszta to boty', () => {
    const lineup = defaultLineup('team', profiles)
    expect(lineup.slots).toHaveLength(TEAM_COUNT.team)
    expect(lineup.slots[0]!.map((slot) => slot.kind)).toEqual(['human', 'human', 'human', 'bot'])
    const { entrants, teams } = buildTeamRoster(lineup, profiles, 'normal')
    expect(entrants).toHaveLength(48)
    expect(new Set(entrants.map((entrant) => entrant.id)).size).toBe(48)
    expect(teams[0]!.memberIds.slice(0, 3)).toEqual(profiles.map((profile) => profile.id))
    expect(entrants.filter((entrant) => entrant.controller.kind === 'human')).toHaveLength(3)
  })

  it('←/→ pomija profile zajęte gdzie indziej; duplikat i brak gracza blokują start', () => {
    let lineup = defaultLineup('team', profiles)
    // Miejsce 4 drużyny 1: BOT → tylko BOT (wszystkie 3 profile zajęte).
    expect(cycleLineupSlot(lineup, 0, 3, 1, profiles).slots[0]![3]).toEqual({ kind: 'bot' })
    // Zwolnienie profilu 3 (→ BOT) i przypisanie go w innej drużynie.
    lineup = cycleLineupSlot(lineup, 0, 2, 1, profiles)
    expect(lineup.slots[0]![2]).toEqual({ kind: 'bot' })
    lineup = cycleLineupSlot(lineup, 5, 0, 1, profiles)
    expect(lineup.slots[5]![0]).toEqual({ kind: 'human', profileId: profiles[2]!.id })
    expect(lineupProblems(lineup, profiles)).toEqual([])

    const duplicated = { ...lineup, slots: lineup.slots.map((slots, index) => (index === 1 ? [{ kind: 'human' as const, profileId: profiles[0]!.id }, ...slots.slice(1)] : slots)) }
    expect(lineupProblems(duplicated, profiles)[0]).toMatch(/dwa razy/)
    expect(() => buildTeamRoster(duplicated, profiles, 'normal')).toThrow(/dwa razy/)
    const noHuman = { ...lineup, slots: lineup.slots.map((slots) => slots.map(() => ({ kind: 'bot' as const }))) }
    expect(lineupProblems(noHuman, profiles)).toEqual(['brak gracza w obsadzie'])
  })

  it('Super Team: jeden zespół może mieć obu skoczków sterowanych przez graczy', () => {
    const lineup = defaultLineup('superteam', LOCAL_PROFILES.slice(0, 2))
    const { teams, entrants } = buildTeamRoster(lineup, LOCAL_PROFILES.slice(0, 2), 'easy')
    expect(teams).toHaveLength(16)
    const humans = new Set(entrants.filter((entrant) => entrant.controller.kind === 'human').map((entrant) => entrant.id))
    expect(teams[0]!.memberIds.every((id) => humans.has(id))).toBe(true)
  })
})

describe('P27 — Super Team 16 zespołów: wszyscy → 12 → 8, trzy serie (F03 §3.2.4)', () => {
  // Nota zależna od zespołu i serii: T16 najlepszy w I serii, potem zmiany.
  const scorer: Scorer = (id, roundId) => {
    const team = teamOf(id)
    const group = Number(id.at(-1))
    if (roundId === 'first') return 1000 + team * 10 + group
    if (roundId === 'second') return 1000 + (17 - team) * 7 + group
    return 1000 + ((team * 7) % 11) * 30 + group
  }

  it('pełny konkurs: 32 → 24 → 16 skoków, suma wszystkich zaliczonych skoków', () => {
    let state = create('superteam', 16)
    const first = playRound(state, scorer)
    expect(first.jumped).toHaveLength(32)
    expect(first.jumped.slice(0, 16).every((id) => id.endsWith('g1'))).toBe(true)
    state = first.state
    expect(currentRound(state).id).toBe('second')
    // II seria: 12 najlepszych (T5–T16), nadal grupami, kolejność z I serii.
    const second = playRound(state, scorer)
    expect(second.jumped).toHaveLength(24)
    expect(second.jumped.slice(0, 12).map(teamOf)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
    expect(second.jumped.slice(12).every((id) => id.endsWith('g2'))).toBe(true)
    state = second.state
    expect(currentRound(state).id).toBe('final')
    const final = playRound(state, scorer)
    expect(final.jumped).toHaveLength(16)
    state = final.state
    expect(state.status).toBe('complete')

    const standings = teamStandings(state)
    expect(standings.filter((row) => row.roundsReached === 3)).toHaveLength(8)
    expect(standings.filter((row) => row.roundsReached === 2)).toHaveLength(4)
    expect(standings.filter((row) => row.roundsReached === 1)).toHaveLength(4)
    for (const row of standings) {
      const team = state.teams!.find((candidate) => candidate.id === row.teamId)!
      const expected = state.rounds.reduce((sum, round) =>
        sum + team.memberIds.reduce((inner, id) => inner + (round.attempts[id]?.kind === 'score' ? scorer(id, round.id) : 0), 0), 0)
      expect(row.totalTenths).toBe(expected)
    }
    // Finał: każda grupa w odwrotnej bieżącej klasyfikacji (lider ostatni).
    const finalRound = state.rounds[2]!
    const leaderBeforeGroup2 = finalRound.startOrder.slice(8).map(teamOf).at(-1)
    const partial: CompetitionState = {
      ...state,
      rounds: [state.rounds[0]!, state.rounds[1]!, {
        ...finalRound,
        attempts: Object.fromEntries(finalRound.startOrder.slice(0, 8).map((id) => [id, finalRound.attempts[id]!])),
      }],
    }
    const leader = teamStandings(partial).filter((row) => row.roundsReached === 3)[0]!
    expect(`T${leaderBeforeGroup2}`).toBe(leader.teamId)
  })

  it('wznowienie między grupami (JSON jak IndexedDB) daje identyczny wynik', () => {
    let reference = create('superteam', 16)
    while (reference.status === 'active') reference = playRound(reference, scorer).state

    let resumed = create('superteam', 16)
    resumed = playRound(resumed, scorer).state
    resumed = playRound(resumed, scorer).state
    // 8 skoków finału = koniec grupy 1; zapis i odczyt w tym miejscu.
    for (let index = 0; index < 8; index += 1) {
      const id = currentParticipantId(resumed)!
      resumed = recordAttempt(resumed, scoreAttempt(resumed, id, scorer(id, 'final'))).state
    }
    resumed = JSON.parse(JSON.stringify(resumed)) as CompetitionState
    while (resumed.status === 'active') resumed = playRound(resumed, scorer).state
    expect(teamStandings(resumed)).toEqual(teamStandings(reference))
    expect(resumed.rounds.map((round) => round.startOrder)).toEqual(reference.rounds.map((round) => round.startOrder))
  })

  it('odwołana II seria kończy konkurs wynikiem I serii; odwołana I — konkurs anulowany', () => {
    let state = create('superteam', 16)
    state = playRound(state, scorer).state
    const cancelled = cancelCurrentRound(state, 'wiatr')
    expect(cancelled.status).toBe('complete')
    expect(teamStandings(cancelled)[0]!.name).toBe('DRUŻYNA 16')
    expect(cancelCurrentRound(create('superteam', 16), 'wiatr').status).toBe('cancelled')
  })
})
