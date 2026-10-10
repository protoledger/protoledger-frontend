import { describe, expect, it } from 'vitest'
import { guessMapping, readCsvHeader } from '~/utils/csv-header'

describe('readCsvHeader', () => {
  it('запятая и кавычки', () => {
    expect(readCsvHeader('"time","action",params,result\n2026-10-01T00:00:00Z,set,value=21,ok')).toEqual({
      delimiter: ',',
      columns: ['time', 'action', 'params', 'result'],
    })
  })

  it('точка с запятой, BOM и CRLF', () => {
    expect(readCsvHeader('\uFEFFВремя;Действие;Результат\r\n1;2;3')).toEqual({ delimiter: ';', columns: ['Время', 'Действие', 'Результат'] })
  })

  it('табуляция передаётся движку словом tab', () => {
    expect(readCsvHeader('ts\tevent\n').delimiter).toBe('tab')
  })

  it('пустой файл — нет колонок', () => {
    expect(readCsvHeader('').columns).toEqual([])
  })
})

describe('guessMapping', () => {
  it('узнаёт колонки по именам', () => {
    expect(guessMapping(['timestamp', 'command', 'value', 'status'])).toEqual({ time: 'timestamp', action: 'command', params: 'value', result: 'status' })
  })

  it('без подсказок — первые две колонки, необязательные пустые', () => {
    expect(guessMapping(['a', 'b', 'c'])).toEqual({ time: 'a', action: 'b', params: null, result: null })
  })
})
