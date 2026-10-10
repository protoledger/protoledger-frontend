import { describe, expect, it } from 'vitest'
import { compile, createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { safeText } from '~/utils/safe-text'

// Невидимые символы собираются из кодов, чтобы их не было в исходнике.
const ch = (code: number) => String.fromCodePoint(code)
const RLO = ch(0x202E)
const NUL = ch(0x00)
const ESC = ch(0x1B)
const NEL = ch(0x85)
const ZWSP = ch(0x200B)
const BOM = ch(0xFEFF)

const HOSTILE = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  `invoice${RLO}txt.exe`,
  `a${NUL}b${ESC}c${NEL}d`,
  `zero${ZWSP}width${BOM}`,
  'строка\nс переводом\tи табом',
]

describe('safeText', () => {
  it('смена направления и управляющие символы — видимой меткой', () => {
    expect(safeText(`invoice${RLO}txt.exe`)).toBe('invoice[U+202E]txt.exe')
    expect(safeText(`a${NUL}b${ESC}c${NEL}d`)).toBe('a[U+0000]b[U+001B]c[U+0085]d')
    expect(safeText(`zero${ZWSP}width${BOM}`)).toBe('zero[U+200B]width[U+FEFF]')
  })

  it('переводы строк и табуляция видны, длинное обрезается', () => {
    expect(safeText('a\nb\tc')).toBe('a ⏎ b → c')
    expect(safeText('x'.repeat(10), 4)).toBe('xxxx…')
  })

  it('обычный текст, кириллица и значки не трогаются', () => {
    expect(safeText('set_param · value = 21 ✓ привет')).toBe('set_param · value = 21 ✓ привет')
  })

  it('в разметке злые строки остаются текстом', async () => {
    const render = compile('<ul><li v-for="s in items" :title="safeText(s)">{{ safeText(s) }}</li></ul>')
    const html = await renderToString(createSSRApp({ render: () => h({ render, setup: () => ({ items: HOSTILE, safeText }) }) }))
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    for (const bad of [RLO, NUL, ZWSP, BOM]) expect(html).not.toContain(bad)
  })
})
