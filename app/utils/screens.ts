import { tr } from './i18n'

export interface ScreenDef {
  path: string
  title: string
  short: string
  icon: string
  /** main — путь исследования по порядку; detail — подробности для тех, кто хочет смотреть байты сам. */
  group: 'main' | 'detail'
}

export const SCREENS: ScreenDef[] = [
  { path: '/project', get title() { return tr('screen.project') }, get short() { return tr('screen.project.short') }, icon: 'i-lucide-files', group: 'main' },
  { path: '/protocol', get title() { return tr('screen.protocol') }, get short() { return tr('screen.protocol.short') }, icon: 'i-lucide-table-properties', group: 'main' },
  { path: '/verify', get title() { return tr('screen.verify') }, get short() { return tr('screen.verify.short') }, icon: 'i-lucide-circle-check-big', group: 'main' },
  { path: '/report', get title() { return tr('screen.report') }, get short() { return tr('screen.report.short') }, icon: 'i-lucide-file-text', group: 'main' },
  { path: '/overview', get title() { return tr('screen.overview') }, get short() { return tr('screen.overview.short') }, icon: 'i-lucide-binary', group: 'detail' },
  { path: '/actions', get title() { return tr('screen.actions') }, get short() { return tr('screen.actions.short') }, icon: 'i-lucide-list-checks', group: 'detail' },
  { path: '/compare', get title() { return tr('screen.compare') }, get short() { return tr('screen.compare.short') }, icon: 'i-lucide-columns-2', group: 'detail' },
  { path: '/bounds', get title() { return tr('screen.bounds') }, get short() { return tr('screen.bounds.short') }, icon: 'i-lucide-brackets', group: 'detail' },
]

export function screenByPath(path: string): ScreenDef | undefined {
  return SCREENS.find(s => path === s.path || path.startsWith(`${s.path}/`))
}
