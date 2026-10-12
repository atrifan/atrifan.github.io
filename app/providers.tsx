'use client';

import { Suspense } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { dark } from '@clerk/themes';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { Analytics } from '@/src/components/Analytics';
import { AppShell } from '@/src/components/shell/AppShell';
import { ThemeProvider, useTheme } from '@/src/components/theme/ThemeProvider';
import { surfaceUrl, type Surface } from '@/src/lib/surface-url';
import type { Scheme } from '@/src/lib/theme';

interface ProvidersProps {
  /** TULZO_SURFACE of this deploy, resolved on the server (null = path-prefix mode). */
  surface: Surface | null;
  children: React.ReactNode;
}

/** Clerk styling that follows the resolved theme and the design tokens. */
function clerkAppearance(scheme: Scheme) {
  return {
    baseTheme: scheme === 'dark' ? dark : undefined,
    variables:
      scheme === 'dark'
        ? { colorPrimary: '#b9a3e6', colorTextOnPrimaryBackground: '#17141f', colorBackground: '#1f1f1f', colorInputBackground: '#161616', colorText: '#ececec' }
        : { colorPrimary: '#6b4fb3', colorTextOnPrimaryBackground: '#ffffff', colorBackground: '#ffffff', colorInputBackground: '#ffffff', colorText: '#1c1a22' },
    elements: { card: { boxShadow: 'none', border: '1px solid var(--color-border)' } },
    // The shell header already carries the Tulzo mark. Clerk's own logo is a link to the home
    // page whose only content is an <img> that renders after the image loads, so until then axe
    // sees a link without a name (the /sign-in link-name flake).
    layout: { logoPlacement: 'none' as const },
  };
}

function ThemedProviders({ surface, children }: ProvidersProps) {
  const { scheme } = useTheme();
  return (
    <ClerkProvider
      appearance={clerkAppearance(scheme)}
      signInUrl={surfaceUrl('hub', '/sign-in')}
      signUpUrl={surfaceUrl('hub', '/sign-up')}
    >
      <Provider theme={defaultTheme} colorScheme={scheme} UNSAFE_style={{ background: 'transparent' }} UNSAFE_className="spectrum-root">
        <Suspense fallback={null}>
          <Analytics />
        </Suspense>
        <AppShell surface={surface}>{children}</AppShell>
      </Provider>
    </ClerkProvider>
  );
}

export function Providers(props: ProvidersProps) {
  return (
    <ThemeProvider>
      <ThemedProviders {...props} />
    </ThemeProvider>
  );
}
