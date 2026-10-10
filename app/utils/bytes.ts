export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

export function hexByte(b: number): string {
  return b.toString(16).toUpperCase().padStart(2, '0')
}

export function hexOffset(n: number, width = 4): string {
  return n.toString(16).toUpperCase().padStart(width, '0')
}

/** Символ для ASCII-колонки: непечатаемые байты заменяются точкой, данные никогда не исполняются. */
export function asciiChar(b: number): string {
  return b >= 0x20 && b < 0x7F ? String.fromCharCode(b) : '·'
}

export function readUint(bytes: Uint8Array, littleEndian: boolean): number {
  let v = 0
  const n = bytes.length
  for (let i = 0; i < n; i++) {
    const b = bytes[littleEndian ? n - 1 - i : i] ?? 0
    v = v * 256 + b
  }
  return v
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat('ru-RU').format(n)
}

export function formatBytesSize(n: number): string {
  if (n < 1024) return `${n} Б`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} КиБ`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} МиБ`
  return `${(n / 1024 ** 3).toFixed(1)} ГиБ`
}
