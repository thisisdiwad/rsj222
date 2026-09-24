/**
 * PKG-015 — konkurs drużynowy, Super Team i King of the Hill wyłącznie klawiszami.
 * Człowiek rezygnuje (Q + Enter) albo nie startuje w zielonym (NPS), a skoki
 * oddają boty — prawdziwa droga gracza, bez setterów stanu. Zrzuty służą
 * odbiorowi VISUAL użytkownika.
 */
import { expect, test, type Page } from '@playwright/test'

type TeamRow = { name: string; rank: number; human: boolean; roundTenths: (number | null)[]; totalTenths: number }

type Debug = {
  screen: string
  paused: boolean
  pauseReason: string
  menuSelection: string
  persistence: { ready: boolean }
  competition: {
    view: string
    handoverReady: boolean
    startPhase: string | null
    lastCompletedRound: string | null
    roundId: string
    roundLabel: string
    format: string
    teams: { format: string; rows: TeamRow[]; advanceLimit: number | null; roundLabels: string[] } | null
    koth: {
      roundLabel: string
      verdict: string
      rows: { name: string; human: boolean; state: string; rank: number | null; eliminatedInRound: number | null }[]
    } | null
  } | null
  mode: {
    format: string
    focus: string
    profileCount: number
    botCount: number
    humanSlots: string[]
    message: string
    resumable: boolean
    running: boolean
  }
}

const OVERLOAD_REASON = 'zbyt długa przerwa klatki'

async function snapshot(page: Page): Promise<Debug> {
  return page.evaluate(() => (window as unknown as { __retroDebugSnapshot: () => Debug }).__retroDebugSnapshot())
}

/** Czeka na stan; udokumentowaną pauzę przeciążenia wznawia Enterem jak gracz. */
async function waitFor(page: Page, predicate: (state: Debug) => boolean, description: string, timeoutMs = 60_000): Promise<Debug> {
  const deadline = Date.now() + timeoutMs
  let last: Debug | null = null
  while (Date.now() < deadline) {
    last = await snapshot(page)
    if (last.paused) {
      expect([OVERLOAD_REASON, '']).toContain(last.pauseReason)
      await page.keyboard.press('Enter')
    } else if (predicate(last)) {
      return last
    }
    await page.waitForTimeout(40)
  }
  throw new Error(`Nie osiągnięto stanu: ${description}. Ostatni: ${JSON.stringify(last)}`)
}

/** Klawisz z potwierdzeniem efektu — pauza przeciążenia może zjeść pojedyncze naciśnięcie. */
async function press(page: Page, key: string, predicate: (state: Debug) => boolean, description: string): Promise<Debug> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await waitFor(page, (state) => !state.paused, 'brak pauzy', 5_000)
    await page.keyboard.press(key)
    try {
      return await waitFor(page, predicate, description, 1_500)
    } catch {
      // ponów prawdziwy klawisz
    }
  }
  return waitFor(page, predicate, description, 2_000)
}

async function openMode(page: Page, target: 'team' | 'superteam' | 'koth'): Promise<Debug> {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.keyboard.press('Enter')
  await waitFor(page, (state) => state.screen === 'menu' && state.persistence.ready, 'menu z bazą')
  // Tryby PKG-015 są na końcu listy: ↑ z „trening” zawija na KotH, potem Super Team i drużynowy.
  for (const step of ['koth', 'superteam', 'team']) {
    await press(page, 'ArrowUp', (state) => state.menuSelection === step, `menu → ${step}`)
    if (step === target) break
  }
  if (target === 'team') await page.screenshot({ path: test.info().outputPath('menu-modes-960x540.png') })
  return press(page, 'Enter', (state) => state.screen === 'mode-setup' && state.mode.format === target, `konfiguracja ${target}`)
}

/** Rezygnacja człowieka z bieżącego skoku (Q + Enter) i przejście dalej. */
async function withdrawHuman(page: Page): Promise<void> {
  await press(page, 'KeyQ', (state) => state.competition?.view === 'withdraw-confirm', 'rezygnacja')
  await press(page, 'Enter', (state) => state.competition?.view !== 'withdraw-confirm', 'potwierdzona rezygnacja')
  const after = await snapshot(page)
  if (after.competition?.view === 'result') {
    await press(page, 'Enter', (state) => state.competition?.view !== 'result', 'dalej po rezygnacji')
  }
}

