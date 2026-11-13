/**
 * Ссылка «Скачать PDF». Пока бэкенда нет — открываем печатную версию билета,
 * из которой браузер сохраняет PDF. Когда сервер начнёт отдавать файл
 * (например, GET /tickets/{id}/pdf), достаточно поменять эту функцию.
 */
export function ticketPdfUrl(ticketId: string, accessToken?: string): string {
  const query = accessToken ? `?token=${encodeURIComponent(accessToken)}` : '';
  return `/tickets/${ticketId}/print${query}`;
}
