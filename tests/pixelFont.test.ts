/** PKG-016 / P30 — font bitmapowy: polskie znaki, spójna siatka, napisy UI bez zastępczego „?”. */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hasPixelGlyph } from '../src/render/pixelFont'

describe('P30 — font bitmapowy', () => {
  it('ma wszystkie polskie litery (małe przez zamianę na wielkie) i podstawową interpunkcję', () => {
    for (const char of 'aąbcćdeęfghijklłmnńoópqrsśtuvwxyzźżAĄBCĆDEĘFGHIJKLŁMNŃOÓPQRSŚTUVWXYZŹŻ0123456789') {
      expect(hasPixelGlyph(char), char).toBe(true)
    }
    for (const char of ' .,:;!?-–—+=/()[]<>%"„”…•·←→↑↓×~#°_*&|@\'') expect(hasPixelGlyph(char), char).toBe(true)
  })

  it('każdy napis UI wielkimi literami w kodzie ekranów da się narysować', () => {
    const files = [
      ...readdirSync('src/render').map((name) => join('src/render', name)),
      ...readdirSync('src/app').map((name) => join('src/app', name)),
    ].filter((file) => file.endsWith('.ts'))
    const missing = new Set<string>()
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      // Literały '…' i `…` (bez części ${}) — napisy UI są w całości wielkimi literami.
      for (const match of source.matchAll(/'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
        const literal = (match[1] ?? match[2] ?? '').replace(/\$\{[^}]*\}/g, ' ')
        const letters = literal.replace(/[^A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]/g, '')
        if (letters.length < 3 || letters !== letters.toUpperCase()) continue
        for (const char of literal) {
          // Składnia zagnieżdżonych szablonów (${…}) nie jest tekstem ekranu.
          if ('\n\\{}$`'.includes(char)) continue
          if (!hasPixelGlyph(char)) missing.add(`${char} ← ${file}: ${literal.slice(0, 40)}`)
        }
      }
    }
    expect([...missing]).toEqual([])
  })
})
