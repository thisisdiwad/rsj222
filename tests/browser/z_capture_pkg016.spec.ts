/**
 * PKG-016 / P30 — zrzuty do odbioru VISUAL: ekrany 1× (480×270) i 2× (960×540),
 * tabele z dużym tekstem, ekran rekordów i arkusz póz skoczka (z hamowaniem).
 * Wyłącznie klawisze; do `outputPath`, nic nie nadpisuje w repozytorium.
 */
import { writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

type Debug = {
  screen: string
  paused: boolean
  pauseReason: string
  menuSelection: string
  persistence: { ready: boolean }
  selectedRow: string
  settings: { largeText: boolean }
  competition: { view: string; handoverReady: boolean; lastCompletedRound: string | null } | null
  mode: { format: string }
  records: { tab: string; loading: boolean }
}

async function snapshot(page: Page): Promise<Debug> {
  return page.evaluate(() => (window as unknown as { __retroDebugSnapshot: () => Debug }).__retroDebugSnapshot())
}

async function waitFor(page: Page, predicate: (state: Debug) => boolean, description: string, timeoutMs = 60_000): Promise<Debug> {
  const deadline = Date.now() + timeoutMs
  let last: Debug | null = null
  while (Date.now() < deadline) {
    last = await snapshot(page)
    if (last.paused) await page.keyboard.press('Enter')
    else if (predicate(last)) return last
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
      // ponów
    }
  }
  return waitFor(page, predicate, description, 2_000)
}

async function menu(page: Page, target: string): Promise<void> {
  for (let step = 0; step < 12 && (await snapshot(page)).menuSelection !== target; step += 1) {
    await press(page, 'ArrowUp', () => true, 'menu ↑')
  }
  expect((await snapshot(page)).menuSelection).toBe(target)
}

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(250)
  await page.screenshot({ path: test.info().outputPath(name) })
}

async function boot(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height })
  await page.goto('/?debug', { waitUntil: 'domcontentloaded' })
  await page.keyboard.press('Enter')
  await waitFor(page, (state) => state.screen === 'menu' && state.persistence.ready, 'menu')
}

async function toggleLargeText(page: Page): Promise<void> {
  await menu(page, 'settings')
  await press(page, 'Enter', (state) => state.screen === 'settings', 'ustawienia')
  for (let step = 0; step < 15 && (await snapshot(page)).selectedRow !== 'largeText'; step += 1) {
    await press(page, 'ArrowDown', () => true, 'wiersz ↓')
  }
  const before = (await snapshot(page)).settings.largeText
  await press(page, 'Enter', (state) => state.settings.largeText !== before, 'duży tekst')
  await shot(page, `settings-large-${before ? 'off' : 'on'}-960x540.png`)
  await press(page, 'Backspace', (state) => state.screen === 'menu', 'menu')
}

for (const [width, height] of [[480, 270], [960, 540]] as const) {
  test(`ekrany menu, ustawień i rekordów w ${width}×${height}`, async ({ page }) => {
    await boot(page, width, height)
    await shot(page, `menu-${width}x${height}.png`)
    await menu(page, 'settings')
    await press(page, 'Enter', (state) => state.screen === 'settings', 'ustawienia')
    await shot(page, `settings-${width}x${height}.png`)
    await press(page, 'Backspace', (state) => state.screen === 'menu', 'menu')
    await menu(page, 'records')
    await press(page, 'Enter', (state) => state.screen === 'records', 'rekordy')
    await waitFor(page, (state) => !state.records.loading, 'rekordy wczytane')
    await shot(page, `records-${width}x${height}.png`)
  })
}

test('duży tekst: tabela drużynowa, rekordy i statystyki (960×540)', async ({ page }) => {
  test.setTimeout(180_000)
  await boot(page, 960, 540)
  await toggleLargeText(page)
  await menu(page, 'team')
  await press(page, 'Enter', (state) => state.screen === 'mode-setup', 'drużynowy')
  await press(page, 'Enter', (state) => state.screen === 'competition', 'start')
  for (let guard = 0; guard < 20; guard += 1) {
    const state = await waitFor(page, (current) => (current.competition?.view === 'handover' && current.competition.handoverReady)
      || current.competition?.view === 'round-summary', 'I seria', 120_000)
    if (state.competition?.view === 'round-summary') break
    await press(page, 'KeyQ', (current) => current.competition?.view === 'withdraw-confirm', 'rezygnacja')
    await press(page, 'Enter', (current) => current.competition?.view !== 'withdraw-confirm', 'potwierdzenie')
    if ((await snapshot(page)).competition?.view === 'result') {
      await press(page, 'Enter', (current) => current.competition?.view !== 'result', 'dalej')
    }
  }
  await shot(page, 'team-table-large-960x540.png')
})

test('arkusz póz skoczka z nową pozą hamowania (P30)', async ({ page }) => {
  await boot(page, 960, 540)
  const dataUrl = await page.evaluate(() => {
    const evidence = (window as unknown as {
      __retroVisualEvidence?: { poseSheet(options: { poses: string[]; columns: number }): { canvas: HTMLCanvasElement } }
    }).__retroVisualEvidence
    if (!evidence) throw new Error('Brak ?debug')
    return evidence.poseSheet({ poses: ['outrun', 'brake', 'fall'], columns: 7 }).canvas.toDataURL('image/png')
  })
  writeFileSync(test.info().outputPath('pose-sheet-outrun-brake-fall.png'), Buffer.from(dataUrl.split(',')[1]!, 'base64'))
})
