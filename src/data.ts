// 所有数值集中在这里，调平衡只改这个文件。

export const GRID = 16;               // 海面是 GRID×GRID 的菱形格
export const START_RAFT = { c0: 6, r0: 6, size: 4 }; // 开局的 4×4 木筏
export const SAVE_KEY = 'floatcity-save-v1';
export const OFFLINE_CAP = 2 * 3600;   // 离线收益最多算 2 小时

export type Res = 'fish' | 'water' | 'wood' | 'scrap' | 'cloth' | 'metal' | 'meal';
export const RES_IDS: Res[] = ['meal', 'water', 'fish', 'wood', 'scrap', 'cloth', 'metal'];
export const RES: Record<Res, { name: string; value: number }> = {
  meal: { name: '鱼餐', value: 3 },
  water: { name: '淡水', value: 1 },
  fish: { name: '鲜鱼', value: 1 },
  wood: { name: '木材', value: 1 },
  scrap: { name: '废品', value: 1 },
  cloth: { name: '布料', value: 3 },
  metal: { name: '金属', value: 4 },
};

export type Cost = Partial<Record<Res | 'coins', number>>;

export type BKind = 'hq' | 'house' | 'prod' | 'conv' | 'store' | 'care';

export interface BuildingDef {
  name: string;
  desc: string;
  kind: BKind;
  unlockHq: number;     // 指挥塔几级解锁
  cost: Cost;           // 建造（升到 1 级）的花费，之后每级 ×1.55
  time: number;         // 建造秒数，之后每级 ×1.45
  workers: number;      // 1 级需要几个人，之后每 2 级 +1
  produce?: { res: Res; perMin: number };            // 生产：凭空产出
  convert?: { from: Cost; res: Res; perMin: number }; // 加工：消耗 from 产出 res
  housing?: number;     // 每级住几个人
  storage?: number;     // 每级加多少仓储
  morale?: number;      // 每级加多少士气上限
  max: (hq: number) => number; // 最多能建几个
}

export const BUILDINGS = {
  hq: {
    name: '指挥塔', desc: '浮城的心脏。等级决定其他建筑能升多高、能解锁什么',
    kind: 'hq', unlockHq: 99, cost: { coins: 250, wood: 70, scrap: 50 }, time: 40, workers: 0,
    housing: 4, storage: 60, max: () => 1,
  },
  tent: {
    name: '帐篷', desc: '给幸存者住的地方，人多了才有人干活',
    kind: 'house', unlockHq: 1, cost: { wood: 25, scrap: 10 }, time: 12, workers: 0,
    housing: 4, max: hq => 2 + hq * 2,
  },
  dock: {
    name: '捕鱼台', desc: '撒网捕鱼，产出鲜鱼',
    kind: 'prod', unlockHq: 1, cost: { coins: 40, wood: 25 }, time: 15, workers: 2,
    produce: { res: 'fish', perMin: 18 }, max: hq => 1 + hq,
  },
  desal: {
    name: '海水提取厂', desc: '把海水变成能喝的淡水',
    kind: 'prod', unlockHq: 1, cost: { coins: 40, wood: 20, scrap: 15 }, time: 15, workers: 2,
    produce: { res: 'water', perMin: 10 }, max: hq => 1 + hq,
  },
  salvage: {
    name: '打捞站', desc: '从海里捞起漂来的废品',
    kind: 'prod', unlockHq: 1, cost: { coins: 30, wood: 25 }, time: 15, workers: 2,
    produce: { res: 'scrap', perMin: 14 }, max: hq => 1 + hq,
  },
  drift: {
    name: '漂木站', desc: '收集海上的漂流木',
    kind: 'prod', unlockHq: 1, cost: { coins: 40, scrap: 20 }, time: 15, workers: 2,
    produce: { res: 'wood', perMin: 14 }, max: hq => 1 + hq,
  },
  kitchen: {
    name: '厨房', desc: '把鲜鱼做成鱼餐，幸存者每天都要吃',
    kind: 'conv', unlockHq: 1, cost: { coins: 60, wood: 30, scrap: 15 }, time: 20, workers: 2,
    convert: { from: { fish: 2 }, res: 'meal', perMin: 9 }, max: hq => Math.ceil(hq / 2) + 1,
  },
  loom: {
    name: '织布坊', desc: '把废品里的旧布料拆洗重织',
    kind: 'conv', unlockHq: 2, cost: { coins: 80, wood: 40, scrap: 20 }, time: 25, workers: 2,
    convert: { from: { scrap: 2 }, res: 'cloth', perMin: 4 }, max: hq => Math.ceil(hq / 2),
  },
  smelter: {
    name: '熔炼炉', desc: '把废品熔成可用的金属',
    kind: 'conv', unlockHq: 2, cost: { coins: 100, wood: 50, scrap: 40 }, time: 30, workers: 2,
    convert: { from: { scrap: 3 }, res: 'metal', perMin: 3 }, max: hq => Math.ceil(hq / 2),
  },
  storage: {
    name: '仓库', desc: '所有资源的存储上限都会提高',
    kind: 'store', unlockHq: 2, cost: { coins: 80, wood: 60, metal: 10 }, time: 25, workers: 0,
    storage: 120, max: hq => hq,
  },
  clinic: {
    name: '医疗站', desc: '照顾伤病员，提高士气上限',
    kind: 'care', unlockHq: 3, cost: { coins: 150, cloth: 40, metal: 20 }, time: 35, workers: 1,
    morale: 8, max: () => 2,
  },
} satisfies Record<string, BuildingDef>;

