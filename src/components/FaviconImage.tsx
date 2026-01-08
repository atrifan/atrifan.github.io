'use client';

import { useState, useEffect, CSSProperties } from 'react';

interface FaviconImageProps {
  /** Primary icon URL to try first */
  iconUrl?: string | null;
  /** Base URL of the service (used to try favicon fallbacks) */
  baseUrl?: string | null;
  /** Alt text for the image */
  alt?: string;
  /** Size of the icon (width and height) */
  size?: number;
  /** Border radius */
  borderRadius?: number;
  /** Fallback emoji to show if no icon loads */
  fallbackEmoji?: string;
  /** Fallback background color */
  fallbackBgColor?: string;
  /** Additional styles */
  style?: CSSProperties;
}

/**
 * Extracts the base URL (origin) from a full URL
 */
function getBaseUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * FaviconImage component that tries multiple icon sources:
 * 1. Primary iconUrl if provided
 * 2. /favicon.png from base URL
 * 3. /favicon.svg from base URL
 * 4. /favicon.ico from base URL
 * 5. Falls back to emoji
 */
export function FaviconImage({
  iconUrl,
  baseUrl,
  alt = '',
  size = 32,
  borderRadius = 6,
  fallbackEmoji = '🔧',
  fallbackBgColor = 'rgba(255, 255, 255, 0.1)',
  style,
}: FaviconImageProps) {
  const [currentSrc, setCurrentSrc] = useState<string | null>(null);
  const [fallbackIndex, setFallbackIndex] = useState(0);
  const [showFallback, setShowFallback] = useState(false);

  // Build list of URLs to try
  const urlsToTry: string[] = [];
  
  if (iconUrl) {
    urlsToTry.push(iconUrl);
  }
  
  const origin = baseUrl ? getBaseUrl(baseUrl) : null;
  if (origin) {
    urlsToTry.push(`${origin}/favicon.png`);
    urlsToTry.push(`${origin}/favicon.svg`);
    urlsToTry.push(`${origin}/favicon.ico`);
  }

  useEffect(() => {
    if (urlsToTry.length === 0) {
      setShowFallback(true);
      return;
    }

    setCurrentSrc(urlsToTry[0]);
    setFallbackIndex(0);
    setShowFallback(false);
  }, [iconUrl, baseUrl]);

  const handleError = () => {
    const nextIndex = fallbackIndex + 1;
    if (nextIndex < urlsToTry.length) {
      setFallbackIndex(nextIndex);
      setCurrentSrc(urlsToTry[nextIndex]);
    } else {
      setShowFallback(true);
    }
  };

  const containerStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...style,
  };

  if (showFallback || !currentSrc) {
    return (
      <div
        style={{
          ...containerStyle,
          background: fallbackBgColor,
          fontSize: size * 0.5,
        }}
      >
        {fallbackEmoji}
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      style={{
        ...containerStyle,
        objectFit: 'cover',
      }}
      onError={handleError}
    />
  );
}

