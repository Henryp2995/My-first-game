export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export const FONT_DISPLAY = 'Bungee, "Arial Black", Impact, sans-serif';
export const FONT_BODY = 'Rubik, "Segoe UI", "Helvetica Neue", Arial, sans-serif';

export const PLAYER_COLORS = [0xff4d5e, 0x3da5ff, 0xffc93c, 0x4ddc7a] as const;
export const PLAYER_CSS = ['#ff4d5e', '#3da5ff', '#ffc93c', '#4ddc7a'] as const;

/** CPU fighters are tagged in neutral gray, like classic platform fighters. */
export const CPU_COLOR = 0xa9adc8;
export const CPU_CSS = '#a9adc8';

export const UI = {
  ink: 0x14112b,
  inkCss: '#14112b',
  panel: 0x1d1940,
  panelLight: 0x2c2660,
  accent: 0xffd23f,
  accentCss: '#ffd23f',
  white: 0xffffff,
  muted: '#b9b4e6',
};

export function hexToCss(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

/** Damage % text goes white → yellow → orange → red as it climbs. */
export function damageColor(pct: number): string {
  const stops: [number, [number, number, number]][] = [
    [0, [255, 255, 255]],
    [50, [255, 228, 92]],
    [100, [255, 140, 50]],
    [150, [235, 40, 40]],
    [250, [140, 10, 20]],
  ];
  for (let i = 1; i < stops.length; i++) {
    const [p1, c1] = stops[i];
    const [p0, c0] = stops[i - 1];
    if (pct <= p1) {
      const t = (pct - p0) / (p1 - p0);
      const c = c0.map((v, k) => Math.round(v + (c1[k] - v) * t));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  const c = stops[stops.length - 1][1];
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