export type BType = keyof typeof BUILDINGS;
export const BTYPES = Object.keys(BUILDINGS) as BType[];
export const BUILDABLE = BTYPES.filter(t => t !== 'hq');
export const def = (t: BType): BuildingDef => BUILDINGS[t];

export const HQ_MAX = 8;

/** 升到 level 级的花费 / 时间 */
export function levelCost(t: BType, level: number): Cost {
  const k = Math.pow(1.55, level - 1);
  const c: Cost = {};
  for (const [r, v] of Object.entries(def(t).cost)) c[r as keyof Cost] = Math.round((v ?? 0) * k);
  // 指挥塔 3 级起要用到熔炼和织布的产物；第一级只用基础材料，避免卡死
  if (t === 'hq' && level >= 2) { c.metal = 20 * (level - 1); c.cloth = 15 * (level - 1); }
  // 其他建筑高等级也要金属
  else if (t !== 'hq' && level >= 4) c.metal = (c.metal ?? 0) + 6 * (level - 3);
  return c;
}
export const levelTime = (t: BType, level: number) => Math.round(def(t).time * Math.pow(1.45, level - 1));
export const workersAt = (t: BType, level: number) => def(t).workers ? def(t).workers + Math.floor((level - 1) / 2) : 0;
export const rateMult = (level: number) => 1 + 0.35 * (level - 1);

/** 幸存者每分钟消耗 */
export const EAT_PER_MIN = 0.4;   // 鱼餐
export const DRINK_PER_MIN = 0.4; // 淡水
export const ARRIVE_EVERY = 20;   // 有空床位且士气够时，每隔几秒来一个新幸存者
export const START = {
  coins: 250,
  survivors: 5,
  res: { meal: 20, water: 20, fish: 10, wood: 60, scrap: 30, cloth: 16, metal: 10 } as Record<Res, number>,
};

/** 扩建木筏的花费：越扩越贵 */
export const raftCost = (extra: number): Cost => ({ wood: 10 + extra * 3, coins: 10 + extra * 5 });

// ---------- 主线任务 ----------
export type QuestCheck =
  | { k: 'have'; t: BType; n: number }
  | { k: 'level'; t: BType; n: number }
  | { k: 'made'; res: Res; n: number }
  | { k: 'orders'; n: number }
  | { k: 'rafts'; n: number }
  | { k: 'pop'; n: number };

export interface Quest { text: string; check: QuestCheck; reward: Cost }

export const QUESTS: Quest[] = [
  { text: '建造一座打捞站', check: { k: 'have', t: 'salvage', n: 1 }, reward: { coins: 60, wood: 20 } },
  { text: '建造一间厨房', check: { k: 'have', t: 'kitchen', n: 1 }, reward: { coins: 60, fish: 20 } },
  { text: '做出 10 份鱼餐', check: { k: 'made', res: 'meal', n: 10 }, reward: { coins: 80, water: 20 } },
  { text: '建造一座漂木站', check: { k: 'have', t: 'drift', n: 1 }, reward: { coins: 60, scrap: 20 } },
  { text: '完成 2 个补给订单', check: { k: 'orders', n: 2 }, reward: { coins: 100, cloth: 10 } },
  { text: '再搭一顶帐篷', check: { k: 'have', t: 'tent', n: 2 }, reward: { coins: 80, wood: 30 } },
  { text: '扩建 3 块木筏', check: { k: 'rafts', n: 3 }, reward: { coins: 100, wood: 30 } },
  { text: '指挥塔升到 2 级', check: { k: 'level', t: 'hq', n: 2 }, reward: { coins: 150, metal: 15 } },
  { text: '建造一座熔炼炉', check: { k: 'have', t: 'smelter', n: 1 }, reward: { coins: 120, scrap: 40 } },
  { text: '建造一间织布坊', check: { k: 'have', t: 'loom', n: 1 }, reward: { coins: 120, scrap: 40 } },
  { text: '幸存者达到 15 人', check: { k: 'pop', n: 15 }, reward: { coins: 150, meal: 30 } },
  { text: '捕鱼台升到 3 级', check: { k: 'level', t: 'dock', n: 3 }, reward: { coins: 150, wood: 40 } },
  { text: '建造一座仓库', check: { k: 'have', t: 'storage', n: 1 }, reward: { coins: 150, metal: 20 } },
  { text: '完成 10 个补给订单', check: { k: 'orders', n: 10 }, reward: { coins: 250, cloth: 30 } },
  { text: '指挥塔升到 3 级', check: { k: 'level', t: 'hq', n: 3 }, reward: { coins: 300, metal: 30 } },
  { text: '建造一座医疗站', check: { k: 'have', t: 'clinic', n: 1 }, reward: { coins: 250, cloth: 30 } },
  { text: '海水提取厂升到 4 级', check: { k: 'level', t: 'desal', n: 4 }, reward: { coins: 300, scrap: 60 } },
  { text: '幸存者达到 30 人', check: { k: 'pop', n: 30 }, reward: { coins: 400, meal: 60 } },
  { text: '扩建 12 块木筏', check: { k: 'rafts', n: 12 }, reward: { coins: 400, wood: 80 } },
  { text: '指挥塔升到 4 级', check: { k: 'level', t: 'hq', n: 4 }, reward: { coins: 500, metal: 50 } },
  { text: '完成 30 个补给订单', check: { k: 'orders', n: 30 }, reward: { coins: 600, cloth: 50 } },
  { text: '幸存者达到 50 人', check: { k: 'pop', n: 50 }, reward: { coins: 800, meal: 100 } },
  { text: '指挥塔升到 5 级', check: { k: 'level', t: 'hq', n: 5 }, reward: { coins: 1000, metal: 80 } },
];
