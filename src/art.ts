// 等距视角的程序化美术：木筏、建筑、幸存者、图标全部用 Canvas 画，不依赖图片素材。
import type { BType, Res } from './data';

export const INK = '#1b2742';
export const C = {
  sea: '#2f5d9e', seaDeep: '#22477f', seaLight: '#4c7fc0',
  plank: '#d8b07a', plankDark: '#b4864f', plankSide: '#7d5532',
  orange: '#f28b2e', orangeDeep: '#c9631a', teal: '#2fa59a', tealDeep: '#1f7d74',
  red: '#e0533f', yellow: '#ffc93c', yellowDeep: '#e0a100', cream: '#f6ecd6',
  steel: '#a7b6c4', steelDeep: '#6f8194', rust: '#a8643a', purple: '#b07ad8',
  white: '#f7f4ee', navy: '#2b3d63',
};

type G = CanvasRenderingContext2D;
type Pt = [number, number];
const TAU = Math.PI * 2;

// ---------- 基础几何 ----------
function poly(g: G, pts: Pt[], fill: string | CanvasGradient, lw = 1.5, stroke = INK) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fillStyle = fill; g.fill();
  if (lw) { g.lineWidth = lw; g.strokeStyle = stroke; g.lineJoin = 'round'; g.stroke(); }
}
/** 以 (cx, cy) 为中心、缩放 s 的菱形四角：上 右 下 左 */
function dia(cx: number, cy: number, TW: number, s: number, ox = 0, oy = 0): [Pt, Pt, Pt, Pt] {
  const hw = TW / 2 * s, hh = TW / 4 * s;
  // ox/oy 是沿格子两个轴方向的偏移（单位：格）
  const x = cx + (ox - oy) * TW / 2, y = cy + (ox + oy) * TW / 4;
  return [[x, y - hh], [x + hw, y], [x, y + hh], [x - hw, y]];
}
const up = ([x, y]: Pt, h: number): Pt => [x, y - h];
const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** 等距方块：top / left / right 三面颜色 */
export function box(g: G, cx: number, cy: number, TW: number, s: number, h: number, top: string, left: string, right: string, ox = 0, oy = 0, lw = 1.5) {
  const [T, R, B, L] = dia(cx, cy, TW, s, ox, oy);
  poly(g, [L, B, up(B, h), up(L, h)], left, lw);
  poly(g, [B, R, up(R, h), up(B, h)], right, lw);
  poly(g, [up(T, h), up(R, h), up(B, h), up(L, h)], top, lw);
  return { T: up(T, h), R: up(R, h), B: up(B, h), L: up(L, h) };
}
/** 人字形屋顶（屋脊沿左上→右下方向） */
function roof(g: G, top: { T: Pt; R: Pt; B: Pt; L: Pt }, h: number, color: string, side: string, lw = 1.5) {
  const A = up(mid(top.L, top.T), h), Bp = up(mid(top.B, top.R), h);
  poly(g, [top.T, A, Bp, top.R], side, lw);
  poly(g, [top.L, A, Bp, top.B], color, lw);
  poly(g, [top.B, Bp, top.R], side, lw);
}
function cyl(g: G, x: number, y: number, rx: number, h: number, body: string, topc: string, lw = 1.5) {
  const ry = rx / 2;
  g.beginPath();
  g.moveTo(x - rx, y - h); g.lineTo(x - rx, y); g.ellipse(x, y, rx, ry, 0, Math.PI, 0, true); g.lineTo(x + rx, y - h);
  g.closePath(); g.fillStyle = body; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
  g.beginPath(); g.ellipse(x, y - h, rx, ry, 0, 0, TAU); g.fillStyle = topc; g.fill(); g.stroke();
}
function line(g: G, a: Pt, b: Pt, color: string, w: number) {
  g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round'; g.stroke();
}
function shadow(g: G, cx: number, cy: number, TW: number, s: number) {
  const [T, R, B, L] = dia(cx, cy + TW * 0.04, TW, s);
  poly(g, [T, R, B, L], 'rgba(20,30,60,.22)', 0);
}
function smoke(g: G, x: number, y: number, t: number, s: number, dark = false) {
  for (let i = 0; i < 3; i++) {
    const p = ((t * 0.5 + i / 3) % 1);
    g.globalAlpha = (1 - p) * 0.7;
    g.fillStyle = dark ? '#555c68' : '#e9eef3';
    g.beginPath(); g.arc(x + Math.sin(p * 4 + i) * s * 0.4, y - p * s * 3, s * (0.4 + p * 0.6), 0, TAU); g.fill();
  }
  g.globalAlpha = 1;
}

