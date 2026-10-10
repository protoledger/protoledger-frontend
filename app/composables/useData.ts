import type { DataSource } from '~/data'

export function useData(): DataSource {
  return useNuxtApp().$data
}
