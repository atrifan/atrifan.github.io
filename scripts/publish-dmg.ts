/**
 * Publish a DMG (or any installer artifact) to Vercel Blob under downloads/,
 * so the control panel and public download page can serve it.
 *
 * Usage:
 *   npm run publish:dmg -- <path-to-dmg> [remote-name]
 *   npm run publish:dmg -- ~/.claude/skills/playwright-browser-automation/installer/out/HoriaAssistant-0.1.1-arm64.dmg
 *
 * Requires BLOB_READ_WRITE_TOKEN in the environment (.env.local is loaded).
 * Prints the public URL on success.
 */
import { config as loadEnv } from 'dotenv';
import { put } from '@vercel/blob';
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';

loadEnv({ path: '.env.local' });

async function main() {
  const [, , srcPath, remoteNameArg] = process.argv;
  if (!srcPath) {
    console.error('Usage: npm run publish:dmg -- <path-to-dmg> [remote-name]');
    process.exit(1);
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.error('Missing BLOB_READ_WRITE_TOKEN in environment (.env.local).');
    process.exit(1);
  }

  const info = await stat(srcPath).catch(() => null);
  if (!info || !info.isFile()) {
    console.error(`File not found: ${srcPath}`);
    process.exit(1);
  }

  // If a remote name is given, use it verbatim as the blob key (so it can match
  // an existing public URL exactly). With no name, default under downloads/.
  const key = remoteNameArg || `downloads/${basename(srcPath)}`;
  const sizeMb = (info.size / 1024 / 1024).toFixed(1);
  console.log(`Uploading ${srcPath} (${sizeMb} MB) → blob:${key} ...`);

  const data = await readFile(srcPath);
  const blob = await put(key, data, {
    access: 'public',
    contentType: srcPath.endsWith('.dmg') ? 'application/x-apple-diskimage' : 'application/octet-stream',
    addRandomSuffix: false,
    token,
    allowOverwrite: true,
  });

  console.log('Uploaded.');
  console.log('Public URL:', blob.url);
}

main().catch((e) => {
  console.error('Publish failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
