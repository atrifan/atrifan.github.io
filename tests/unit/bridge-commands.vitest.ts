import { describe, expect, it } from 'vitest';
import {
  BRIDGE_COMMANDS,
  activationChoice,
  buildA2aAdd,
  buildA2aPreview,
  buildAllowSite,
  buildMcpAdd,
  buildMcpDiscover,
  buildScheduleAdd,
  buildSecretAdd,
  buildSecretUpdate,
  buildUsageBreakdown,
  clientAuthParam,
  cronFieldCount,
  isHttpUrl,
  missingFields,
  normalizeHost,
  request,
  unknownFields,
  type Built,
} from '@/src/lib/bridge-commands';

const req = (b: Built) => {
  if (!b.ok) throw new Error(`expected ok, got ${b.error}`);
  return b.request;
};
const err = (b: Built) => (b.ok ? `ok:${b.request.command}` : b.error);

describe('command table', () => {
  it('does not list NOTIFICATION_TEST (the extension does not forward it)', () => {
    expect(Object.keys(BRIDGE_COMMANDS)).not.toContain('NOTIFICATION_TEST');
  });

  it('every spec has disjoint required and optional fields', () => {
    for (const [name, s] of Object.entries(BRIDGE_COMMANDS)) {
      const overlap = s.required.filter((f) => (s.optional as readonly string[]).includes(f));
      expect(overlap, name).toEqual([]);
    }
  });

  it('missingFields treats undefined and "" as missing, null as present', () => {
    expect(missingFields('SECRETS_ADD', { name: 'A' })).toEqual(['value']);
    expect(missingFields('SECRETS_ADD', { name: '', value: 'x' })).toEqual(['name']);
    expect(missingFields('SKILL_SET_ACTIVATION', { id: 's', choice: null })).toEqual([]);
    expect(missingFields('GET_USAGE', {})).toEqual([]);
  });

  it('unknownFields reports params the handler never reads', () => {
    expect(unknownFields('SECRETS_REMOVE', { name: 'A', value: 'x' })).toEqual(['value']);
    expect(unknownFields('SECRETS_UPDATE', { name: 'A', value: 'x', description: '' })).toEqual([]);
  });

  it('request() refuses missing and unknown fields', () => {
    expect(() => request('WHITELIST_ADD', {})).toThrow('WHITELIST_ADD needs host');
    expect(() => request('LIST_FLEET', { x: 1 })).toThrow('LIST_FLEET does not read x');
    expect(request('MCP_RECONNECT')).toEqual({ command: 'MCP_RECONNECT', params: {} });
    expect(request('MCP_RECONNECT', { serverId: 'gh' })).toEqual({ command: 'MCP_RECONNECT', params: { serverId: 'gh' } });
  });
});

describe('validation helpers', () => {
  it('isHttpUrl accepts http(s) URLs only', () => {
    expect(isHttpUrl('https://a.example/mcp')).toBe(true);
    expect(isHttpUrl('  HTTP://a.example ')).toBe(true);
    expect(isHttpUrl('ftp://a.example')).toBe(false);
    expect(isHttpUrl('https://')).toBe(false);
    expect(isHttpUrl('see https://a.example')).toBe(false);
    expect(isHttpUrl('https://a b')).toBe(false);
  });

  it('normalizeHost trims and lower-cases', () => {
    expect(normalizeHost('  Docs.Example.COM ')).toBe('docs.example.com');
  });

  it('cronFieldCount counts whitespace-separated fields', () => {
    expect(cronFieldCount('')).toBe(0);
    expect(cronFieldCount('   ')).toBe(0);
    expect(cronFieldCount('0 9 * * 1-5')).toBe(5);
    expect(cronFieldCount(' 0  9 *\t* 1 ')).toBe(5);
    expect(cronFieldCount('0 9 * *')).toBe(4);
  });

  it('clientAuthParam keeps known methods, anything else is Automatic', () => {
    expect(clientAuthParam('client_secret_post')).toBe('client_secret_post');
    expect(clientAuthParam('none')).toBe('none');
    expect(clientAuthParam('')).toBe('');
    expect(clientAuthParam('private_key_jwt')).toBe('');
  });

  it('activationChoice maps the select value to the handler choice', () => {
    expect(activationChoice('always')).toBe('always');
    expect(activationChoice('on-demand')).toBe('on-demand');
    expect(activationChoice('')).toBeNull();
    expect(activationChoice('sometimes')).toBeNull();
  });
});

describe('secrets', () => {
  it('builds SECRETS_ADD with a trimmed name and description, value untouched', () => {
    expect(req(buildSecretAdd({ name: ' GITHUB_TOKEN ', description: ' gh ', value: ' s3cret ' }))).toEqual({
      command: 'SECRETS_ADD',
      params: { name: 'GITHUB_TOKEN', description: 'gh', value: ' s3cret ' },
    });
  });

  it('refuses names the device would refuse, and an empty value', () => {
    expect(err(buildSecretAdd({ name: 'github_token', description: '', value: 'x' }))).toBe('Name must be UPPER_CASE_UNDERSCORE');
    expect(err(buildSecretAdd({ name: '1TOKEN', description: '', value: 'x' }))).toBe('Name must be UPPER_CASE_UNDERSCORE');
    expect(err(buildSecretAdd({ name: 'MY-TOKEN', description: '', value: 'x' }))).toBe('Name must be UPPER_CASE_UNDERSCORE');
    expect(err(buildSecretAdd({ name: 'A_1', description: '', value: '' }))).toBe('Value is required');
    expect(err(buildSecretAdd({ name: 'A_1', description: '', value: 'v' }))).toBe('ok:SECRETS_ADD');
  });

  it('SECRETS_UPDATE leaves the value out when blank', () => {
    expect(req(buildSecretUpdate({ name: 'A', description: ' new ', value: '' })).params).toEqual({ name: 'A', description: 'new' });
    expect(req(buildSecretUpdate({ name: 'A', description: '', value: 'v2' })).params).toEqual({ name: 'A', description: '', value: 'v2' });
  });
});

