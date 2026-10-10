export interface ScreenDef {
  path: string
  title: string
  short: string
  icon: string
  /** Есть ли эндпоинты в контракте API; иначе экран работает на примере данных. */
  inContract: boolean
}

export const SCREENS: ScreenDef[] = [
  { path: '/project', title: 'Проект', short: 'Проект', icon: 'i-lucide-folder', inContract: true },
  { path: '/overview', title: 'Обзор записей', short: 'Обзор', icon: 'i-lucide-list-tree', inContract: true },
  { path: '/bounds', title: 'Границы', short: 'Границы', icon: 'i-lucide-brackets', inContract: false },
  { path: '/actions', title: 'Действия', short: 'Действия', icon: 'i-lucide-clock', inContract: false },
  { path: '/compare', title: 'Сравнение', short: 'Сравн.', icon: 'i-lucide-columns-2', inContract: false },
  { path: '/interpretation', title: 'Интерпретация', short: 'Интерпр.', icon: 'i-lucide-code-xml', inContract: false },
  { path: '/hypotheses', title: 'Гипотезы и вопросы', short: 'Гипотезы', icon: 'i-lucide-flask-conical', inContract: false },
  { path: '/verify', title: 'Проверка', short: 'Проверка', icon: 'i-lucide-circle-check-big', inContract: false },
  { path: '/report', title: 'Отчёт', short: 'Отчёт', icon: 'i-lucide-file-text', inContract: false },
]

export function screenByPath(path: string): ScreenDef | undefined {
  return SCREENS.find(s => path === s.path || path.startsWith(`${s.path}/`))
}
