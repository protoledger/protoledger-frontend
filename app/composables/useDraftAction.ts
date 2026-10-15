/** Действие в режиме примера данных: честно сообщаем, что оно не сохранено. */
export function useDraftAction() {
  const toast = useToast()
  return (what: string) => toast.add({
    title: what,
    description: tr('common.sampleTitle'),
    icon: 'i-lucide-info',
    color: 'warning',
  })
}
