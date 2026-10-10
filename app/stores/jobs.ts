import { defineStore } from 'pinia'
import type { Job } from '~/api/types'

const ACTIVE: Job['state'][] = ['queued', 'running', 'cancelling']

/** Долгие задачи движка (импорт) с прогрессом и отменой. */
export const useJobsStore = defineStore('jobs', () => {
  const data = useData()
  const jobs = ref<Job[]>([])
  const labels = ref<Record<string, string>>({})
  const unsubscribe = new Map<string, () => void>()

  const active = computed(() => jobs.value.filter(j => ACTIVE.includes(j.state)))

  function upsert(job: Job) {
    const i = jobs.value.findIndex(j => j.id === job.id)
    if (i === -1) jobs.value.push(job)
    else jobs.value[i] = job
  }

  function track(id: string, label: string, onDone?: (job: Job) => void) {
    labels.value[id] = label
    if (unsubscribe.has(id)) return
    unsubscribe.set(id, data.watchJob(id, (job) => {
      upsert(job)
      if (!ACTIVE.includes(job.state)) {
        unsubscribe.get(id)?.()
        unsubscribe.delete(id)
        onDone?.(job)
      }
    }))
  }

  async function load(onDone?: (job: Job) => void) {
    for (const job of await data.listJobs()) {
      upsert(job)
      if (ACTIVE.includes(job.state)) track(job.id, labels.value[job.id] ?? 'Импорт записи', onDone)
    }
  }

  async function cancel(id: string) {
    upsert(await data.cancelJob(id))
  }

  return { jobs, labels, active, track, load, cancel }
})
