import { describe, expect, it } from 'vitest'
import { addField, parseForm, setFieldAttr, splitFlow } from '~/utils/interp-form'

const yaml = `format: protoledger/interpretation@1
framing:
  kind: length_prefixed
  length: { at: 2, type: u16be, adjust: 8 }
messages:
  - id: read_config_req
    description: Запрос настроек
    when: "dir == 0 && cmd == 0x10"
    fields:
      - { name: signature, at: 0, type: bytes, len: 2, expect: "a65c", status: rule }
      - { name: length, at: 2, type: u16be, status: rule, description: "длина тела, без заголовка" }
  - id: values_resp
    when: "dir == 1"
    fields:
      - { name: count, at: 9, type: u8, status: hypothesis, hypothesis: H8 }
      - name: measurements
        at: 10
        repeat:
          count: "count"
          fields:
            - { name: temperature_centi_c, at: 4, type: i16be, status: hypothesis }
  - id: empty_msg
    when: "dir == 2"
`

describe('splitFlow', () => {
  it('запятая в кавычках не делит пару', () => {
    expect(splitFlow(' name: length, description: "длина, без заголовка", at: 2 ')).toEqual([
      ['name', 'length'], ['description', '"длина, без заголовка"'], ['at', '2'],
    ])
  })
})

describe('parseForm', () => {
  const form = parseForm(yaml)

  it('сообщения с условиями; поле фрейминга — не поле сообщения', () => {
    expect(form.map(m => [m.id, m.when])).toEqual([
      ['read_config_req', '"dir == 0 && cmd == 0x10"'],
      ['values_resp', '"dir == 1"'],
      ['empty_msg', '"dir == 2"'],
    ])
    expect(form[0]!.fields.map(f => f.attrs.name)).toEqual(['signature', 'length'])
  })

  it('поле повторяющейся группы — глубже, блочное поле не теряет соседей', () => {
    expect(form[1]!.fields.map(f => [f.attrs.name, f.depth])).toEqual([['count', 0], ['temperature_centi_c', 1]])
  })
})

describe('setFieldAttr', () => {
  it('меняет значение, остальное и кавычки остаются', () => {
    const line = parseForm(yaml)[0]!.fields[1]!.line
    const out = setFieldAttr(yaml, line, 'status', 'hypothesis')
    expect(out.split('\n')[line - 1]).toBe('      - { name: length, at: 2, type: u16be, status: hypothesis, description: "длина тела, без заголовка" }')
    expect(out.split('\n').length).toBe(yaml.split('\n').length)
  })

  it('добавляет и убирает ключ, сложное значение берёт в кавычки', () => {
    const line = parseForm(yaml)[1]!.fields[0]!.line
    const added = setFieldAttr(yaml, line, 'len', 'end - 1')
    expect(added.split('\n')[line - 1]).toContain('len: "end - 1"')
    expect(setFieldAttr(added, line, 'hypothesis', null).split('\n')[line - 1]).toBe('      - { name: count, at: 9, type: u8, status: hypothesis, len: "end - 1" }')
  })
})

describe('addField', () => {
  it('после последнего поля сообщения, с тем же отступом', () => {
    const msg = parseForm(yaml)[0]!
    const out = addField(yaml, msg, { name: 'cmd', at: '7', type: 'u8', status: 'unknown' })
    expect(out.split('\n')[msg.fields[1]!.line]).toBe('      - { name: cmd, at: 7, type: u8, status: unknown }')
    expect(parseForm(out)[0]!.fields.map(f => f.attrs.name)).toEqual(['signature', 'length', 'cmd'])
  })

  it('после блочного поля — за его вложенными строками', () => {
    const msg = parseForm(yaml)[1]!
    const out = addField(yaml, msg, { name: 'tail', at: '20', type: 'bytes', status: 'unknown' })
    expect(parseForm(out)[1]!.fields.map(f => [f.attrs.name, f.depth])).toEqual([['count', 0], ['temperature_centi_c', 1], ['tail', 0]])
  })

  it('у сообщения без полей создаёт fields:', () => {
    const msg = parseForm(yaml)[2]!
    const out = addField(yaml, msg, { name: 'x', at: '0', type: 'u8', status: 'unknown' })
    expect(parseForm(out)[2]!.fields.map(f => f.attrs.name)).toEqual(['x'])
  })
})
