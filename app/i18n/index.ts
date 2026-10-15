// Словари интерфейса по областям; каждая область — свой файл, ключи начинаются с её имени.
import common from './common'
import shell from './shell'
import status from './status'
import project from './project'
import overview from './overview'
import bounds from './bounds'
import actions from './actions'
import compare from './compare'
import verify from './verify'
import report from './report'
import data from './data'
import v1 from './v1'
import type { Message } from './types'

type Keys<A> = A extends { ru: Record<infer K extends string, Message> } ? K : never
export type MessageKey = Keys<typeof common> | Keys<typeof shell> | Keys<typeof status> | Keys<typeof project> | Keys<typeof overview> | Keys<typeof bounds> | Keys<typeof actions> | Keys<typeof compare> | Keys<typeof verify> | Keys<typeof report> | Keys<typeof data> | Keys<typeof v1>

const AREAS = [common, shell, status, project, overview, bounds, actions, compare, verify, report, data, v1]

export const MESSAGES = {
  ru: Object.assign({}, ...AREAS.map(a => a.ru)) as Record<MessageKey, Message>,
  en: Object.assign({}, ...AREAS.map(a => a.en)) as Record<MessageKey, Message>,
}
