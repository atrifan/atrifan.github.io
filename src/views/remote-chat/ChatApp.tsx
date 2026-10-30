'use client';

import type { DeviceLike } from './model/presence';
import { LiveChatApp } from './LiveChatApp';

export interface ChatDevice extends DeviceLike {
  platform: string | null;
  model: string | null;
}

export function ChatApp() { return <LiveChatApp />; }
