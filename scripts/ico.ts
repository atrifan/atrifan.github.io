/** One image of an ICO: a square PNG and its edge in px (1-256). */
export interface IcoImage {
  size: number;
  data: Buffer;
}

/**
 * An ICO file holding PNG images (the PNG-in-ICO form every current browser and Windows Vista+
 * read): ICONDIR, one 16-byte ICONDIRENTRY per image, then the PNGs. A 256px edge is stored as 0.
 */
export function encodeIco(images: readonly IcoImage[]): Buffer {
  if (images.length === 0) throw new Error('encodeIco: no images');
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(images.length, 4);
  const entries = Buffer.alloc(16 * images.length);
  let offset = header.length + entries.length;
  images.forEach(({ size, data }, i) => {
    if (!Number.isInteger(size) || size < 1 || size > 256) throw new Error(`encodeIco: bad size ${size}`);
    const e = i * 16;
    const edge = size === 256 ? 0 : size;
    entries.writeUInt8(edge, e);
    entries.writeUInt8(edge, e + 1);
    entries.writeUInt16LE(1, e + 4); // colour planes
    entries.writeUInt16LE(32, e + 6); // bits per pixel
    entries.writeUInt32LE(data.length, e + 8);
    entries.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, entries, ...images.map((img) => img.data)]);
}
