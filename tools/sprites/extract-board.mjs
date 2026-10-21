#!/usr/bin/env node
/**
 * Cuts individual animation frames out of a character "showcase board" image.
 *
 *   node tools/sprites/extract-board.mjs assets/references/goku-board.json
 *
 * For each panel in the config it removes the dark, blue-tinted panel background with a flood
 * fill from the panel border (stopping at the character's dark outline), splits the remaining
 * figures by empty columns, trims them, and writes assets/sprites/<fighter>/frames/<state>_<n>.png.
 * Works for boards with a dark navy background; tune isBackground() for other boards.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const configPath = process.argv[2];
if (!configPath) {
  console.error('usage: extract-board.mjs <board-config.json>');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const board = PNG.sync.read(fs.readFileSync(path.join(path.dirname(configPath), config.source)));
const outDir = path.join('assets', 'sprites', config.fighter, 'frames');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const W = board.width;
const at = (x, y) => (y * W + x) * 4;
/** Panel background: dark and blue-tinted. Outlines and black hair are neutral, so they survive. */
function isBackground(x, y) {
  const i = at(x, y);
  const r = board.data[i];
  const g = board.data[i + 1];
  const b = board.data[i + 2];
  return b >= 9 && b - r >= 4 && r < 48 && g < 56 && b < 80;
}

/** Drops small detached pixel islands (background specks, label text): keeps pieces ≥ 5% of the largest. */
function removeFragments(img, edgeRatio = 0) {
  const { width: w, height: h, data } = img;
  const label = new Int32Array(w * h).fill(-1);
  const sizes = [];
  for (let start = 0; start < w * h; start++) {
    if (label[start] >= 0 || !data[start * 4 + 3]) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [start];
    label[start] = id;
    while (stack.length) {
      const k = stack.pop();
      size++;
      const x = k % w;
      const y = (k - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (label[n] < 0 && data[n * 4 + 3]) {
          label[n] = id;
          stack.push(n);
        }
      }
    }
    sizes.push(size);
  }
  const largest = Math.max(0, ...sizes);
  const keep = Math.max(14, largest * 0.05);
  // Pieces touching the left/right cut edge that are much smaller than the figure belong to a neighbour.
  const touchesEdge = new Set();
  if (edgeRatio > 0) {
    for (let y = 0; y < h; y++) for (const x of [0, 1, w - 2, w - 1]) {
      const k = y * w + x;
      if (x >= 0 && x < w && label[k] >= 0) touchesEdge.add(label[k]);
    }
  }
  for (let k = 0; k < w * h; k++) {
    const id = label[k];
    if (id < 0) continue;
    if (sizes[id] < keep || (touchesEdge.has(id) && sizes[id] < largest * edgeRatio && sizes[id] !== largest)) data[k * 4 + 3] = 0;
  }
}

/** Crops an image in place to its opaque bounds (pngjs objects are re-dimensioned). */
function trimTransparent(img) {
  const { width: w, height: h, data } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3]) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  if (x1 < 0) return;
  const nw = x1 - x0 + 1;
  const nh = y1 - y0 + 1;
  const out = Buffer.alloc(nw * nh * 4);
  for (let y = 0; y < nh; y++) data.copy(out, y * nw * 4, ((y0 + y) * w + x0) * 4, ((y0 + y) * w + x0 + nw) * 4);
  img.width = nw;
  img.height = nh;
  img.data = out;
}

