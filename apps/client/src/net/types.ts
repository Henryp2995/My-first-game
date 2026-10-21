/**
 * Phase 3 (online multiplayer) contract — not implemented yet.
 *
 * The local game is already structured so the server can be authoritative:
 *  - `@arena-rush/shared` holds the deterministic 60 Hz simulation (`stepMatch`).
 *  - Clients only produce `InputFrame`s (see `input/source.ts` → `InputSource`).
 *  - Rendering reads `MatchState` and `GameEvent`s; it never mutates them.
 *
 * In Phase 3 a Colyseus room will run `stepMatch` on the server, receive encoded inputs
 * (`encodeInput`) from each client, and broadcast state snapshots + events. The client's
 * BattleScene will add a network `InputSource` alongside `KeyboardInputSource` / `CpuInputSource` and render server state.
 */
import type { FighterId, GameEvent, MatchState } from '@arena-rush/shared';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface LobbyPlayer {
  sessionId: string;
  name: string;
  fighter: FighterId | null;
  ready: boolean;
  slot: number;
}

export interface LobbyState {
  roomCode: string;
  hostSessionId: string;
  players: LobbyPlayer[];
  phase: 'lobby' | 'countdown' | 'match' | 'results';
}

/** What the online client will expose to scenes (Create/Join Room, Lobby, Ready-Up, Connection Status). */
export interface OnlineSession {
  readonly status: ConnectionStatus;
  createRoom(playerName: string): Promise<string>;
  joinRoom(code: string, playerName: string): Promise<void>;
  selectFighter(fighter: FighterId): void;
  setReady(ready: boolean): void;
  sendInput(bits: number, frame: number): void;
  leave(): void;
  onLobby(cb: (lobby: LobbyState) => void): void;
  onSnapshot(cb: (state: MatchState, events: GameEvent[]) => void): void;
  onStatus(cb: (status: ConnectionStatus) => void): void;
}
