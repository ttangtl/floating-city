import {
  GRID, START_RAFT, SAVE_KEY, OFFLINE_CAP, RES, RES_IDS, BUILDINGS, BUILDABLE, HQ_MAX, QUESTS, START,
  EAT_PER_MIN, DRINK_PER_MIN, ARRIVE_EVERY,
  def, levelCost, levelTime, workersAt, rateMult, raftCost,
  type Res, type Cost, type BType,
} from './data';

export interface Building {
  uid: number; type: BType; c: number; r: number;
  level: number;          // 0 = 还在第一次建造
  buffer: number;         // 已产出、等着收的数量
  prog: number;           // 加工进度（0~1）
  build?: { to: number; left: number; total: number };
}

export interface Order { items: { res: Res; n: number }[]; reward: number; cd: number }

export interface State {
  coins: number;
  res: Record<Res, number>;
  rafts: string[];        // 已拥有的木筏格 "c,r"
  buildings: Building[];
  pop: number;
  morale: number;
  clock: number;
  orders: Order[];
  quest: number;
  stats: { made: Partial<Record<Res, number>>; orders: number; rafts: number };
  nextUid: number;
  lastSeen: number;
  tutorial: number;
}

export interface Walker {
  id: number;
  x: number; y: number;   // 浮点格坐标
  path: [number, number][];
  wait: number;
  home: number | null;    // 在哪栋建筑干活
  look: number;
}

export interface Floater { c: number; r: number; res: Res | 'coins'; n: number; t: number }

export type GameEvent =
  | { e: 'collect'; res: Res; n: number } | { e: 'built'; b: Building } | { e: 'arrive' } | { e: 'leave' }
  | { e: 'order' } | { e: 'full'; res: Res };

const key = (c: number, r: number) => `${c},${r}`;

export let S: State = newState();
export const rt = {
  walkers: [] as Walker[],
  floaters: [] as Floater[],
  hungry: false, thirsty: false,
  lastHunger: -99, lastThirst: -99,
  eatAcc: 0, drinkAcc: 0, arriveT: 0, leaveT: 0,
  onEvent: null as ((e: GameEvent) => void) | null,
};

function newState(): State {
  const rafts: string[] = [];
  const { c0, r0, size } = START_RAFT;
  for (let r = r0; r < r0 + size; r++) for (let c = c0; c < c0 + size; c++) rafts.push(key(c, r));
  const s: State = {
    coins: START.coins, res: { ...START.res }, rafts, buildings: [], pop: START.survivors, morale: 60, clock: 0,
    orders: [], quest: 0, stats: { made: {}, orders: 0, rafts: 0 }, nextUid: 1, lastSeen: Date.now(), tutorial: 0,
  };
  const add = (type: BType, c: number, r: number) => s.buildings.push({ uid: s.nextUid++, type, c, r, level: 1, buffer: 0, prog: 0 });
  add('hq', c0 + 1, r0 + 1);
  add('tent', c0, r0 + 3);
  add('dock', c0 + 3, r0);
  add('desal', c0 + 3, r0 + 3);
  return s;
}

// ---------- 存档 ----------
export function save() {
  S.lastSeen = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch { /* 无存储 */ }
}
/** 读档并补算离线收益；返回 { hasSave, offline 秒数 } */
export function load(): { hasSave: boolean; away: number; gained: Partial<Record<Res, number>> } {
  let away = 0;
  const before = { ...S.res };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) { fillOrders(); return { hasSave: false, away: 0, gained: {} }; }
    S = { ...newState(), ...JSON.parse(raw) };
    fillOrders();
    away = Math.min(OFFLINE_CAP, Math.max(0, (Date.now() - S.lastSeen) / 1000));
    const snap = { ...S.res };
    if (away > 30) for (let i = 0; i < away; i++) tick(1, true);
    const gained: Partial<Record<Res, number>> = {};
    for (const r of RES_IDS) { const d = Math.floor(S.res[r] - snap[r]); if (d > 0) gained[r] = d; }
    return { hasSave: true, away: away > 30 ? away : 0, gained };
  } catch {
    S = newState(); fillOrders();
    void before;
    return { hasSave: false, away: 0, gained: {} };
  }
}
export function resetGame() {
  S = newState();
  rt.walkers = []; rt.floaters = [];
  fillOrders();
  save();
}

