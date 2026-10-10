import type { FramingSpec } from '~/api/types'

const FORMAT = 'protoledger/interpretation@1'

// JSON — подмножество YAML: фрейминг из ответа движка вставляется как есть, без своего сериализатора.
function framingLine(spec: FramingSpec) {
  return `framing: ${JSON.stringify(spec)}`
}

/** Интерпретация только из фрейминга: чтобы движок показал границы сообщений по кандидату. */
export function framingOnlyYaml(spec: FramingSpec): string {
  return [`format: ${FORMAT}`, 'scope:', '  direction: any', framingLine(spec), 'messages: []', ''].join('\n')
}

/**
 * Заменяет верхнеуровневый блок `framing:` (до следующего ключа верхнего уровня) или добавляет его.
 * Остальной текст интерпретации не трогается; проверку делает движок при сохранении.
 */
export function replaceFramingBlock(yaml: string, spec: FramingSpec): string {
  const lines = yaml.split('\n')
  const start = lines.findIndex(l => /^framing\s*:/.test(l))
  if (start === -1) {
    const messages = lines.findIndex(l => /^messages\s*:/.test(l))
    const at = messages === -1 ? lines.length : messages
    lines.splice(at, 0, framingLine(spec))
    return lines.join('\n')
  }
  let end = start + 1
  while (end < lines.length && (/^\s/.test(lines[end]!) || lines[end] === '' || lines[end]!.startsWith('#'))) end++
  // Пустые строки и комментарии перед следующим ключом оставляем на месте.
  while (end > start + 1 && (lines[end - 1] === '' || lines[end - 1]!.startsWith('#'))) end--
  lines.splice(start, end - start, framingLine(spec))
  return lines.join('\n')
}
