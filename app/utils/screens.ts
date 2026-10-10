export interface ScreenDef {
  path: string
  title: string
  short: string
  icon: string
}

export const SCREENS: ScreenDef[] = [
  { path: '/project', title: 'Проект', short: 'Проект', icon: 'i-lucide-folder' },
  { path: '/overview', title: 'Обзор записей', short: 'Обзор', icon: 'i-lucide-list-tree' },
  { path: '/bounds', title: 'Границы', short: 'Границы', icon: 'i-lucide-brackets' },
  { path: '/actions', title: 'Действия', short: 'Действия', icon: 'i-lucide-clock' },
  { path: '/compare', title: 'Сравнение', short: 'Сравн.', icon: 'i-lucide-columns-2' },
  { path: '/interpretation', title: 'Интерпретация', short: 'Интерпр.', icon: 'i-lucide-code-xml' },
  { path: '/hypotheses', title: 'Гипотезы и вопросы', short: 'Гипотезы', icon: 'i-lucide-flask-conical' },
  { path: '/verify', title: 'Проверка', short: 'Проверка', icon: 'i-lucide-circle-check-big' },
  { path: '/report', title: 'Отчёт', short: 'Отчёт', icon: 'i-lucide-file-text' },
]

export function screenByPath(path: string): ScreenDef | undefined {
  return SCREENS.find(s => path === s.path || path.startsWith(`${s.path}/`))
}
