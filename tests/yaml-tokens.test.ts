import { describe, expect, it } from 'vitest'
import { tokenizeYamlLine } from '~/utils/yaml-tokens'

describe('tokenizeYamlLine', () => {
  it('ключи, числа, строки и комментарии', () => {
    const t = tokenizeYamlLine('  magic: "aa55"  # сигнатура')
    expect(t.map(x => x.text).join('')).toBe('  magic: "aa55"  # сигнатура')
    expect(t.find(x => x.kind === 'key')?.text).toBe('magic')
    expect(t.find(x => x.kind === 'string')?.text).toBe('"aa55"')
    expect(t.at(-1)?.kind).toBe('comment')
  })

  it('не теряет символы на произвольной строке', () => {
    const line = '- { name: value, offset: 4, type: u16be, ref: H4 } <script>'
    expect(tokenizeYamlLine(line).map(x => x.text).join('')).toBe(line)
  })
})
