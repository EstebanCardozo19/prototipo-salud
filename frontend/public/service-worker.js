self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(data.title || 'Recordatorio de medicación', {
    body: data.body || 'Tienes una pauta programada durante tu servicio activo.',
    icon: '/favicon.ico',
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});