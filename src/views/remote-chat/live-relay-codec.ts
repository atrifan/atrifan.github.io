import { frameEnvelope, logicalFrame, type LogicalFrame } from './live-relay-contract';

const MAX_EVENT = 128 * 1024;
const MAX_LOGICAL = 8 * 1024 * 1024;
const MAX_ASSEMBLY = 16 * 1024 * 1024;
type Part = ReturnType<typeof frameEnvelope.parse>['part'];

/** SSE bytes may split anywhere, including in the middle of UTF-8 characters. */
export class EventDecoder {
  private readonly decoder = new TextDecoder('utf-8', { fatal: true });
  private pending = '';
  push(bytes: Uint8Array): Array<{ event: string; data: unknown }> {
    if (bytes.byteLength > 512 * 1024) throw new Error('event_batch_too_large');
    this.pending += this.decoder.decode(bytes, { stream: true });
    const result: Array<{ event: string; data: unknown }> = [];
    let end: number;
    while ((end = this.pending.indexOf('\n\n')) !== -1) {
      const raw = this.pending.slice(0, end);
      this.pending = this.pending.slice(end + 2);
      if (new TextEncoder().encode(raw).byteLength > MAX_EVENT) throw new Error('event_too_large');
      const match = raw.match(/^event:([^\n]+)\ndata:([^\n]+)$/);
      if (!match) throw new Error('invalid_event');
      result.push({ event: match[1], data: JSON.parse(match[2]) as unknown });
    }
    if (new TextEncoder().encode(this.pending).byteLength > MAX_EVENT) throw new Error('event_too_large');
    return result;
  }
  finish(): void {
    if (this.decoder.decode() || this.pending) throw new Error('truncated_event');
  }
}

type Assembly = { requestId: string; hash: string; count: number; pieces: Array<Uint8Array | undefined>; hashes: Array<string | undefined>; size: number; complete: boolean; timer: ReturnType<typeof setTimeout> };
const digest = async (value: Uint8Array): Promise<string> => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(value).buffer))].map((n) => n.toString(16).padStart(2, '0')).join('');
export class FrameAssembler {
  private readonly entries = new Map<string, Assembly>();
  private total = 0;
  constructor(private readonly failed: () => void) {}
  async add(part: Part): Promise<LogicalFrame | null> {
    if (part.index >= part.count || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(part.data)) throw new Error('invalid_fragment');
    const decoded = atob(part.data);
    if (btoa(decoded) !== part.data || decoded.length === 0 || decoded.length > 65536) throw new Error('invalid_fragment');
    const bytes = Uint8Array.from(decoded, (value) => value.charCodeAt(0));
    let item = this.entries.get(part.frameId);
    if (!item) {
      if ([...this.entries.values()].filter((entry) => !entry.complete).length >= 8 || this.entries.size >= 256) throw new Error('too_many_assemblies');
      const frameId = part.frameId;
      const timer = setTimeout(() => {
        const expired = this.entries.get(frameId);
        if (!expired) return;
        this.total -= expired.size;
        this.entries.delete(frameId);
        if (!expired.complete) this.failed();
      }, 15000);
      item = { requestId: part.requestId, hash: part.sha256, count: part.count, pieces: Array.from({ length: part.count }, () => undefined), hashes: Array.from({ length: part.count }, () => undefined), size: 0, complete: false, timer };
      this.entries.set(part.frameId, item);
    }
    if (item.count !== part.count || item.hash !== part.sha256 || item.requestId !== part.requestId) throw new Error('conflicting_fragment');
    const pieceHash = await digest(bytes);
    if (item.complete) {
      if (item.hashes[part.index] !== pieceHash) throw new Error('conflicting_fragment');
      return null;
    }
    const previous = item.pieces[part.index];
    if (previous) {
      if (previous.length !== bytes.length || previous.some((byte, index) => byte !== bytes[index])) throw new Error('conflicting_fragment');
      return null;
    }
    if (item.size + bytes.length > MAX_LOGICAL || this.total + bytes.length > MAX_ASSEMBLY) throw new Error('assembly_too_large');
    item.pieces[part.index] = bytes;
    item.hashes[part.index] = pieceHash;
    item.size += bytes.length;
    this.total += bytes.length;
    if (item.pieces.some((piece) => !piece)) return null;
    const combined = new Uint8Array(item.size);
    let offset = 0;
    for (const piece of item.pieces) { combined.set(piece!, offset); offset += piece!.length; }
    const hash = await digest(combined);
    if (hash !== item.hash) throw new Error('fragment_hash_mismatch');
    const result = logicalFrame.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(combined)) as unknown);
    if (result.requestId !== item.requestId) throw new Error('request_mismatch');
    item.complete = true;
    this.total -= item.size;
    item.size = 0;
    item.pieces = [];
    return result;
  }
  clear(): void {
    for (const entry of this.entries.values()) clearTimeout(entry.timer);
    this.entries.clear();
    this.total = 0;
  }
}
