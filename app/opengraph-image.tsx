import { ImageResponse } from 'next/og';

export const alt = 'Tex by Tulzo, your personal AI assistant';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Social card: the Tulzo robot mark and the wordmark on the light token palette. */
export default function OpengraphImage() {
  const accent = '#6b4fb3';
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 64,
          background: '#fbfaf8',
          color: '#1c1a22',
          fontFamily: 'sans-serif',
        }}
      >
        <svg width="260" height="260" viewBox="0 0 100 100" fill="none" stroke={accent} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="50" y1="7" x2="50" y2="16" />
          <circle cx="50" cy="6" r="5" fill={accent} stroke="none" />
          <rect x="20" y="16" width="60" height="62" rx="12" />
          <circle cx="35" cy="42" r="6.5" fill={accent} stroke="none" />
          <circle cx="65" cy="42" r="6.5" fill={accent} stroke="none" />
          <line x1="41" y1="61" x2="59" y2="61" />
          <line x1="34" y1="78" x2="34" y2="88" />
          <line x1="66" y1="78" x2="66" y2="88" />
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: -2 }}>Tulzo</div>
          <div style={{ fontSize: 40, color: '#5d5968', marginTop: 8 }}>Tex, your personal AI assistant</div>
        </div>
      </div>
    ),
    size,
  );
}
