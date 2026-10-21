import Phaser from 'phaser';
import { FIGHTERS, getStage } from '@arena-rush/shared';
import { sound } from '../audio/sound';
import { drawFighter, shade } from '../render/art';
import { Backdrop } from '../render/backdrop';
import { Effects } from '../render/effects';
import { computePose } from '../render/pose';
import { FONT_BODY, GAME_HEIGHT, GAME_WIDTH, UI } from '../theme';
import { bodyText, displayText, fadeTo, installGlobalKeys, Menu, panel } from '../ui/widgets';
import { isAltCostume, slotColor, slotCss, slotDescription, type MatchSummary } from './types';

export class ResultsScene extends Phaser.Scene {
  private summary!: MatchSummary;
  private backdrop!: Backdrop;
  private hero!: Phaser.GameObjects.Graphics;
  private effects!: Effects;
  private t = 0;

  constructor() {
    super('Results');
  }

  init(data: MatchSummary): void {
    this.summary = data;
  }

  create(): void {
    this.t = 0;
    const s = this.summary;
    this.cameras.main.fadeIn(400, 255, 255, 255);
    this.backdrop = new Backdrop(this);
    installGlobalKeys(this);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0d0b1f, 0.35);

    const winner = s.winner;
    const color = winner === null ? UI.accent : slotColor(s.setup, winner);
    // Light rays behind the winner
    const rays = this.add.graphics();
    rays.fillStyle(color, 0.18);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      rays.fillTriangle(0, 0, Math.cos(a) * 700, Math.sin(a) * 700, Math.cos(a + 0.18) * 700, Math.sin(a + 0.18) * 700);
    }
    rays.setPosition(320, 420);
    this.tweens.add({ targets: rays, angle: 360, duration: 30000, repeat: -1 });

    // Pedestal
    const ped = this.add.graphics();
    ped.fillStyle(0x000000, 0.3);
    ped.fillEllipse(320, 560, 320, 40);
    ped.fillStyle(shade(color, 0.6), 1);
    ped.fillRoundedRect(180, 520, 280, 40, 12);
    ped.fillStyle(color, 1);
    ped.fillRoundedRect(170, 508, 300, 22, 10);

    this.hero = this.add.graphics();
    this.effects = new Effects(this);

    if (winner === null) {
      displayText(this, 320, 110, 'DRAW!', 84, '#ffd23f', UI.inkCss, 12);
      bodyText(this, 320, 170, 'Nobody could finish it.', 20, '#ffffff', '700');
    } else {
      const def = FIGHTERS[s.setup.players[winner].fighter];
      const human = s.setup.players[winner].control === 'human';
      displayText(this, 320, 80, human ? 'YOU WIN!' : 'CPU WINS!', 72, slotCss(s.setup, winner), UI.inkCss, 12);
      displayText(this, 320, 150, def.name.toUpperCase(), def.name.length > 10 ? 32 : 40, '#ffffff', UI.inkCss, 8);
      sound.victory();
    }
    const cpuIndex = s.setup.players.findIndex((p) => p.control === 'cpu');
    const vs = (cpuIndex >= 0 ? `  ·  vs ${slotDescription(s.setup, cpuIndex)}` : '') + `  ·  ${getStage(s.setup.stage).name}`;
    bodyText(this, 320, 196, (s.reason === 'time' ? 'Decided on time' : 'Last fighter standing') + vs, 15, UI.muted, '700');

    // Standings table
    const tx = 900;
    panel(this, tx, 250, 680, 330, UI.panel, 0xffffff, 0.95);
    displayText(this, tx, 115, 'RESULTS', 30, '#ffd23f', UI.inkCss, 6);
    const cols = [-290, -150, 50, 140, 220, 300];
    ['#', 'FIGHTER', 'KOs', 'FALLS', 'DMG', 'LEFT'].forEach((h, i) => {
      this.add.text(tx + cols[i], 160, h, { fontFamily: FONT_BODY, fontSize: '15px', fontStyle: '900', color: UI.muted })
        .setOrigin(i === 1 ? 0 : 0.5, 0.5);
    });
    s.ranking.forEach((pid, rank) => {
      const r = s.results[pid];
      const y = 205 + rank * 62;
      const row = this.add.graphics();
      row.fillStyle(shade(slotColor(s.setup, pid), 0.35), 1);
      row.fillRoundedRect(tx - 320, y - 26, 640, 52, 12);
      row.lineStyle(3, slotColor(s.setup, pid), 1);
      row.strokeRoundedRect(tx - 320, y - 26, 640, 52, 12);
      displayText(this, tx + cols[0], y, `${rank + 1}`, 28, rank === 0 ? '#ffd23f' : '#ffffff', UI.inkCss, 5);
      this.add.text(tx + cols[1], y - 9, slotDescription(s.setup, pid), { fontFamily: FONT_BODY, fontSize: '13px', fontStyle: '900', color: slotCss(s.setup, pid) }).setOrigin(0, 0.5);
      this.add.text(tx + cols[1], y + 10, FIGHTERS[r.fighter].name, { fontFamily: FONT_BODY, fontSize: '18px', fontStyle: '900', color: '#ffffff' }).setOrigin(0, 0.5);
      [r.stats.kos, r.stats.falls, Math.round(r.stats.damageDealt), r.stocks].forEach((v, i) => {
        bodyText(this, tx + cols[i + 2], y, String(v), 22, '#ffffff', '900');
      });
    });
    const secs = Math.round(s.durationFrames / 60);
    bodyText(this, tx, 395, `Match time ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, 14, UI.muted, '500');

    new Menu(this, tx, 480, [
      { label: () => 'REMATCH', hint: 'Same fighters, difficulty & stage', action: () => fadeTo(this, 'Battle', { setup: s.setup }) },
      { label: () => 'CHARACTER SELECT', action: () => fadeTo(this, 'Select', { previous: s.setup }) },
      { label: () => 'MAIN MENU', action: () => fadeTo(this, 'Menu') },
    ], 400, 70);
  }

  update(): void {
    this.t++;
    this.backdrop.update();
    const s = this.summary;
    const g = this.hero;
    g.clear();
    const ids = s.winner === null ? s.ranking : [s.winner];
    ids.forEach((pid, i) => {
      const fighter = s.setup.players[pid].fighter;
      const x = ids.length === 1 ? 320 : 320 + (i - (ids.length - 1) / 2) * 120;
      const pose = computePose({
        fighter, action: s.winner === null ? 'preview' : 'victory', move: null, actionFrame: 0, grounded: true,
        vx: 0, vy: 0, runSpeed: 1, t: this.t, flip: -1, tumble: false, charge: 0, rocketLaunched: false,
      });
      const alt = isAltCostume(s.setup, pid);
      drawFighter(g, fighter, pose, x, 508, 1, ids.length === 1 ? 2.6 : 2.0, false, alt);
    });
    if (s.winner !== null && this.t % 3 === 0 && this.t < 600) {
      this.effects.confetti(0, -20, GAME_WIDTH, [slotColor(s.setup, s.winner), 0xffd23f, 0xffffff, 0xff6fb5]);
    }
    this.effects.tick();
    this.effects.draw();
  }
}
