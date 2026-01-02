import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { dark } from '@clerk/themes';
import { Providers } from './providers';
import '@/styles/globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://tulzo.vercel.app'),
  title: {
    default: 'Tulzo - Free Online Tools & Calculators',
    template: '%s | Tulzo',
  },
  description: 'Free online tools: IQ test, cat or dog person quiz, sleep calculator, tip calculator, coin flip, wheel spinner, age calculator, timezone converter & more. 100% free, no signup required.',
  keywords: ['free online tools', 'calculators', 'IQ test', 'cat or dog person quiz', 'sleep calculator', 'tip calculator', 'coin flip', 'random wheel', 'age calculator', 'timezone converter'],
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
    title: 'Tulzo - Free Online Tools & Calculators',
    description: 'Free online tools: IQ test, cat or dog person quiz, sleep calculator, tip calculator, coin flip, wheel spinner & more.',
    images: [
      {
        url: '/tulzo-og.svg',
        width: 1200,
        height: 630,
        alt: 'Tulzo - Free Online Tools',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tulzo - Free Online Tools & Calculators',
    description: 'Free online tools: IQ test, cat or dog person quiz, sleep calculator, tip calculator, coin flip, wheel spinner & more.',
    images: ['/tulzo-og.svg'],
  },
  icons: {
    icon: '/tulzo-logo.svg',
    apple: '/tulzo-logo.svg',
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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Google AdSense */}
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7299057534028491"
          crossOrigin="anonymous"
        />
        <meta name="google-adsense-account" content="ca-pub-7299057534028491" />

        {/* Google Analytics */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-QSNTL3PGRJ" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-QSNTL3PGRJ');
            `,
          }}
        />

        {/* iubenda Cookie Consent Banner */}
        <script
          type="text/javascript"
          src="https://embeds.iubenda.com/widgets/2a8c5c2b-e4ed-46ab-bf87-cf7b1fa09a94.js"
        />

        {/* Preconnect for performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

        {/* Suppress hydration warnings from browser extensions */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Remove any extension-injected elements before React hydrates
              if (typeof window !== 'undefined') {
                document.addEventListener('DOMContentLoaded', function() {
                  // Clean up extension injections
                  const extensionElements = document.querySelectorAll('[data-extension], [class*="extension"]');
                  extensionElements.forEach(el => el.remove());
                });
              }
            `,
          }}
        />
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
      </body>
    </html>
  );
}

