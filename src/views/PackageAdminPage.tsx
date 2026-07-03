'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';

interface PackageItem {
  id: string;
  name: string;
  description: string | null;
  type: 'plugin' | 'skill' | 'practitioner' | 'mcp';
  latest_version: string;
  blob_url: string;
  config_json?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  visibility?: 'public' | 'pending' | 'private';
  install_count?: number;
  avg_rating?: number | null;
  rating_count?: number;
  owner_user_id?: string | null;
}

interface VersionItem {
  id: string;
  version: string;
  blob_url: string;
  changelog: string | null;
  created_at: string;
}

interface DownloadItem {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: string;
}

function DownloadsSection() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchDownloads = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/downloads');
      if (res.ok) {
        const data = await res.json();
        setDownloads(data.downloads || []);
      }
    } catch {
      setError('Failed to load downloads');
    }
  }, []);

  useEffect(() => { fetchDownloads(); }, [fetchDownloads]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/admin/downloads', { method: 'POST', body: form });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }
      const data = await res.json();
      setSuccess(`Uploaded: ${data.url}`);
      await fetchDownloads();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDelete = async (url: string) => {
    if (!confirm('Delete this file?')) return;
    try {
      const res = await fetch('/api/admin/downloads', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        await fetchDownloads();
        setSuccess('Deleted');
      }
    } catch {
      setError('Delete failed');
    }
  };

  return (
    <div style={{ marginTop: '2rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '1.5rem' }}>
      <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 1rem' }}>
        File Uploads (Downloads / Packages / Archives)
      </h3>

      {error && <div style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</div>}
      {success && <div style={{ color: '#22c55e', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{success}</div>}

      <div style={{ marginBottom: '1rem' }}>
        <input
          ref={fileRef}
          type="file"
          accept=".dmg,.zip,.tar.gz,.tgz"
          onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])}
          style={{ display: 'none' }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            border: 'none',
            borderRadius: '8px',
            padding: '0.6rem 1.2rem',
            color: '#fff',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: uploading ? 'wait' : 'pointer',
            opacity: uploading ? 0.6 : 1,
          }}
        >
          {uploading ? 'Uploading...' : 'Upload File'}
        </button>
      </div>

      {downloads.length === 0 ? (
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>No downloads uploaded yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {downloads.map(d => (
            <div key={d.url} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '0.6rem 0.75rem' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.pathname.replace('downloads/', '')}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>
                  {(d.size / 1024 / 1024).toFixed(1)} MB
                </div>
              </div>
              <button
                onClick={() => { navigator.clipboard.writeText(d.url); setSuccess('URL copied!'); }}
                style={{ background: 'rgba(102, 126, 234, 0.15)', border: '1px solid rgba(102, 126, 234, 0.3)', borderRadius: '6px', padding: '0.35rem 0.6rem', color: '#667eea', fontSize: '0.75rem', cursor: 'pointer' }}
              >
                Copy URL
              </button>
              <button
                onClick={() => handleDelete(d.url)}
                style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', padding: '0.35rem 0.6rem', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer' }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const PackageAdminPage: React.FC = () => {
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // New package form
  const [formId, setFormId] = useState('');
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formType, setFormType] = useState<'plugin' | 'skill' | 'practitioner' | 'mcp'>('plugin');
  const [formVersion, setFormVersion] = useState('1.0.0');
  const [formFile, setFormFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // MCP config form fields
  const [mcpTransport, setMcpTransport] = useState<'http' | 'sse' | 'stdio'>('http');
  const [mcpUrl, setMcpUrl] = useState('');
  const [mcpCommand, setMcpCommand] = useState('');
  const [mcpArgs, setMcpArgs] = useState('');
  const [mcpOAuthAuthUrl, setMcpOAuthAuthUrl] = useState('');
  const [mcpOAuthTokenUrl, setMcpOAuthTokenUrl] = useState('');
  const [mcpOAuthClientId, setMcpOAuthClientId] = useState('');
  const [mcpOAuthScopes, setMcpOAuthScopes] = useState('');

  // New version modal
  const [versionPkg, setVersionPkg] = useState<PackageItem | null>(null);
  const [versionStr, setVersionStr] = useState('');
  const [versionChangelog, setVersionChangelog] = useState('');
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [versionDragging, setVersionDragging] = useState(false);
  const versionFileRef = useRef<HTMLInputElement>(null);

  // Expanded package detail
  const [expandedPkg, setExpandedPkg] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionItem[]>([]);

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchPackages = useCallback(async () => {
    try {
      const res = await fetch('/api/packages');
      if (res.ok) {
        const data = await res.json();
        setPackages(data.packages || []);
      }
    } catch {
      setError('Failed to load packages');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  const fetchVersions = async (pkgId: string) => {
    const res = await fetch(`/api/packages/${pkgId}`);
    if (res.ok) {
      const data = await res.json();
      setVersions(data.versions || []);
    }
  };

  const handleExpand = (pkgId: string) => {
    if (expandedPkg === pkgId) {
      setExpandedPkg(null);
      setVersions([]);
    } else {
      setExpandedPkg(pkgId);
      fetchVersions(pkgId);
    }
  };

  const slugify = (text: string) =>
    text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const handleNameChange = (val: string) => {
    setFormName(val);
    if (!formId || formId === slugify(formName)) {
      setFormId(slugify(val));
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formId || !formName) return;
    if (formType !== 'mcp' && !formFile) return;

    setUploading(true);
    setError(null);
    setSuccess(null);

    const fd = new FormData();
    if (formFile) fd.append('file', formFile);
    fd.append('id', formId);
    fd.append('name', formName);
    fd.append('description', formDescription);
    fd.append('type', formType);
    fd.append('version', formVersion);

    if (formType === 'mcp') {
      const configJson: Record<string, unknown> = { transport: mcpTransport };
      if (mcpTransport === 'stdio') {
        configJson.command = mcpCommand;
        if (mcpArgs.trim()) configJson.args = mcpArgs.trim().split(/\s+/);
      } else {
        configJson.url = mcpUrl;
      }
      if (mcpOAuthAuthUrl && mcpOAuthTokenUrl && mcpOAuthClientId) {
        configJson.oauth = {
          auth_url: mcpOAuthAuthUrl,
          token_url: mcpOAuthTokenUrl,
          client_id: mcpOAuthClientId,
          scopes: mcpOAuthScopes ? mcpOAuthScopes.split(',').map(s => s.trim()) : [],
          redirect_uri: 'http://localhost:8919/callback',
        };
      }
      fd.append('config_json', JSON.stringify(configJson));
    }

    try {
      const res = await fetch('/api/packages', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Upload failed');
      } else {
        setSuccess(`Package "${formName}" v${formVersion} ${formType === 'mcp' ? 'created' : 'uploaded'}`);
        setShowForm(false);
        resetForm();
        fetchPackages();
      }
    } catch {
      setError('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleNewVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!versionPkg || !versionFile || !versionStr) return;

    setUploading(true);
    setError(null);

    const fd = new FormData();
    fd.append('file', versionFile);
    fd.append('version', versionStr);
    fd.append('changelog', versionChangelog);

    try {
      const res = await fetch(`/api/packages/${versionPkg.id}/versions`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Version upload failed');
      } else {
        setSuccess(`Version ${versionStr} uploaded for "${versionPkg.name}"`);
        setVersionPkg(null);
        setVersionStr('');
        setVersionChangelog('');
        setVersionFile(null);
        fetchPackages();
        if (expandedPkg === versionPkg.id) {
          fetchVersions(versionPkg.id);
        }
      }
    } catch {
      setError('Version upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (pkgId: string) => {
    try {
      const res = await fetch(`/api/packages/${pkgId}`, { method: 'DELETE' });
      if (res.ok) {
        setSuccess('Package deleted');
        setConfirmDelete(null);
        fetchPackages();
      } else {
        const data = await res.json();
        setError(data.error || 'Delete failed');
      }
    } catch {
      setError('Delete failed');
    }
  };

  const handleModerate = async (pkgId: string, visibility: 'public' | 'pending' | 'private') => {
    try {
      const res = await fetch(`/api/packages/${pkgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility }),
      });
      if (res.ok) {
        setSuccess(`Package set to ${visibility}`);
        fetchPackages();
      } else {
        const data = await res.json();
        setError(data.error || 'Moderation failed');
      }
    } catch {
      setError('Moderation failed');
    }
  };

  const resetForm = () => {
    setFormId('');
    setFormName('');
    setFormDescription('');
    setFormType('plugin');
    setFormVersion('1.0.0');
    setFormFile(null);
    setMcpTransport('http');
    setMcpUrl('');
    setMcpCommand('');
    setMcpArgs('');
    setMcpOAuthAuthUrl('');
    setMcpOAuthTokenUrl('');
    setMcpOAuthClientId('');
    setMcpOAuthScopes('');
  };

  const handleDrop = (e: React.DragEvent, setFile: (f: File) => void, setDrag: (b: boolean) => void) => {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.zip') || file.type === 'application/zip')) {
      setFile(file);
    }
  };

  const cardStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '16px',
    padding: '1.5rem',
    marginBottom: '1.5rem',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.6rem 0.8rem',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '0.85rem',
    outline: 'none',
  };

  const buttonStyle = (variant: 'primary' | 'secondary' | 'danger'): React.CSSProperties => ({
    padding: '0.5rem 1rem',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 600,
    background: variant === 'primary'
      ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      : variant === 'danger'
        ? 'rgba(239, 68, 68, 0.2)'
        : 'rgba(255,255,255,0.08)',
    color: variant === 'danger' ? '#ef4444' : '#fff',
  });

  const typeBadge = (type: string): React.CSSProperties => {
    const colors: Record<string, { bg: string; fg: string; border: string }> = {
      plugin: { bg: 'rgba(59, 130, 246, 0.15)', fg: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' },
      skill: { bg: 'rgba(34, 197, 94, 0.15)', fg: '#22c55e', border: 'rgba(34, 197, 94, 0.3)' },
      practitioner: { bg: 'rgba(168, 85, 247, 0.15)', fg: '#a855f7', border: 'rgba(168, 85, 247, 0.3)' },
      mcp: { bg: 'rgba(245, 158, 11, 0.15)', fg: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)' },
    };
    const c = colors[type] || colors.plugin;
    return {
      display: 'inline-block',
      padding: '0.15rem 0.5rem',
      borderRadius: '999px',
      fontSize: '0.7rem',
      fontWeight: 500,
      background: c.bg,
      color: c.fg,
      border: `1px solid ${c.border}`,
    };
  };

  const dropZoneStyle = (dragging: boolean): React.CSSProperties => ({
    border: `2px dashed ${dragging ? '#667eea' : 'rgba(255,255,255,0.15)'}`,
    borderRadius: '12px',
    padding: '2rem',
    textAlign: 'center',
    cursor: 'pointer',
    background: dragging ? 'rgba(102, 126, 234, 0.05)' : 'transparent',
    transition: 'all 0.2s',
  });

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
      <main style={{ maxWidth: '56rem', margin: '0 auto', padding: '2rem 1.5rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#fff', margin: '0 0 0.5rem' }}>
              Package Admin
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0, fontSize: '0.9rem' }}>
              Upload and manage packages for devices.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Link href="/dashboard" style={{ ...buttonStyle('secondary'), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
              Control Panel
            </Link>
            <button onClick={() => setShowForm(!showForm)} style={buttonStyle('primary')}>
              {showForm ? 'Cancel' : '+ Add Package'}
            </button>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div style={{ ...cardStyle, background: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', fontSize: '0.85rem' }}>
            {error}
            <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>x</button>
          </div>
        )}
        {success && (
          <div style={{ ...cardStyle, background: 'rgba(34, 197, 94, 0.08)', borderColor: 'rgba(34, 197, 94, 0.2)', color: '#22c55e', fontSize: '0.85rem' }}>
            {success}
            <button onClick={() => setSuccess(null)} style={{ float: 'right', background: 'none', border: 'none', color: '#22c55e', cursor: 'pointer' }}>x</button>
          </div>
        )}

        {/* Add Package Form */}
        {showForm && (
          <div style={cardStyle}>
            <h3 style={{ color: '#fff', margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600 }}>New Package</h3>
            <form onSubmit={handleUpload}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', display: 'block', marginBottom: '0.3rem' }}>Name</label>
                  <input value={formName} onChange={e => handleNameChange(e.target.value)} placeholder="My Package" style={inputStyle} required />
                </div>
                <div>
                  <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', display: 'block', marginBottom: '0.3rem' }}>ID (slug)</label>
                  <input value={formId} onChange={e => setFormId(e.target.value)} placeholder="my-package" style={inputStyle} required />
                </div>
                <div>
                  <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', display: 'block', marginBottom: '0.3rem' }}>Type</label>
                  <select value={formType} onChange={e => setFormType(e.target.value as any)} style={{ ...inputStyle, appearance: 'none' }}>
                    <option value="plugin">Plugin</option>
                    <option value="skill">Skill</option>
                    <option value="practitioner">Practitioner</option>
                    <option value="mcp">MCP Server</option>
                  </select>
                </div>
                <div>
                  <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', display: 'block', marginBottom: '0.3rem' }}>Version</label>
                  <input value={formVersion} onChange={e => setFormVersion(e.target.value)} placeholder="1.0.0" style={inputStyle} required />
                </div>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', display: 'block', marginBottom: '0.3rem' }}>Description</label>
                <textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="What this package does..." style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} />
              </div>
              {formType === 'mcp' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div>
                    <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', display: 'block', marginBottom: '0.3rem' }}>Transport</label>
                    <select value={mcpTransport} onChange={e => setMcpTransport(e.target.value as any)} style={{ ...inputStyle, appearance: 'none' }}>
                      <option value="http">HTTP</option>
                      <option value="sse">SSE</option>
                      <option value="stdio">stdio (local process)</option>
                    </select>
                  </div>
                  {mcpTransport === 'stdio' ? (
                    <>
                      <div>
                        <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', display: 'block', marginBottom: '0.3rem' }}>Command</label>
                        <input value={mcpCommand} onChange={e => setMcpCommand(e.target.value)} placeholder="npx, uvx, node..." style={inputStyle} required />
                      </div>
                      <div>
                        <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', display: 'block', marginBottom: '0.3rem' }}>Args (space-separated)</label>
                        <input value={mcpArgs} onChange={e => setMcpArgs(e.target.value)} placeholder="@modelcontextprotocol/server-filesystem /tmp" style={inputStyle} />
                      </div>
                    </>
                  ) : (
                    <div>
                      <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', display: 'block', marginBottom: '0.3rem' }}>URL</label>
                      <input value={mcpUrl} onChange={e => setMcpUrl(e.target.value)} placeholder="https://mcp.example.com/sse" style={inputStyle} required />
                    </div>
                  )}
                  <details style={{ marginTop: '0.5rem' }}>
                    <summary style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', cursor: 'pointer' }}>OAuth (optional)</summary>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.5rem' }}>
                      <div>
                        <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', display: 'block', marginBottom: '0.3rem' }}>Auth URL</label>
                        <input value={mcpOAuthAuthUrl} onChange={e => setMcpOAuthAuthUrl(e.target.value)} placeholder="https://..." style={inputStyle} />
                      </div>
                      <div>
                        <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', display: 'block', marginBottom: '0.3rem' }}>Token URL</label>
                        <input value={mcpOAuthTokenUrl} onChange={e => setMcpOAuthTokenUrl(e.target.value)} placeholder="https://..." style={inputStyle} />
                      </div>
                      <div>
                        <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', display: 'block', marginBottom: '0.3rem' }}>Client ID</label>
                        <input value={mcpOAuthClientId} onChange={e => setMcpOAuthClientId(e.target.value)} placeholder="client_id" style={inputStyle} />
                      </div>
                      <div>
                        <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', display: 'block', marginBottom: '0.3rem' }}>Scopes (comma-separated)</label>
                        <input value={mcpOAuthScopes} onChange={e => setMcpOAuthScopes(e.target.value)} placeholder="read,write" style={inputStyle} />
                      </div>
                    </div>
                  </details>
                </div>
              ) : (
                <div
                  style={dropZoneStyle(isDragging)}
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragEnter={() => setIsDragging(true)}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={e => handleDrop(e, setFormFile, setIsDragging)}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input ref={fileInputRef} type="file" accept=".zip" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && setFormFile(e.target.files[0])} />
                  {formFile ? (
                    <span style={{ color: '#22c55e', fontSize: '0.85rem' }}>{formFile.name} ({(formFile.size / 1024).toFixed(1)} KB)</span>
                  ) : (
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>
                      {isDragging ? 'Drop zip file here' : 'Click or drag & drop zip file'}
                    </span>
                  )}
                </div>
              )}
              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" disabled={uploading || (formType !== 'mcp' && !formFile)} style={{ ...buttonStyle('primary'), opacity: uploading || (formType !== 'mcp' && !formFile) ? 0.5 : 1 }}>
                  {uploading ? (formType === 'mcp' ? 'Saving...' : 'Uploading...') : (formType === 'mcp' ? 'Save MCP Server' : 'Upload Package')}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Package List */}
        <div style={cardStyle}>
          <h3 style={{ color: '#fff', margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600 }}>
            Packages ({packages.length})
          </h3>
          {loading ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>Loading...</p>
          ) : packages.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>No packages yet. Upload one to get started.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {packages.map(pkg => (
                <div key={pkg.id}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '0.75rem 1rem',
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <span style={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem' }}>{pkg.name}</span>
                        <span style={typeBadge(pkg.type)}>{pkg.type}</span>
                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>v{pkg.latest_version}</span>
                        {pkg.visibility && (
                          <span style={{
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            padding: '0.1rem 0.45rem',
                            borderRadius: '999px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.03em',
                            color: pkg.visibility === 'public' ? '#22c55e' : pkg.visibility === 'pending' ? '#eab308' : 'rgba(255,255,255,0.5)',
                            background: pkg.visibility === 'public' ? 'rgba(34,197,94,0.12)' : pkg.visibility === 'pending' ? 'rgba(234,179,8,0.12)' : 'rgba(255,255,255,0.06)',
                          }}>
                            {pkg.visibility}
                          </span>
                        )}
                      </div>
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>
                        {pkg.id} &middot; {new Date(pkg.updated_at).toLocaleDateString()}
                        {' '}&middot; {pkg.install_count ?? 0} installs
                        {pkg.avg_rating != null && <> &middot; ★ {pkg.avg_rating.toFixed(1)} ({pkg.rating_count ?? 0})</>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                      {pkg.visibility === 'pending' && (
                        <button onClick={() => handleModerate(pkg.id, 'public')} style={{ ...buttonStyle('primary'), fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}>
                          Approve
                        </button>
                      )}
                      {pkg.visibility === 'public' && (
                        <button onClick={() => handleModerate(pkg.id, 'private')} style={{ ...buttonStyle('secondary'), fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}>
                          Hide
                        </button>
                      )}
                      <button onClick={() => handleExpand(pkg.id)} style={{ ...buttonStyle('secondary'), fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}>
                        {expandedPkg === pkg.id ? 'Hide' : 'Versions'}
                      </button>
                      <button onClick={() => { setVersionPkg(pkg); setVersionStr(''); setVersionChangelog(''); setVersionFile(null); }} style={{ ...buttonStyle('secondary'), fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}>
                        + Version
                      </button>
                      {confirmDelete === pkg.id ? (
                        <>
                          <button onClick={() => handleDelete(pkg.id)} style={{ ...buttonStyle('danger'), fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}>Confirm</button>
                          <button onClick={() => setConfirmDelete(null)} style={{ ...buttonStyle('secondary'), fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}>Cancel</button>
                        </>
                      ) : (
                        <button onClick={() => setConfirmDelete(pkg.id)} style={{ ...buttonStyle('danger'), fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}>Delete</button>
                      )}
                    </div>
                  </div>
                  {/* Expanded versions */}
                  {expandedPkg === pkg.id && (
                    <div style={{ marginTop: '0.5rem', marginLeft: '1rem', padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                      {versions.length === 0 ? (
                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>Loading...</span>
                      ) : versions.map(v => (
                        <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <div>
                            <span style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 500 }}>v{v.version}</span>
                            {v.changelog && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginLeft: '0.5rem' }}>{v.changelog}</span>}
                          </div>
                          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem' }}>{new Date(v.created_at).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* New Version Modal */}
        {versionPkg && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setVersionPkg(null)}>
            <div style={{ ...cardStyle, maxWidth: '28rem', width: '90%', margin: 0 }} onClick={e => e.stopPropagation()}>
              <h3 style={{ color: '#fff', margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600 }}>
                New Version for &quot;{versionPkg.name}&quot;
              </h3>
              <form onSubmit={handleNewVersion}>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', display: 'block', marginBottom: '0.3rem' }}>Version (current: {versionPkg.latest_version})</label>
                  <input value={versionStr} onChange={e => setVersionStr(e.target.value)} placeholder="1.1.0" style={inputStyle} required />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', display: 'block', marginBottom: '0.3rem' }}>Changelog</label>
                  <textarea value={versionChangelog} onChange={e => setVersionChangelog(e.target.value)} placeholder="What changed..." style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} />
                </div>
                <div
                  style={dropZoneStyle(versionDragging)}
                  onDragOver={e => { e.preventDefault(); setVersionDragging(true); }}
                  onDragEnter={() => setVersionDragging(true)}
                  onDragLeave={() => setVersionDragging(false)}
                  onDrop={e => handleDrop(e, setVersionFile, setVersionDragging)}
                  onClick={() => versionFileRef.current?.click()}
                >
                  <input ref={versionFileRef} type="file" accept=".zip" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && setVersionFile(e.target.files[0])} />
                  {versionFile ? (
                    <span style={{ color: '#22c55e', fontSize: '0.85rem' }}>{versionFile.name} ({(versionFile.size / 1024).toFixed(1)} KB)</span>
                  ) : (
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>Click or drag & drop zip file</span>
                  )}
                </div>
                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button type="button" onClick={() => setVersionPkg(null)} style={buttonStyle('secondary')}>Cancel</button>
                  <button type="submit" disabled={uploading || !versionFile} style={{ ...buttonStyle('primary'), opacity: uploading || !versionFile ? 0.5 : 1 }}>
                    {uploading ? 'Uploading...' : 'Upload Version'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <DownloadsSection />
      </main>
    </div>
  );
};