// ---------- 海面 ----------
export function drawSea(g: G, W: number, H: number, t: number, camX: number, camY: number) {
  g.fillStyle = C.sea; g.fillRect(0, 0, W, H);
  // 斜向的浪纹，跟着镜头走
  g.strokeStyle = 'rgba(255,255,255,.10)'; g.lineWidth = 2; g.lineCap = 'round';
  const step = 46;
  const offX = ((camX % step) + step) % step, offY = ((camY % (step / 2)) + step / 2) % (step / 2);
  for (let y = -step; y < H + step; y += step / 2) {
    for (let x = -step; x < W + step; x += step) {
      const xx = x + offX + ((Math.round((y - offY) / (step / 2)) % 2) ? step / 2 : 0) + Math.sin(t + y * 0.05) * 4;
      const yy = y + offY;
      g.beginPath(); g.moveTo(xx - 8, yy); g.quadraticCurveTo(xx - 2, yy - 4, xx + 4, yy); g.stroke();
    }
  }
}

/** 漂在水上的杂物（纯装饰） */
export function drawFlotsam(g: G, x: number, y: number, TW: number, kind: number, t: number) {
  const bob = Math.sin(t * 1.5 + kind) * TW * 0.02;
  y += bob;
  g.fillStyle = 'rgba(255,255,255,.18)';
  g.beginPath(); g.ellipse(x, y + TW * 0.05, TW * 0.16, TW * 0.06, 0, 0, TAU); g.fill();
  if (kind % 3 === 0) cyl(g, x, y, TW * 0.07, TW * 0.12, C.red, '#f07b68', 1.2);
  else if (kind % 3 === 1) box(g, x, y, TW, 0.18, TW * 0.08, '#c99a5e', '#9c6f3c', '#8a5f31', 0, 0, 1.2);
  else { g.fillStyle = C.teal; g.strokeStyle = INK; g.lineWidth = 1.2; g.beginPath(); g.ellipse(x, y, TW * 0.1, TW * 0.04, 0.4, 0, TAU); g.fill(); g.stroke(); }
}

// ---------- 木筏格 ----------
export function drawRaft(g: G, cx: number, cy: number, TW: number, seed: number, edges: { n: boolean; e: boolean; s: boolean; w: boolean }) {
  const th = TW * 0.07;
  const [T, R, B, L] = dia(cx, cy, TW, 1);
  // 侧面（只画露在水面的两侧）
  if (!edges.s) poly(g, [L, B, [B[0], B[1] + th], [L[0], L[1] + th]], C.plankSide, 1.2);
  if (!edges.e) poly(g, [B, R, [R[0], R[1] + th], [B[0], B[1] + th]], '#6a4728', 1.2);
  poly(g, [T, R, B, L], seed % 7 === 0 ? '#cfa56d' : C.plank, 1.2);
  // 木板缝
  g.strokeStyle = 'rgba(110,70,30,.35)'; g.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const a = mid(L, T), k = i / 4;
    const p1: Pt = [L[0] + (T[0] - L[0]) * k, L[1] + (T[1] - L[1]) * k];
    const p2: Pt = [B[0] + (R[0] - B[0]) * k, B[1] + (R[1] - B[1]) * k];
    void a;
    g.beginPath(); g.moveTo(...p1); g.lineTo(...p2); g.stroke();
  }
  // 边缘彩色护栏（像集装箱/木箱拼起来的感觉）
  const trim = [C.teal, C.red, C.yellow, C.navy][seed % 4];
  g.lineWidth = Math.max(2, TW * 0.04); g.lineCap = 'round';
  if (!edges.s) { g.strokeStyle = trim; g.beginPath(); g.moveTo(...L); g.lineTo(...B); g.stroke(); }
  if (!edges.e) { g.strokeStyle = [C.teal, C.red, C.yellow, C.navy][(seed + 1) % 4]; g.beginPath(); g.moveTo(...B); g.lineTo(...R); g.stroke(); }
}

