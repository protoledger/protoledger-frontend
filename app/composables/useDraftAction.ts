/** Действие экрана, для которого в контракте ещё нет эндпоинта: честно сообщаем, что не сохранено. */
export function useDraftAction() {
  const toast = useToast()
  return (what: string) => toast.add({
    title: what,
    description: 'Пока пример: сохранится в проекте, когда в API появится эндпоинт.',
    icon: 'i-lucide-info',
    color: 'warning',
  })
}
