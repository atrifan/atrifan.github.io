import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { dark } from '@clerk/themes';
import Script from 'next/script';
import { Providers } from './providers';
import '@/styles/globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://tulzo.vercel.app'),
  title: {
    default: 'Tulzo - AI Workflow Automation & MCP Tools Platform',
    template: '%s | Tulzo',
  },
  description: 'Build AI-powered workflow automations with YAML. Connect to ChatGPT, Claude, and Cursor via MCP. AI chat with RAG knowledge bases. Plus free online tools: calculators, converters & more.',
  keywords: ['workflow automation', 'MCP tools', 'AI automation', 'ChatGPT integration', 'Claude integration', 'Cursor AI', 'AI agents', 'RAG knowledge base', 'AI chat', 'YAML workflows', 'free online tools', 'calculators', 'BMI calculator', 'sleep calculator', 'tip calculator'],
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
    title: 'Tulzo - AI Workflow Automation & MCP Tools Platform',
    description: 'Build AI-powered workflow automations. Connect to ChatGPT, Claude & Cursor via MCP. AI chat with tools & RAG. Plus free online calculators.',
    images: [
      {
        url: '/tulzo-og.svg',
        width: 1200,
        height: 630,
        alt: 'Tulzo - AI Workflow Automation & MCP Tools',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tulzo - AI Workflow Automation & MCP Tools Platform',
    description: 'Build AI-powered workflow automations. Connect to ChatGPT, Claude & Cursor via MCP. AI chat with tools & RAG. Plus free online calculators.',
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

        {/* iubenda Cookie Consent Banner - loaded after page */}
        <Script
          src="https://cs.iubenda.com/autoblocking/3856498.js"
          strategy="afterInteractive"
        />
        <Script
          src="//cdn.iubenda.com/cs/gpp/stub.js"
          strategy="afterInteractive"
        />
        <Script
          src="//cdn.iubenda.com/cs/iubenda_cs.js"
          strategy="afterInteractive"
          async
        />
        <Script id="iubenda-config" strategy="afterInteractive">
          {`
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
          `}
        </Script>
      </body>
    </html>
  );
}