// ---------- 查询 ----------
export const hqLevel = () => S.buildings.find(b => b.type === 'hq')!.level;
export const builders = () => (hqLevel() >= 3 ? 2 : 1);
export const busyBuilders = () => S.buildings.filter(b => b.build).length;
export const countOf = (t: BType) => S.buildings.filter(b => b.type === t).length;
export const isRaft = (c: number, r: number) => S.rafts.includes(key(c, r));
export const buildingAt = (c: number, r: number) => S.buildings.find(b => b.c === c && b.r === r);
export const working = (b: Building) => b.level >= 1;

export function storageCap() {
  let cap = 200;
  for (const b of S.buildings) if (working(b)) cap += (def(b.type).storage ?? 0) * b.level;
  return cap;
}
export function housing() {
  let n = 0;
  for (const b of S.buildings) if (working(b)) n += (def(b.type).housing ?? 0) * b.level;
  return n;
}
export function moraleMax() {
  let m = 72;
  for (const b of S.buildings) if (working(b)) m += (def(b.type).morale ?? 0) * b.level;
  return Math.min(100, m);
}
export const moraleMult = () => 0.55 + S.morale / 200;

/** 按建造顺序分配工人；返回 uid → 实际人数 */
export function staffing(): Map<number, number> {
  const m = new Map<number, number>();
  let free = S.pop;
  // 先保证吃喝，再按建造顺序
  const order = [...S.buildings].filter(working).filter(b => def(b.type).workers)
    .sort((a, b) => prio(a) - prio(b) || a.uid - b.uid);
  for (const b of order) {
    const need = workersAt(b.type, b.level);
    const n = Math.min(need, free);
    m.set(b.uid, n);
    free -= n;
  }
  return m;
}
const prio = (b: Building) => (b.type === 'kitchen' || b.type === 'desal' || b.type === 'dock' ? 0 : 1);
export const idleWorkers = () => S.pop - [...staffing().values()].reduce((a, b) => a + b, 0);

export function bufCap(b: Building) {
  const d = def(b.type);
  const per = d.produce?.perMin ?? d.convert?.perMin ?? 0;
  return Math.max(10, Math.round(per * rateMult(b.level) * 2)); // 存 2 分钟的量
}
export function ratePerMin(b: Building, staff = staffing()) {
  const d = def(b.type);
  const per = d.produce?.perMin ?? d.convert?.perMin ?? 0;
  const need = workersAt(b.type, b.level);
  const ratio = need ? (staff.get(b.uid) ?? 0) / need : 1;
  return per * rateMult(b.level) * ratio * moraleMult();
}
export const pinReady = (b: Building) => working(b) && b.buffer >= Math.max(3, bufCap(b) * 0.2);

// ---------- 资源 ----------
export function canAfford(cost: Cost) {
  return Object.entries(cost).every(([k, v]) => (k === 'coins' ? S.coins : S.res[k as Res]) >= (v ?? 0));
}
function pay(cost: Cost) {
  for (const [k, v] of Object.entries(cost)) {
    if (k === 'coins') S.coins -= v ?? 0; else S.res[k as Res] -= v ?? 0;
  }
}
export function grant(cost: Cost) {
  const cap = storageCap();
  for (const [k, v] of Object.entries(cost)) {
    if (k === 'coins') S.coins += v ?? 0;
    else S.res[k as Res] = Math.min(cap, S.res[k as Res] + (v ?? 0));
  }
}

// ---------- 建造 ----------
export type BuildCheck = { ok: true } | { ok: false; why: string };

export function canBuildType(t: BType): BuildCheck {
  const d = def(t);
  if (hqLevel() < d.unlockHq) return { ok: false, why: `指挥塔 ${d.unlockHq} 级解锁` };
  if (countOf(t) >= d.max(hqLevel())) return { ok: false, why: '数量已满，先升级指挥塔' };
  if (busyBuilders() >= builders()) return { ok: false, why: '工匠都在忙，等手上的活干完' };
  if (!canAfford(levelCost(t, 1))) return { ok: false, why: '材料不够' };
  return { ok: true };
}
export const freeTile = (c: number, r: number) => isRaft(c, r) && !buildingAt(c, r);

