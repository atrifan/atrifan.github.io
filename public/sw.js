/**
 * Service Worker for Push Notifications
 * 
 * Handles:
 * - Push notification events from Web Push API
 * - Notification click handling (opens relevant URL)
 * - Background sync for offline support
 */

// Cache name for offline support
const CACHE_NAME = 'tulzo-push-v1';

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('tulzo-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

/**
 * Push event - received when server sends a push notification
 * 
 * Expected payload format:
 * {
 *   title: string,
 *   body: string,
 *   icon?: string,
 *   badge?: string,
 *   tag?: string,           // For notification grouping
 *   data?: {
 *     url?: string,         // URL to open on click
 *     type?: string,        // 'automation', 'input_required', 'error', etc.
 *     automationId?: string,
 *     executionId?: string,
 *   },
 *   actions?: Array<{ action: string, title: string, icon?: string }>,
 *   requireInteraction?: boolean,
 *   silent?: boolean,
 * }
 */
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);

  let payload = {
    title: 'Tulzo Notification',
    body: 'You have a new notification',
    icon: '/tulzo-logo.png',
    badge: '/tulzo-logo.png',
  };

  try {
    if (event.data) {
      const data = event.data.json();
      payload = { ...payload, ...data };
    }
  } catch (e) {
    console.error('[SW] Error parsing push data:', e);
    // Try as text
    if (event.data) {
      payload.body = event.data.text();
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon || '/tulzo-logo.png',
    badge: payload.badge || '/tulzo-logo.png',
    tag: payload.tag || 'tulzo-notification',
    data: payload.data || {},
    actions: payload.actions || [],
    requireInteraction: payload.requireInteraction || false,
    silent: payload.silent || false,
    vibrate: [200, 100, 200], // Vibration pattern for mobile
    timestamp: Date.now(),
  };

  // Add default actions based on notification type
  if (payload.data?.type === 'input_required' && !payload.actions?.length) {
    options.actions = [
      { action: 'open', title: '📝 Provide Input' },
      { action: 'dismiss', title: 'Dismiss' },
    ];
    options.requireInteraction = true; // Keep notification visible until user interacts
  } else if (payload.data?.type === 'error' && !payload.actions?.length) {
    options.actions = [
      { action: 'open', title: '🔍 View Details' },
      { action: 'retry', title: '🔄 Retry' },
    ];
  } else if (payload.data?.type === 'automation' && !payload.actions?.length) {
    options.actions = [
      { action: 'open', title: '👀 View' },
    ];
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

/**
 * Notification click event - handle user interaction with notification
 */
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);

  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};

  notification.close();

  // Determine URL to open based on action and data
  let urlToOpen = data.url || '/';

  if (action === 'dismiss') {
    // Just close the notification
    return;
  }

  if (action === 'retry' && data.executionId) {
    // Retry URL for failed automations
    urlToOpen = `/automations?retry=${data.executionId}`;
  } else if (action === 'open' || !action) {
    // Default: open the URL from data
    if (data.type === 'input_required' && data.executionId) {
      urlToOpen = data.url || `/automations/input/${data.executionId}`;
    } else if (data.automationId) {
      urlToOpen = data.url || `/automations?id=${data.automationId}`;
    }
  }

  // Focus existing window or open new one
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Try to focus an existing window
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(urlToOpen);
          return;
        }
      }
      // Open new window if none exists
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

/**
 * Notification close event - track when user dismisses notification
 */
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed:', event.notification.tag);
  // Could send analytics here if needed
});