// ---------- 建筑 ----------
export function drawBuilding(g: G, type: BType, cx: number, cy: number, TW: number, level: number, t: number, building = false) {
  const lw = Math.max(1.2, TW * 0.018);
  const H = TW / 2; // 高度单位
  if (building) return drawScaffold(g, cx, cy, TW, t);
  shadow(g, cx, cy, TW, 0.85);
  switch (type) {
    case 'hq': {
      box(g, cx, cy, TW, 0.86, H * 0.35, '#c99a5e', '#9c6f3c', '#8a5f31', 0, 0, lw);
      const tw = box(g, cx, cy - H * 0.35, TW, 0.5, H * (1.1 + level * 0.08), C.cream, '#d8cdb6', '#bfb39b', 0, 0, lw);
      // 窗
      g.fillStyle = C.navy;
      for (let i = 0; i < 2; i++) { const y = cy - H * (0.7 + i * 0.45); g.fillRect(cx + TW * 0.05, y, TW * 0.06, H * 0.18); g.fillRect(cx - TW * 0.12, y, TW * 0.06, H * 0.18); }
      const deck = box(g, tw.B[0], tw.B[1] - TW * 0.125, TW, 0.66, H * 0.12, C.teal, C.tealDeep, '#186a62', 0, 0, lw);
      roof(g, deck, H * 0.35, C.red, '#b23c2c', lw);
      // 天线和旗
      const top = up(mid(mid(deck.L, deck.T), mid(deck.B, deck.R)), H * 0.35);
      line(g, top, up(top, H * 0.7), INK, lw * 1.4);
      g.fillStyle = C.yellow; g.beginPath(); const f = up(top, H * 0.7);
      g.moveTo(...f); g.lineTo(f[0] + TW * (0.16 + Math.sin(t * 4) * 0.01), f[1] + H * 0.1); g.lineTo(f[0], f[1] + H * 0.22); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#ff4f4f'; g.beginPath(); g.arc(f[0], f[1] - 2, TW * 0.02 * (1 + Math.sin(t * 5) * 0.3), 0, TAU); g.fill();
      break;
    }
    case 'tent': {
      const base = dia(cx, cy, TW, 0.82);
      poly(g, base, '#bf9a66', lw);
      const top = { T: base[0], R: base[1], B: base[2], L: base[3] };
      roof(g, top, H * 1.0, C.orange, C.orangeDeep, lw);
      // 门口
      const [, , Bp] = base;
      g.fillStyle = '#4a2a1a';
      g.beginPath(); g.moveTo(Bp[0] + TW * 0.04, Bp[1] - H * 0.02); g.lineTo(Bp[0] + TW * 0.18, Bp[1] - H * 0.42); g.lineTo(Bp[0] + TW * 0.2, Bp[1] - H * 0.1); g.closePath(); g.fill();
      // 门口的紫色小凳（向截图致敬）
      g.fillStyle = C.purple; g.beginPath(); g.ellipse(cx - TW * 0.16, cy + H * 0.3, TW * 0.06, TW * 0.03, 0, 0, TAU); g.fill(); g.stroke();
      if (level >= 3) { g.fillStyle = C.yellow; g.fillRect(cx - TW * 0.02, cy - H * 0.95, TW * 0.04, H * 0.12); }
      break;
    }
    case 'dock': {
      box(g, cx, cy, TW, 0.86, H * 0.12, '#b98c55', '#8f6638', '#7d5730', 0, 0, lw);
      // 渔网架
      const a: Pt = [cx - TW * 0.28, cy - H * 0.1], b: Pt = [cx + TW * 0.08, cy - H * 0.45];
      line(g, a, up(a, H * 1.1), INK, lw * 2.4); line(g, a, up(a, H * 1.1), C.plankSide, lw * 1.2);
      line(g, b, up(b, H * 1.1), INK, lw * 2.4); line(g, b, up(b, H * 1.1), C.plankSide, lw * 1.2);
      g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1;
      for (let i = 0; i <= 5; i++) {
        const k = i / 5;
        g.beginPath(); g.moveTo(a[0], a[1] - H * 1.1 * k); g.lineTo(b[0], b[1] - H * 1.1 * k); g.stroke();
        g.beginPath(); g.moveTo(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k - H * 1.1); g.lineTo(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k); g.stroke();
      }
      // 晒鱼
      for (let i = 0; i < 3; i++) fish(g, cx + TW * (0.12 + i * 0.08), cy - H * (0.05 - i * 0.12) + Math.sin(t * 2 + i) * 1.5, TW * 0.07);
      cyl(g, cx + TW * 0.26, cy + H * 0.05, TW * 0.06, H * 0.25, '#4f7fb5', '#6d9ad0', lw);
      break;
    }
    case 'desal': {
      box(g, cx, cy, TW, 0.86, H * 0.12, C.steel, C.steelDeep, '#5c6d80', 0, 0, lw);
      cyl(g, cx - TW * 0.14, cy - H * 0.1, TW * 0.15, H * (0.9 + level * 0.06), '#5fa8d8', '#8cc6ea', lw);
      cyl(g, cx + TW * 0.16, cy + H * 0.05, TW * 0.12, H * 0.65, '#5fa8d8', '#8cc6ea', lw);
      line(g, [cx - TW * 0.02, cy - H * 0.75], [cx + TW * 0.14, cy - H * 0.55], INK, lw * 3);
      line(g, [cx - TW * 0.02, cy - H * 0.75], [cx + TW * 0.14, cy - H * 0.55], C.steel, lw * 1.6);
      // 水滴标志
      g.fillStyle = '#fff'; g.beginPath(); const dx = cx - TW * 0.14, dy = cy - H * 0.55;
      g.moveTo(dx, dy - TW * 0.05); g.quadraticCurveTo(dx + TW * 0.05, dy + TW * 0.01, dx, dy + TW * 0.03); g.quadraticCurveTo(dx - TW * 0.05, dy + TW * 0.01, dx, dy - TW * 0.05); g.fill();
      break;
    }
    case 'salvage': {
      box(g, cx, cy, TW, 0.86, H * 0.12, '#b98c55', '#8f6638', '#7d5730', 0, 0, lw);
      // 废品堆
      const junk = [[-0.2, 0.05, C.teal], [-0.08, 0.15, C.red], [-0.15, -0.1, C.yellow], [0.02, 0.0, C.steel]] as const;
      for (const [ox, oy, col] of junk) box(g, cx + TW * ox, cy + H * oy - H * 0.12, TW, 0.2, H * 0.22, col, '#00000033', '#00000055', 0, 0, lw * 0.8);
      // 吊臂
      const base: Pt = [cx + TW * 0.2, cy - H * 0.1];
      line(g, base, up(base, H * 1.3), INK, lw * 3); line(g, base, up(base, H * 1.3), C.yellow, lw * 1.6);
      const tip: Pt = [base[0] - TW * 0.35, base[1] - H * 1.2];
      line(g, up(base, H * 1.3), tip, INK, lw * 2.6); line(g, up(base, H * 1.3), tip, C.yellow, lw * 1.3);
      const sway = Math.sin(t * 1.5) * TW * 0.02;
      line(g, tip, [tip[0] + sway, tip[1] + H * 0.6], INK, 1);
      box(g, tip[0] + sway, tip[1] + H * 0.75, TW, 0.12, H * 0.12, C.red, '#a83a2a', '#8f3123', 0, 0, 1);
      break;
    }
    case 'drift': {
      box(g, cx, cy, TW, 0.86, H * 0.12, '#b98c55', '#8f6638', '#7d5730', 0, 0, lw);
      // 原木堆
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) {
        const x = cx - TW * 0.2 + j * TW * 0.1 + i * TW * 0.05, y = cy - H * 0.15 - i * H * 0.18 + j * H * 0.05;
        g.fillStyle = '#9b6a3b'; g.fillRect(x - TW * 0.05, y - H * 0.06, TW * 0.22, H * 0.14);
        g.strokeStyle = INK; g.lineWidth = 1; g.strokeRect(x - TW * 0.05, y - H * 0.06, TW * 0.22, H * 0.14);
        g.beginPath(); g.ellipse(x - TW * 0.05, y + H * 0.01, TW * 0.035, H * 0.07, 0, 0, TAU); g.fillStyle = '#e8c48c'; g.fill(); g.stroke();
      }
      const shed = box(g, cx, cy, TW, 0.32, H * 0.55, '#c99a5e', '#9c6f3c', '#8a5f31', 0.22, -0.12, lw);
      roof(g, shed, H * 0.2, C.teal, C.tealDeep, lw);
      break;
    }
    case 'kitchen': {
      const top = box(g, cx, cy, TW, 0.74, H * 0.6, C.cream, '#d6c7a8', '#c0b190', 0, 0, lw);
      roof(g, top, H * 0.45, C.red, '#b23c2c', lw);
      g.fillStyle = C.navy; g.fillRect(cx + TW * 0.1, cy - H * 0.38, TW * 0.08, H * 0.25);
      // 招牌鱼
      fish(g, cx - TW * 0.17, cy - H * 0.3, TW * 0.1);
      const ch: Pt = [cx + TW * 0.12, cy - H * 1.15];
      box(g, ch[0], ch[1] + H * 0.25, TW, 0.1, H * 0.35, '#8a8f99', '#6b707a', '#5b5f68', 0, 0, lw);
      smoke(g, ch[0], ch[1] - H * 0.15, t, TW * 0.05);
      break;
    }
    case 'loom': {
      const top = box(g, cx, cy, TW, 0.6, H * 0.6, '#c99a5e', '#9c6f3c', '#8a5f31', -0.08, -0.08, lw);
      roof(g, top, H * 0.35, C.purple, '#8a58b3', lw);
      // 晾布
      const a: Pt = [cx - TW * 0.02, cy + H * 0.3], b: Pt = [cx + TW * 0.36, cy + H * 0.05];
      line(g, a, up(a, H * 0.8), INK, lw * 1.6); line(g, b, up(b, H * 0.8), INK, lw * 1.6);
      line(g, up(a, H * 0.75), up(b, H * 0.75), INK, 1);
      const cloths = [C.red, C.yellow, C.teal];
      cloths.forEach((col, i) => {
        const k = (i + 0.5) / 3, p: Pt = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k - H * 0.75];
        const sw = Math.sin(t * 2 + i) * TW * 0.01;
        poly(g, [[p[0] - TW * 0.04, p[1]], [p[0] + TW * 0.04, p[1] - H * 0.04], [p[0] + TW * 0.04 + sw, p[1] + H * 0.3], [p[0] - TW * 0.04 + sw, p[1] + H * 0.34]], col, 1);
      });
      break;
    }
    case 'smelter': {
      const top = box(g, cx, cy, TW, 0.7, H * 0.7, '#5d6470', '#474d58', '#3b404a', 0, 0, lw);
      // 炉口火光
      const glow = 0.7 + Math.sin(t * 6) * 0.3;
      g.fillStyle = `rgba(255,${120 + glow * 60},40,1)`;
      g.beginPath(); g.ellipse(cx + TW * 0.14, cy - H * 0.2, TW * 0.06, H * 0.12, 0, 0, TAU); g.fill(); g.stroke();
      const ch: Pt = mid(top.T, top.R);
      cyl(g, ch[0] - TW * 0.05, ch[1] + H * 0.1, TW * 0.07, H * 0.9, C.rust, '#c47a4a', lw);
      smoke(g, ch[0] - TW * 0.05, ch[1] - H * 0.9, t, TW * 0.06, true);
      // 金属锭
      box(g, cx - TW * 0.2, cy + H * 0.15, TW, 0.16, H * 0.1, '#dfe6ec', C.steel, C.steelDeep, 0, 0, 1);
      break;
    }
    case 'storage': {
      const top = box(g, cx, cy, TW, 0.86, H * 0.75, C.teal, C.tealDeep, '#186a62', 0, 0, lw);
      roof(g, top, H * 0.25, '#8fa6b8', '#6f8496', lw);
      // 卷帘门
      g.fillStyle = '#d6dde3';
      g.beginPath(); g.moveTo(cx + TW * 0.08, cy + H * 0.25); g.lineTo(cx + TW * 0.3, cy + H * 0.03); g.lineTo(cx + TW * 0.3, cy - H * 0.42); g.lineTo(cx + TW * 0.08, cy - H * 0.2); g.closePath(); g.fill(); g.stroke();
      box(g, cx - TW * 0.3, cy + H * 0.25, TW, 0.18, H * 0.2, '#c99a5e', '#9c6f3c', '#8a5f31', 0, 0, 1);
      break;
    }
    case 'clinic': {
      const base = dia(cx, cy, TW, 0.82);
      poly(g, base, '#c9c2b4', lw);
      roof(g, { T: base[0], R: base[1], B: base[2], L: base[3] }, H * 0.95, C.white, '#d8d2c6', lw);
      // 红十字
      const m: Pt = [cx - TW * 0.1, cy - H * 0.4];
      g.fillStyle = C.red;
      g.fillRect(m[0] - TW * 0.025, m[1] - TW * 0.07, TW * 0.05, TW * 0.14);
      g.fillRect(m[0] - TW * 0.07, m[1] - TW * 0.025, TW * 0.14, TW * 0.05);
      break;
    }
  }
}

