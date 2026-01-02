'use client';

import { useState, useRef, useCallback } from 'react';
import html2canvas from 'html2canvas';

interface ShareResultsProps {
  /** Ref to the element to capture */
  targetRef: React.RefObject<HTMLElement>;
  /** Title for sharing */
  title: string;
  /** Description/text for sharing */
  text?: string;
  /** URL to share (defaults to current page) */
  url?: string;
}

/**
 * Share button that captures a screenshot and allows sharing to various platforms
 * Works without server storage by using:
 * - Web Share API (native sharing with image file)
 * - Clipboard API (copy image)
 * - Social links (share URL)
 */
export const ShareResults: React.FC<ShareResultsProps> = ({
  targetRef,
  title,
  text,
  url,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '');

  // Capture screenshot
  const captureScreenshot = useCallback(async (): Promise<Blob | null> => {
    if (!targetRef.current) return null;
    
    setIsCapturing(true);
    setError(null);
    
    try {
      const canvas = await html2canvas(targetRef.current, {
        backgroundColor: '#1e293b',
        scale: 2, // Higher quality
        logging: false,
        useCORS: true,
      });
      
      canvasRef.current = canvas;
      
      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          resolve(blob);
        }, 'image/png');
      });
    } catch (err) {
      console.error('Screenshot failed:', err);
      setError('Failed to capture screenshot');
      return null;
    } finally {
      setIsCapturing(false);
    }
  }, [targetRef]);

  // Native share (mobile/supported browsers)
  const handleNativeShare = async () => {
    const blob = await captureScreenshot();
    if (!blob) return;

    const file = new File([blob], `${title.toLowerCase().replace(/\s+/g, '-')}-results.png`, {
      type: 'image/png',
    });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          title,
          text: text || title,
          files: [file],
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Share failed:', err);
        }
      }
    } else {
      // Fallback: download the image
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.toLowerCase().replace(/\s+/g, '-')}-results.png`;
      a.click();
      URL.revokeObjectURL(url);
    }
    setIsOpen(false);
  };

  // Copy image to clipboard
  const handleCopyImage = async () => {
    const blob = await captureScreenshot();
    if (!blob) return;

    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
      setError('Failed to copy image');
    }
  };

  // Download image
  const handleDownload = async () => {
    const blob = await captureScreenshot();
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s+/g, '-')}-results.png`;
    a.click();
    URL.revokeObjectURL(url);
    setIsOpen(false);
  };

  // Social share (URL only - platforms don't support direct image upload)
  const handleSocialShare = (platform: 'facebook' | 'twitter' | 'linkedin') => {
    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedText = encodeURIComponent(text || title);
    
    const urls = {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      twitter: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    };
    
    window.open(urls[platform], '_blank', 'width=600,height=400');
    setIsOpen(false);
  };

  const buttonStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1rem',
    background: 'rgba(255,255,255,0.05)',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '0.9rem',
    cursor: 'pointer',
    width: '100%',
    transition: 'background 0.2s',
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Share Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isCapturing}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.6rem 1.25rem',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          border: 'none',
          borderRadius: '10px',
          color: '#fff',
          fontWeight: 600,
          fontSize: '0.9rem',
          cursor: isCapturing ? 'wait' : 'pointer',
          opacity: isCapturing ? 0.7 : 1,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        {isCapturing ? 'Capturing...' : 'Share'}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setIsOpen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999,
            }}
          />
          
          {/* Menu */}
          <div style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '0.5rem',
            background: '#1e293b',
            borderRadius: '12px',
            padding: '0.5rem',
            minWidth: '200px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
            border: '1px solid rgba(255,255,255,0.1)',
            zIndex: 1000,
          }}>
            {error && (
              <p style={{ color: '#ef4444', fontSize: '0.8rem', padding: '0.5rem', margin: 0 }}>
                {error}
              </p>
            )}
            
            {/* Native Share / Download */}
            <button onClick={handleNativeShare} style={buttonStyle}>
              <span>📤</span> Share / Save Image
            </button>
            
            {/* Copy Image */}
            <button onClick={handleCopyImage} style={buttonStyle}>
              <span>{copied ? '✓' : '📋'}</span> {copied ? 'Copied!' : 'Copy Image'}
            </button>
            
            {/* Download */}
            <button onClick={handleDownload} style={buttonStyle}>
              <span>⬇️</span> Download Image
            </button>
            
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0.5rem 0' }} />
            
            {/* Social Share (URL) */}
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', padding: '0.25rem 0.5rem', margin: 0 }}>
              Share link:
            </p>
            
            <button onClick={() => handleSocialShare('twitter')} style={buttonStyle}>
              <span>𝕏</span> Share on X
            </button>
            
            <button onClick={() => handleSocialShare('facebook')} style={buttonStyle}>
              <span>📘</span> Share on Facebook
            </button>
            
            <button onClick={() => handleSocialShare('linkedin')} style={buttonStyle}>
              <span>💼</span> Share on LinkedIn
            </button>
          </div>
        </>
      )}
    </div>
  );
};

