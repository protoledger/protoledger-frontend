/**
 * Выбор строки таблицы с клавиатуры: у таблицы tabindex, стрелки вверх/вниз, Home/End двигают выбор.
 * Возвращает новый индекс или null, если клавиша не наша.
 */
export function stepIndex(e: KeyboardEvent, index: number, length: number): number | null {
  if (!length) return null
  const to = e.key === 'ArrowDown' ? index + 1
    : e.key === 'ArrowUp' ? index - 1
      : e.key === 'Home' ? 0
        : e.key === 'End' ? length - 1
          : null
  if (to === null) return null
  e.preventDefault()
  return Math.min(length - 1, Math.max(0, to))
}

/** После смены выбора — прокрутить выбранную строку в видимую область. */
export function revealSelected(e: KeyboardEvent) {
  const root = e.currentTarget as HTMLElement | null
  nextTick(() => root?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }))
}
