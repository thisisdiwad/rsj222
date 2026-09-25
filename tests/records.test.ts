/** PKG-016 / P29 — Q-FIS-15: kategorie rekordów, remis, idempotencja, archiwum wersji, replay rekordu, statystyki. */
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { CompetitionSession } from '../src/app/competitionSession'
import { buildHillById } from '../src/app/hills'
import type { CompetitionJumpResult } from '../src/sport/jumpResult'
import { humanJumpStats, seasonStats } from '../src/sport/stats'
import type { SeasonState } from '../src/sport/season'
import {
  commitAttempt,
  commitTrainingJump,
  loadLatestReplay,
  loadRecords,
  loadReplay,
  openGameDatabase,
  recordReplayId,
} from '../src/storage/db'
import {
  isRecordEligible,
  nextRecord,
  recordKeyFor,
  recordTargets,
  type ContentVersions,
  type RecordCandidate,
  type StoredReplay,
} from '../src/storage/schema'

const V1: ContentVersions = { rules: 'r1', physics: 'p1', hill: 'h01-inspired-4' }
const V2: ContentVersions = { ...V1, hill: 'h01-inspired-5' }

function entry(distanceHalfMeters: number, participantId: string, resultId: string, establishedAtMs: number) {
  return {
    key: 'k', distanceHalfMeters, totalTenths: 1000, participantId, participantName: participantId,
    resultId, establishedAtMs, versions: V1, category: 'competition' as const, scope: null,
  }
}

function candidate(overrides: Partial<RecordCandidate> = {}): RecordCandidate {
  return {
    context: 'competition', status: 'landed', administrativeStatus: null, distanceHalfMeters: 200,
    versions: V1, participantName: 'Łucja Wicher', hillId: 'h01-lillehammer-normal', ...overrides,
  }
}

function result(resultId: string, participantId = 'local-01', distanceHalfMeters = 200, status: 'landed' | 'fall' = 'landed') {
  return { resultId, participantId, distanceHalfMeters, totalTenths: 1200, status, versions: V1 } as unknown as CompetitionJumpResult
}

function replayFor(id: string): StoredReplay {
  return {
    schemaVersion: 1, id, sessionId: 's', kind: 'auto', createdAtMs: 1, formatVersion: 'pkg006-replay-1', versions: V1,
    sampleHz: 30,
    initialState: {
      competitionId: 's', roundId: 'first', participantId: 'local-01', participantName: 'Łucja Wicher', gateNumber: 8,
      juryGateNumber: 8, coachRequested: false, windSeed: null, windVersion: null, hillId: 'h01-lillehammer-normal',
    },
    inputs: [],
    samples: [{ tick: 0, x: 0, y: 0, pitchRad: 0, phase: 'Inrun', speedKmh: 0, windUserMetersPerSecond: 0, heightAboveSurface: 0 }],
    discreteEvents: [],
    recordedResult: result(id),
  }
}

