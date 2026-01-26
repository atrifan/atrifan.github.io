'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { View } from '@adobe/react-spectrum';
import { SignedIn, SignedOut, SignInButton, useUser } from '@clerk/nextjs';
import { Footer } from '../components/Footer';
import { AdBanner } from '../components/AdBanner';
import { SideAds } from '../components/SideAds';
import { ADS_CONFIG } from '../config/ads.config';
import { OAuthAuthenticationModal, OAuthSuccessData } from '../components/OAuthAuthenticationModal';
import type { OAuth2AuthConfig, OAuthServerType } from '../types/supabase';

interface MCPOAuthLoginPageProps {
  serverName: string;
  toolId?: string;
}

interface ToolSourceInfo {
  sourceType: OAuthServerType;
  sourceId: string;
  sourceName: string;
  oauthConfig: OAuth2AuthConfig;
  toolName?: string;
}

export const MCPOAuthLoginPage: React.FC<MCPOAuthLoginPageProps> = ({ serverName, toolId }) => {
  const { user, isLoaded } = useUser();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toolSource, setToolSource] = useState<ToolSourceInfo | null>(null);
  const [oauthModalOpen, setOauthModalOpen] = useState(false);
  const [authSuccess, setAuthSuccess] = useState(false);

  // Fetch tool source and OAuth config
  const fetchToolSource = useCallback(async () => {
    if (!user?.id || !serverName) return;

    try {
      setLoading(true);
      setError(null);

      // Call API to get tool source info
      const params = new URLSearchParams({ serverName });
      if (toolId) params.append('toolId', toolId);

      const response = await fetch(`/api/mcp/oauth-source?${params}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to fetch tool information');
        return;
      }

      if (!data.oauthConfig) {
        setError('This tool does not require OAuth authentication');
        return;
      }

      setToolSource({
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        sourceName: data.sourceName,
        oauthConfig: data.oauthConfig,
        toolName: data.toolName,
      });
    } catch (err) {
      console.error('Error fetching tool source:', err);
      setError('Failed to load authentication information');
    } finally {
      setLoading(false);
    }
  }, [user?.id, serverName, toolId]);

  useEffect(() => {
    if (isLoaded && user) {
      fetchToolSource();
    } else if (isLoaded && !user) {
      setLoading(false);
    }
  }, [isLoaded, user, fetchToolSource]);

  const handleOAuthSuccess = useCallback((data?: OAuthSuccessData) => {
    console.log('[MCP OAuth] Authentication successful:', data);
    setOauthModalOpen(false);
    setAuthSuccess(true);
  }, []);

  const handleOAuthCancel = useCallback(() => {
    setOauthModalOpen(false);
  }, []);

  const startAuth = useCallback(() => {
    setOauthModalOpen(true);
  }, []);

  return (
    <View UNSAFE_style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
    }}>
      <SideAds
        leftTopSlot={ADS_CONFIG.slots.sideLeftHorizontalTop}
        leftMiddleSlot={ADS_CONFIG.slots.sideLeftVerticalMiddle}
        leftBottomSlot={ADS_CONFIG.slots.sideLeftHorizontalBottom}
        rightTopSlot={ADS_CONFIG.slots.sideRightHorizontalTop}
        rightMiddleSlot={ADS_CONFIG.slots.sideRightVerticalMiddle}
        rightBottomSlot={ADS_CONFIG.slots.sideRightHorizontalBottom}
      />

      <main style={{ paddingTop: '2rem', paddingBottom: '3rem' }}>
        {/* Hero */}
        <section style={{ textAlign: 'center', padding: '2rem 1rem 3rem', maxWidth: '50rem', margin: '0 auto' }}>
          <h1 style={{
            fontSize: 'clamp(1.75rem, 4vw, 2.5rem)',
            fontWeight: 800,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f472b6 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            margin: 0,
          }}>
            🔐 MCP Tool Authentication
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 'clamp(0.9rem, 2vw, 1.1rem)', marginTop: '1rem' }}>
            Authorize access to external services for your MCP tools
          </p>
        </section>

        {/* Ad Banner */}
        <AdBanner slot={ADS_CONFIG.slots.mcpComposerTop} style={{ marginBottom: '2rem' }} />

        {/* Main Content */}
        <section style={{
          padding: '0 1rem',
          maxWidth: '40rem',
          margin: '0 auto',
        }}>
          <SignedIn>
            <AuthContent
              loading={loading}
              error={error}
              toolSource={toolSource}
              serverName={serverName}
              authSuccess={authSuccess}
              onStartAuth={startAuth}
            />
          </SignedIn>
          <SignedOut>
            <SignInPrompt />
          </SignedOut>
        </section>

        {/* Ad Banner */}
        <AdBanner slot={ADS_CONFIG.slots.mcpComposerBottom} style={{ marginTop: '2rem' }} />
      </main>

      <Footer />

      {/* OAuth Modal */}
      {toolSource && (
        <OAuthAuthenticationModal
          isOpen={oauthModalOpen}
          serverName={toolSource.sourceName}
          serverType={toolSource.sourceType}
          serverId={toolSource.sourceId}
          oauthConfig={toolSource.oauthConfig}
          onSuccess={handleOAuthSuccess}
          onCancel={handleOAuthCancel}
        />
      )}
    </View>
  );
};

// Auth Content Component
interface AuthContentProps {
  loading: boolean;
  error: string | null;
  toolSource: ToolSourceInfo | null;
  serverName: string;
  authSuccess: boolean;
  onStartAuth: () => void;
}

const AuthContent: React.FC<AuthContentProps> = ({
  loading,
  error,
  toolSource,
  serverName,
  authSuccess,
  onStartAuth,
}) => {
  const cardStyle: React.CSSProperties = {
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '16px',
    padding: 'clamp(1.5rem, 4vw, 2.5rem)',
    textAlign: 'center',
  };

  if (loading) {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⏳</div>
        <h2 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
          Loading...
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0 }}>
          Fetching authentication information for <strong style={{ color: '#fff' }}>{serverName}</strong>
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>❌</div>
        <h2 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
          Error
        </h2>
        <p style={{ color: '#fca5a5', margin: '0 0 1.5rem' }}>{error}</p>
        <a
          href="/dashboard"
          style={{
            display: 'inline-block',
            padding: '0.75rem 1.5rem',
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '8px',
            color: '#fff',
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >
          Go to Dashboard
        </a>
      </div>
    );
  }

  if (authSuccess) {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✅</div>
        <h2 style={{ color: '#10b981', fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
          Authentication Successful!
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 1.5rem', lineHeight: 1.6 }}>
          You have successfully authenticated with <strong style={{ color: '#fff' }}>{toolSource?.sourceName}</strong>.
          <br />
          You can now close this window and return to your MCP client.
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a
            href="/dashboard"
            style={{
              display: 'inline-block',
              padding: '0.75rem 1.5rem',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Go to Dashboard
          </a>
          <a
            href="/chat"
            style={{
              display: 'inline-block',
              padding: '0.75rem 1.5rem',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '8px',
              color: '#fff',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            Open Chat
          </a>
        </div>
      </div>
    );
  }

  if (!toolSource) {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔍</div>
        <h2 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
          Tool Not Found
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.6)', margin: '0 0 1.5rem' }}>
          Could not find the requested tool in server <strong style={{ color: '#fff' }}>{serverName}</strong>
        </p>
        <a
          href="/dashboard"
          style={{
            display: 'inline-block',
            padding: '0.75rem 1.5rem',
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '8px',
            color: '#fff',
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >
          Go to Dashboard
        </a>
      </div>
    );
  }

  const sourceTypeLabel = {
    rest_api: 'REST API',
    graphql: 'GraphQL API',
    mcp: 'MCP Server',
    a2a: 'A2A Agent',
    rag: 'Knowledge Base',
  }[toolSource.sourceType] || 'Server';

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔐</div>
      <h2 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
        Authentication Required
      </h2>
      <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 1.5rem', lineHeight: 1.6 }}>
        <strong style={{ color: '#fff' }}>{toolSource.sourceName}</strong> ({sourceTypeLabel}) requires OAuth authentication.
        {toolSource.toolName && (
          <>
            <br />
            <span style={{ fontSize: '0.9rem' }}>Tool: <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>{toolSource.toolName}</code></span>
          </>
        )}
      </p>
      <button
        onClick={onStartAuth}
        style={{
          padding: '1rem 2rem',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          border: 'none',
          borderRadius: '12px',
          color: '#fff',
          fontWeight: 600,
          fontSize: '1.1rem',
          cursor: 'pointer',
          boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
        }}
      >
        🔓 Authorize Access
      </button>
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', marginTop: '1.5rem' }}>
        After authorization, you can return to your MCP client and retry the operation.
      </p>
    </div>
  );
};

// Sign In Prompt Component
const SignInPrompt: React.FC = () => (
  <div style={{
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '16px',
    padding: 'clamp(1.5rem, 4vw, 2.5rem)',
    textAlign: 'center',
  }}>
    <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔒</div>
    <h2 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700, margin: '0 0 1rem' }}>
      Sign In Required
    </h2>
    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1rem', margin: '0 0 2rem' }}>
      Please sign in to authenticate your MCP tools.
    </p>
    <SignInButton mode="modal">
      <button style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        border: 'none',
        borderRadius: '12px',
        padding: '1rem 2.5rem',
        color: '#fff',
        fontWeight: 600,
        fontSize: '1.1rem',
        cursor: 'pointer',
        boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
      }}>
        Sign In
      </button>
    </SignInButton>
  </div>
);

