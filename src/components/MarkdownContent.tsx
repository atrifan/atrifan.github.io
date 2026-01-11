'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

interface MarkdownContentProps {
  content: string;
}

// Custom components for markdown rendering
const components: Components = {
  // Links - open in new tab
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: '#60a5fa',
        textDecoration: 'underline',
        wordBreak: 'break-all',
      }}
    >
      {children}
    </a>
  ),
  // Code blocks
  code: ({ className, children, ...props }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code
          style={{
            background: 'rgba(139, 92, 246, 0.2)',
            color: '#a78bfa',
            padding: '0.15rem 0.4rem',
            borderRadius: '4px',
            fontSize: '0.85em',
            fontFamily: 'monospace',
          }}
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        className={className}
        style={{
          display: 'block',
          background: 'rgba(0, 0, 0, 0.3)',
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          fontSize: '0.85em',
          fontFamily: 'monospace',
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
        {...props}
      >
        {children}
      </code>
    );
  },
  // Pre blocks (code block wrapper)
  pre: ({ children }) => (
    <pre style={{ margin: '0.5rem 0', padding: 0, background: 'transparent' }}>
      {children}
    </pre>
  ),
  // Paragraphs
  p: ({ children }) => (
    <p style={{ margin: '0.5rem 0', lineHeight: 1.6 }}>{children}</p>
  ),
  // Lists
  ul: ({ children }) => (
    <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>{children}</ol>
  ),
  li: ({ children }) => (
    <li style={{ margin: '0.25rem 0' }}>{children}</li>
  ),
  // Headings
  h1: ({ children }) => (
    <h1 style={{ fontSize: '1.4em', fontWeight: 700, margin: '0.75rem 0 0.5rem', color: '#fff' }}>{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 style={{ fontSize: '1.25em', fontWeight: 600, margin: '0.75rem 0 0.5rem', color: '#fff' }}>{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 style={{ fontSize: '1.1em', fontWeight: 600, margin: '0.5rem 0 0.25rem', color: '#fff' }}>{children}</h3>
  ),
  // Blockquotes
  blockquote: ({ children }) => (
    <blockquote
      style={{
        borderLeft: '3px solid #8b5cf6',
        paddingLeft: '1rem',
        margin: '0.5rem 0',
        color: 'rgba(255, 255, 255, 0.7)',
        fontStyle: 'italic',
      }}
    >
      {children}
    </blockquote>
  ),
  // Horizontal rule
  hr: () => (
    <hr style={{ border: 'none', borderTop: '1px solid rgba(255, 255, 255, 0.2)', margin: '1rem 0' }} />
  ),
  // Strong/bold
  strong: ({ children }) => (
    <strong style={{ fontWeight: 600, color: '#fff' }}>{children}</strong>
  ),
  // Tables (GFM)
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', margin: '0.5rem 0' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9em' }}>{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th style={{ border: '1px solid rgba(255, 255, 255, 0.2)', padding: '0.5rem', background: 'rgba(139, 92, 246, 0.2)', textAlign: 'left' }}>{children}</th>
  ),
  td: ({ children }) => (
    <td style={{ border: '1px solid rgba(255, 255, 255, 0.2)', padding: '0.5rem' }}>{children}</td>
  ),
};

export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <div style={{ wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: 1.5, fontSize: '0.95rem' }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

