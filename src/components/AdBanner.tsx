import React, { useEffect, useRef, useState } from 'react';
import { View } from '@adobe/react-spectrum';
import { ADS_CONFIG, getAdClient, shouldShowAds } from '../config/ads.config';

interface AdBannerProps {
  slot: string;
  format?: 'auto' | 'horizontal' | 'vertical';
  style?: React.CSSProperties;
  /** Delay in ms before showing ad - ensures content loads first */
  delay?: number;
  /** Only show ad when this condition is true (e.g., when results are available) */
  showWhen?: boolean;
}

/**
 * Google AdSense Banner Component
 * Matches AdSense's expected code structure:
 * - <ins> element with required data attributes
 * - Push call to initialize the ad
 *
 * AdSense Policy Compliance:
 * - Delays ad loading to ensure content is present (2s default)
 * - Can conditionally show ads only when meaningful content exists
 */
export const AdBanner: React.FC<AdBannerProps> = ({
  slot,
  format = 'auto',
  style = {},
  delay = 2000,
  showWhen = true
}) => {
  const adRef = useRef<HTMLModElement>(null);
  const isAdLoaded = useRef(false);
  const [isReady, setIsReady] = useState(false);

  // Delay ad rendering to ensure page content loads first
  useEffect(() => {
    if (!showWhen) {
      setIsReady(false);
      return;
    }

    const timer = setTimeout(() => {
      setIsReady(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [delay, showWhen]);

  useEffect(() => {
    // Only load ads in production, when enabled, ready, and only once per component
    if (process.env.NODE_ENV !== 'production' || !shouldShowAds() || ADS_CONFIG.testMode || !isReady) {
      return;
    }

    // Prevent double-loading
    if (isAdLoaded.current) {
      return;
    }

    try {
      const adsbygoogle = (window as any).adsbygoogle;
      if (adsbygoogle && adRef.current) {
        adsbygoogle.push({});
        isAdLoaded.current = true;
      }
    } catch (err) {
      console.error('AdSense error:', err);
    }
  }, [slot, isReady]);

  // Don't render if ads are disabled or showWhen condition is false
  if (!shouldShowAds() || !showWhen) {
    return null;
  }

  // Show placeholder in development/test mode
  if (ADS_CONFIG.testMode || process.env.NODE_ENV !== 'production') {
    if (!isReady) return null;
    return (
      <View
        borderRadius="medium"
        marginY="size-200"
        UNSAFE_style={{
          width: '100%',
          maxWidth: '600px',
          margin: '0 auto',
          minHeight: format === 'vertical' ? '250px' : '50px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%)',
          border: '2px dashed rgba(255, 255, 255, 0.2)',
          borderRadius: '12px',
          ...style
        }}
      >
        <div style={{
          textAlign: 'center',
          color: 'rgba(255, 255, 255, 0.4)',
          padding: '0.5rem'
        }}>
          <span style={{ fontSize: '1rem', display: 'block', marginBottom: '0.15rem' }}>📢</span>
          <span style={{ fontSize: '0.7rem' }}>Ad: {slot}</span>
        </div>
      </View>
    );
  }

  // Don't render production ad until ready (content has loaded)
  if (!isReady) {
    return null;
  }

  // Production ad - matches AdSense code structure exactly
  // For horizontal format, constrain height to prevent oversized mobile ads
  const isHorizontal = format === 'horizontal';

  return (
    <View
      marginY="size-200"
      UNSAFE_style={{
        width: '100%',
        maxWidth: '600px',
        margin: '0 auto',
        minHeight: format === 'vertical' ? '250px' : '50px',
        maxHeight: isHorizontal ? '100px' : undefined,
        overflow: 'hidden',
        ...style
      }}
    >
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{
          display: 'block',
          maxHeight: isHorizontal ? '100px' : undefined,
        }}
        data-ad-client={getAdClient()}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive={isHorizontal ? "false" : "true"}
      />
    </View>
  );
};

