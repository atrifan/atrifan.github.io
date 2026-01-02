import React, { useEffect, useRef } from 'react';
import { View } from '@adobe/react-spectrum';
import { ADS_CONFIG, getAdClient, shouldShowAds } from '../config/ads.config';

interface AdBannerProps {
  slot: string;
  format?: 'auto' | 'horizontal' | 'vertical';
  style?: React.CSSProperties;
}

/**
 * Google AdSense Banner Component
 * Matches AdSense's expected code structure:
 * - <ins> element with required data attributes
 * - Push call to initialize the ad
 */
export const AdBanner: React.FC<AdBannerProps> = ({
  slot,
  format = 'auto',
  style = {}
}) => {
  const adRef = useRef<HTMLModElement>(null);
  const isAdLoaded = useRef(false);

  useEffect(() => {
    // Only load ads in production, when enabled, and only once per component
    if (!import.meta.env.PROD || !shouldShowAds() || ADS_CONFIG.testMode) {
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
  }, [slot]);

  // Don't render if ads are disabled
  if (!shouldShowAds()) {
    return null;
  }

  // Show placeholder in development/test mode
  if (ADS_CONFIG.testMode || !import.meta.env.PROD) {
    return (
      <View
        borderRadius="medium"
        marginY="size-200"
        UNSAFE_style={{
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

  // Production ad - matches AdSense code structure exactly
  return (
    <View
      marginY="size-200"
      UNSAFE_style={{
        minHeight: format === 'vertical' ? '250px' : '50px',
        overflow: 'hidden',
        ...style
      }}
    >
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={getAdClient()}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </View>
  );
};

