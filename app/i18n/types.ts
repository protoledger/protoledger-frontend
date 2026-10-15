export type Locale = 'ru' | 'en'

export type Params = Record<string, string | number>

/** Строка с подстановками {name} или функция — для чисел с падежами. */
export type Message = string | ((p: Params) => string)

/** Словарь области: английский обязан содержать те же ключи, что русский. */
export function defineMessages<K extends string>(ru: Record<K, Message>, en: Record<K, Message>) {
  return { ru, en }
}

/** Русское склонение по числу: 1 запись, 2 записи, 5 записей. */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return many
  if (b === 1) return one
  if (b >= 2 && b <= 4) return few
  return many
}