function drawScaffold(g: G, cx: number, cy: number, TW: number, t: number) {
  const H = TW / 2;
  shadow(g, cx, cy, TW, 0.8);
  const [T, R, B, L] = dia(cx, cy, TW, 0.72);
  poly(g, [T, R, B, L], '#c9a06a', 1.2);
  const hgt = H * 0.9;
  for (const p of [T, R, B, L]) { line(g, p, up(p, hgt), INK, 3); line(g, p, up(p, hgt), '#b07a45', 1.6); }
  for (const k of [0.45, 0.9]) {
    g.strokeStyle = '#b07a45'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(...up(L, hgt * k)); g.lineTo(...up(B, hgt * k)); g.lineTo(...up(R, hgt * k)); g.stroke();
  }
  // 黄黑警示条
  const y = B[1] - hgt * 0.2;
  g.save(); g.beginPath(); g.rect(cx - TW * 0.3, y - 5, TW * 0.6, 10); g.clip();
  for (let i = -6; i < 10; i++) { g.fillStyle = i % 2 ? C.yellow : INK; g.fillRect(cx - TW * 0.3 + i * 8 + ((t * 20) % 16), y - 5, 8, 10); }
  g.restore();
  // 锤子
  const a = Math.sin(t * 8) * 0.6;
  g.save(); g.translate(cx + TW * 0.05, cy - H * 0.95); g.rotate(a);
  g.fillStyle = '#9b6a3b'; g.fillRect(-2, -2, 4, TW * 0.16);
  g.fillStyle = C.steel; g.fillRect(-TW * 0.06, -TW * 0.03, TW * 0.12, TW * 0.05); g.strokeStyle = INK; g.lineWidth = 1; g.strokeRect(-TW * 0.06, -TW * 0.03, TW * 0.12, TW * 0.05);
  g.restore();
}