export function startBuild(t: BType, c: number, r: number): boolean {
  if (!canBuildType(t).ok || !freeTile(c, r)) return false;
  pay(levelCost(t, 1));
  const total = levelTime(t, 1);
  S.buildings.push({ uid: S.nextUid++, type: t, c, r, level: 0, buffer: 0, prog: 0, build: { to: 1, left: total, total } });
  // 站在格子上的人挪开
  for (const w of rt.walkers) if (Math.round(w.x) === c && Math.round(w.y) === r) { w.path = []; w.wait = 0; }
  return true;
}

export function upgradeCheck(b: Building): BuildCheck & { cost?: Cost; time?: number } {
  const to = b.level + 1;
  if (b.build) return { ok: false, why: '正在施工' };
  const maxLv = b.type === 'hq' ? HQ_MAX : hqLevel();
  if (b.level >= maxLv) return { ok: false, why: b.type === 'hq' ? '已满级' : '先升级指挥塔' };
  const cost = levelCost(b.type, b.type === 'hq' ? to - 1 : to);
  const time = levelTime(b.type, b.type === 'hq' ? to - 1 : to);
  if (busyBuilders() >= builders()) return { ok: false, why: '工匠都在忙', cost, time };
  if (!canAfford(cost)) return { ok: false, why: '材料不够', cost, time };
  return { ok: true, cost, time };
}
export function startUpgrade(b: Building): boolean {
  const chk = upgradeCheck(b);
  if (!chk.ok || !chk.cost || !chk.time) return false;
  pay(chk.cost);
  b.build = { to: b.level + 1, left: chk.time, total: chk.time };
  return true;
}
export function demolish(b: Building) {
  if (b.type === 'hq') return;
  const back = levelCost(b.type, Math.max(1, b.level));
  for (const k of Object.keys(back) as (keyof Cost)[]) back[k] = Math.floor((back[k] ?? 0) * 0.4);
  grant(back);
  S.buildings = S.buildings.filter(x => x !== b);
}

// ---------- 扩建木筏 ----------
export function canRaft(c: number, r: number) {
  if (c < 0 || r < 0 || c >= GRID || r >= GRID || isRaft(c, r)) return false;
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => isRaft(c + dc, r + dr));
}
export const nextRaftCost = () => raftCost(S.stats.rafts);
export function buyRaft(c: number, r: number): boolean {
  const cost = nextRaftCost();
  if (!canRaft(c, r) || !canAfford(cost)) return false;
  pay(cost);
  S.rafts.push(key(c, r));
  S.stats.rafts++;
  return true;
}

// ---------- 收获 ----------
export function collect(b: Building): number {
  const d = def(b.type);
  const res = d.produce?.res ?? d.convert?.res;
  if (!res) return 0;
  const room = storageCap() - S.res[res];
  const n = Math.min(Math.floor(b.buffer), Math.max(0, room));
  if (n <= 0) { if (b.buffer >= 1) rt.onEvent?.({ e: 'full', res }); return 0; }
  b.buffer -= n;
  S.res[res] += n;
  S.stats.made[res] = (S.stats.made[res] ?? 0) + n;
  rt.floaters.push({ c: b.c, r: b.r, res, n, t: 0 });
  rt.onEvent?.({ e: 'collect', res, n });
  return n;
}

// ---------- 订单 ----------
function genOrder(): Order {
  const hq = hqLevel();
  const pool: Res[] = ['meal', 'water', 'fish', 'wood', 'scrap'];
  if (countOf('loom')) pool.push('cloth');
  if (countOf('smelter')) pool.push('metal');
  const k = 1 + Math.floor(Math.random() * Math.min(3, 1 + hq));
  const items: Order['items'] = [];
  while (items.length < k) {
    const res = pool[Math.floor(Math.random() * pool.length)];
    if (items.some(i => i.res === res)) continue;
    const n = Math.max(2, Math.round(((6 + hq * 7) * (0.6 + Math.random() * 0.8)) / RES[res].value));
    items.push({ res, n });
  }
  const value = items.reduce((a, i) => a + RES[i.res].value * i.n, 0);
  return { items, reward: Math.round(value * 2.2 + 10), cd: 0 };
}
export function fillOrders() {
  while (S.orders.length < 3) S.orders.push(genOrder());
}
export const orderReady = (o: Order) => o.cd <= 0 && o.items.every(i => S.res[i.res] >= i.n);
export function fulfill(i: number): boolean {
  const o = S.orders[i];
  if (!o || !orderReady(o)) return false;
  for (const it of o.items) S.res[it.res] -= it.n;
  S.coins += o.reward;
  S.stats.orders++;
  S.orders[i] = { ...genOrder(), cd: 10 };
  rt.onEvent?.({ e: 'order' });
  return true;
}
export function skipOrder(i: number) {
  if (S.orders[i].cd > 0) return;
  S.orders[i] = { ...genOrder(), cd: 25 };
}