/** Boty skaczą; na każdej zmianie człowieka — rezygnacja; na planszach serii — callback i Enter. */
async function playAsBots(page: Page, onSummary: (state: Debug) => Promise<void>): Promise<Debug> {
  for (let guard = 0; guard < 40; guard += 1) {
    const state = await waitFor(
      page,
      (current) => (current.competition?.view === 'handover' && current.competition.handoverReady)
        || current.competition?.view === 'round-summary' || current.competition?.view === 'finished',
      'człowiek, plansza serii albo koniec',
      120_000,
    )
    if (state.competition?.view === 'finished') return state
    if (state.competition?.view === 'handover') {
      await withdrawHuman(page)
      continue
    }
    await onSummary(state)
    await press(page, 'Enter', (current) => current.competition?.view !== 'round-summary', 'zatwierdzenie serii')
  }
  throw new Error('Za dużo kroków konkursu')
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 540 })
})

test('drużynowy: obsada klawiszami (walidacja braku gracza), finał 8, tabela drużynowa i powrót', async ({ page }) => {
  test.setTimeout(300_000)
  const setup = await openMode(page, 'team')
  expect(setup.mode).toMatchObject({ focus: 'profiles', profileCount: 1, humanSlots: ['AUT-1:local-01'] })
  await press(page, 'ArrowDown', (state) => state.mode.focus === 'difficulty', 'fokus: AI')
  await press(page, 'ArrowDown', (state) => state.mode.focus === 'AUT-1', 'fokus: AUT grupa I')
  // Zamiana gracza na bota: brak człowieka blokuje start.
  const noHuman = await press(page, 'ArrowRight', (state) => state.mode.humanSlots.length === 0, 'AUT-1 → bot')
  expect(noHuman.mode.message).toMatch(/BRAK GRACZA/)
  await press(page, 'Enter', (state) => state.mode.message.includes('BRAK GRACZA'), 'start zablokowany')
  expect((await snapshot(page)).screen).toBe('mode-setup')
  // Przeskok do GER i obsadzenie grupy I graczem 1.
  await press(page, 'PageDown', (state) => state.mode.focus === 'GER-1', 'fokus: GER grupa I')
  await press(page, 'ArrowRight', (state) => state.mode.humanSlots.join() === 'GER-1:local-01', 'GER-1 → gracz 1')
  await page.screenshot({ path: test.info().outputPath('team-setup-960x540.png') })

  await press(page, 'Enter', (state) => state.screen === 'competition', 'start konkursu drużynowego')
  const summaries: string[] = []
  const finished = await playAsBots(page, async (state) => {
    const teams = state.competition!.teams!
    expect(teams.rows).toHaveLength(12)
    summaries.push(state.competition!.lastCompletedRound!)
    if (state.competition!.lastCompletedRound === 'first') {
      expect(teams.advanceLimit).toBe(8)
      expect(state.competition!.roundId).toBe('final')
      await page.screenshot({ path: test.info().outputPath('team-table-after-first-960x540.png') })
    }
  })
  expect(summaries).toEqual(['first'])
  const rows = finished.competition!.teams!.rows
  expect(rows.filter((row) => row.roundTenths.length === 2 && row.roundTenths[1] !== null).length).toBeGreaterThanOrEqual(8)
  for (const row of rows) expect(row.totalTenths).toBe(row.roundTenths.reduce<number>((sum, value) => sum + (value ?? 0), 0))
  await page.screenshot({ path: test.info().outputPath('team-final-960x540.png') })
  const back = await press(page, 'Enter', (state) => state.screen === 'mode-setup', 'powrót do konfiguracji')
  expect(back.mode.running).toBe(false)
  expect(back.mode.message).toMatch(/KONKURS ZAKOŃCZONY/)
})

