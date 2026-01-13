'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * OAuth Callback Page for Popup Flow
 *
 * This page receives the authorization code from the OAuth provider
 * and sends it back to the parent window via postMessage.
 */
function OAuthCallbackContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Processing authorization...');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (error) {
      setStatus('error');
      setMessage(errorDescription || error || 'Authorization failed');

      const errorData = {
        type: 'oauth-callback',
        error: error,
        errorDescription: errorDescription,
        state: state,
      };

      // Send error to parent - try iframe parent first, then popup opener
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(errorData, '*');
      } else if (window.opener) {
        window.opener.postMessage(errorData, '*');
        setTimeout(() => window.close(), 2000);
      }
      return;
    }

    if (code) {
      setStatus('success');
      setMessage('Authorization successful!');

      const messageData = {
        type: 'oauth-callback',
        code: code,
        state: state,
      };

      // Send code to parent - try iframe parent first, then popup opener
      if (window.parent && window.parent !== window) {
        // We're in an iframe
        window.parent.postMessage(messageData, '*');
      } else if (window.opener) {
        // We're in a popup
        window.opener.postMessage(messageData, '*');
        setTimeout(() => window.close(), 1000);
      } else {
        setMessage('Authorization successful! You can close this window.');
      }
    } else {
      setStatus('error');
      setMessage('No authorization code received');
    }
  }, [searchParams]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      color: '#fff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        textAlign: 'center',
        padding: '2rem',
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        maxWidth: '400px',
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
          {status === 'processing' && '⏳'}
          {status === 'success' && '✅'}
          {status === 'error' && '❌'}
        </div>
        <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>
          {status === 'processing' && 'Processing...'}
          {status === 'success' && 'Success!'}
          {status === 'error' && 'Error'}
        </h1>
        <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.9rem' }}>
          {message}
        </p>
        {status === 'error' && (
          <button
            onClick={() => window.close()}
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1.5rem',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '8px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Close Window
          </button>
        )}
      </div>
    </div>
  );
}

// Loading fallback for Suspense
function LoadingFallback() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      color: '#fff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
        <p style={{ color: 'rgba(255, 255, 255, 0.7)' }}>Loading...</p>
      </div>
    </div>
  );
}

// Main export with Suspense wrapper
export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <OAuthCallbackContent />
    </Suspense>
  );
}
