// Управляющие (C0, C1), смена направления текста (RLO, LRI…) и невидимые символы из данных
// показываются явной меткой: иначе имя файла или параметр могут выглядеть не тем, чем являются.
// Диапазоны кодов: C0 без \t \n \r, DEL и C1, ALM, нулевой ширины и LRM/RLM, LRE…RLO, WJ…PDI, BOM.
const UNSAFE_RANGES: [number, number][] = [
  [0x00, 0x08], [0x0B, 0x0C], [0x0E, 0x1F], [0x7F, 0x9F], [0x61C, 0x61C],
  [0x200B, 0x200F], [0x202A, 0x202E], [0x2060, 0x2069], [0xFEFF, 0xFEFF],
]

function isUnsafe(code: number) {
  return UNSAFE_RANGES.some(([a, b]) => code >= a && code <= b)
}

/** Строка из данных для показа: опасные символы — меткой [U+XXXX], переводы строк и табуляции — видимыми. */
export function safeText(value: unknown, maxLength = 2000): string {
  if (value === null || value === undefined) return ''
  let s = String(value)
  if (s.length > maxLength) s = `${s.slice(0, maxLength)}…`
  return s
    .replace(/\r\n|\r|\n/g, ' ⏎ ')
    .replace(/\t/g, ' → ')
    .replace(/./gsu, (ch) => {
      const code = ch.codePointAt(0)!
      return isUnsafe(code) ? `[U+${code.toString(16).toUpperCase().padStart(4, '0')}]` : ch
    })
}
