import type { InputFrame } from '@arena-rush/shared';

/**
 * Anything that produces one InputFrame per simulation tick. The match only ever sees InputFrames,
 * whether they come from the local keyboard, the CPU, or (Phase 3) a remote player over the network.
 */
export interface InputSource {
  poll(): InputFrame;
}
