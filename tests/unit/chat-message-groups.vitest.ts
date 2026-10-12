import { describe, expect, it } from 'vitest';
import { groupMessages, sessionTitle, sortSessions } from '@/src/views/remote-chat/model/message-groups';

const m = (id: string, role: 'user' | 'assistant') => ({ id, role });

describe('groupMessages', () => {
  it('groups consecutive messages from the same speaker', () => {
    const groups = groupMessages([m('1', 'user'), m('2', 'user'), m('3', 'assistant'), m('4', 'assistant'), m('5', 'user')]);
    expect(groups.map((g) => [g.role, g.items.map((i) => i.id)])).toEqual([
      ['user', ['1', '2']],
      ['assistant', ['3', '4']],
      ['user', ['5']],
    ]);
  });

  it('keys each group by its first message so React keys stay stable while a group grows', () => {
    const before = groupMessages([m('a', 'assistant')]);
    const after = groupMessages([m('a', 'assistant'), m('b', 'assistant')]);
    expect(before[0].key).toBe('a');
    expect(after[0].key).toBe('a');
  });

  it('handles an empty conversation', () => {
    expect(groupMessages([])).toEqual([]);
  });
});

describe('sortSessions', () => {
  const s = (id: string, updated_at: string) => ({ id, updated_at });

  it('newest first, unparseable dates last, without mutating the input', () => {
    const input = [s('old', '2026-01-01T00:00:00Z'), s('bad', 'x'), s('new', '2026-10-01T00:00:00Z'), s('mid', '2026-05-01T00:00:00Z')];
    expect(sortSessions(input).map((x) => x.id)).toEqual(['new', 'mid', 'old', 'bad']);
    expect(input[0].id).toBe('old');
  });

  it('keeps the original order for equal timestamps', () => {
    const t = '2026-05-01T00:00:00Z';
    expect(sortSessions([s('a', t), s('b', t), s('c', t)]).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('sessionTitle', () => {
  it('uses the trimmed title or a placeholder', () => {
    expect(sessionTitle({ title: '  Trip plan ' })).toBe('Trip plan');
    expect(sessionTitle({ title: '   ' })).toBe('Untitled chat');
    expect(sessionTitle({ title: null })).toBe('Untitled chat');
  });
});
