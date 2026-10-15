import { tr } from './i18n'

export interface ScreenDef {
  path: string
  title: string
  short: string
  icon: string
}

export const SCREENS: ScreenDef[] = [
  { path: '/project', get title() { return tr('screen.project') }, get short() { return tr('screen.project.short') }, icon: 'i-lucide-folder' },
  { path: '/overview', get title() { return tr('screen.overview') }, get short() { return tr('screen.overview.short') }, icon: 'i-lucide-list-tree' },
  { path: '/bounds', get title() { return tr('screen.bounds') }, get short() { return tr('screen.bounds.short') }, icon: 'i-lucide-brackets' },
  { path: '/actions', get title() { return tr('screen.actions') }, get short() { return tr('screen.actions.short') }, icon: 'i-lucide-clock' },
  { path: '/compare', get title() { return tr('screen.compare') }, get short() { return tr('screen.compare.short') }, icon: 'i-lucide-columns-2' },
  { path: '/interpretation', get title() { return tr('screen.interpretation') }, get short() { return tr('screen.interpretation.short') }, icon: 'i-lucide-code-xml' },
  { path: '/hypotheses', get title() { return tr('screen.hypotheses') }, get short() { return tr('screen.hypotheses.short') }, icon: 'i-lucide-flask-conical' },
  { path: '/verify', get title() { return tr('screen.verify') }, get short() { return tr('screen.verify.short') }, icon: 'i-lucide-circle-check-big' },
  { path: '/report', get title() { return tr('screen.report') }, get short() { return tr('screen.report.short') }, icon: 'i-lucide-file-text' },
]

export function screenByPath(path: string): ScreenDef | undefined {
  return SCREENS.find(s => path === s.path || path.startsWith(`${s.path}/`))
}
