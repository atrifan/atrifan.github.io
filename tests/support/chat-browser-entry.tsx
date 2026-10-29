/**
 * Test-only browser entry for the chat UI. Mounts the public `ChatApp` under
 * React StrictMode with the Tulzo tokens and global styles. Not production
 * `/chat`: no Clerk sign-in, no server rendering, no assistant.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../styles/tokens.css';
import '../../styles/globals.css';
import { ChatApp } from '../../src/views/remote-chat/ChatApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ChatApp />
  </StrictMode>,
);
