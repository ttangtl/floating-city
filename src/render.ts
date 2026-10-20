import { GRID, def, type BType, type Res } from './data';
import { S, rt, isRaft, freeTile, canRaft, pinReady, bufCap, storageCap, orderReady, buildingAt } from './game';
import {
  INK, drawSea, drawFlotsam, drawRaft, drawBuilding, drawSurvivor, drawPin, drawTimer, drawNeed, drawOrderBubble, drawIcon,
} from './art';

export const view = {
  W: 0, H: 0, dpr: 1,
  ox: 0, oy: 0, zoom: 0.9,
  mode: 'none' as 'none' | 'build' | 'raft',
  placing: null as BType | null,
  selected: null as number | null,
};
export const TW = () => 92 * view.zoom;

/** 地图上可点的东西（每帧刷新） */
export const hits = {
  pins: [] as { uid: number; x: number; y: number; r: number }[],
  orders: [] as { x: number; y: number; w: number; h: number }[],
};

let g: CanvasRenderingContext2D;
let cv: HTMLCanvasElement;

export function initRender(c: HTMLCanvasElement) {
  cv = c; g = c.getContext('2d')!;
  resize();
  window.addEventListener('resize', resize);
}
export function resize() {
  const wrap = cv.parentElement!;
  const first = !view.W;
  view.W = wrap.clientWidth; view.H = wrap.clientHeight;
  view.dpr = window.devicePixelRatio || 1;
  cv.width = view.W * view.dpr; cv.height = view.H * view.dpr;
  cv.style.width = view.W + 'px'; cv.style.height = view.H + 'px';
  if (first) centerOn(...hqTile());
}
const hqTile = (): [number, number] => { const h = S.buildings.find(b => b.type === 'hq')!; return [h.c, h.r]; };
export function centerOn(c: number, r: number) {
  const T = TW();
  view.ox = view.W / 2 - (c - r) * T / 2;
  view.oy = view.H * 0.5 - (c + r) * T / 4;
}

export const toScreen = (c: number, r: number): [number, number] => {
  const T = TW();
  return [(c - r) * T / 2 + view.ox, (c + r) * T / 4 + view.oy];
};
export function toTile(x: number, y: number): [number, number] {
  const T = TW();
  const dx = (x - view.ox) / (T / 2), dy = (y - view.oy) / (T / 4);
  return [Math.round((dx + dy) / 2), Math.round((dy - dx) / 2)];
}

/** 缩放时保持手指下的点不动 */
export function zoomAt(x: number, y: number, z: number) {
  const nz = Math.max(0.55, Math.min(1.8, z));
  const k = nz / view.zoom;
  view.ox = x - (x - view.ox) * k;
  view.oy = y - (y - view.oy) * k;
  view.zoom = nz;
}
/** 别把整座城拖出屏幕 */
export function clampCamera() {
  const [hx, hy] = toScreen(GRID / 2, GRID / 2);
  const T = TW(), lim = GRID * T * 0.45;
  if (hx < view.W / 2 - lim) view.ox += view.W / 2 - lim - hx;
  if (hx > view.W / 2 + lim) view.ox -= hx - (view.W / 2 + lim);
  if (hy < view.H / 2 - lim / 2) view.oy += view.H / 2 - lim / 2 - hy;
  if (hy > view.H / 2 + lim / 2) view.oy -= hy - (view.H / 2 + lim / 2);
}

// 漂浮杂物：固定种子，满海都有
const flotsam = Array.from({ length: 26 }, (_, i) => ({
  c: ((i * 37) % (GRID + 8)) - 4 + ((i * 13) % 7) / 7,
  r: ((i * 53) % (GRID + 8)) - 4 + ((i * 29) % 5) / 5,
  k: i,
}));