function fish(g: G, x: number, y: number, s: number) {
  g.fillStyle = '#7fb0d8'; g.strokeStyle = INK; g.lineWidth = 1;
  g.beginPath(); g.ellipse(x, y, s * 0.5, s * 0.25, -0.3, 0, TAU); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(x + s * 0.4, y - s * 0.15); g.lineTo(x + s * 0.75, y - s * 0.35); g.lineTo(x + s * 0.7, y + s * 0.05); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = INK; g.beginPath(); g.arc(x - s * 0.28, y - s * 0.02, s * 0.06, 0, TAU); g.fill();
}

// ---------- 幸存者 ----------
const SKIN = ['#f1c9a5', '#d9a47a', '#b57a52', '#7d5236'];
const TOP = [C.orange, C.white, C.teal, '#6a7f4a', C.red, '#d9c9a0'];
const PANTS = ['#3b4a6b', '#5a4a3a', '#2f3b52', '#6b5a48'];

export function drawSurvivor(g: G, x: number, y: number, TW: number, look: number, t: number, moving: boolean) {
  const s = TW * 0.07;
  const ph = t * 10 + look;
  const bob = moving ? Math.abs(Math.sin(ph)) * s * 0.2 : 0;
  g.fillStyle = 'rgba(20,30,60,.25)'; g.beginPath(); g.ellipse(x, y + s * 0.2, s * 0.7, s * 0.3, 0, 0, TAU); g.fill();
  const sw = moving ? Math.sin(ph) * s * 0.3 : 0;
  line(g, [x - s * 0.22, y - s * 0.6 - bob], [x - s * 0.22 + sw, y], INK, s * 0.42);
  line(g, [x + s * 0.22, y - s * 0.6 - bob], [x + s * 0.22 - sw, y], INK, s * 0.42);
  line(g, [x - s * 0.22, y - s * 0.6 - bob], [x - s * 0.22 + sw, y], PANTS[look % 4], s * 0.26);
  line(g, [x + s * 0.22, y - s * 0.6 - bob], [x + s * 0.22 - sw, y], PANTS[look % 4], s * 0.26);
  g.beginPath(); g.roundRect(x - s * 0.5, y - s * 1.55 - bob, s, s * 1.0, s * 0.3);
  g.fillStyle = TOP[(look >> 2) % TOP.length]; g.fill(); g.lineWidth = 1.2; g.strokeStyle = INK; g.stroke();
  g.beginPath(); g.arc(x, y - s * 1.95 - bob, s * 0.45, 0, TAU);
  g.fillStyle = SKIN[(look >> 4) % 4]; g.fill(); g.stroke();
  if ((look >> 3) % 3 === 0) { // 有的人戴帽子 / 有头发
    g.fillStyle = (look >> 5) % 2 ? C.orange : '#3a2a20';
    g.beginPath(); g.arc(x, y - s * 2.0 - bob, s * 0.47, Math.PI, 0); g.fill();
  }
}

