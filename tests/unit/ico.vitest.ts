import { describe, expect, it } from 'vitest';
import { encodeIco } from '@/scripts/ico';

const fake = (len: number, fill: number) => Buffer.alloc(len, fill);

describe('encodeIco', () => {
  it('writes ICONDIR, one entry per image and the payloads in order', () => {
    const a = fake(10, 0xaa);
    const b = fake(7, 0xbb);
    const ico = encodeIco([
      { size: 16, data: a },
      { size: 48, data: b },
    ]);
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(2);
    expect(ico.length).toBe(6 + 32 + 10 + 7);

    const entry = (i: number) => {
      const e = 6 + i * 16;
      return {
        w: ico.readUInt8(e),
        h: ico.readUInt8(e + 1),
        colors: ico.readUInt8(e + 2),
        reserved: ico.readUInt8(e + 3),
        planes: ico.readUInt16LE(e + 4),
        bpp: ico.readUInt16LE(e + 6),
        size: ico.readUInt32LE(e + 8),
        offset: ico.readUInt32LE(e + 12),
      };
    };
    expect(entry(0)).toEqual({ w: 16, h: 16, colors: 0, reserved: 0, planes: 1, bpp: 32, size: 10, offset: 38 });
    expect(entry(1)).toEqual({ w: 48, h: 48, colors: 0, reserved: 0, planes: 1, bpp: 32, size: 7, offset: 48 });
    expect(ico.subarray(38, 48)).toEqual(a);
    expect(ico.subarray(48, 55)).toEqual(b);
  });

  it('stores a 256px edge as 0 and 255 as itself', () => {
    const ico = encodeIco([
      { size: 256, data: fake(1, 1) },
      { size: 255, data: fake(1, 2) },
    ]);
    expect([ico.readUInt8(6), ico.readUInt8(7)]).toEqual([0, 0]);
    expect([ico.readUInt8(22), ico.readUInt8(23)]).toEqual([255, 255]);
  });

  it('accepts the 1px and 256px bounds and rejects sizes outside them or fractional', () => {
    expect(() => encodeIco([{ size: 1, data: fake(1, 0) }])).not.toThrow();
    for (const size of [0, 257, 15.5, -16]) {
      expect(() => encodeIco([{ size, data: fake(1, 0) }]), String(size)).toThrow(/bad size/);
    }
  });

  it('rejects an empty image list', () => {
    expect(() => encodeIco([])).toThrow(/no images/);
  });
});
