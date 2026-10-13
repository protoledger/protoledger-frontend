import { describe, expect, it } from 'vitest'
import { stepIndex } from '~/utils/list-keys'

const key = (k: string) => new KeyboardEvent('keydown', { key: k, cancelable: true })

describe('stepIndex', () => {
  it('стрелки двигают выбор в пределах списка', () => {
    expect(stepIndex(key('ArrowDown'), 0, 3)).toBe(1)
    expect(stepIndex(key('ArrowDown'), 2, 3)).toBe(2)
    expect(stepIndex(key('ArrowUp'), 0, 3)).toBe(0)
    expect(stepIndex(key('ArrowUp'), -1, 3)).toBe(0)
  })

  it('Home и End — к краям; чужие клавиши не трогает', () => {
    expect(stepIndex(key('End'), 0, 5)).toBe(4)
    expect(stepIndex(key('Home'), 3, 5)).toBe(0)
    const e = key('Enter')
    expect(stepIndex(e, 1, 5)).toBeNull()
    expect(e.defaultPrevented).toBe(false)
    expect(stepIndex(key('ArrowDown'), 0, 0)).toBeNull()
  })
})