// ---------- 图标 ----------
export type IconKind = Res | 'coins' | 'pop' | 'morale';

export function drawIcon(g: G, k: IconKind, x: number, y: number, S: number) {
  const lw = Math.max(1.2, S * 0.07);
  g.lineJoin = 'round';
  switch (k) {
    case 'coins': {
      g.beginPath(); g.arc(x, y, S * 0.42, 0, TAU); g.fillStyle = C.yellow; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
      g.beginPath(); g.arc(x, y, S * 0.28, 0, TAU); g.strokeStyle = C.yellowDeep; g.lineWidth = lw * 0.8; g.stroke();
      fishShape(g, x, y, S * 0.36, C.yellowDeep, 0);
      break;
    }
    case 'fish': fishShape(g, x, y, S * 0.85, '#7fb0d8', lw); break;
    case 'meal': {
      g.beginPath(); g.ellipse(x, y + S * 0.12, S * 0.45, S * 0.2, 0, 0, TAU); g.fillStyle = '#fff'; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
      fishShape(g, x, y - S * 0.02, S * 0.7, '#e8a05a', lw * 0.8);
      g.strokeStyle = '#3a8f3a'; g.lineWidth = lw; g.beginPath(); g.moveTo(x - S * 0.32, y - S * 0.05); g.lineTo(x - S * 0.22, y + S * 0.08); g.stroke();
      break;
    }
    case 'water': {
      g.beginPath(); g.roundRect(x - S * 0.2, y - S * 0.28, S * 0.4, S * 0.68, S * 0.08);
      g.fillStyle = '#9fd4f5'; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
      g.beginPath(); g.rect(x - S * 0.1, y - S * 0.44, S * 0.2, S * 0.16); g.fillStyle = '#3d7fc4'; g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(x - S * 0.12, y - S * 0.15, S * 0.06, S * 0.3);
      break;
    }
    case 'wood': {
      g.beginPath(); g.roundRect(x - S * 0.42, y - S * 0.2, S * 0.7, S * 0.4, S * 0.08); g.fillStyle = '#a8703c'; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
      g.beginPath(); g.ellipse(x + S * 0.28, y, S * 0.14, S * 0.2, 0, 0, TAU); g.fillStyle = '#f0c98b'; g.fill(); g.stroke();
      break;
    }
    case 'scrap': {
      g.beginPath(); g.arc(x, y, S * 0.4, 0, TAU); g.fillStyle = C.teal; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
      g.fillStyle = '#fff'; g.font = `900 ${Math.round(S * 0.5)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('♻', x, y + S * 0.03);
      break;
    }
    case 'cloth': {
      for (let i = 0; i < 3; i++) {
        g.beginPath(); g.roundRect(x - S * 0.38, y + S * (0.12 - i * 0.18), S * 0.76, S * 0.2, S * 0.05);
        g.fillStyle = [C.red, '#e9dcc0', C.teal][i]; g.fill(); g.lineWidth = lw * 0.8; g.strokeStyle = INK; g.stroke();
      }
      break;
    }
    case 'metal': {
      poly(g, [[x - S * 0.4, y + S * 0.2], [x - S * 0.1, y - S * 0.25], [x + S * 0.42, y - S * 0.25], [x + S * 0.12, y + S * 0.2]], '#c3ced8', lw);
      poly(g, [[x - S * 0.4, y + S * 0.2], [x + S * 0.12, y + S * 0.2], [x + S * 0.12, y + S * 0.32], [x - S * 0.4, y + S * 0.32]], C.steelDeep, lw);
      g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = lw; g.beginPath(); g.moveTo(x - S * 0.05, y - S * 0.15); g.lineTo(x + S * 0.2, y - S * 0.15); g.stroke();
      break;
    }
    case 'pop': {
      g.beginPath(); g.arc(x, y - S * 0.15, S * 0.22, 0, TAU); g.fillStyle = '#f1c9a5'; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
      g.beginPath(); g.arc(x, y - S * 0.2, S * 0.23, Math.PI, 0); g.fillStyle = '#3a2a20'; g.fill();
      g.beginPath(); g.roundRect(x - S * 0.32, y + S * 0.1, S * 0.64, S * 0.32, S * 0.15); g.fillStyle = C.orange; g.fill(); g.stroke();
      break;
    }
    case 'morale': {
      g.beginPath(); g.arc(x, y, S * 0.4, 0, TAU); g.fillStyle = C.yellow; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
      g.fillStyle = INK; g.beginPath(); g.arc(x - S * 0.13, y - S * 0.08, S * 0.05, 0, TAU); g.arc(x + S * 0.13, y - S * 0.08, S * 0.05, 0, TAU); g.fill();
      g.beginPath(); g.arc(x, y + S * 0.02, S * 0.2, 0.2, Math.PI - 0.2); g.stroke();
      break;
    }
  }
}
function fishShape(g: G, x: number, y: number, s: number, col: string, lw: number) {
  g.fillStyle = col; g.strokeStyle = INK; g.lineWidth = lw;
  g.beginPath(); g.ellipse(x - s * 0.08, y, s * 0.36, s * 0.2, 0, 0, TAU); g.fill(); if (lw) g.stroke();
  g.beginPath(); g.moveTo(x + s * 0.22, y); g.lineTo(x + s * 0.48, y - s * 0.2); g.lineTo(x + s * 0.48, y + s * 0.2); g.closePath(); g.fill(); if (lw) g.stroke();
  g.fillStyle = lw ? INK : '#fff'; g.beginPath(); g.arc(x - s * 0.26, y - s * 0.03, s * 0.045, 0, TAU); g.fill();
}

// ---------- 地图上的提示物 ----------
/** 可收获的黄色定位针 */
export function drawPin(g: G, x: number, y: number, TW: number, res: Res, t: number, full: boolean) {
  const s = TW * 0.22, b = Math.sin(t * 3) * s * 0.12;
  y += b;
  g.fillStyle = 'rgba(20,30,60,.25)'; g.beginPath(); g.ellipse(x, y + s * 1.55 - b, s * 0.3, s * 0.1, 0, 0, TAU); g.fill();
  g.beginPath();
  g.moveTo(x, y + s * 1.3);
  g.bezierCurveTo(x - s * 0.5, y + s * 0.6, x - s, y + s * 0.2, x - s, y - s * 0.2);
  g.arc(x, y - s * 0.2, s, Math.PI, 0);
  g.bezierCurveTo(x + s, y + s * 0.2, x + s * 0.5, y + s * 0.6, x, y + s * 1.3);
  g.fillStyle = full ? '#ff8a3c' : C.yellow; g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
  g.beginPath(); g.arc(x, y - s * 0.2, s * 0.72, 0, TAU); g.fillStyle = '#fff6dc'; g.fill();
  drawIcon(g, res, x, y - s * 0.2, s * 1.3);
}

/** 施工进度条 */
export function drawTimer(g: G, x: number, y: number, TW: number, frac: number, text: string) {
  const w = TW * 0.8, h = Math.max(14, TW * 0.16);
  g.beginPath(); g.roundRect(x - w / 2, y - h / 2, w, h, h / 2); g.fillStyle = 'rgba(27,39,66,.85)'; g.fill();
  g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
  g.save(); g.beginPath(); g.roundRect(x - w / 2 + 3, y - h / 2 + 3, (w - 6) * Math.max(0.05, frac), h - 6, (h - 6) / 2); g.fillStyle = '#5fd08a'; g.fill(); g.restore();
  g.fillStyle = '#fff'; g.font = `900 ${Math.round(h * 0.66)}px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 3; g.strokeStyle = INK; g.strokeText(text, x, y + 1); g.fillText(text, x, y + 1);
}

/** 幸存者头顶的需求气泡（缺吃/缺喝） */
export function drawNeed(g: G, x: number, y: number, TW: number, res: Res, t: number) {
  const r = TW * 0.12, yy = y - r * 1.3 + Math.sin(t * 3) * 2;
  g.beginPath(); g.arc(x, yy, r, 0, TAU); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = INK; g.stroke();
  g.beginPath(); g.arc(x - r * 0.3, yy + r * 1.15, r * 0.22, 0, TAU); g.fill(); g.stroke();
  drawIcon(g, res, x, yy, r * 1.5);
}

/** 订单对话框：一排「图标 + 有/需」 */
export function drawOrderBubble(g: G, x: number, y: number, TW: number, items: { res: Res; have: number; n: number }[], ready: boolean, t: number) {
  const cell = TW * 0.36, pad = 8, w = items.length * cell + pad * 2, h = cell * 1.25;
  const bx = x - w / 2, by = y - h + Math.sin(t * 2 + x) * 1.5;
  g.beginPath(); g.roundRect(bx, by, w, h, 10);
  g.moveTo(x - 8, by + h); g.lineTo(x - 2, by + h + 9); g.lineTo(x + 6, by + h);
  g.fillStyle = ready ? '#e6ffe9' : '#fff'; g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
  items.forEach((it, i) => {
    const cx = bx + pad + cell * (i + 0.5);
    drawIcon(g, it.res, cx, by + cell * 0.45, cell * 0.72);
    g.font = `800 ${Math.round(cell * 0.26)}px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = it.have >= it.n ? '#2a8c58' : '#d0412f';
    g.fillText(`${Math.floor(it.have)}/${it.n}`, cx, by + cell * 1.0);
  });
}

// ---------- DOM 用图片 ----------
const cache = new Map<string, string>();
export function iconURL(k: IconKind, px = 48) {
  const id = `i:${k}:${px}`;
  if (!cache.has(id)) {
    const cv = document.createElement('canvas'); cv.width = cv.height = px;
    drawIcon(cv.getContext('2d')!, k, px / 2, px / 2, px * 0.95);
    cache.set(id, cv.toDataURL());
  }
  return cache.get(id)!;
}
export function buildingURL(t: BType, px = 120) {
  const id = `b:${t}:${px}`;
  if (!cache.has(id)) {
    const cv = document.createElement('canvas'); cv.width = cv.height = px;
    const tall = t === 'hq' ? 0.55 : t === 'salvage' || t === 'dock' ? 0.78 : 0.85;
    drawBuilding(cv.getContext('2d')!, t, px / 2, px * (t === 'hq' ? 0.8 : 0.68), px * tall, 2, 0.7);
    cache.set(id, cv.toDataURL());
  }
  return cache.get(id)!;
}