export function draw(now: number) {
  const t = now / 1000, T = TW();
  g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  drawSea(g, view.W, view.H, t, view.ox, view.oy);

  // 可扩建区域的边界（淡淡的虚线菱形）
  {
    const a = toScreen(-0.5, -0.5), b = toScreen(GRID - 0.5, -0.5), c = toScreen(GRID - 0.5, GRID - 0.5), d = toScreen(-0.5, GRID - 0.5);
    g.setLineDash([6, 8]); g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.lineTo(...c); g.lineTo(...d); g.closePath(); g.stroke(); g.setLineDash([]);
  }

  for (const f of flotsam) {
    const fc = f.c + Math.sin(t * 0.05 + f.k) * 0.6, fr = f.r + Math.cos(t * 0.04 + f.k) * 0.6;
    if (isRaft(Math.round(fc), Math.round(fr))) continue;
    const [x, y] = toScreen(fc, fr);
    if (x < -T || x > view.W + T || y < -T || y > view.H + T) continue;
    drawFlotsam(g, x, y, T, f.k, t);
  }

  // 木筏
  const rafts = S.rafts.map(k => k.split(',').map(Number) as [number, number]).sort((a, b) => a[0] + a[1] - b[0] - b[1]);
  for (const [c, r] of rafts) {
    const [x, y] = toScreen(c, r);
    if (x < -T || x > view.W + T || y < -T || y > view.H + T * 2) continue;
    drawRaft(g, x, y, T, (c * 7 + r * 13) & 255, { n: isRaft(c, r - 1), e: isRaft(c + 1, r), s: isRaft(c, r + 1), w: isRaft(c - 1, r) });
  }

  // 模式提示格
  const pulse = 0.35 + Math.sin(t * 5) * 0.15;
  if (view.mode === 'build') {
    for (const [c, r] of rafts) if (freeTile(c, r)) diamond(c, r, `rgba(95,208,138,${pulse})`, 'rgba(40,140,80,.9)');
  }
  if (view.mode === 'raft') {
    for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) if (canRaft(c, r)) {
      diamond(c, r, `rgba(255,255,255,${pulse * 0.6})`, 'rgba(255,255,255,.9)', true);
      const [x, y] = toScreen(c, r);
      g.fillStyle = '#fff'; g.font = `900 ${Math.round(T * 0.22)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('+', x, y + 1);
    }
  }
  const sel = S.buildings.find(b => b.uid === view.selected);
  if (sel) diamond(sel.c, sel.r, 'rgba(255,255,255,.45)', '#fff');

  // 建筑 + 小人按纵深画
  type Item = { d: number; fn: () => void };
  const items: Item[] = [];
  for (const b of S.buildings) {
    const [x, y] = toScreen(b.c, b.r);
    items.push({ d: b.c + b.r, fn: () => drawBuilding(g, b.type, x, y, T, b.level, t + b.uid, b.level === 0) });
  }
  const needs: { x: number; y: number; res: Res }[] = [];
  rt.walkers.forEach((w, i) => {
    const [x, y] = toScreen(w.x, w.y);
    items.push({ d: w.x + w.y + 0.1, fn: () => drawSurvivor(g, x, y, T, w.look, t, w.path.length > 0) });
    if ((rt.hungry || rt.thirsty) && i % 3 === 0) needs.push({ x, y: y - T * 0.2, res: rt.hungry && (i % 2 === 0 || !rt.thirsty) ? 'meal' : 'water' });
  });
  items.sort((a, b) => a.d - b.d);
  for (const it of items) it.fn();

  // 头顶提示：施工进度、收获针
  hits.pins = [];
  const cap = storageCap();
  for (const b of S.buildings) {
    const [x, y] = toScreen(b.c, b.r);
    const top = y - T * (b.type === 'hq' ? 1.25 : 0.75);
    if (b.build) {
      const left = Math.ceil(b.build.left);
      drawTimer(g, x, y + T * 0.2, T, 1 - b.build.left / b.build.total, left >= 60 ? `${Math.floor(left / 60)}分${left % 60}秒` : `${left}秒`);
    }
    if (pinReady(b)) {
      const d = def(b.type);
      const res = (d.produce?.res ?? d.convert?.res)!;
      drawPin(g, x, top, T, res, t + b.uid, b.buffer >= bufCap(b) || S.res[res] >= cap);
      hits.pins.push({ uid: b.uid, x, y: top, r: T * 0.32 });
    }
  }
  for (const n of needs) drawNeed(g, n.x, n.y, T, n.res, t);

  // 指挥塔旁边的订单气泡
  hits.orders = [];
  const hq = S.buildings.find(b => b.type === 'hq')!;
  const [hx, hy] = toScreen(hq.c, hq.r);
  S.orders.forEach((o, i) => {
    if (o.cd > 0) return;
    const ox = hx + (i - 1) * T * 0.82, oy = hy - T * (1.5 + (i === 1 ? 0.32 : 0));
    const items2 = o.items.map(it => ({ res: it.res, have: S.res[it.res], n: it.n }));
    drawOrderBubble(g, ox, oy, T, items2, orderReady(o), t);
    const w = items2.length * T * 0.36 + 16, h = T * 0.45;
    hits.orders.push({ x: ox - w / 2, y: oy - h, w, h });
  });

  // 飘字
  for (const f of rt.floaters) {
    const [x, y0] = toScreen(f.c, f.r);
    const p = f.t / 1.3, y = y0 - T * (0.9 + p * 0.6);
    g.globalAlpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
    const s = T * 0.26;
    drawIcon(g, f.res, x - s * 0.5, y, s);
    g.font = `900 ${Math.round(s * 0.8)}px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif`;
    g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineWidth = 4; g.strokeStyle = INK; g.lineJoin = 'round';
    g.strokeText(`+${f.n}`, x, y); g.fillStyle = '#fff3b0'; g.fillText(`+${f.n}`, x, y);
    g.globalAlpha = 1;
  }
}

function diamond(c: number, r: number, fill: string, stroke: string, dashed = false) {
  const T = TW();
  const [x, y] = toScreen(c, r);
  g.beginPath();
  g.moveTo(x, y - T / 4 + 3); g.lineTo(x + T / 2 - 5, y); g.lineTo(x, y + T / 4 - 3); g.lineTo(x - T / 2 + 5, y); g.closePath();
  g.fillStyle = fill; g.fill();
  if (dashed) g.setLineDash([5, 4]);
  g.lineWidth = 2; g.strokeStyle = stroke; g.stroke(); g.setLineDash([]);
}

export { buildingAt };
