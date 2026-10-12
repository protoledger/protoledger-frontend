/**
 * Окно настольного приложения разрешает одну нативную команду — выбор папки.
 * В браузере её нет, интерфейс работает как обычно.
 */
interface TauriInternals {
  invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>
}

function tauri(): TauriInternals | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__ ?? null
}

export function hasNativeFolderPicker(): boolean {
  return tauri() !== null
}

/** Абсолютный путь выбранной папки; null — выбор отменён или окна приложения нет. */
export async function pickFolder(title: string): Promise<string | null> {
  const t = tauri()
  if (!t) return null
  const path = await t.invoke('plugin:dialog|open', { options: { directory: true, title } })
  return typeof path === 'string' && path ? path : null
}
