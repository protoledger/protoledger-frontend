import { describe, expect, it } from 'vitest'
import { reportBlocks, unescapeMd } from '~/utils/report-blocks'

const md = `# Отчёт по проекту «stand»

Версия движка 0.1.0.
Вторая строка абзаца.

## Область

| Запись | Условие |
|---|---|
| main.pcapng | dst\\_port == 4710 \\|\\| src\\_port == 4710 |

- main.pcapng: non\\_ip — 1 кадров
- extra.pcapng: non\\_tcp — 1 кадров

### Контрпримеры
`

describe('reportBlocks', () => {
  it('заголовки с якорями, абзац склеивается', () => {
    const b = reportBlocks(md)
    expect(b[0]).toEqual({ kind: 'heading', level: 1, text: 'Отчёт по проекту «stand»', id: 'sec-1' })
    expect(b[1]).toEqual({ kind: 'paragraph', text: 'Версия движка 0.1.0. Вторая строка абзаца.' })
    expect(b.filter(x => x.kind === 'heading').map(x => x.kind === 'heading' && x.level)).toEqual([1, 2, 3])
  })

  it('таблица: экранированная черта не делит ячейку', () => {
    const t = reportBlocks(md).find(x => x.kind === 'table')
    expect(t).toEqual({ kind: 'table', head: ['Запись', 'Условие'], rows: [['main.pcapng', 'dst_port == 4710 || src_port == 4710']] })
  })

  it('список без экранирования', () => {
    expect(reportBlocks(md).find(x => x.kind === 'list')).toEqual({ kind: 'list', items: ['main.pcapng: non_ip — 1 кадров', 'extra.pcapng: non_tcp — 1 кадров'] })
  })

  it('разметка HTML остаётся текстом', () => {
    expect(reportBlocks('<script>alert(1)</script>')).toEqual([{ kind: 'paragraph', text: '<script>alert(1)</script>' }])
  })

  it('unescapeMd снимает только экранирование', () => {
    expect(unescapeMd('\\[0, 8) a\\_b \\\\ c')).toBe('[0, 8) a_b \\ c')
  })
})
