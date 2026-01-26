'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { OAuthAuthenticationModal, OAuthSuccessData } from '@/src/components/OAuthAuthenticationModal';
import type { OAuth2AuthConfig, OAuthServerType } from '@/src/types/supabase';

interface RequiredField {
  name: string;
  type: string;
  description: string;
  server_name?: string;
  server_id?: string;
  server_type?: string;
}

interface ExecutionData {
  id: string;
  automation_id: string;
  automation_name: string;
  status: string;
  pending_inputs: RequiredField[];
  collected_inputs: Record<string, unknown>;
}

interface ConnectorData {
  id: string;
  display_name: string;
  mcp_server_id?: string;
  external_auth_type?: string;
  external_auth_config?: Record<string, unknown>;
}

export default function AutomationInputPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const automationId = params.id as string;
  const runId = params.runId as string;

  const [execution, setExecution] = useState<ExecutionData | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // OAuth modal state
  const [oauthModalOpen, setOauthModalOpen] = useState(false);
  const [oauthModalData, setOauthModalData] = useState<{
    serverName: string;
    serverType: OAuthServerType;
    serverId: string;
    oauthConfig: OAuth2AuthConfig;
  } | null>(null);
  const [authSuccess, setAuthSuccess] = useState(false);

  // Get dynamic message and auth requirement from query params
  const dynamicMessage = searchParams.get('message');
  const requireAuth = searchParams.get('require_auth') === 'true';
  const serverName = searchParams.get('server_name');
  const serverId = searchParams.get('server_id');

  useEffect(() => {
    fetchExecution();
  }, [automationId, runId]);

  // Pre-fill from query params (exclude reserved params)
  useEffect(() => {
    const prefilled: Record<string, string> = {};
    const reservedParams = ['message', 'require_auth', 'server_name', 'server_id'];
    searchParams.forEach((value, key) => {
      if (!reservedParams.includes(key)) {
        prefilled[key] = value;
      }
    });
    if (Object.keys(prefilled).length > 0) {
      setInputs(prev => ({ ...prev, ...prefilled }));
    }
  }, [searchParams]);

  // Handle OAuth requirement - fetch connector and show modal
  useEffect(() => {
    if (requireAuth && serverName && !oauthModalOpen && !authSuccess) {
      fetchConnectorAndShowAuth();
    }
  }, [requireAuth, serverName, oauthModalOpen, authSuccess]);

  const fetchConnectorAndShowAuth = async () => {
    try {
      // Fetch connectors to find the one that needs auth
      const res = await fetch('/api/connections');
      if (!res.ok) throw new Error('Failed to fetch connectors');
      const data = await res.json();

      // Find connector by server name or ID
      const connector = data.connections?.find((c: ConnectorData) =>
        c.display_name === serverName ||
        c.mcp_server_id === serverId ||
        c.id === serverId
      );

      if (!connector) {
        setError(`Could not find connector for ${serverName}`);
        return;
      }

      // Check if it has OAuth config
      if (connector.external_auth_type !== 'oauth2' || !connector.external_auth_config) {
        setError(`Connector ${serverName} does not have OAuth configuration`);
        return;
      }

      const authConfig = connector.external_auth_config as Record<string, string>;
      const authEndpoint = authConfig.authorization_endpoint;
      const tokenEndpoint = authConfig.token_endpoint;
      const clientId = authConfig.client_id;
      const scopes = authConfig.scopes || 'openid';
      const useDcr = authConfig.use_dcr === 'true' || (authConfig.use_dcr as unknown) === true;
      const registrationEndpoint = authConfig.registration_endpoint;

      const canAuthenticate = authEndpoint && tokenEndpoint && (clientId || (useDcr && registrationEndpoint));

      if (!canAuthenticate) {
        setError(`OAuth configuration incomplete for ${serverName}`);
        return;
      }

      // Show OAuth modal
      setOauthModalData({
        serverName: connector.display_name,
        serverType: 'mcp' as OAuthServerType,
        serverId: connector.mcp_server_id || connector.id,
        oauthConfig: {
          authorization_endpoint: authEndpoint,
          token_endpoint: tokenEndpoint,
          scopes: scopes,
          use_dcr: useDcr,
          client_id: clientId || '',
          client_secret: authConfig.client_secret || '',
          registration_endpoint: registrationEndpoint || '',
        },
      });
      setOauthModalOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connector');
    }
  };

  const fetchExecution = async () => {
    try {
      const res = await fetch(`/api/ai/automations/${automationId}/executions/${runId}`);
      if (!res.ok) throw new Error('Failed to fetch execution');
      const data = await res.json();
      setExecution(data.execution);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  // Handle OAuth success - resume automation
  const handleOAuthSuccess = useCallback(async (data?: OAuthSuccessData) => {
    setOauthModalOpen(false);
    setOauthModalData(null);
    setAuthSuccess(true);

    // Resume the automation by submitting empty inputs (just to trigger continuation)
    try {
      setSubmitting(true);
      const res = await fetch(`/api/ai/automations/${automationId}/executions/${runId}/input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: {}, authCompleted: true }),
      });

      if (!res.ok) {
        const resData = await res.json();
        throw new Error(resData.error || 'Failed to resume automation');
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume automation');
    } finally {
      setSubmitting(false);
    }
  }, [automationId, runId]);

  const handleOAuthCancel = useCallback(() => {
    setOauthModalOpen(false);
    setOauthModalData(null);
    setError('Authentication cancelled');
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/ai/automations/${automationId}/executions/${runId}/input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit inputs');
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f0f1a, #1a1a2e)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#fff', fontSize: '1.2rem' }}>Loading...</div>
      </div>
    );
  }

  if (error && !execution) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f0f1a, #1a1a2e)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', padding: '2rem', maxWidth: '400px', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>❌</div>
          <h2 style={{ color: '#ef4444', margin: '0 0 0.5rem' }}>Error</h2>
          <p style={{ color: 'rgba(255,255,255,0.7)', margin: 0 }}>{error}</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f0f1a, #1a1a2e)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', padding: '2rem', maxWidth: '400px', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>✅</div>
          <h2 style={{ color: '#10b981', margin: '0 0 0.5rem' }}>Input Submitted</h2>
          <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 1rem' }}>
            Your input has been received. The automation will continue running.
          </p>
          <button
            onClick={() => router.push('/automations')}
            style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', cursor: 'pointer', fontSize: '0.9rem' }}
          >
            Back to Automations
          </button>
        </div>
      </div>
    );
  }

  if (execution?.status !== 'waiting_input') {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f0f1a, #1a1a2e)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '12px', padding: '2rem', maxWidth: '400px', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ color: '#f59e0b', margin: '0 0 0.5rem' }}>No Input Required</h2>
          <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 1rem' }}>
            This execution is not waiting for input. Status: {execution?.status}
          </p>
          <button
            onClick={() => router.push('/automations')}
            style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', fontSize: '0.9rem' }}
          >
            Back to Automations
          </button>
        </div>
      </div>
    );
  }

  const pendingInputs = execution?.pending_inputs || [];

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f0f1a, #1a1a2e)', padding: '2rem' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🤖</div>
          <h1 style={{ color: '#fff', fontSize: '1.5rem', margin: '0 0 0.5rem' }}>
            {pendingInputs.length > 0 ? 'Input Required' : 'Action Required'}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0 }}>
            Automation <strong style={{ color: '#f59e0b' }}>{execution?.automation_name || 'Unknown'}</strong> {pendingInputs.length > 0 ? 'needs your input to continue' : 'is waiting for your confirmation'}
          </p>
        </div>

        {/* Dynamic Message from notification */}
        {dynamicMessage && (
          <div style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.25rem' }}>💬</span>
              <p style={{ color: 'rgba(255,255,255,0.85)', margin: 0, lineHeight: 1.5 }}>
                {dynamicMessage}
              </p>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {pendingInputs.length > 0 ? (
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem' }}>
              {pendingInputs.map((field, idx) => (
              <div key={field.name} style={{ marginBottom: idx < pendingInputs.length - 1 ? '1.25rem' : 0 }}>
                <label style={{ display: 'block', color: '#fff', fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  {field.name}
                  <span style={{ color: '#ef4444', marginLeft: '0.25rem' }}>*</span>
                </label>
                {field.description && (
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: '0 0 0.5rem' }}>
                    {field.description}
                  </p>
                )}
                {field.type === 'boolean' ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={inputs[field.name] === 'true'}
                      onChange={(e) => setInputs(prev => ({ ...prev, [field.name]: e.target.checked ? 'true' : 'false' }))}
                      style={{ width: '18px', height: '18px' }}
                    />
                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem' }}>Yes</span>
                  </label>
                ) : (
                  <input
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={inputs[field.name] || ''}
                    onChange={(e) => setInputs(prev => ({ ...prev, [field.name]: e.target.value }))}
                    required
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'rgba(0,0,0,0.3)',
                      color: '#fff',
                      fontSize: '0.9rem',
                    }}
                    placeholder={`Enter ${field.name}...`}
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem', textAlign: 'center' }}>
            <p style={{ color: 'rgba(255,255,255,0.7)', margin: 0 }}>
              Click the button below to continue the automation.
            </p>
          </div>
        )}

          {error && (
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', padding: '0.75rem', marginBottom: '1rem' }}>
              <p style={{ color: '#ef4444', margin: 0, fontSize: '0.85rem' }}>❌ {error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              padding: '1rem',
              borderRadius: '10px',
              border: 'none',
              background: submitting ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #10b981, #059669)',
              color: '#fff',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
          >
            {submitting ? (
              <>⏳ Submitting...</>
            ) : (
              <>▶️ {pendingInputs.length > 0 ? 'Submit & Continue Automation' : 'Continue Automation'}</>
            )}
          </button>
        </form>

        {/* Info */}
        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>
            Run ID: {runId}
          </p>
        </div>
      </div>

      {/* OAuth Authentication Modal */}
      {oauthModalData && (
        <OAuthAuthenticationModal
          isOpen={oauthModalOpen}
          serverName={oauthModalData.serverName}
          serverType={oauthModalData.serverType}
          serverId={oauthModalData.serverId}
          oauthConfig={oauthModalData.oauthConfig}
          onSuccess={handleOAuthSuccess}
          onCancel={handleOAuthCancel}
        />
      )}
    </div>
  );
}

