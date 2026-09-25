/** PKG-016 / P31 — manager dźwięku na atrapie Web Audio: głosy, pętle, pauza, autoplay, synteza. */
import { describe, expect, it } from 'vitest'
import { AudioDirector, MAX_VOICES } from '../src/audio/audioDirector'
import { renderLoop, renderMusic, renderSfx, SFX_CATEGORY, type SfxId } from '../src/audio/synth'

class FakeParam {
  value = 1
  targets: number[] = []
  setTargetAtTime(value: number): void {
    this.value = value
    this.targets.push(value)
  }
}

class FakeNode {
  connected: FakeNode[] = []
  connect(node: FakeNode): FakeNode {
    this.connected.push(node)
    return node
  }
  disconnect(): void {
    this.connected = []
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam()
}

class FakeSource extends FakeNode {
  buffer: unknown = null
  loop = false
  started = 0
  stopped = 0
  onended: (() => void) | null = null
  start(): void {
    this.started += 1
  }
  stop(): void {
    this.stopped += 1
  }
  end(): void {
    this.onended?.()
  }
}

class FakeContext {
  state: 'suspended' | 'running' = 'suspended'
  currentTime = 0
  destination = new FakeNode()
  sources: FakeSource[] = []
  gains: FakeGain[] = []
  constructor(private readonly allowResume = true) {}
  async resume(): Promise<void> {
    if (!this.allowResume) throw new Error('NotAllowedError')
    this.state = 'running'
  }
  createGain(): FakeGain {
    const gain = new FakeGain()
    this.gains.push(gain)
    return gain
  }
  createBufferSource(): FakeSource {
    const source = new FakeSource()
    this.sources.push(source)
    return source
  }
  createBiquadFilter() {
    return Object.assign(new FakeNode(), { type: 'lowpass', frequency: new FakeParam() })
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length)
    return { length, getChannelData: () => data }
  }
}

async function director(allowResume = true): Promise<{ audio: AudioDirector; context: FakeContext }> {
  const context = new FakeContext(allowResume)
  const audio = new AudioDirector(() => context as unknown as AudioContext)
  await audio.unlock()
  return { audio, context }
}

describe('P31 — manager dźwięku', () => {
  it('50 prób skoku: liczba głosów nie narasta ponad limit i wraca do zera po zakończeniu', async () => {
    const { audio, context } = await director()
    const perJump: SfxId[] = ['lightRed', 'lightYellow', 'lightGreen', 'takeoff', 'telemark', 'brake', 'result', 'cheer']
    for (let jump = 0; jump < 50; jump += 1) {
      for (const id of perJump) audio.play(id)
      expect(audio.activeVoices).toBeLessThanOrEqual(MAX_VOICES)
      // Część efektów kończy się naturalnie między próbami.
      for (const source of context.sources.slice(-3)) source.end()
    }
    expect(audio.playedCount).toBe(50 * perJump.length)
    for (const source of context.sources) source.end()
    expect(audio.activeVoices).toBe(0)
  })

  it('pętle są uruchamiane raz i tylko strojone; poziom 0 je zatrzymuje', async () => {
    const { audio, context } = await director()
    for (let frame = 0; frame < 120; frame += 1) audio.setLoop('slide', 0.3 + frame / 400, frame / 120)
    const loops = context.sources.filter((source) => source.loop)
    expect(loops).toHaveLength(1)
    expect(loops[0]!.started).toBe(1)
    expect(audio.activeLoops).toEqual(['slide'])
    audio.setLoop('slide', 0)
    expect(loops[0]!.stopped).toBe(1)
    expect(audio.activeLoops).toEqual([])
  })

  it('pauza wycisza master i blokuje nowe efekty; wznowienie przywraca poziom', async () => {
    const { audio, context } = await director()
    const master = context.gains[0]!
    audio.setLevels({ master: 80, sfx: 100, crowd: 50, music: 40 })
    expect(master.gain.value).toBeCloseTo(0.8)
    audio.setPaused(true)
    expect(master.gain.value).toBe(0)
    const before = audio.playedCount
    audio.play('confirm')
    expect(audio.playedCount).toBe(before)
    audio.setPaused(false)
    expect(master.gain.value).toBeCloseTo(0.8)
    // Szyny kategorii: efekty, publiczność, muzyka.
    expect(context.gains.slice(1, 4).map((gain) => gain.gain.value)).toEqual([1, 0.5, 0.4])
  })

  it('odmowa autoplay: gra działa bez dźwięku, bez wyjątku; brak Web Audio też', async () => {
    const { audio } = await director(false)
    expect(audio.running).toBe(false)
    expect(() => audio.play('takeoff')).not.toThrow()
    expect(() => audio.setMusic('menu')).not.toThrow()
    expect(audio.musicId).toBeNull()
    const none = new AudioDirector(() => null)
    expect(await none.unlock()).toBe(false)
  })

  it('muzyka ekranu: ta sama pętla co klatkę nie restartuje się; zmiana ekranu przełącza', async () => {
    const { audio, context } = await director()
    for (let frame = 0; frame < 30; frame += 1) audio.setMusic('menu')
    expect(context.sources.filter((source) => source.loop)).toHaveLength(1)
    audio.setMusic('podium')
    expect(audio.musicId).toBe('podium')
    audio.setMusic(null)
    expect(audio.musicId).toBeNull()
    expect(context.sources.filter((source) => source.loop).every((source) => source.stopped === 1)).toBe(true)
  })
})

describe('P31 — autorska synteza', () => {
  it('efekty i pętle są deterministyczne, niepuste i w zakresie [-1, 1]', () => {
    for (const id of Object.keys(SFX_CATEGORY) as SfxId[]) {
      const first = renderSfx(id, 22_050)
      expect(first.length).toBeGreaterThan(100)
      expect(renderSfx(id, 22_050)).toEqual(first)
      expect(Math.max(...first.map(Math.abs))).toBeLessThanOrEqual(1)
      expect(first.some((value) => value !== 0)).toBe(true)
    }
    for (const id of ['slide', 'wind', 'crowd'] as const) expect(renderLoop(id, 8_000)).toHaveLength(16_000)
  })

  it('trzy pętle muzyczne (menu, konfiguracja, podium) mają długość dwóch taktów', () => {
    expect(renderMusic('menu', 8_000).length).toBe(Math.floor(16 * 0.2 * 2 * 8_000))
    expect(renderMusic('setup', 8_000).length).toBe(Math.floor(16 * 0.24 * 2 * 8_000))
    expect(renderMusic('podium', 8_000).length).toBe(Math.floor(16 * 0.18 * 2 * 8_000))
  })
})
