#!/usr/bin/env node
/**
 * Crops a painted backdrop out of a stage concept board, fading its bottom edge to transparent so
 * it blends into the procedural sky below.
 *
 *   node tools/stages/crop-backdrop.mjs <board.png> <stageId> <x> <y> <w> <h> [--fade=<px>]
 *
 * Output: apps/client/public/assets/stages/<stageId>/backdrop.png
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const [src, stageId, ...rect] = args;
if (!src || !stageId || rect.length !== 4) {
  console.error('usage: crop-backdrop.mjs <board.png> <stageId> <x> <y> <w> <h> [--fade=<px>]');
  process.exit(1);
}
const [x0, y0, w, h] = rect.map(Number);
const fade = Number(flags.fade ?? 0);
const board = PNG.sync.read(fs.readFileSync(src));
const out = new PNG({ width: w, height: h });
for (let y = 0; y < h; y++) {
  const alpha = fade > 0 && y > h - fade ? Math.max(0, (h - y) / fade) : 1;
  for (let x = 0; x < w; x++) {
    const si = ((y0 + y) * board.width + x0 + x) * 4;
    const oi = (y * w + x) * 4;
    out.data[oi] = board.data[si];
    out.data[oi + 1] = board.data[si + 1];
    out.data[oi + 2] = board.data[si + 2];
    // Smoothstep fade so the seam is invisible.
    out.data[oi + 3] = Math.round(255 * alpha * alpha * (3 - 2 * alpha));
  }
}
const dir = path.join('apps', 'client', 'public', 'assets', 'stages', stageId);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'backdrop.png'), PNG.sync.write(out));
console.log(`backdrop ${w}x${h} (bottom fade ${fade}px) → ${dir}/backdrop.png`);
