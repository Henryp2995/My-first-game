#!/usr/bin/env node
/**
 * Packs a folder of animation frames into a Phaser texture atlas the game loads automatically.
 *
 *   node tools/sprites/pack.mjs <fighterId> [framesDir] [--height=<px>]
 *
 * Input:  <framesDir>/<state>_<n>.png (default assets/sprites/<fighterId>/frames), drawn facing right.
 * Output: apps/client/public/assets/fighters/<id>/<id>.png + <id>.json (JSON Hash atlas) and an
 *         entry in apps/client/src/render/characters/sprites.generated.json (the game's sprite manifest).
 *
 * Every frame is placed in an identical cell with the character's feet and torso at the same
 * point, so animation never jitters between frames. Missing states fall back to similar ones
 * (walk ← run, victory/respawn ← idle, …) and are reported.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const fighter = args[0];
if (!fighter) {
  console.error('usage: pack.mjs <fighterId> [framesDir] [--height=<world px for the idle pose>]');
  process.exit(1);
}
const framesDir = args[1] ?? path.join('assets', 'sprites', fighter, 'frames');
const targetHeight = Number(flags.height ?? 100);

const STATES = ['idle', 'walk', 'run', 'jumpStart', 'rise', 'fall', 'land', 'light', 'heavy', 'special', 'aerial', 'dodge', 'hit', 'knockback', 'ko', 'respawn', 'victory'];
const FALLBACKS = {
  walk: ['run', 'idle'], run: ['walk', 'idle'], jumpStart: ['rise', 'idle'], rise: ['jumpStart', 'fall', 'idle'],
  fall: ['rise', 'idle'], land: ['idle'], dodge: ['idle'], hit: ['knockback', 'idle'], knockback: ['hit', 'ko', 'idle'],
  ko: ['knockback', 'hit', 'idle'], respawn: ['idle'], victory: ['idle'],
  light: ['heavy', 'idle'], heavy: ['light', 'idle'], special: ['heavy', 'idle'], aerial: ['light', 'idle'],
};

// ---- Load frames ------------------------------------------------------------
const frames = {};
for (const file of fs.readdirSync(framesDir).filter((f) => /^[a-zA-Z]+_\d+\.png$/.test(f))) {
  const [, state, n] = /^([a-zA-Z]+)_(\d+)\.png$/.exec(file);
  (frames[state] ??= [])[Number(n)] = PNG.sync.read(fs.readFileSync(path.join(framesDir, file)));
}
if (!frames.idle?.length) {
  console.error(`No idle_<n>.png frames in ${framesDir}; idle is required.`);
  process.exit(1);
}

// ---- Measure anchors: feet (from gi + boots, not effects) and torso center ------------
// Which pixels are the character's body (vs. effects). Default: an orange gi + skin (Goku).
// Override per fighter with assets/sprites/<id>/pack.json { "bodyColors": [[r, g, b, tolerance], ...] }.
const packConfigPath = path.join('assets', 'sprites', fighter, 'pack.json');
const packConfig = fs.existsSync(packConfigPath) ? JSON.parse(fs.readFileSync(packConfigPath, 'utf8')) : {};
const bodyColors = Array.isArray(packConfig.bodyColors) ? packConfig.bodyColors : null;
const isBody = bodyColors
  ? (r, g, b) => bodyColors.some(([cr, cg, cb, tol]) => Math.abs(r - cr) <= tol && Math.abs(g - cg) <= tol && Math.abs(b - cb) <= tol)
  : (r, g, b) => (r > 140 && g > 40 && g < 160 && b < 100) || (r > 200 && g > 150 && b > 110 && b < 200);
function measure(img) {
  const { width: w, height: h, data } = img;
  let minY = h, maxY = -1;
  const xs = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (data[i + 3] && isBody(data[i], data[i + 1], data[i + 2])) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxY < 0) return { footBody: h - 1, cx: w / 2, top: 0 };
  const torsoLimit = minY + (maxY - minY) * 0.45;
  for (let y = minY; y <= torsoLimit; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (data[i + 3] && isBody(data[i], data[i + 1], data[i + 2])) xs.push(x);
  }
  xs.sort((a, b) => a - b);
  let top = h;
  for (let y = 0; y < h && top === h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3]) { top = y; break; }
  return { footBody: maxY, cx: xs.length ? xs[Math.floor(xs.length / 2)] : w / 2, top };
}
// The boots sit below the lowest gi pixel: learn that offset from the idle pose.
const idle0 = frames.idle[0];
const bootOffset = idle0.height - 1 - measure(idle0).footBody;
const idleHeight = idle0.height;

const list = [];
for (const [state, arr] of Object.entries(frames)) {
  arr.forEach((img, n) => {
    if (!img) return;
    const m = measure(img);
    const footY = Math.min(img.height - 1, m.footBody + bootOffset);
    list.push({ name: `${state}_${n}`, state, img, ax: Math.round(m.cx), ay: footY });
  });
}

// ---- Uniform cells: anchor at the same point in every cell -----------------------
const left = Math.max(...list.map((f) => f.ax));
const right = Math.max(...list.map((f) => f.img.width - f.ax));
const above = Math.max(...list.map((f) => f.ay));
const below = Math.max(...list.map((f) => f.img.height - f.ay));
const halfW = Math.max(left, right) + 1;
const cellW = halfW * 2;
const cellH = above + below + 2;
const anchorPx = { x: halfW, y: above + 1 };

const cols = 8;
const rows = Math.ceil(list.length / cols);
const atlas = new PNG({ width: cols * cellW, height: rows * cellH });
atlas.data.fill(0);
const jsonFrames = {};
list.forEach((f, i) => {
  const cx = (i % cols) * cellW;
  const cy = Math.floor(i / cols) * cellH;
  const ox = cx + anchorPx.x - f.ax;
  const oy = cy + anchorPx.y - f.ay;
  PNG.bitblt(f.img, atlas, 0, 0, f.img.width, f.img.height, ox, oy);
  f.rect = { x: cx, y: cy, w: cellW, h: cellH };
});

// Fallbacks for missing states: alias frames to existing regions.
const byState = {};
for (const f of list) (byState[f.state] ??= []).push(f);
const report = [];
for (const state of STATES) {
  let src = byState[state];
  let from = state;
  if (!src) {
    from = (FALLBACKS[state] ?? []).find((s) => byState[s]) ?? 'idle';
    src = byState[from];
    report.push(`${state} ← ${from}`);
  }
  src.forEach((f, n) => {
    jsonFrames[`${state}_${n}`] = {
      frame: f.rect, rotated: false, trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: cellW, h: cellH }, sourceSize: { w: cellW, h: cellH },
    };
  });
}

const outDir = path.join('apps', 'client', 'public', 'assets', 'fighters', fighter);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `${fighter}.png`), PNG.sync.write(atlas));
fs.writeFileSync(path.join(outDir, `${fighter}.json`), JSON.stringify({
  frames: jsonFrames,
  meta: { app: 'arena-rush tools/sprites/pack.mjs', image: `${fighter}.png`, format: 'RGBA8888', size: { w: atlas.width, h: atlas.height }, scale: '1' },
}, null, 1));

// Manifest entry (world scale makes the idle pose `targetHeight` px tall).
const scale = +(targetHeight / idleHeight).toFixed(3);
const idleTop = measure(idle0).top;
const manifestPath = path.join('apps', 'client', 'src', 'render', 'characters', 'sprites.generated.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
manifest[fighter] = {
  key: `sprite-${fighter}`,
  atlasPng: `assets/fighters/${fighter}/${fighter}.png`,
  atlasJson: `assets/fighters/${fighter}/${fighter}.json`,
  scale,
  anchorX: +(anchorPx.x / cellW).toFixed(4),
  anchorY: +(anchorPx.y / cellH).toFixed(4),
  fps: {},
  head: { x: 4, y: -Math.round(idleHeight - idleTop - idleHeight * 0.12) },
  hand: { x: Math.round(idleHeight * 0.3), y: -Math.round(idleHeight * 0.5) },
  filter: 'nearest',
  frameCount: list.length,
};
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

console.log(`packed ${list.length} frames (${cellW}x${cellH} cells) → ${outDir}/${fighter}.png`);
console.log(`world scale ${scale} (idle pose ${idleHeight}px → ${targetHeight}px)`);
if (report.length) console.log(`filled missing states: ${report.join(', ')}`);
