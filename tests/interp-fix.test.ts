import { describe, expect, it } from 'vitest'
import { applyFixEdit } from '~/utils/interp-fix'

const yaml = [
  'format: protoledger/interpretation@1',
  'messages:',
  '  - id: msg_00_20',
  '    when: "dir == 0 && cmd == 0x20"',
  '    fields:',
  '      - { name: threshold_centi_c, at: 11, type: u16be, status: hypothesis, hypothesis: H6 }',
  '  - id: msg_01_20',
  '    fields:',
  '      - { name: threshold_centi_c, at: 12, type: u16be, status: hypothesis, hypothesis: H6 }',
  '  - id: msg_01_30',
  '    fields:',
  '      - { name: threshold_centi_c, at: 9, type: u16be, status: hypothesis, hypothesis: H6 }',
  'hypotheses:',
  '  - { id: H5, statement: "период", test: "period_ms == action.params.period_ms" }',
  '  - { id: H6, statement: "порог, знаковое", test: "threshold_centi_c == action.params.threshold_c" }',
].join('\n')

describe('applyFixEdit', () => {
  it('меняет тип поля только в указанных сообщениях', () => {
    const r = applyFixEdit(yaml, { hypothesis: 'H6', field: 'threshold_centi_c', messages: ['msg_00_20', 'msg_01_20'], fromType: 'u16be', toType: 'i16be' })
    expect(r.changed).toBe(2)
    const lines = r.text.split('\n')
    expect(lines[5]).toBe('      - { name: threshold_centi_c, at: 11, type: i16be, status: hypothesis, hypothesis: H6 }')
    expect(lines[8]).toContain('type: i16be')
    expect(lines[11]).toContain('type: u16be')
  })

  it('сдвигает смещение, если правка его меняет', () => {
    const r = applyFixEdit(yaml, { hypothesis: 'H6', field: 'threshold_centi_c', messages: ['msg_01_30'], fromType: 'u16be', toType: 'u32be', fromAt: 9, toAt: 7 })
    expect(r.text.split('\n')[11]).toBe('      - { name: threshold_centi_c, at: 7, type: u32be, status: hypothesis, hypothesis: H6 }')
  })

  it('меняет тест нужной гипотезы, остальные не трогает', () => {
    const r = applyFixEdit(yaml, { hypothesis: 'H6', test: 'threshold_centi_c == dec(action.params.threshold_c, 2)' })
    expect(r.changed).toBe(1)
    const lines = r.text.split('\n')
    expect(lines[14]).toBe('  - { id: H6, statement: "порог, знаковое", test: "threshold_centi_c == dec(action.params.threshold_c, 2)" }')
    expect(lines[13]).toBe('  - { id: H5, statement: "период", test: "period_ms == action.params.period_ms" }')
  })

  it('нет такого поля — текст не меняется', () => {
    expect(applyFixEdit(yaml, { hypothesis: 'H6', field: 'nope', toType: 'i8' })).toEqual({ text: yaml, changed: 0 })
  })
})
