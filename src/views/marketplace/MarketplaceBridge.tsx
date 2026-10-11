'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { extensionBridge } from '@/src/lib/extension-bridge';
import { buildInstallCommand, installedIds, type InstallTarget } from '@/src/lib/marketplace/install-plan';
import { surfaceUrl } from '@/src/lib/surface-url';

/**
 * The catalog's link to the assistant extension (src/lib/extension-bridge.ts): connection state,
 * which packages are installed on this device (LIST_INSTALLED, MCP_LIST_SERVERS,
 * A2A_LIST_AGENTS), and `install()`, which sends the bridge command for the package's kind
 * (install-plan.ts) and then counts the install with POST /api/marketplace/install.
 *
 * Install needs sign-in (signed out → the hub sign-in page) and the extension (otherwise the
 * "Get the assistant" dialog opens).
 */

export type BridgeStatus = 'checking' | 'connected' | 'disconnected';

interface Notice {
  kind: 'status' | 'error';
  text: string;
}

interface BridgeContextValue {
  status: BridgeStatus;
  installed: Set<string> | null;
  busyId: string | null;
  notice: Notice | null;
  install(pkg: InstallTarget, onCounted?: () => void): Promise<void>;
  needsAssistant: boolean;
  closeNeedsAssistant(): void;
}

const BridgeContext = createContext<BridgeContextValue | null>(null);

/** How long to wait for the extension to answer `discover` before calling it absent. */
const DISCOVER_GRACE_MS = 1500;

export function MarketplaceBridgeProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn } = useAuth();
  const [status, setStatus] = useState<BridgeStatus>('checking');
  const [installed, setInstalled] = useState<Set<string> | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [needsAssistant, setNeedsAssistant] = useState(false);
  const statusRef = useRef<BridgeStatus>('checking');

  const refreshInstalled = useCallback(async () => {
    const safe = async (command: string) => {
      try {
        return await extensionBridge.send<Record<string, unknown>>(command, {});
      } catch {
        return {};
      }
    };
    const [pkgs, mcp, a2a] = await Promise.all([safe('LIST_INSTALLED'), safe('MCP_LIST_SERVERS'), safe('A2A_LIST_AGENTS')]);
    setInstalled(installedIds({ packages: pkgs?.packages, servers: mcp?.servers, agents: a2a?.agents }));
  }, []);

  useEffect(() => {
    const apply = (s: 'connected' | 'disconnected') => {
      statusRef.current = s;
      setStatus(s);
      if (s === 'connected') void refreshInstalled();
    };
    extensionBridge.start();
    const off = extensionBridge.onStateChange(apply);
    if (extensionBridge.state === 'connected') apply('connected');
    const grace = setTimeout(() => {
      if (statusRef.current === 'checking') apply('disconnected');
    }, DISCOVER_GRACE_MS);
    return () => {
      off();
      clearTimeout(grace);
    };
  }, [refreshInstalled]);

  const install = useCallback(
    async (pkg: InstallTarget, onCounted?: () => void) => {
      if (!isSignedIn) {
        const back = typeof window === 'undefined' ? '' : window.location.href;
        window.location.assign(`${surfaceUrl('hub', '/sign-in')}?redirect_url=${encodeURIComponent(back)}`);
        return;
      }
      if (extensionBridge.state !== 'connected' && statusRef.current === 'checking') {
        // The extension may still be answering `discover`; give it the same grace period.
        await new Promise<void>((resolve) => {
          const done = () => {
            off();
            clearTimeout(timer);
            resolve();
          };
          const off = extensionBridge.onStateChange((s) => s === 'connected' && done());
          const timer = setTimeout(done, DISCOVER_GRACE_MS);
        });
      }
      if (extensionBridge.state !== 'connected') {
        setNeedsAssistant(true);
        return;
      }
      const plan = buildInstallCommand(pkg);
      if (!plan.ok) {
        setNotice({ kind: 'error', text: `Install failed: ${plan.error}` });
        return;
      }
      setBusyId(pkg.id);
      setNotice(null);
      try {
        await extensionBridge.send(plan.command, plan.params);
      } catch (e) {
        setNotice({ kind: 'error', text: `Install failed: ${e instanceof Error ? e.message : 'unknown error'}` });
        setBusyId(null);
        return;
      }
      // Count it before reporting success, so "Installed" means the count is in too. Same origin
      // in both URL modes: the marketplace surface serves /api/marketplace/*.
      try {
        const res = await fetch('/api/marketplace/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ package_id: pkg.id }),
          keepalive: true,
        });
        if (res.ok) onCounted?.();
      } catch {
        // The package is installed; only the counter missed it.
      }
      setInstalled((prev) => new Set([...(prev ?? []), pkg.id]));
      setNotice({ kind: 'status', text: `Installed ${pkg.name}` });
      setBusyId(null);
    },
    [isSignedIn],
  );

  return (
    <BridgeContext.Provider
      value={{ status, installed, busyId, notice, install, needsAssistant, closeNeedsAssistant: () => setNeedsAssistant(false) }}
    >
      {children}
    </BridgeContext.Provider>
  );
}

export function useMarketplaceBridge(): BridgeContextValue {
  const ctx = useContext(BridgeContext);
  if (!ctx) throw new Error('useMarketplaceBridge needs MarketplaceBridgeProvider');
  return ctx;
}
