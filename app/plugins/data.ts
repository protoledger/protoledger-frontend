import { createDataSource, type DataSourceKind } from '~/data'

export default defineNuxtPlugin(() => {
  const kind = useRuntimeConfig().public.dataSource as DataSourceKind
  return { provide: { data: createDataSource(kind === 'mock' ? 'mock' : 'live') } }
})
