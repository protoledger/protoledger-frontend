import { describe, expect, it } from 'vitest'
import { asciiChar, base64ToBytes, bytesToBase64, hexByte, readUint } from '~/utils/bytes'

describe('bytes', () => {
  it('base64 туда и обратно', () => {
    const b = Uint8Array.from([0, 0xAA, 0x55, 0xFF])
    expect(base64ToBytes(bytesToBase64(b))).toEqual(b)
  })

  it('hex и ASCII', () => {
    expect(hexByte(0x0A)).toBe('0A')
    expect(asciiChar(0x41)).toBe('A')
    expect(asciiChar(0x0A)).toBe('·')
    expect(asciiChar(0x3C)).toBe('<')
  })

  it('порядок байтов', () => {
    const b = Uint8Array.from([0xC9, 0xAA])
    expect(readUint(b, false)).toBe(51626)
    expect(readUint(b, true)).toBe(43721)
  })
})
