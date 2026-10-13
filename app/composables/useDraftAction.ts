/** Действие в режиме примера данных: честно сообщаем, что оно не сохранено. */
export function useDraftAction() {
  const toast = useToast()
  return (what: string) => toast.add({
    title: what,
    description: 'Открыт пример данных — изменения не сохраняются. С подключённым движком действие выполняется в проекте.',
    icon: 'i-lucide-info',
    color: 'warning',
  })
}
