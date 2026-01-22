'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { View } from '@adobe/react-spectrum';
import { Footer } from '../components/Footer';
import { BackToTools } from '../components/BackToTools';
import { MermaidDiagram } from '../components/MermaidDiagram';
import { applySEO } from '../utils/seo';
import yaml from 'js-yaml';
import { WorkflowDefinition } from '../lib/automation/types';
import { workflowToMermaid } from '../lib/automation/yaml-to-mermaid';

// Default YAML template
const DEFAULT_YAML = `name: "My Workflow"
description: "A sample workflow"
version: 1

trigger:
  type: manual

steps:
  - id: search
    tool: brave-search.web_search
    params:
      query: "AI news today"
      count: 10
    output: results

  - id: filter
    code: |
      results.filter(r => r.score > 0.7)
    output: filtered

  - id: summarize
    llm:
      prompt: "Summarize: {{filtered}}"
    output: summary
`;

export const YamlPlaygroundPage: React.FC = () => {
  const [yamlInput, setYamlInput] = useState(DEFAULT_YAML);
  const [mermaidOutput, setMermaidOutput] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [rulesContent, setRulesContent] = useState<string>('');
  const [showRules, setShowRules] = useState(false);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  // Apply SEO
  useEffect(() => {
    applySEO('yaml-playground');
  }, []);

  // Fetch rules on mount
  useEffect(() => {
    fetch('/api/ai/automations/rules', {
      headers: { 'Accept': 'text/markdown' },
    })
      .then(res => res.text())
      .then(setRulesContent)
      .catch(console.error);
  }, []);

  // Parse YAML and generate Mermaid
  const parseYaml = useCallback(() => {
    try {
      const parsed = yaml.load(yamlInput) as WorkflowDefinition;
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid YAML: must be an object');
      }
      if (!parsed.name) {
        throw new Error('Missing required field: name');
      }
      if (!parsed.trigger) {
        parsed.trigger = { type: 'manual' };
      }
      if (!parsed.steps) {
        parsed.steps = [];
      }
      
      const mermaid = workflowToMermaid(parsed);
      setMermaidOutput(mermaid);
      setParseError(null);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Parse error');
      setMermaidOutput('');
    }
  }, [yamlInput]);

  // Auto-parse on YAML change (debounced)
  useEffect(() => {
    const timer = setTimeout(parseYaml, 500);
    return () => clearTimeout(timer);
  }, [yamlInput, parseYaml]);

  // Copy handlers
  const copyYaml = useCallback(() => {
    navigator.clipboard.writeText(yamlInput);
    setCopySuccess('yaml');
    setTimeout(() => setCopySuccess(null), 2000);
  }, [yamlInput]);

  const copyMermaid = useCallback(() => {
    navigator.clipboard.writeText(mermaidOutput);
    setCopySuccess('mermaid');
    setTimeout(() => setCopySuccess(null), 2000);
  }, [mermaidOutput]);

  const copyRules = useCallback(() => {
    navigator.clipboard.writeText(rulesContent);
    setCopySuccess('rules');
    setTimeout(() => setCopySuccess(null), 2000);
  }, [rulesContent]);

  // Download handlers
  const downloadYaml = useCallback(() => {
    try {
      const parsed = yaml.load(yamlInput) as WorkflowDefinition;
      const filename = `${parsed?.name || 'workflow'}.yaml`.replace(/\s+/g, '-').toLowerCase();
      const blob = new Blob([yamlInput], { type: 'text/yaml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Use default filename
      const blob = new Blob([yamlInput], { type: 'text/yaml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'workflow.yaml';
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [yamlInput]);

  const downloadRules = useCallback(() => {
    const blob = new Blob([rulesContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workflow-rules.md';
    a.click();
    URL.revokeObjectURL(url);
  }, [rulesContent]);

  // Paste handler
  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setYamlInput(text);
    } catch {
      console.error('Failed to read clipboard');
    }
  }, []);

  // Load example
  const loadExample = useCallback(() => {
    setYamlInput(DEFAULT_YAML);
  }, []);

  return (
    <View padding="size-400" minHeight="100vh" UNSAFE_style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%)' }}>
      <BackToTools />

      {/* Header */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ color: '#fff', fontSize: '1.5rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              📝 YAML Playground
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', margin: '0.25rem 0 0' }}>
              Create and test workflow YAML, see the generated Mermaid diagram
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowRules(!showRules)}
              style={{
                background: showRules ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255,255,255,0.1)',
                border: showRules ? '1px solid rgba(139, 92, 246, 0.5)' : '1px solid rgba(255,255,255,0.2)',
                borderRadius: '8px',
                padding: '0.5rem 1rem',
                color: showRules ? '#a78bfa' : '#fff',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              📖 {showRules ? 'Hide' : 'Show'} Rules
            </button>
            <button
              onClick={loadExample}
              style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '0.5rem 1rem', color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              📋 Load Example
            </button>
          </div>
        </div>
      </div>

      {/* Rules Panel (collapsible) */}
      {showRules && (
        <div style={{ maxWidth: '1400px', margin: '0 auto 1.5rem', background: 'rgba(139, 92, 246, 0.1)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ color: '#a78bfa', fontSize: '1.1rem', margin: 0 }}>📖 Workflow Rules (System Prompt / IDE Rules)</h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={copyRules} style={{ background: copySuccess === 'rules' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', padding: '0.4rem 0.75rem', color: copySuccess === 'rules' ? '#10b981' : '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>
                {copySuccess === 'rules' ? '✓ Copied!' : '📋 Copy'}
              </button>
              <button onClick={downloadRules} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', padding: '0.4rem 0.75rem', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>
                💾 Download .md
              </button>
            </div>
          </div>
          <pre style={{ background: 'rgba(0,0,0,0.4)', borderRadius: '10px', padding: '1rem', overflow: 'auto', maxHeight: '400px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', margin: 0 }}>
            {rulesContent || 'Loading rules...'}
          </pre>
        </div>
      )}

      {/* Main Content - Split View */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
        {/* YAML Editor Panel */}
        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 style={{ color: '#10b981', fontSize: '1.1rem', margin: 0 }}>📄 YAML Input</h2>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button onClick={handlePaste} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', padding: '0.4rem 0.75rem', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>
                📥 Paste
              </button>
              <button onClick={copyYaml} style={{ background: copySuccess === 'yaml' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', padding: '0.4rem 0.75rem', color: copySuccess === 'yaml' ? '#10b981' : '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>
                {copySuccess === 'yaml' ? '✓ Copied!' : '📋 Copy'}
              </button>
              <button onClick={downloadYaml} style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: '6px', padding: '0.4rem 0.75rem', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>
                💾 Download
              </button>
            </div>
          </div>

          {/* Error Display */}
          {parseError && (
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', padding: '0.75rem', marginBottom: '1rem' }}>
              <span style={{ color: '#ef4444', fontSize: '0.85rem' }}>❌ {parseError}</span>
            </div>
          )}

          {/* YAML Textarea */}
          <textarea
            value={yamlInput}
            onChange={(e) => setYamlInput(e.target.value)}
            placeholder="Paste or type your YAML workflow here..."
            style={{
              width: '100%',
              minHeight: '500px',
              background: 'rgba(0,0,0,0.4)',
              borderRadius: '10px',
              padding: '1rem',
              fontSize: '0.8rem',
              color: '#a5b4fc',
              fontFamily: 'monospace',
              border: parseError ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(255,255,255,0.1)',
              resize: 'vertical',
              lineHeight: 1.5,
            }}
          />
        </div>

        {/* Mermaid Output Panel */}
        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 style={{ color: '#f59e0b', fontSize: '1.1rem', margin: 0 }}>🔀 Generated Mermaid</h2>
            <button onClick={copyMermaid} disabled={!mermaidOutput} style={{ background: copySuccess === 'mermaid' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', padding: '0.4rem 0.75rem', color: copySuccess === 'mermaid' ? '#10b981' : '#fff', cursor: 'pointer', fontSize: '0.8rem', opacity: mermaidOutput ? 1 : 0.5 }}>
              {copySuccess === 'mermaid' ? '✓ Copied!' : '📋 Copy Mermaid'}
            </button>
          </div>

          {/* Mermaid Diagram */}
          {mermaidOutput ? (
            <div style={{ minHeight: '400px' }}>
              <MermaidDiagram
                definition={mermaidOutput}
                title="Workflow Preview"
                editable={false}
                minHeight="400px"
                maxHeight="600px"
              />
            </div>
          ) : (
            <div style={{ minHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '10px' }}>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem' }}>
                {parseError ? 'Fix YAML errors to see diagram' : 'Enter valid YAML to generate diagram'}
              </p>
            </div>
          )}

          {/* Raw Mermaid Code */}
          {mermaidOutput && (
            <details style={{ marginTop: '1rem' }}>
              <summary style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', cursor: 'pointer' }}>
                View Raw Mermaid Code
              </summary>
              <pre style={{ background: 'rgba(0,0,0,0.4)', borderRadius: '10px', padding: '1rem', overflow: 'auto', maxHeight: '200px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', marginTop: '0.5rem' }}>
                {mermaidOutput}
              </pre>
            </details>
          )}
        </div>
      </div>

      {/* Save to Automation Section */}
      <div style={{ maxWidth: '1400px', margin: '1.5rem auto 0', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ color: '#f59e0b', fontSize: '1rem', margin: 0 }}>💾 Save to Automation</h3>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>
              Once your YAML is ready, save it as an automation to run it
            </p>
          </div>
          <a
            href="/automation"
            style={{
              background: 'linear-gradient(135deg, #f59e0b, #ea580c)',
              border: 'none',
              borderRadius: '10px',
              padding: '0.75rem 1.5rem',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            ⚡ Go to Automations
          </a>
        </div>
      </div>

      <Footer />
    </View>
  );
};