let total = 0;
const counters = {};
for (const panel of config.panels) {
  const [px, py, pw, ph] = panel.rect;
  // Flood fill background from the panel's border.
  const bg = new Uint8Array(pw * ph);
  // Explicitly ignored areas (e.g. panel labels overlapping tall frames) count as background.
  for (const [ix, iy, iw, ih] of panel.ignore ?? []) {
    for (let y = Math.max(0, iy - py); y < Math.min(ph, iy - py + ih); y++) {
      for (let x = Math.max(0, ix - px); x < Math.min(pw, ix - px + iw); x++) bg[y * pw + x] = 1;
    }
  }
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= pw || y >= ph) return;
    const k = y * pw + x;
    if (bg[k] || !isBackground(px + x, py + y)) return;
    bg[k] = 1;
    stack.push(k);
  };
  for (let x = 0; x < pw; x++) { push(x, 0); push(x, ph - 1); }
  for (let y = 0; y < ph; y++) { push(0, y); push(pw - 1, y); }
  while (stack.length) {
    const k = stack.pop();
    const x = k % pw;
    const y = (k - x) / pw;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  // Isolated background pockets (e.g. between arm and body) are also background.
  for (let k = 0; k < pw * ph; k++) {
    const x = k % pw;
    const y = (k - x) / pw;
    if (!bg[k] && isBackground(px + x, py + y)) bg[k] = 1;
  }

  // Split figures by runs of empty columns.
  const colCount = new Array(pw).fill(0);
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) if (!bg[y * pw + x]) colCount[x]++;
  const N = panel.states.length;
  let segments = [];
  let start = -1;
  let gap = 0;
  for (let x = 0; x <= pw; x++) {
    const filled = x < pw && colCount[x] > 1;
    if (filled) {
      if (start < 0) start = x;
      gap = 0;
    } else if (start >= 0) {
      gap++;
      if (gap >= 3 || x === pw) {
        const end = x - gap + 1;
        if (end - start >= 12) segments.push([start, end]);
        start = -1;
        gap = 0;
      }
    }
  }
  let cutPanel = false;
  if (panel.frames) {
    cutPanel = true;
    // Explicit frame ranges (panel-relative x), for panels where effects bridge the figures.
    segments = panel.frames.map(([a, b]) => [a, b]);
  } else if (segments.length < N) {
    // Figures touch: cut at the emptiest column near each evenly spaced boundary.
    const cuts = [0];
    for (let k = 1; k < N; k++) {
      const guess = Math.round((pw * k) / N);
      const win = Math.round((pw / N) * 0.3);
      let best = guess;
      for (let x = Math.max(1, guess - win); x < Math.min(pw - 1, guess + win); x++) if (colCount[x] < colCount[best]) best = x;
      cuts.push(best);
    }
    cuts.push(pw);
    segments = [];
    cutPanel = true;
    for (let k = 0; k < N; k++) {
      let a = cuts[k];
      let b = cuts[k + 1];
      while (a < b && colCount[a] <= 1) a++;
      while (b > a && colCount[b - 1] <= 1) b--;
      segments.push([a, b]);
    }
    console.log(`  ${panel.name}: figures touch, split at columns ${cuts.slice(1, -1).join(', ')}`);
  }
  if (segments.length !== N) {
    console.warn(`! ${panel.name}: found ${segments.length} figures, expected ${N}`);
  }

  segments.slice(0, N).forEach(([sx, ex], idx) => {
    // Trim rows.
    let top = ph;
    let bottom = -1;
    for (let y = 0; y < ph; y++) for (let x = sx; x < ex; x++) if (!bg[y * pw + x]) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
    const w = ex - sx;
    const h = bottom - top + 1;
    const out = new PNG({ width: w, height: h });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = (top + y) * pw + sx + x;
      const si = at(px + sx + x, py + top + y);
      const oi = (y * w + x) * 4;
      const r = board.data[si];
      const g = board.data[si + 1];
      const b = board.data[si + 2];
      out.data[oi] = r;
      out.data[oi + 1] = g;
      out.data[oi + 2] = b;
      // Saturated ki glow (pure blue, almost no red) is removed when requested; the game draws its own.
      const glow = panel.removeGlow && ((b >= 140 && r < 60) || (r <= 10 && b >= 100) || (b >= 200 && g >= 170 && b > r + 25));
      out.data[oi + 3] = bg[k] || glow ? 0 : 255;
    }
    // Where neighbouring figures overlap, cuts can leave a stray limb or beam piece at the edge.
    removeFragments(out, cutPanel ? 0.35 : 0);
    trimTransparent(out);
    const state = panel.states[idx];
    const n = counters[state] ?? 0;
    counters[state] = n + 1;
    fs.writeFileSync(path.join(outDir, `${state}_${n}.png`), PNG.sync.write(out));
    total++;
  });
}
console.log(`extracted ${total} frames → ${outDir}`);
console.log(Object.entries(counters).map(([s, n]) => `${s}:${n}`).join('  '));
