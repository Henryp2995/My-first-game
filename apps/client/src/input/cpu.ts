import { CpuController, type CpuDifficulty, type InputFrame, type MatchState } from '@arena-rush/shared';
import type { InputSource } from './source';

/** Feeds the shared CPU brain's decisions into the match through the normal input path. */
export class CpuInputSource implements InputSource {
  private readonly cpu: CpuController;

  constructor(playerIndex: number, difficulty: CpuDifficulty, private readonly getMatch: () => MatchState, seed?: number) {
    this.cpu = new CpuController(playerIndex, difficulty, seed);
  }

  poll(): InputFrame {
    return this.cpu.decide(this.getMatch());
  }
}
