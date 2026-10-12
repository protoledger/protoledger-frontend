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
    expect(guessMapping(['timestamp', 'command', 'value', 'status'])).toEqual({ time: 'timestamp', action: 'command', params: 'value', result: 'status', source: null, paramsFormat: 'kv', resultFormat: 'kv' })
  })

  it('без подсказок — первые две колонки, необязательные пустые', () => {
    expect(guessMapping(['a', 'b', 'c'])).toEqual({ time: 'a', action: 'b', params: null, result: null, source: null, paramsFormat: 'kv', resultFormat: 'kv' })
  })

  it('журнал с несколькими записями и JSON: точное имя важнее похожего', () => {
    const header = 'capture,session,action_id,start_utc,end_utc,action,parameters,observed_result'
    const sample = `${header}\nresearch/01.pcap,s1,01-01-001,2026-10-10T10:30:00Z,2026-10-10T10:30:01Z,read-config,{},"{""status"":""ok""}"`
    expect(guessMapping(header.split(','), sample)).toEqual({
      time: 'start_utc', action: 'action', params: 'parameters', result: 'observed_result', source: 'capture', paramsFormat: 'json', resultFormat: 'json',
    })
  })
})
