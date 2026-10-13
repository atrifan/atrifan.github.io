import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Providers } from './providers';
import { requestSurface } from '@/src/lib/request-surface';
import { absoluteSurfaceUrl } from '@/src/lib/site-url';
import { seoEnv } from '@/src/lib/seo';
import type { Surface } from '@/src/lib/surface-url';
import { noFlashThemeScript } from '@/src/lib/theme';
import { iubendaConfig } from '@/src/lib/consent';
import { ConsentScripts } from '@/src/components/consent/ConsentScripts';
import '@/styles/tokens.css';
import '@/styles/globals.css';

/** This request's site root: the surface's own host on a single-surface host, the hub in path mode. */
function siteUrlFor(surface: Surface | null): string {
  return absoluteSurfaceUrl(surface ?? 'hub', '/', seoEnv(surface));
}

/**
 * iubenda cookie banner: a slim bottom bar naming this surface's domain (src/lib/consent.ts).
 * Every page view with a stored preference (and every new choice) publishes it on
 * window.__tulzoConsent + a `tulzo:consent` event, which ConsentScripts and AdBanner read.
 */
/** NEXT_PUBLIC_ROOT_DOMAIN without scheme or port (consent shared by every surface), or ''. */
function rootDomainHost(): string {
  const root = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? '').trim().replace(/^https?:\/\//, '').replace(/[:/].*$/, '');
  return root;
}

function iubendaBootScript(host: string): string {
  const config = JSON.stringify(iubendaConfig({ siteHost: host, consentDomain: rootDomainHost() })).replace(/</g, '\\u003c');
  return `
    (function () {
      var publish = function (preference) {
        window.__tulzoConsent = preference;
        window.dispatchEvent(new CustomEvent('tulzo:consent', { detail: preference }));
      };
      var cfg = ${config};
      cfg.callback = { onPreferenceExpressed: publish };
      window._iub = window._iub || [];
      window._iub.csConfiguration = cfg;
      var gpp = document.createElement('script');
      gpp.src = 'https://cdn.iubenda.com/cs/gpp/stub.js';
      document.head.appendChild(gpp);
      var cs = document.createElement('script');
      cs.src = 'https://cdn.iubenda.com/cs/iubenda_cs.js';
      cs.async = true;
      cs.charset = 'UTF-8';
      document.head.appendChild(cs);
    })();
  `;
}

const baseMetadata: Metadata = {
  title: {
    default: 'Tex by Tulzo - Your Personal AI Assistant',
    template: '%s | Tex by Tulzo',
  },
  description: 'Tex is a sandboxed AI agent with browser automation, domain skills, and multi-channel access. Runs isolated on your machine — interact via Chrome extension, CLI, or Telegram.',
  keywords: ['Tex', 'AI assistant', 'browser automation', 'Playwright', 'Chrome extension', 'Telegram bot', 'AI agent', 'sandboxed AI', 'task automation'],
  authors: [{ name: 'Tulzo' }],
  creator: 'Tulzo',
  publisher: 'Tulzo',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'Tulzo',
    title: 'Tex by Tulzo - Your Personal AI Assistant',
    description: 'Tex is a sandboxed AI agent with browser automation, domain skills, and multi-channel access. Chrome extension, CLI, or Telegram.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tex by Tulzo - Your Personal AI Assistant',
    description: 'Tex is a sandboxed AI agent with browser automation, domain skills, and multi-channel access. Chrome extension, CLI, or Telegram.',
  },
  // Icons are Next file conventions, all generated from TulzoMark (npm run generate:icons):
  // app/favicon.ico, app/icon.svg and app/apple-icon.png; the manifest lists public/icon-*.png.
  manifest: '/manifest.json',
};

/** Per request: metadataBase and og:url follow the host's surface (x-tulzo-surface). */
export function generateMetadata(): Metadata {
  const siteUrl = siteUrlFor(requestSurface());
  return { ...baseMetadata, metadataBase: new URL(siteUrl), openGraph: { ...baseMetadata.openGraph, url: siteUrl } };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfaf8' },
    { media: '(prefers-color-scheme: dark)', color: '#161616' },
  ],
  // iOS notch/safe area handling
  viewportFit: 'cover',
  // Android keyboard behavior - resizes content instead of panning
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const surface = requestSurface();
  const siteHost = new URL(siteUrlFor(surface)).host;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Sets data-theme before first paint (no flash of the wrong theme). */}
        <script dangerouslySetInnerHTML={{ __html: noFlashThemeScript() }} />
        {/* Google AdSense - account verification only, ads are manually rendered */}
        <meta name="google-adsense-account" content="ca-pub-7299057534028491" />

        {/* Suppress hydration warnings from browser extensions */}
        <Script id="extension-cleanup" strategy="beforeInteractive">
          {`
            if (typeof window !== 'undefined') {
              document.addEventListener('DOMContentLoaded', function() {
                var extensionElements = document.querySelectorAll('[data-extension], [class*="extension"]');
                extensionElements.forEach(function(el) { el.remove(); });
              });
            }
          `}
        </Script>

        {/* Extension bridge — starts discovery on all pages */}
        <Script id="tulzo-extension-bridge" strategy="afterInteractive">
          {`
            (function() {
              // Lazy-start the bridge singleton when the module loads client-side
              // The bridge itself is in src/lib/extension-bridge.ts and started by components that need it
              // This script just ensures early discovery messages are sent even before React hydrates
              window.__tulzoExtension = { detected: false };
              window.addEventListener("message", function(e) {
                if (e.data && e.data.source === "tex-extension") {
                  window.__tulzoExtension.detected = true;
                  window.__tulzoExtension.data = e.data;
                  window.dispatchEvent(new CustomEvent("tulzo-extension-detected", { detail: e.data }));
                }
              });
              function discover() { window.postMessage({ source: "tulzo", action: "discover" }, "*"); }
              discover();
              setTimeout(discover, 1000);
              setTimeout(discover, 3000);
            })();
          `}
        </Script>
      </head>
      <body suppressHydrationWarning>
        <Providers surface={surface}>{children}</Providers>

        {/* Consent first: GA and AdSense load only after the visitor agrees (src/components/consent). */}
        <ConsentScripts />
        <Script id="iubenda-cs" strategy="afterInteractive">
          {iubendaBootScript(siteHost)}
        </Script>
      </body>
    </html>
  );
}

