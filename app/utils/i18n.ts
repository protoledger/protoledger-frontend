import { ref } from 'vue'
import { MESSAGES, type MessageKey } from '~/i18n'
import type { Locale, Params } from '~/i18n/types'

const KEY = 'protoledger-locale'

function initial(): Locale {
  try {
    return localStorage.getItem(KEY) === 'en' ? 'en' : 'ru'
  }
  catch {
    return 'ru'
  }
}

/** Язык интерфейса: по умолчанию русский (закон о государственном языке), английский — по выбору. */
export const locale = ref<Locale>(typeof window === 'undefined' ? 'ru' : initial())

export function setLocale(next: Locale) {
  locale.value = next
  try {
    localStorage.setItem(KEY, next)
  }
  catch {
    // Хранилище недоступно — выбор действует до перезагрузки.
  }
}

/** Текст интерфейса по ключу; {name} в строке заменяется параметром. Тексты движка не переводятся. */
export function tr(key: MessageKey, params: Params = {}): string {
  const m = MESSAGES[locale.value][key] ?? MESSAGES.ru[key]
  if (typeof m === 'function') return m(params)
  return m.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`))
}

/** Локаль для чисел, дат и времени. */
export function intlLocale(): string {
  return locale.value === 'en' ? 'en-US' : 'ru-RU'
}
