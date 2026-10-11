'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { SignedIn, SignedOut, UserButton, useAuth } from '@clerk/nextjs';
import { TulzoMark } from '../brand/TulzoMark';
import { SURFACE_ICON } from '../brand/SurfaceIcons';
import { ThemeToggle } from '../theme/ThemeToggle';
import { AdBanner } from '../AdBanner';
import { activeSurface } from '@/src/lib/surface-routing';
import { footerAdAllowed } from '@/src/lib/ads-policy';
import { surfaceUrl, type Surface } from '@/src/lib/surface-url';

/**
 * Shared shell for every surface: skip link, wordmark, primary nav
 * (AI · Marketplace · Gigs · Chat via surfaceUrl, the active one marked with
 * aria-current), theme switch, sign-in or the Clerk user menu (with Profile and
 * Credits on the hub), and a footer with at most one small ad.
 *
 * Below 960px the nav and tools fold into a menu panel behind a "Menu" button:
 * focus moves into the panel, Tab is trapped inside it, Escape closes it.
 */

const NAV: { surface: Exclude<Surface, 'hub'>; label: string }[] = [
  { surface: 'ai', label: 'AI' },
  { surface: 'marketplace', label: 'Marketplace' },
  { surface: 'gigs', label: 'Gigs' },
  { surface: 'chat', label: 'Chat' },
];

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
const MOBILE_QUERY = '(max-width: 959px)';

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
      {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
    </svg>
  );
}

const ProfileIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);
const CreditsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v10M9 9.5h4.5a2 2 0 0 1 0 4H10a2 2 0 0 0 0 4h5" />
  </svg>
);

export function AppShell({ surface, children }: { surface: Surface | null; children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  const current = activeSurface({ surface, pathname });
  const { isSignedIn } = useAuth();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  }, []);

  // Close the menu on navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Focus into the panel on open; trap Tab; Escape closes.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const items = () =>
      [buttonRef.current, ...Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter(
        (el): el is HTMLElement => !!el && el.offsetParent !== null,
      );
    items()[1]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(true);
        return;
      }
      if (e.key !== 'Tab') return;
      const list = items();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = !!active && list.includes(active);
      if (e.shiftKey && (active === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    // Leaving the mobile layout (rotate/resize) closes the menu.
    const mq = window.matchMedia(MOBILE_QUERY);
    const onMq = () => {
      if (!mq.matches) close(false);
    };
    mq.addEventListener('change', onMq);
    return () => {
      document.removeEventListener('keydown', onKey);
      mq.removeEventListener('change', onMq);
    };
  }, [open, close]);

  const showAd = isSignedIn !== true && footerAdAllowed({ surface: current, pathname, signedIn: false });
  const year = new Date().getFullYear();

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="shell-header">
        <div className="shell-bar container">
          <a href={surfaceUrl('hub', '/')} className="wordmark">
            <TulzoMark size={28} className="wordmark-mark" />
            <span>Tulzo</span>
          </a>

          <button
            ref={buttonRef}
            type="button"
            className="menu-button"
            aria-expanded={open}
            aria-controls="site-menu"
            onClick={() => setOpen((o) => !o)}
          >
            <MenuIcon open={open} />
            <span className="visually-hidden">Menu</span>
          </button>

          <div id="site-menu" ref={panelRef} className="shell-panel" data-open={open ? 'true' : undefined}>
            <nav aria-label="Primary" className="primary-nav">
              <ul role="list">
                {NAV.map(({ surface: s, label }) => {
                  const Icon = SURFACE_ICON[s];
                  const isCurrent = current === s;
                  return (
                    <li key={s}>
                      <a href={surfaceUrl(s, '/')} className="nav-link" aria-current={isCurrent ? 'page' : undefined}>
                        <Icon size={24} />
                        <span>{label}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="shell-tools">
              <ThemeToggle />
              <SignedOut>
                <a href={surfaceUrl('hub', '/sign-in')} className="btn btn-primary btn-sm">
                  Sign in
                </a>
              </SignedOut>
              <SignedIn>
                <div className="user-button">
                  <UserButton>
                    <UserButton.MenuItems>
                      <UserButton.Link label="Profile" labelIcon={<ProfileIcon />} href={surfaceUrl('hub', '/profile')} />
                      <UserButton.Link label="Credits" labelIcon={<CreditsIcon />} href={surfaceUrl('hub', '/credits')} />
                    </UserButton.MenuItems>
                  </UserButton>
                </div>
              </SignedIn>
            </div>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="shell-main">
        {children}
      </main>

      <footer className="shell-footer">
        <div className="container footer-inner">
          {showAd && <AdBanner />}
          <nav aria-label="Legal" className="footer-links">
            <a href="https://www.iubenda.com/privacy-policy/11077306" className="iubenda-noiframe">
              Privacy
            </a>
            <a href="https://www.iubenda.com/privacy-policy/11077306/cookie-policy" className="iubenda-noiframe">
              Cookies
            </a>
            <a href="https://www.iubenda.com/terms-and-conditions/11077306" className="iubenda-noiframe">
              Terms
            </a>
            <a href={surfaceUrl('hub', '/pricing')}>Pricing</a>
          </nav>
          <p className="footer-copy">© {year} Tulzo</p>
        </div>
      </footer>
    </div>
  );
}
