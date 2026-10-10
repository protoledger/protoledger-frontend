import type { PanelState } from '~/stores/workspace'

/**
 * Перетаскивание границы панели мышью и стрелками.
 * edge — с какой стороны панели граница: у левой панели справа, у правой слева.
 */
export function useResizer(state: () => PanelState, edge: 'right' | 'left', min: number, max: number) {
  const clamp = (w: number) => Math.round(Math.min(max, Math.max(min, w)))

  function onPointerDown(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const startW = state().width
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      state().width = clamp(edge === 'right' ? startW + dx : startW - dx)
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  function onKeydown(e: KeyboardEvent) {
    const step = e.shiftKey ? 64 : 16
    const grow = edge === 'right' ? 'ArrowRight' : 'ArrowLeft'
    const shrink = edge === 'right' ? 'ArrowLeft' : 'ArrowRight'
    if (e.key === grow) state().width = clamp(state().width + step)
    else if (e.key === shrink) state().width = clamp(state().width - step)
    else return
    e.preventDefault()
  }

  return { onPointerDown, onKeydown }
}
