// Service worker сайта: только пуш-уведомления администратору (запросы сайта не перехватывает).
// Уведомление присылает Edge Function notify; нажатие открывает нужный раздел админ-панели.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: 'Инженерный клуб', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Инженерный клуб', {
    body: d.body || '', tag: d.tag, renotify: !!d.tag, data: { url: d.url || '/admin.html' },
    icon: '/assets/icons/admin-192.png', badge: '/assets/icons/badge-72.png', lang: 'ru',
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/admin.html', self.location.origin).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const tab = all.find((c) => new URL(c.url).pathname === '/admin.html');
    if (tab) { await tab.focus(); return tab.navigate(url).catch(() => tab.postMessage({ open: url })); }
    return self.clients.openWindow(url);
  })());
});