// ---------- 任务 ----------
export function questProgress(): { have: number; need: number } | null {
  const q = QUESTS[S.quest];
  if (!q) return null;
  const ch = q.check;
  switch (ch.k) {
    case 'have': return { have: S.buildings.filter(b => b.type === ch.t && working(b)).length, need: ch.n };
    case 'level': return { have: Math.max(0, ...S.buildings.filter(b => b.type === ch.t).map(b => b.level)), need: ch.n };
    case 'made': return { have: S.stats.made[ch.res] ?? 0, need: ch.n };
    case 'orders': return { have: S.stats.orders, need: ch.n };
    case 'rafts': return { have: S.stats.rafts, need: ch.n };
    case 'pop': return { have: S.pop, need: ch.n };
  }
}
export function claimQuest(): boolean {
  const p = questProgress();
  if (!p || p.have < p.need) return false;
  grant(QUESTS[S.quest].reward);
  S.quest++;
  return true;
}

// ---------- 主循环 ----------
export function tick(dt: number, offline = false) {
  S.clock += dt;
  const staff = staffing();
  const cap = storageCap();

  // 施工
  for (const b of S.buildings) {
    if (!b.build) continue;
    b.build.left -= dt;
    if (b.build.left <= 0) {
      b.level = b.build.to;
      b.build = undefined;
      if (!offline) rt.onEvent?.({ e: 'built', b });
    }
  }

  // 生产和加工
  for (const b of S.buildings) {
    if (!working(b)) continue;
    const d = def(b.type);
    if (!d.produce && !d.convert) continue;
    const bc = bufCap(b);
    if (b.buffer >= bc) continue;
    const amount = ratePerMin(b, staff) * dt / 60;
    if (d.produce) b.buffer = Math.min(bc, b.buffer + amount);
    else if (d.convert) {
      b.prog += amount;
      while (b.prog >= 1 && b.buffer < bc) {
        if (!canAfford(d.convert.from)) { b.prog = Math.min(b.prog, 1); break; }
        pay(d.convert.from);
        b.buffer += 1;
        b.prog -= 1;
      }
    }
    // 离线时当作幸存者自己去收
    if (offline && b.buffer >= 1) {
      const res = d.produce?.res ?? d.convert!.res;
      const n = Math.min(Math.floor(b.buffer), cap - S.res[res]);
      if (n > 0) { b.buffer -= n; S.res[res] += n; S.stats.made[res] = (S.stats.made[res] ?? 0) + n; }
    }
  }

  // 吃喝
  rt.eatAcc += S.pop * EAT_PER_MIN * dt / 60;
  rt.drinkAcc += S.pop * DRINK_PER_MIN * dt / 60;
  while (rt.eatAcc >= 1) { rt.eatAcc--; if (S.res.meal >= 1) S.res.meal--; else rt.lastHunger = S.clock; }
  while (rt.drinkAcc >= 1) { rt.drinkAcc--; if (S.res.water >= 1) S.res.water--; else rt.lastThirst = S.clock; }
  rt.hungry = S.clock - rt.lastHunger < 12;
  rt.thirsty = S.clock - rt.lastThirst < 12;

  // 士气：吃饱喝足慢慢涨到上限，缺吃缺喝就往下掉
  const target = rt.hungry || rt.thirsty ? (rt.hungry && rt.thirsty ? 5 : 25) : moraleMax();
  S.morale += (target - S.morale) * Math.min(1, 0.04 * dt);

  // 来人 / 走人
  if (S.pop < housing() && S.morale >= 45) {
    rt.arriveT += dt;
    if (rt.arriveT >= ARRIVE_EVERY) { rt.arriveT = 0; S.pop++; if (!offline) rt.onEvent?.({ e: 'arrive' }); }
  } else rt.arriveT = 0;
  if (S.morale < 20 && S.pop > 3) {
    rt.leaveT += dt;
    if (rt.leaveT >= 30) { rt.leaveT = 0; S.pop--; if (!offline) rt.onEvent?.({ e: 'leave' }); }
  } else rt.leaveT = 0;
  if (S.pop > housing() + 2) S.pop = housing() + 2; // 拆了帐篷，挤不下的人走掉

  // 订单冷却
  for (const o of S.orders) if (o.cd > 0) o.cd = Math.max(0, o.cd - dt);

  if (!offline) {
    updateWalkers(dt, staff);
    for (const f of rt.floaters) f.t += dt;
    rt.floaters = rt.floaters.filter(f => f.t < 1.3);
  }
}

