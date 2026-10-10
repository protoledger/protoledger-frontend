import { createLiveSource } from './live'
import { createMockContractSource } from './mock/contract'
import { createMockDraftSource } from './mock/draft'
import type { DataSource, DataSourceKind } from './source'

/**
 * Единственное место выбора источника данных. Экраны работают только с DataSource,
 * поэтому переход с примера на движок — смена NUXT_PUBLIC_DATA_SOURCE, без правок экранов.
 */
export function createDataSource(kind: DataSourceKind): DataSource {
  const contract = kind === 'live' ? createLiveSource() : createMockContractSource()
  return { kind, ...contract, ...createMockDraftSource() }
}

export type { DataSource, DataSourceKind } from './source'
