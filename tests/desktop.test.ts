import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasNativeFolderPicker, pickFolder } from '~/utils/desktop'

const w = window as unknown as { __TAURI_INTERNALS__?: { invoke: ReturnType<typeof vi.fn> } }

afterEach(() => {
  delete w.__TAURI_INTERNALS__
})

describe('выбор папки в окне приложения', () => {
  it('в браузере выбора нет', async () => {
    expect(hasNativeFolderPicker()).toBe(false)
    expect(await pickFolder('Папка проекта')).toBeNull()
  })

  it('в окне приложения — команда диалога папки с заголовком', async () => {
    const invoke = vi.fn().mockResolvedValue('C:\\Users\\di\\Проекты\\stand.protoledger')
    w.__TAURI_INTERNALS__ = { invoke }
    expect(hasNativeFolderPicker()).toBe(true)
    expect(await pickFolder('Папка проекта')).toBe('C:\\Users\\di\\Проекты\\stand.protoledger')
    expect(invoke).toHaveBeenCalledWith('plugin:dialog|open', { options: { directory: true, title: 'Папка проекта' } })
  })

  it('отмена выбора — null', async () => {
    w.__TAURI_INTERNALS__ = { invoke: vi.fn().mockResolvedValue(null) }
    expect(await pickFolder('Папка проекта')).toBeNull()
  })
})