describe('P29 — polityka rekordu (GAMEPLAY_SPEC §9)', () => {
  it('dłuższy skok ustanawia rekord, krótszy nic nie zmienia', () => {
    const first = nextRecord(undefined, entry(200, 'a', 'r1', 10))!
    expect(first.change).toBe('new')
    expect(nextRecord(first.record, entry(199, 'b', 'r2', 20))).toBeNull()
    const better = nextRecord(first.record, entry(201, 'b', 'r3', 30))!
    expect(better).toMatchObject({ change: 'new', record: { participantId: 'b', establishedAtMs: 30, coHolders: [] } })
  })

  it('remis: współposiadacz bez zmiany daty; ten sam zawodnik lub wynik — bez zmian', () => {
    const first = nextRecord(undefined, entry(200, 'a', 'r1', 10))!.record
    const tie = nextRecord(first, entry(200, 'b', 'r2', 99))!
    expect(tie.change).toBe('co-holder')
    expect(tie.record.establishedAtMs).toBe(10)
    expect(tie.record.participantId).toBe('a')
    expect(tie.record.coHolders).toEqual([{ participantId: 'b', participantName: 'b', resultId: 'r2', establishedAtMs: 99 }])
    expect(nextRecord(tie.record, entry(200, 'a', 'r9', 120))).toBeNull()
    expect(nextRecord(tie.record, entry(200, 'b', 'r10', 130))).toBeNull()
    expect(nextRecord(tie.record, entry(200, 'c', 'r1', 140))).toBeNull()
  })

  it('Q-FIS-15: upadek, DSQ i skok bez odległości nie mogą ustanowić żadnego rekordu', () => {
    expect(isRecordEligible(candidate())).toBe(true)
    expect(isRecordEligible(candidate({ status: 'fall' }))).toBe(false)
    expect(isRecordEligible(candidate({ administrativeStatus: 'dsq' }))).toBe(false)
    expect(isRecordEligible(candidate({ distanceHalfMeters: 0 }))).toBe(false)
  })

  it('kategorie mają osobne klucze; konkurs sezonu dotyka też rekordu zestawu; konkursowy klucz jak w P19', () => {
    expect(recordKeyFor('competition', V1)).toBe('r1|p1|h01-inspired-4')
    expect(recordTargets(candidate()).map((target) => target.category)).toEqual(['competition'])
    expect(recordTargets(candidate({ setKey: 'PUCHAR-1-ABCDEF12' }))).toEqual([
      { category: 'competition', scope: null, key: 'r1|p1|h01-inspired-4' },
      { category: 'set', scope: 'PUCHAR-1-ABCDEF12', key: 'set:PUCHAR-1-ABCDEF12|r1|p1|h01-inspired-4' },
    ])
    expect(recordTargets(candidate({ context: 'fun' }))[0]!.key).toBe('fun|r1|p1|h01-inspired-4')
    expect(recordTargets(candidate({ context: 'training' }))[0]!.key).toBe('training|r1|p1|h01-inspired-4')
  })
})

describe('P29 — zapis rekordów w transakcji skoku (IndexedDB v3)', () => {
  const hill = buildHillById('h01-lillehammer-normal')
  const session = () => new CompetitionSession(hill, 1, 'easy', false, null, 'records-test').toStoredSession(1)

  it('nowy rekord konkursu i zestawu z kopią replaya; ponowne zatwierdzenie tego samego wyniku nic nie zmienia', async () => {
    const db = await openGameDatabase(new IDBFactory())
    const input = {
      session: session(), result: result('res-1'), recordCandidate: candidate({ setKey: 'PUCHAR-1-X' }),
      replay: replayFor('res-1'), ownerId: 'tab', nowMs: 50,
    }
    const outcome = await commitAttempt(db, input)
    expect(outcome.ok && outcome.recordUpdated).toBe(true)
    if (!outcome.ok) return
    expect(outcome.recordChanges.map((change) => [change.category, change.change])).toEqual([['competition', 'new'], ['set', 'new']])
    const records = await loadRecords(db)
    expect(records).toHaveLength(2)
    const official = records.find((record) => record.key === 'r1|p1|h01-inspired-4')!
    expect(official).toMatchObject({ category: 'competition', participantName: 'Łucja Wicher', hillId: 'h01-lillehammer-normal', replayId: recordReplayId(official.key) })
    const copy = await loadReplay(db, official.replayId!)
    expect(copy).toMatchObject({ kind: 'record', recordedResult: { resultId: 'res-1' } })

    const again = await commitAttempt(db, { ...input, nowMs: 60 })
    expect(again.ok && again.applied).toBe(false)
    expect(again.ok && again.recordChanges).toEqual([])
    expect(await loadRecords(db)).toEqual(records)
  })

  it('upadek i King of the Hill nie zmieniają oficjalnego rekordu; KotH ma własną kategorię', async () => {
    const db = await openGameDatabase(new IDBFactory())
    const base = { session: session(), replay: null, ownerId: 'tab' }
    await commitAttempt(db, { ...base, result: result('fall-1', 'local-01', 300, 'fall'), recordCandidate: candidate({ status: 'fall', distanceHalfMeters: 300 }), nowMs: 1 })
    expect(await loadRecords(db)).toEqual([])
    await commitAttempt(db, { ...base, result: result('fun-1', 'local-01', 260), recordCandidate: candidate({ context: 'fun', distanceHalfMeters: 260 }), nowMs: 2 })
    expect((await loadRecords(db)).map((record) => record.category)).toEqual(['fun'])
  })

  it('trening zapisuje tylko rekord treningowy; zmiana wersji skoczni archiwizuje (stary rekord zostaje)', async () => {
    const db = await openGameDatabase(new IDBFactory())
    const changes = await commitTrainingJump(db, {
      candidate: candidate({ context: 'competition', distanceHalfMeters: 210 }),
      result: { resultId: 'training-1', participantId: 'local-01', totalTenths: 1100 },
      replay: replayFor('training-1'),
      nowMs: 5,
    })
    // Wywołanie treningowe zawsze wymusza kategorię treningu, nawet przy błędnym kontekście.
    expect(changes.map((change) => change.category)).toEqual(['training'])
    await commitTrainingJump(db, {
      candidate: candidate({ context: 'training', distanceHalfMeters: 205, versions: V2 }),
      result: { resultId: 'training-2', participantId: 'local-01', totalTenths: 1000 },
      replay: null,
      nowMs: 6,
    })
    const records = await loadRecords(db)
    expect(records.map((record) => [record.key, record.distanceHalfMeters]).sort()).toEqual([
      ['training|r1|p1|h01-inspired-4', 210],
      ['training|r1|p1|h01-inspired-5', 205],
    ])
    expect(records.find((record) => record.versions.hill === V2.hill)!.replayId).toBeNull()
    // Kopia replaya rekordu treningu nie udaje „ostatniej powtórki” konkursu.
    expect(await loadLatestReplay(db)).toEqual({ kind: 'none' })
  })
})

