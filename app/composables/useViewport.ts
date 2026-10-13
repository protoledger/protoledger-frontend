/**
 * Ширина окна для раскладки: на узком экране боковые панели выезжают поверх рабочей области,
 * на телефоне инструменты — внизу. Одно состояние на приложение, слушатели — через matchMedia.
 */
const PHONE = '(max-width: 639px)'
const COMPACT = '(max-width: 1023px)'

const phone = ref(false)
const compact = ref(false)
let started = false

export function useViewport() {
  if (!started && typeof window !== 'undefined' && window.matchMedia) {
    started = true
    const p = window.matchMedia(PHONE)
    const c = window.matchMedia(COMPACT)
    phone.value = p.matches
    compact.value = c.matches
    p.addEventListener('change', (e) => { phone.value = e.matches })
    c.addEventListener('change', (e) => { compact.value = e.matches })
  }
  return { phone: readonly(phone), compact: readonly(compact) }
}
