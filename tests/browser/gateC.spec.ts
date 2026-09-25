/**
 * PKG-016 — bramka C: każda pozycja menu prowadzi do działającego ekranu
 * (bez „coming soon”) i wraca do menu; trening kończy się wynikiem.
 * Pełne drogi wejście → gra → wynik → powrót trybów konkursowych są w
 * `competition.spec.ts` (konkurs + rekordy), `season.spec.ts` (puchar, KO)
 * i `modes.spec.ts` (drużyny, Super Team, King of the Hill).
 */
import { expect, test, type Page } from '@playwright/test'

type Debug = {
  screen: string
  paused: boolean
  pauseReason: string
  menuSelection: string
  persistence: { ready: boolean }
  jump: { phase: string; status: string | null; events: string[] } | null
  records: { tab: string; loading: boolean; rows: string[][] }
  audio: { running: boolean; voices: number; loops: string[]; music: string | null; played: number }
}

const OVERLOAD_REASON = 'zbyt długa przerwa klatki'

async function snapshot(page: Page): Promise<Debug> {
  return page.evaluate(() => (window as unknown as { __retroDebugSnapshot: () => Debug }).__retroDebugSnapshot())
}

async function waitFor(page: Page, predicate: (state: Debug) => boolean, description: string, timeoutMs = 30_000): Promise<Debug> {
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

const MENU = ['training', 'competition', 'replay', 'settings', 'cup', 'ko', 'team', 'superteam', 'koth', 'records'] as const
/** Ekran, na który prowadzi Enter, i klawisz powrotu do menu. */
const TARGET: Readonly<Record<(typeof MENU)[number], string>> = {
  training: 'jump',
  competition: 'competition-setup',
  replay: 'menu',
  settings: 'settings',
  cup: 'season',
  ko: 'season',
  team: 'mode-setup',
  superteam: 'mode-setup',
  koth: 'mode-setup',
  records: 'records',
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 540 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.keyboard.press('Enter')
  await waitFor(page, (state) => state.screen === 'menu' && state.persistence.ready, 'menu z bazą')
})

test('bramka C: każda z 10 pozycji menu otwiera działający ekran i wraca Backspace', async ({ page }) => {
  test.setTimeout(120_000)
  for (const [index, entry] of MENU.entries()) {
    const selected = await snapshot(page)
    expect(selected.menuSelection).toBe(entry)
    const opened = await press(page, 'Enter', (state) => state.screen === TARGET[entry], `otwarcie: ${entry}`)
    if (entry === 'records') {
      await waitFor(page, (state) => !state.records.loading, 'rekordy wczytane')
      // Świeża baza: tabela rekordów ma wiersze skoczni z „—”, bez pustego ekranu.
      expect((await snapshot(page)).records.rows.length).toBeGreaterThanOrEqual(15)
      await press(page, 'ArrowRight', (state) => state.records.tab === 'stats', 'zakładka statystyk')
      await press(page, 'ArrowRight', (state) => state.records.tab === 'archive', 'zakładka archiwum')
    }
    if (opened.screen !== 'menu') {
      await press(page, 'Backspace', (state) => state.screen === 'menu', `powrót z: ${entry}`)
    }
    if (index < MENU.length - 1) {
      await press(page, 'ArrowDown', (state) => state.menuSelection === MENU[index + 1], `menu → ${MENU[index + 1]}`)
    }
  }
})

test('bramka C: trening — skok do stanu końcowego z wynikiem, potem menu', async ({ page }) => {
  test.setTimeout(60_000)
  await press(page, 'Enter', (state) => state.screen === 'jump' && state.jump?.phase === 'GateGreen', 'trening')
  await press(page, 'ArrowRight', (state) => (state.jump?.events ?? []).some((event) => event.endsWith(' gateOpen')), 'belka otwarta')
  // Wybicie w okolicy progu; wynik (ustany albo upadek) jest stanem końcowym treningu.
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const state = await snapshot(page)
    if (state.jump?.status) break
    if (state.jump?.phase === 'Inrun' || state.jump?.phase === 'Takeoff') await page.keyboard.press('ArrowUp')
    await page.waitForTimeout(100)
  }
  const done = await waitFor(page, (state) => state.jump?.status !== null && state.jump?.status !== undefined, 'wynik treningu', 30_000)
  expect(['landed', 'fall']).toContain(done.jump!.status)
  await page.screenshot({ path: test.info().outputPath('gate-c-training-result-960x540.png') })
  await press(page, 'Backspace', (state) => state.screen === 'menu', 'powrót z treningu')
})

test('P31: dźwięk po geście — muzyka menu, cisza muzyki w skoku, pętla ślizgu, efekty menu', async ({ page }) => {
  test.setTimeout(60_000)
  const menu = await waitFor(page, (state) => state.audio.running && state.audio.music === 'menu', 'muzyka menu')
  const before = menu.audio.played
  await press(page, 'ArrowDown', (state) => state.menuSelection === 'competition', 'menu ↓')
  expect((await snapshot(page)).audio.played).toBeGreaterThan(before)
  await press(page, 'ArrowUp', (state) => state.menuSelection === 'training', 'menu ↑')
  await press(page, 'Enter', (state) => state.screen === 'jump', 'trening')
  expect((await snapshot(page)).audio.music).toBeNull()
  await press(page, 'ArrowRight', (state) => state.audio.loops.includes('slide'), 'pętla ślizgu na rozbiegu')
  const loops = await waitFor(page, (state) => state.jump?.phase === 'Inrun', 'rozbieg')
  expect(loops.audio.loops).toEqual(['slide'])
})