describe('allowlist, schedules, MCP, A2A', () => {
  it('WHITELIST_ADD normalises the host and refuses an empty one', () => {
    expect(req(buildAllowSite(' Example.ORG '))).toEqual({ command: 'WHITELIST_ADD', params: { host: 'example.org' } });
    expect(err(buildAllowSite('   '))).toBe('Enter a host');
  });

  it('SCHEDULE_ADD needs exactly five cron fields and a prompt', () => {
    expect(req(buildScheduleAdd({ cron: ' 0  9 * * 1-5 ', prompt: ' Check inbox ' }))).toEqual({
      command: 'SCHEDULE_ADD',
      params: { cron: '0 9 * * 1-5', prompt: 'Check inbox' },
    });
    expect(err(buildScheduleAdd({ cron: '0 9 * *', prompt: 'x' }))).toBe('Cron needs 5 fields');
    expect(err(buildScheduleAdd({ cron: '0 9 * * * *', prompt: 'x' }))).toBe('Cron needs 5 fields');
    expect(err(buildScheduleAdd({ cron: '0 9 * * *', prompt: '  ' }))).toBe('Prompt is required');
  });

  it('MCP_ADD_SERVER is an http server added by the user', () => {
    expect(req(buildMcpAdd({ name: ' GitHub ', url: ' https://api.example/mcp ' }))).toEqual({
      command: 'MCP_ADD_SERVER',
      params: { name: 'GitHub', url: 'https://api.example/mcp', transport: 'http', source: 'user' },
    });
    expect(err(buildMcpAdd({ name: '', url: 'https://x.example' }))).toBe('Name is required');
    expect(err(buildMcpAdd({ name: 'x', url: 'x.example' }))).toBe('Enter an http(s) URL');
  });

  it('MCP_DISCOVER_AUTH and A2A_GET_CARD need an http(s) URL', () => {
    expect(req(buildMcpDiscover(' https://x.example/mcp '))).toEqual({ command: 'MCP_DISCOVER_AUTH', params: { url: 'https://x.example/mcp' } });
    expect(err(buildMcpDiscover('x.example'))).toBe('Enter an http(s) URL');
    expect(req(buildA2aPreview('https://agent.example/.well-known/agent.json'))).toEqual({
      command: 'A2A_GET_CARD',
      params: { cardUrl: 'https://agent.example/.well-known/agent.json' },
    });
    expect(err(buildA2aPreview(''))).toBe('Enter an http(s) URL');
  });

  it('A2A_ADD_AGENT carries name, card URL and source user', () => {
    expect(req(buildA2aAdd({ name: ' Research ', cardUrl: ' https://a.example/card ' }))).toEqual({
      command: 'A2A_ADD_AGENT',
      params: { name: 'Research', cardUrl: 'https://a.example/card', source: 'user' },
    });
    expect(err(buildA2aAdd({ name: ' ', cardUrl: 'https://a.example' }))).toBe('Name is required');
    expect(err(buildA2aAdd({ name: 'R', cardUrl: 'mailto:x' }))).toBe('Enter an http(s) URL');
  });
});

describe('usage breakdown requests', () => {
  const period = { month: '2026-10', year: '2026' };
  it('maps each breakdown to its command and period', () => {
    expect(req(buildUsageBreakdown('session', period))).toEqual({ command: 'GET_USAGE_BY_SESSION', params: { month: '2026-10' } });
    expect(req(buildUsageBreakdown('schedule', period))).toEqual({ command: 'GET_USAGE_BY_SCHEDULE', params: { month: '2026-10' } });
    expect(req(buildUsageBreakdown('agent', period))).toEqual({ command: 'GET_USAGE_BY_AGENT', params: { month: '2026-10' } });
    expect(req(buildUsageBreakdown('month', period))).toEqual({ command: 'GET_USAGE_BY_MONTH', params: { year: '2026' } });
  });

  it('refuses a malformed period instead of asking the device for the current one', () => {
    expect(err(buildUsageBreakdown('month', { month: '2026-10', year: '26' }))).toBe('Enter a year like 2026');
    expect(err(buildUsageBreakdown('session', { month: '2026-1', year: '2026' }))).toBe('Enter a month like 2026-10');
    expect(err(buildUsageBreakdown('agent', { month: 'x2026-10', year: '2026' }))).toBe('Enter a month like 2026-10');
    expect(err(buildUsageBreakdown('month', { month: '', year: '2026x' }))).toBe('Enter a year like 2026');
  });
});
