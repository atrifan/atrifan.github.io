/**
 * Push Notifications Hook
 * 
 * Provides easy-to-use functions for:
 * - Checking if push notifications are supported
 * - Requesting notification permission
 * - Subscribing to push notifications
 * - Unsubscribing from push notifications
 * 
 * Usage:
 * ```tsx
 * const { isSupported, permission, subscribe, unsubscribe, isSubscribed } = usePushNotifications();
 * 
 * // Request permission and subscribe
 * const handleEnable = async () => {
 *   const result = await subscribe();
 *   if (result.success) {
 *     console.log('Subscribed!', result.subscriptionId);
 *   }
 * };
 * ```
 */

import { useState, useEffect, useCallback } from 'react';

interface PushNotificationState {
  isSupported: boolean;
  permission: NotificationPermission | 'unsupported';
  isSubscribed: boolean;
  isLoading: boolean;
  error: string | null;
}

interface SubscribeResult {
  success: boolean;
  subscriptionId?: string;
  error?: string;
}

// Detect device info for subscription metadata
function getDeviceInfo() {
  const ua = navigator.userAgent;
  let browser = 'unknown';
  let os = 'unknown';
  let deviceType: 'desktop' | 'mobile' | 'tablet' = 'desktop';

  // Detect browser
  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'chrome';
  else if (ua.includes('Firefox')) browser = 'firefox';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'safari';
  else if (ua.includes('Edg')) browser = 'edge';

  // Detect OS
  if (ua.includes('Mac OS')) os = 'macos';
  else if (ua.includes('Windows')) os = 'windows';
  else if (ua.includes('Linux')) os = 'linux';
  else if (ua.includes('Android')) os = 'android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'ios';

  // Detect device type
  if (/Mobi|Android/i.test(ua)) deviceType = 'mobile';
  else if (/Tablet|iPad/i.test(ua)) deviceType = 'tablet';

  const deviceName = `${browser.charAt(0).toUpperCase() + browser.slice(1)} on ${os.charAt(0).toUpperCase() + os.slice(1)}`;

  return { browser, os, deviceType, deviceName };
}

export function usePushNotifications() {
  const [state, setState] = useState<PushNotificationState>({
    isSupported: false,
    permission: 'unsupported',
    isSubscribed: false,
    isLoading: true,
    error: null,
  });

  // Check support and current state on mount
  useEffect(() => {
    const checkSupport = async () => {
      const isSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      
      if (!isSupported) {
        setState(s => ({ ...s, isSupported: false, isLoading: false }));
        return;
      }

      const permission = Notification.permission;
      
      // Check if already subscribed
      let isSubscribed = false;
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        isSubscribed = !!subscription;
      } catch {
        // Ignore errors
      }

      setState({
        isSupported: true,
        permission,
        isSubscribed,
        isLoading: false,
        error: null,
      });
    };

    checkSupport();
  }, []);

  // Subscribe to push notifications
  const subscribe = useCallback(async (channels?: string[]): Promise<SubscribeResult> => {
    setState(s => ({ ...s, isLoading: true, error: null }));

    try {
      // Request permission if not granted
      if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        setState(s => ({ ...s, permission }));
        
        if (permission !== 'granted') {
          setState(s => ({ ...s, isLoading: false, error: 'Permission denied' }));
          return { success: false, error: 'Permission denied' };
        }
      } else if (Notification.permission === 'denied') {
        setState(s => ({ ...s, isLoading: false, error: 'Notifications blocked' }));
        return { success: false, error: 'Notifications are blocked. Please enable them in browser settings.' };
      }

      // Register service worker
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // Get VAPID public key
      const vapidResponse = await fetch('/api/push/vapid-key');
      const vapidData = await vapidResponse.json();
      
      if (!vapidData.configured) {
        setState(s => ({ ...s, isLoading: false, error: 'Push not configured' }));
        return { success: false, error: 'Push notifications are not configured on this server' };
      }

      // Convert VAPID key to Uint8Array
      const vapidKey = urlBase64ToUint8Array(vapidData.publicKey);

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey,
      });

      // Get device info
      const deviceInfo = getDeviceInfo();

      // Send subscription to server
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          ...deviceInfo,
          channels: channels || ['automation', 'input_required', 'error'],
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save subscription');
      }

      const result = await response.json();
      setState(s => ({ ...s, isSubscribed: true, isLoading: false }));
      return { success: true, subscriptionId: result.subscriptionId };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to subscribe';
      setState(s => ({ ...s, isLoading: false, error: message }));
      return { success: false, error: message };
    }
  }, []);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async (): Promise<SubscribeResult> => {
    setState(s => ({ ...s, isLoading: true, error: null }));

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Unsubscribe from browser
        await subscription.unsubscribe();

        // Remove from server
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
      }

      setState(s => ({ ...s, isSubscribed: false, isLoading: false }));
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to unsubscribe';
      setState(s => ({ ...s, isLoading: false, error: message }));
      return { success: false, error: message };
    }
  }, []);

  return {
    ...state,
    subscribe,
    unsubscribe,
  };
}

// Helper to convert VAPID key to ArrayBuffer for PushManager
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

