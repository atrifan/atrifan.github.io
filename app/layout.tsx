import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { dark } from '@clerk/themes';
import Script from 'next/script';
import { Providers } from './providers';
import '@/styles/globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://tulzo.vercel.app'),
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
    url: 'https://tulzo.vercel.app',
    siteName: 'Tulzo',
    title: 'Tex by Tulzo - Your Personal AI Assistant',
    description: 'Tex is a sandboxed AI agent with browser automation, domain skills, and multi-channel access. Chrome extension, CLI, or Telegram.',
    images: [
      {
        url: '/tulzo-og.svg',
        width: 1200,
        height: 630,
        alt: 'Tex by Tulzo - Personal AI Assistant',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tex by Tulzo - Your Personal AI Assistant',
    description: 'Tex is a sandboxed AI agent with browser automation, domain skills, and multi-channel access. Chrome extension, CLI, or Telegram.',
    images: ['/tulzo-og.svg'],
  },
  icons: {
    icon: '/tulzo-logo.png',
    apple: '/tulzo-logo.png',
  },
  manifest: '/manifest.json',
  verification: {
    google: 'G-QSNTL3PGRJ',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#667eea',
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
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Google AdSense - account verification only, ads are manually rendered */}
        <meta name="google-adsense-account" content="ca-pub-7299057534028491" />

        {/* Google Analytics - using next/script to avoid hydration mismatch */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-QSNTL3PGRJ"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-QSNTL3PGRJ');
          `}
        </Script>

        {/* Google AdSense - loads the adsbygoogle library for manual ad rendering */}
        <Script
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7299057534028491"
          strategy="afterInteractive"
          crossOrigin="anonymous"
        />

        {/* Preconnect for performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

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

        {/* Extension detection — runs on all pages */}
        <Script id="tulzo-extension-bridge" strategy="afterInteractive">
          {`
            (function() {
              window.__tulzoExtension = { detected: false };
              window.addEventListener("message", function(e) {
                if (e.data && e.data.source === "tex-extension") {
                  window.__tulzoExtension.detected = true;
                  window.__tulzoExtension.lastMessage = e.data;
                  window.dispatchEvent(new CustomEvent("tulzo-extension-detected", { detail: e.data }));
                }
              });
              function ping() { window.postMessage({ source: "tulzo", action: "ping" }, "*"); }
              ping();
              setTimeout(ping, 500);
              setTimeout(ping, 1500);
              setTimeout(ping, 3000);
            })();
          `}
        </Script>
      </head>
      <body suppressHydrationWarning>
        <ClerkProvider
          appearance={{
            baseTheme: dark,
            variables: {
              colorPrimary: '#667eea',
              colorBackground: '#1e293b',
              colorInputBackground: '#0f172a',
              colorText: '#ffffff',
            },
          }}
        >
          <Providers>{children}</Providers>
        </ClerkProvider>

        {/* iubenda - dynamically loaded based on domain */}
        <Script id="iubenda-dynamic" strategy="afterInteractive">
          {`
            (function() {
              var hostname = window.location.hostname;
              console.log('[iubenda] hostname:', hostname);
              if (hostname === 'tulzo.online' || hostname === 'www.tulzo.online' || hostname.endsWith('.tulzo.online')) {
                // Load tulzo.online widget
                console.log('[iubenda] Loading tulzo.online widget');
                var widgetScript = document.createElement('script');
                widgetScript.src = 'https://embeds.iubenda.com/widgets/2569ce59-a2eb-4a6d-8767-523fba42cce4.js';
                document.body.appendChild(widgetScript);
              } else {
                // Set config first for other domains
                var _iub = _iub || [];
                _iub.csConfiguration = {
                  "siteId": 3856498,
                  "cookiePolicyId": 11077306,
                  "lang": "en",
                  "storage": { "useSiteId": true },
                  "banner": {
                    "acceptButtonDisplay": true,
                    "closeButtonDisplay": false,
                    "customizeButtonDisplay": true,
                    "explicitWithdrawal": true,
                    "listPurposes": true,
                    "position": "float-bottom-center",
                    "rejectButtonDisplay": true,
                    "showTitle": false,
                    "backgroundOverlay": true
                  }
                };
                window._iub = _iub;

                // Then load scripts
                var autoblock = document.createElement('script');
                autoblock.src = 'https://cs.iubenda.com/autoblocking/3856498.js';
                document.head.appendChild(autoblock);

                var gpp = document.createElement('script');
                gpp.src = '//cdn.iubenda.com/cs/gpp/stub.js';
                document.head.appendChild(gpp);

                var iubendaCs = document.createElement('script');
                iubendaCs.src = '//cdn.iubenda.com/cs/iubenda_cs.js';
                iubendaCs.async = true;
                document.head.appendChild(iubendaCs);
              }
            })();
          `}
        </Script>
      </body>
    </html>
  );
}

