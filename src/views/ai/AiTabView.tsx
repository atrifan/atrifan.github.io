'use client';

import { A2aTab } from './A2aTab';
import { AllowlistTab } from './AllowlistTab';
import { DevicesTab } from './DevicesTab';
import { DocsTab } from './DocsTab';
import { FleetTab } from './FleetTab';
import { LogsTab } from './LogsTab';
import { McpTab } from './McpTab';
import { NotificationsTab } from './NotificationsTab';
import { OverviewTab } from './OverviewTab';
import { PackagesTab } from './PackagesTab';
import { ProvidersTab } from './ProvidersTab';
import { SchedulesTab } from './SchedulesTab';
import { SecretsTab } from './SecretsTab';
import { UsageTab } from './UsageTab';

const VIEWS: Record<string, () => JSX.Element> = {
  '': OverviewTab,
  devices: DevicesTab,
  usage: UsageTab,
  logs: LogsTab,
  packages: PackagesTab,
  mcp: McpTab,
  schedules: SchedulesTab,
  secrets: SecretsTab,
  allowlist: AllowlistTab,
  a2a: A2aTab,
  fleet: FleetTab,
  notifications: NotificationsTab,
  providers: ProvidersTab,
  docs: DocsTab,
};

/** The section for a slug from src/lib/ai-tabs.ts (the route has already 404'd unknown ones). */
export function AiTabView({ slug }: { slug: string }) {
  const View = VIEWS[slug] ?? OverviewTab;
  return <View />;
}
