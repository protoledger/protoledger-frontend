// Словари интерфейса по областям; каждая область — свой файл, ключи начинаются с её имени.
import common from './common'
import shell from './shell'
import status from './status'
import project from './project'
import overview from './overview'
import bounds from './bounds'
import actions from './actions'
import compare from './compare'
import interp from './interp'
import hypotheses from './hypotheses'
import verify from './verify'
import report from './report'
import data from './data'
import type { Message } from './types'

type Keys<A> = A extends { ru: Record<infer K extends string, Message> } ? K : never
export type MessageKey = Keys<typeof common> | Keys<typeof shell> | Keys<typeof status> | Keys<typeof project> | Keys<typeof overview> | Keys<typeof bounds> | Keys<typeof actions> | Keys<typeof compare> | Keys<typeof interp> | Keys<typeof hypotheses> | Keys<typeof verify> | Keys<typeof report> | Keys<typeof data>

const AREAS = [common, shell, status, project, overview, bounds, actions, compare, interp, hypotheses, verify, report, data]

export const MESSAGES = {
  ru: Object.assign({}, ...AREAS.map(a => a.ru)) as Record<MessageKey, Message>,
  en: Object.assign({}, ...AREAS.map(a => a.en)) as Record<MessageKey, Message>,
}
