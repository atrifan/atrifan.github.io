import { describe, expect, it } from 'vitest';
import { parseReceive, takeFresh } from '@/src/views/remote-chat/model/frame-sequence';

const f = (seq: number, type = 'STREAM_CHUNK') => ({ seq, frame: { type, delta: String(seq) } });

describe('parseReceive', () => {
  it('reads frames and the cursor from a /receive body', () => {
    expect(parseReceive({ frames: [f(3), f(4)], cursor: 4 })).toEqual({ frames: [f(3), f(4)], cursor: 4 });
  });

  it('drops malformed envelopes instead of throwing', () => {
    const body = {
      frames: [
        null,
        'x',
        { seq: '5', frame: { type: 'A' } },
        { seq: Number.NaN, frame: { type: 'A' } },
        { seq: 6 },
        { seq: 7, frame: null },
        { seq: 8, frame: { delta: 'no type' } },
        { seq: 9, frame: { type: 'OK' } },
      ],
      cursor: 9,
    };
    expect(parseReceive(body)).toEqual({ frames: [{ seq: 9, frame: { type: 'OK' } }], cursor: 9 });
  });

  it('tolerates a missing or non-array frames field and a missing cursor', () => {
    expect(parseReceive(null)).toEqual({ frames: [], cursor: null });
    expect(parseReceive('nope')).toEqual({ frames: [], cursor: null });
    expect(parseReceive({ frames: 'x', cursor: 'y' })).toEqual({ frames: [], cursor: null });
    expect(parseReceive({ cursor: 12 })).toEqual({ frames: [], cursor: 12 });
    expect(parseReceive({ cursor: Number.POSITIVE_INFINITY })).toEqual({ frames: [], cursor: null });
  });
});

describe('takeFresh', () => {
  it('keeps only frames past the cursor, in seq order', () => {
    const { fresh, cursor } = takeFresh([f(7), f(5), f(6), f(4)], 4);
    expect(fresh.map((e) => e.seq)).toEqual([5, 6, 7]);
    expect(cursor).toBe(7);
  });

  it('dedupes a seq delivered twice', () => {
    const { fresh } = takeFresh([f(5), f(5), f(6)], 0);
    expect(fresh.map((e) => e.seq)).toEqual([5, 6]);
  });

  it('never moves the cursor backwards', () => {
    expect(takeFresh([f(2), f(3)], 10)).toEqual({ fresh: [], cursor: 10 });
    expect(takeFresh([], 3)).toEqual({ fresh: [], cursor: 3 });
  });

  it('does not reorder the caller array', () => {
    const input = [f(2), f(1)];
    takeFresh(input, 0);
    expect(input.map((e) => e.seq)).toEqual([2, 1]);
  });
});
