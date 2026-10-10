export interface Token {
  text: string
  kind: 'key' | 'string' | 'number' | 'comment' | 'punct' | 'plain'
}

/** Простая подсветка строки YAML для просмотра: только разбиение на куски, без разбора смысла. */
export function tokenizeYamlLine(line: string): Token[] {
  const out: Token[] = []
  const re = /(#.*$)|("(?:[^"\\]|\\.)*")|(\b0x[0-9a-fA-F]+\b|-?\b\d+(?:\.\d+)?\b)|([A-Za-z_][\w]*)(?=\s*:)|([{}[\],:-])|(\s+)|([^\s{}[\],:#"]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) {
    if (m[1]) out.push({ text: m[1], kind: 'comment' })
    else if (m[2]) out.push({ text: m[2], kind: 'string' })
    else if (m[3]) out.push({ text: m[3], kind: 'number' })
    else if (m[4]) out.push({ text: m[4], kind: 'key' })
    else if (m[5]) out.push({ text: m[5], kind: 'punct' })
    else out.push({ text: m[0], kind: 'plain' })
  }
  return out
}
