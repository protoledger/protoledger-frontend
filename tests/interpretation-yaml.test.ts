import { describe, expect, it } from 'vitest'
import type { FramingSpec } from '~/api/types'
import { framingOnlyYaml, replaceFramingBlock } from '~/utils/interpretation-yaml'

const spec: FramingSpec = { kind: 'length_prefixed', length: { at: 4, type: 'u16le', adjust: 7 }, status: 'hypothesis' }
const line = 'framing: {"kind":"length_prefixed","length":{"at":4,"type":"u16le","adjust":7},"status":"hypothesis"}'

describe('YAML интерпретации', () => {
  it('описание только из фрейминга', () => {
    expect(framingOnlyYaml(spec)).toBe(`format: protoledger/interpretation@1\nscope:\n  direction: any\n${line}\nmessages: []\n`)
  })

  it('заменяет блок framing и не трогает остальное', () => {
    const yaml = [
      'format: protoledger/interpretation@1',
      'scope:',
      '  direction: any',
      'framing:',
      '  kind: length_prefixed',
      '  length: { at: 2, type: u8, adjust: 4 }',
      '  status: rule',
      '',
      '# типы',
      'messages:',
      '  - id: a',
    ].join('\n')
    expect(replaceFramingBlock(yaml, spec).split('\n')).toEqual([
      'format: protoledger/interpretation@1',
      'scope:',
      '  direction: any',
      line,
      '',
      '# типы',
      'messages:',
      '  - id: a',
    ])
  })

  it('добавляет framing перед messages, если его нет', () => {
    const yaml = 'format: protoledger/interpretation@1\nmessages:\n  - id: a'
    expect(replaceFramingBlock(yaml, spec).split('\n')).toEqual(['format: protoledger/interpretation@1', line, 'messages:', '  - id: a'])
  })
})