// ---------- 幸存者小人（只是表现，不影响数值）----------
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const walkable = (c: number, r: number) => isRaft(c, r) && !buildingAt(c, r);

function bfs(sc: number, sr: number, goal: (c: number, r: number) => boolean): [number, number][] | null {
  const prev = new Map<string, string | null>();
  const q: [number, number][] = [[sc, sr]];
  prev.set(key(sc, sr), null);
  while (q.length) {
    const [c, r] = q.shift()!;
    if (goal(c, r)) {
      const path: [number, number][] = [];
      let k: string | null = key(c, r);
      while (k && k !== key(sc, sr)) { const [x, y] = k.split(',').map(Number); path.unshift([x, y]); k = prev.get(k) ?? null; }
      return path;
    }
    for (const [dc, dr] of DIRS) {
      const nc = c + dc, nr = r + dr;
      if (!walkable(nc, nr) || prev.has(key(nc, nr))) continue;
      prev.set(key(nc, nr), key(c, r));
      q.push([nc, nr]);
    }
  }
  return null;
}

let walkerId = 1;
function updateWalkers(dt: number, staff: Map<number, number>) {
  const want = Math.min(S.pop, 36);
  while (rt.walkers.length < want) {
    const tiles = S.rafts.map(k => k.split(',').map(Number) as [number, number]).filter(([c, r]) => walkable(c, r));
    if (!tiles.length) break;
    const [c, r] = tiles[Math.floor(Math.random() * tiles.length)];
    rt.walkers.push({ id: walkerId++, x: c, y: r, path: [], wait: Math.random() * 2, home: null, look: Math.floor(Math.random() * 1000) });
  }
  if (rt.walkers.length > want) rt.walkers.length = want;

  // 给小人分配岗位：有几个工人名额就派几个人站过去
  const slots: number[] = [];
  for (const [uid, n] of staff) for (let i = 0; i < n; i++) slots.push(uid);
  rt.walkers.forEach((w, i) => { w.home = slots[i] ?? null; });

  for (const w of rt.walkers) {
    if (w.path.length) {
      const [tc, tr] = w.path[0];
      if (!walkable(tc, tr)) { w.path = []; continue; }
      const dx = tc - w.x, dy = tr - w.y, dist = Math.hypot(dx, dy), step = 1.6 * dt;
      if (dist <= step) { w.x = tc; w.y = tr; w.path.shift(); }
      else { w.x += dx / dist * step; w.y += dy / dist * step; }
      continue;
    }
    w.wait -= dt;
    if (w.wait > 0) continue;
    const c = Math.round(w.x), r = Math.round(w.y);
    const home = S.buildings.find(b => b.uid === w.home);
    let goal: ((x: number, y: number) => boolean) | null = null;
    if (home && Math.random() < 0.8) goal = (x, y) => Math.abs(x - home.c) + Math.abs(y - home.r) === 1;
    else {
      const hq = S.buildings.find(b => b.type === 'hq')!;
      const pick = Math.random() < 0.4 ? hq : S.buildings[Math.floor(Math.random() * S.buildings.length)];
      goal = (x, y) => Math.abs(x - pick.c) + Math.abs(y - pick.r) === 1 && Math.random() < 0.7;
    }
    const p = goal ? bfs(c, r, goal) : null;
    w.path = p ?? [];
    w.wait = home ? 3 + Math.random() * 5 : 1.5 + Math.random() * 4;
    if (!walkable(c, r)) { // 脚下被盖了房子
      const t = bfs(c, r, walkable);
      if (t) w.path = t;
    }
  }
}

export { BUILDINGS, BUILDABLE };