describe('P29 — statystyki skoków i sezonów', () => {
  it('liczy tylko graczy; ustane, upadki, najdłuższy ustany skok i średnią notę', () => {
    const rows = humanJumpStats([
      { ...result('a', 'local-01', 200), totalTenths: 1000 },
      { ...result('b', 'local-01', 260, 'fall'), totalTenths: 400 },
      { ...result('c', 'local-01', 210), totalTenths: 1100 },
      { ...result('d', 'bot-001', 300), totalTenths: 1500 },
    ] as CompetitionJumpResult[])
    expect(rows).toEqual([{
      participantId: 'local-01', jumps: 3, landed: 2, falls: 1, bestDistanceHalfMeters: 210, bestTotalTenths: 1100, averageTotalTenths: 1050,
    }])
  })

  it('sezony: rozpoczęte, ukończone, porzucone, zwycięstwa i podia graczy', () => {
    const season = (status: SeasonState['status'], humanRank: number): SeasonState => ({
      id: `s-${status}-${humanRank}`, format: 'cup', setKey: 'K', createdAtMs: 1, status,
      setup: { profileCount: 1, difficulty: 'normal' },
      calendar: { id: 'c', name: 'C', events: [{ hillId: 'h', hillVersion: 'v' }] },
      results: [{
        eventIndex: 0, status: 'complete',
        placements: [
          { participantId: 'bot-1', name: 'Bot', rank: humanRank === 1 ? 2 : 1, totalTenths: 100 },
          { participantId: 'local-01', name: 'Gracz', rank: humanRank, totalTenths: 90 },
        ],
      }],
    })
    const [cup, ko] = seasonStats([season('complete', 1), season('complete', 3), season('abandoned', 1), season('active', 1)])
    expect(cup).toEqual({ format: 'cup', started: 4, completed: 2, abandoned: 1, humanWins: 1, humanPodiums: 2 })
    expect(ko).toMatchObject({ format: 'four-hills', started: 0 })
  })
})
