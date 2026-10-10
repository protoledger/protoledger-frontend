import { createLiveSource } from './live'
import { createLiveResearchSource } from './live-research'
import { createMockContractSource } from './mock/contract'
import { createMockResearchSource } from './mock/research'
import type { DataSource, DataSourceKind } from './source'

// Экран без эндпоинта в контракте: и в live показывает пример данных.
const SAMPLE_ONLY_LIVE = new Set(['/report'])

/**
 * Единственное место выбора источника данных. Экраны работают только с DataSource,
 * поэтому переход с примера на движок — смена NUXT_PUBLIC_DATA_SOURCE, без правок экранов.
 */
export function createDataSource(kind: DataSourceKind): DataSource {
  const sample = createMockResearchSource()
  if (kind === 'mock') {
    return { kind, sampleOnly: new Set(), ...createMockContractSource(), ...sample }
  }
  const contract = createLiveSource()
  return { kind, sampleOnly: SAMPLE_ONLY_LIVE, ...contract, ...createLiveResearchSource(contract, sample) }
}

export type { DataSource, DataSourceKind } from './source'
