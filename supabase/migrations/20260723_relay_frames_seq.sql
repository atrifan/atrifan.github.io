-- The device's long-poll client (plugin/src/background/remote-relay.ts) dedups
-- inbound frames on a monotonic `seq` cursor: it keeps only envelopes whose
-- `seq` is strictly greater than the last one it saw, and discards any envelope
-- without a numeric `seq`. The original chat_relay_frames table had no such
-- column, so every inbound frame was silently dropped device-side and the agent
-- loop never started. Add a monotonic cursor.
ALTER TABLE chat_relay_frames ADD COLUMN IF NOT EXISTS seq BIGSERIAL;

-- Order the device poll by this cursor.
CREATE INDEX IF NOT EXISTS idx_relay_frames_seq ON chat_relay_frames(seq);