test('Super Team: wszyscy → 12 → 8, wznowienie po reloadzie między seriami', async ({ page }) => {
  test.setTimeout(360_000)
  await openMode(page, 'superteam')
  const two = await press(page, 'ArrowRight', (state) => state.mode.profileCount === 2, 'gracze: 2')
  // Obaj gracze w jednym zespole (AUT, grupy I i II).
  expect(two.mode.humanSlots).toEqual(['AUT-1:local-01', 'AUT-2:local-02'])
  await page.screenshot({ path: test.info().outputPath('superteam-setup-960x540.png') })
  await press(page, 'Enter', (state) => state.screen === 'competition', 'start Super Team')

  // Do planszy po I serii.
  let first: Debug | null = null
  for (let guard = 0; guard < 10 && !first; guard += 1) {
    const state = await waitFor(page, (current) => (current.competition?.view === 'handover' && current.competition.handoverReady)
      || current.competition?.view === 'round-summary', 'I seria', 120_000)
    if (state.competition?.view === 'handover') await withdrawHuman(page)
    else first = state
  }
  expect(first!.competition).toMatchObject({ lastCompletedRound: 'first', roundId: 'second' })
  expect(first!.competition!.teams!.advanceLimit).toBe(12)
  await page.screenshot({ path: test.info().outputPath('superteam-after-first-960x540.png') })
  const tableBefore = first!.competition!.teams!.rows

  // Reload w trakcie konkursu: konfiguracja pokazuje zapis, Enter wznawia na tej samej planszy.
  const reopened = await openMode(page, 'superteam')
  const resumable = reopened.mode.resumable ? reopened : await waitFor(page, (state) => state.mode.resumable, 'zapis do wznowienia')
  expect(resumable.mode.resumable).toBe(true)
  const resumed = await press(page, 'Enter', (state) => state.competition?.view === 'round-summary', 'wznowienie')
  expect(resumed.competition!.teams!.rows).toEqual(tableBefore)

  const rounds: string[] = []
  const finished = await playAsBots(page, async (state) => {
    rounds.push(state.competition!.lastCompletedRound!)
    if (state.competition!.lastCompletedRound === 'second') {
      expect(state.competition!.teams!.advanceLimit).toBe(8)
      await page.screenshot({ path: test.info().outputPath('superteam-after-second-960x540.png') })
    }
  })
  expect(rounds).toEqual(['first', 'second'])
  const rows = finished.competition!.teams!.rows
  expect(rows).toHaveLength(16)
  expect(rows.filter((row) => row.roundTenths[2] !== null && row.roundTenths[2] !== undefined).length).toBeGreaterThanOrEqual(8)
  await page.screenshot({ path: test.info().outputPath('superteam-final-960x540.png') })
})

test('King of the Hill: remis ostatnich (NPS) → dogrywka, wyjście ostatniego człowieka kończy turniej', async ({ page }) => {
  test.setTimeout(240_000)
  await openMode(page, 'koth')
  await press(page, 'ArrowRight', (state) => state.mode.profileCount === 2, 'gracze: 2')
  await press(page, 'ArrowDown', (state) => state.mode.focus === 'bots', 'fokus: boty')
  await press(page, 'ArrowRight', (state) => state.mode.botCount === 4, 'boty: 4')
  await page.screenshot({ path: test.info().outputPath('koth-setup-960x540.png') })
  await press(page, 'Enter', (state) => state.screen === 'competition', 'start KotH')

  // Obaj gracze nie ruszają w zielonym świetle: NPS = gorzej od każdej noty, remis → dogrywka.
  for (let player = 0; player < 2; player += 1) {
    await waitFor(page, (state) => state.competition?.view === 'handover' && state.competition.handoverReady, `gracz ${player + 1}`)
    await press(page, 'Enter', (state) => state.competition?.view === 'start', 'procedura startowa')
    await press(page, 'Enter', (state) => state.competition?.startPhase === 'yellow', 'żółte')
    await press(page, 'Enter', (state) => state.competition?.startPhase === 'green', 'zielone')
    await waitFor(page, (state) => state.competition?.view === 'result', 'NPS po 10 s', 30_000)
    await press(page, 'Enter', (state) => state.competition?.view !== 'result', 'dalej po NPS')
  }
  const summary = await waitFor(page, (state) => state.competition?.view === 'round-summary', 'koniec rundy 1', 120_000)
  expect(summary.competition!.koth!.verdict).toMatch(/REMIS OSTATNICH → DOGRYWKA/)
  expect(summary.competition!.roundLabel).toMatch(/DOGRYWKA/)
  await page.screenshot({ path: test.info().outputPath('koth-round-1-playoff-960x540.png') })
  await press(page, 'Enter', (state) => state.competition?.view !== 'round-summary', 'do dogrywki')

  // Dogrywka: obaj rezygnują — ostatni człowiek wychodzi, boty kończą bez zatrzymań.
  for (let player = 0; player < 2; player += 1) {
    await waitFor(page, (state) => state.competition?.view === 'handover' && state.competition.handoverReady, `dogrywka gracz ${player + 1}`)
    await withdrawHuman(page)
  }
  const finished = await waitFor(page, (state) => state.competition?.view === 'finished', 'koniec turnieju', 120_000)
  const rows = finished.competition!.koth!.rows
  expect(rows.filter((row) => row.state === 'winner').length).toBeGreaterThanOrEqual(1)
  expect(rows.filter((row) => row.human).every((row) => row.state === 'out' && row.eliminatedInRound === 2)).toBe(true)
  await page.screenshot({ path: test.info().outputPath('koth-finished-960x540.png') })
  await press(page, 'Enter', (state) => state.screen === 'mode-setup', 'powrót do konfiguracji')
})
