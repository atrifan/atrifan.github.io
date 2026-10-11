/**
 * Validation and normalisation of a publish request, shared by the HTTP route, the MCP tool and
 * the publisher page (through the route). Pure.
 */
import { installMode, isCategory, isPackageKind, normalizeTags, PACKAGE_KINDS, type CategorySlug, type PackageKind } from './kinds';
import { provenanceOf, type Provenance } from './wire-format';

export interface NormalizedPublish {
  id: string;
  name: string;
  description: string;
  type: PackageKind;
  version: string;
  config_json: Record<string, unknown> | null;
  blob_url: string;
  tags: string[];
  category: CategorySlug | null;
  long_description: string | null;
  provenance: Provenance | null;
  files_hash: string | null;
}

export type PublishValidation = { ok: true; value: NormalizedPublish } | { ok: false; error: string };

/** Ids that collide with marketplace pages (`/marketplace/publish`, `/marketplace/admin`). */
const RESERVED_IDS = ['publish', 'admin'];
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const MAX_NAME = 80;
const MAX_DESCRIPTION = 280;
const MAX_LONG_DESCRIPTION = 20_000;

function trimmed(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function isHttpUrl(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function mcpConfigError(cfg: { transport?: unknown; url?: unknown; command?: unknown } | null): string | null {
  if (!cfg) return 'MCP type requires config_json';
  if (typeof cfg.transport !== 'string' || !['http', 'sse', 'stdio'].includes(cfg.transport)) {
    return 'config_json must include transport (http, sse, or stdio)';
  }
  if (cfg.transport !== 'stdio' && !cfg.url) return 'config_json must include url for http/sse transport';
  if (cfg.transport === 'stdio' && !cfg.command) return 'config_json must include command for stdio transport';
  return null;
}

export function validatePublishInput(input: Record<string, unknown>): PublishValidation {
  const id = trimmed(input.id);
  const name = trimmed(input.name);
  const type = input.type;
  if (!id || !name || !type) return { ok: false, error: 'Missing required fields: id, name, type' };
  if (!isPackageKind(type)) {
    return { ok: false, error: `Invalid type. Must be one of: ${PACKAGE_KINDS.join(', ')}` };
  }
  if (!ID_PATTERN.test(id)) {
    return { ok: false, error: 'Package id may only use letters, numbers, dots, dashes and underscores' };
  }
  if (RESERVED_IDS.includes(id.toLowerCase())) return { ok: false, error: 'That package id is reserved' };

  const version = trimmed(input.version) || '1.0.0';
  if (!VERSION_PATTERN.test(version)) return { ok: false, error: 'Version must look like 1.0.0' };
  if (name.length > MAX_NAME) return { ok: false, error: `Name must be at most ${MAX_NAME} characters` };
  const description = trimmed(input.description);
  if (description.length > MAX_DESCRIPTION) {
    return { ok: false, error: `Short description must be at most ${MAX_DESCRIPTION} characters` };
  }
  const longDescription = trimmed(input.long_description);
  if (longDescription.length > MAX_LONG_DESCRIPTION) {
    return { ok: false, error: `Full description must be at most ${MAX_LONG_DESCRIPTION} characters` };
  }
  const category = trimmed(input.category);
  if (category && !isCategory(category)) return { ok: false, error: 'Unknown category' };

  const rawConfig =
    input.config_json && typeof input.config_json === 'object' && !Array.isArray(input.config_json)
      ? (input.config_json as Record<string, unknown>)
      : null;
  const mode = installMode(type);
  let configJson: Record<string, unknown> | null = null;
  const blobUrl = trimmed(input.blob_url);
  if (mode === 'mcp') {
    const error = mcpConfigError(rawConfig);
    if (error) return { ok: false, error };
    configJson = rawConfig;
  } else if (mode === 'a2a') {
    if (!isHttpUrl(rawConfig?.card_url)) {
      return { ok: false, error: 'A2A agents need config_json.card_url (an http or https URL)' };
    }
    configJson = rawConfig;
  } else if (!blobUrl) {
    return { ok: false, error: 'Missing package archive (blob_url)' };
  }

  return {
    ok: true,
    value: {
      id,
      name,
      description,
      type,
      version,
      config_json: configJson,
      blob_url: mode === 'archive' ? blobUrl : '',
      tags: normalizeTags(input.tags),
      category: category ? (category as CategorySlug) : null,
      long_description: longDescription || null,
      provenance: provenanceOf(input.provenance) ?? null,
      files_hash: trimmed(input.files_hash) || null,
    },
  };
}
