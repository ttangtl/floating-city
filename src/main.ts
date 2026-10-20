import './style.css';
import {
  RES, RES_IDS, BUILDABLE, QUESTS, EAT_PER_MIN, DRINK_PER_MIN, HQ_MAX,
  def, levelCost, levelTime, workersAt, type Cost, type Res, type BType,
} from './data';
import {
  S, rt, load, save, resetGame, tick, hqLevel, housing, storageCap, moraleMax, staffing, idleWorkers, bufCap, ratePerMin,
  canAfford, canBuildType, startBuild, upgradeCheck, startUpgrade, demolish, buildingAt, collect, countOf,
  canRaft, buyRaft, nextRaftCost, fulfill, skipOrder, orderReady, questProgress, claimQuest, builders, busyBuilders, working,
  type Building,
} from './game';
import { initRender, draw, view, toTile, zoomAt, clampCamera, hits, centerOn, resize } from './render';
import { iconURL, buildingURL, drawBuilding, drawRaft, type IconKind } from './art';
import { sfx, audio, unlockAudio, setSound, setMusic } from './sfx';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const canvas = $<HTMLCanvasElement>('#cv'), sheet = $('#sheet'), modal = $('#modal'), hintEl = $('#hint'), questEl = $('#quest');

type Tab = 'build' | 'orders' | 'city' | 'building' | null;
let tab: Tab = null;
let paused = true;
let hintTimer = 0;

// ---------- 小工具 ----------
const ico = (k: IconKind, cls = 'ico') => `<img class="${cls}" src="${iconURL(k)}" alt="">`;
const bimg = (t: BType, cls = 'thumb') => `<img class="${cls}" src="${buildingURL(t)}" alt="">`;
const resKey = (k: string) => (k === 'coins' ? 'coins' : k) as IconKind;
const have = (k: string) => (k === 'coins' ? S.coins : S.res[k as Res]);
function costHTML(cost: Cost, check = true) {
  return Object.entries(cost).map(([k, v]) =>
    `<span class="${check && have(k) < (v ?? 0) ? 'lack' : ''}">${ico(resKey(k))}${v}</span>`).join('');
}
const fmtTime = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}分${s % 60 ? `${s % 60}秒` : ''}` : `${s}秒`);
function hint(text: string, kind: '' | 'sticky' | 'bad' = '') {
  if (kind === 'bad') sfx.error();
  hintEl.textContent = text;
  hintEl.className = (text ? 'show ' : '') + kind;
  hintTimer = kind === 'sticky' ? Infinity : 2.6;
}
function lackText(cost: Cost) {
  const lack = Object.entries(cost).filter(([k, v]) => have(k) < (v ?? 0)).map(([k]) => (k === 'coins' ? '金币' : RES[k as Res].name));
  return lack.length ? `${lack.join('、')}不够` : '';
}

// ---------- HUD ----------
const shown: Record<string, number> = {};
function bumpIf(key: string, v: number, el: HTMLElement) {
  if (shown[key] !== undefined && v > shown[key]) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  shown[key] = v;
}
function renderHUD() {
  $('#hqbadge b').textContent = String(hqLevel());
  const pop = $('#pop'), coins = $('#coins');
  pop.innerHTML = `<img src="${iconURL('pop')}" alt=""><b>${S.pop}</b><small>/${housing()}</small>`;
  coins.innerHTML = `<img src="${iconURL('coins')}" alt=""><b>${S.coins}</b>`;
  bumpIf('coins', S.coins, coins);
  const m = Math.round(S.morale);
  const bar = $('#moralebar');
  bar.style.width = `${m}%`;
  bar.className = m < 30 ? 'low' : m < 55 ? 'mid' : '';
  $('#moraleicon').innerHTML = `<img src="${iconURL('morale')}" alt="">`;
  $('#moraletext').textContent = rt.hungry && rt.thirsty ? '又饿又渴！' : rt.hungry ? '没饭吃了！' : rt.thirsty ? '没水喝了！' : `士气 ${m}`;

  const cap = storageCap();
  const rb = $('#resbar');
  if (!rb.children.length) rb.innerHTML = RES_IDS.map(r => `<div data-r="${r}"><img src="${iconURL(r)}" alt=""><b></b></div>`).join('');
  for (const r of RES_IDS) {
    const el = rb.querySelector<HTMLElement>(`[data-r="${r}"]`)!;
    const v = Math.floor(S.res[r]);
    el.querySelector('b')!.textContent = String(v);
    el.classList.toggle('full', v >= cap);
    el.classList.toggle('low', (r === 'meal' || r === 'water') && v < 5);
    bumpIf(r, v, el);
  }

  // 任务横幅
  const q = QUESTS[S.quest], p = questProgress();
  if (!q || !p) questEl.className = 'hidden';
  else {
    const done = p.have >= p.need;
    questEl.className = done ? 'done' : '';
    const html = `<span class="clip"></span><div class="qt"><b>${q.text}</b>
      <small>${done ? '完成了！点领取奖励' : `进度 ${Math.min(p.have, p.need)}/${p.need}`} · 奖励 ${costHTML(q.reward, false).replace(/<span class="">/g, '<span>')}</small>
      ${done ? '' : `<div class="qbar"><i style="width:${(Math.min(p.have, p.need) / p.need) * 100}%"></i></div>`}</div>
      ${done ? '<button class="btn go" data-q="claim">领取</button>' : ''}`;
    if (questEl.dataset.h !== html) { questEl.innerHTML = html; questEl.dataset.h = html; }
  }
  const ready = S.orders.filter(orderReady).length;
  const badge = $('.n-orders .badge');
  badge.textContent = String(ready);
  badge.classList.toggle('show', ready > 0);
}

// ---------- 面板 ----------
let lastSheet = '';
const head = (title: string, extra = '') => `<header class="sh">${extra}<h3>${title}</h3><button class="x" data-act="close" aria-label="关闭">✕</button></header>`;

function renderSheet(force = false) {
  if (!tab) { sheet.classList.remove('open'); lastSheet = ''; return; }
  let html = '';
  if (tab === 'build') html = buildHTML();
  else if (tab === 'orders') html = ordersHTML();
  else if (tab === 'city') html = cityHTML();
  else if (tab === 'building') {
    const b = S.buildings.find(x => x.uid === view.selected);
    if (!b) return openTab(null);
    html = buildingHTML(b);
  }
  if (force || html !== lastSheet) {
    const st = sheet.scrollTop;
    sheet.innerHTML = html; lastSheet = html;
    sheet.scrollTop = st;
  }
  sheet.classList.add('open');
}

function info(t: BType) {
  const d = def(t);
  if (d.produce) return `产出 ${ico(d.produce.res, 'ico sm')} ${d.produce.perMin}/分 · ${d.workers}人`;
  if (d.convert) return `${Object.entries(d.convert.from).map(([k, v]) => `${v}${ico(k as Res, 'ico sm')}`).join('')} → 1${ico(d.convert.res, 'ico sm')} · ${d.workers}人`;
  if (d.housing) return `住 ${d.housing} 人`;
  if (d.storage) return `仓储 +${d.storage}`;
  if (d.morale) return `士气上限 +${d.morale}`;
  return '';
}

function buildHTML() {
  const cards = BUILDABLE.map(t => {
    const d = def(t), chk = canBuildType(t), max = d.max(hqLevel());
    const locked = hqLevel() < d.unlockHq;
    return `<button class="card ${chk.ok ? '' : 'no'}" data-act="pick" data-id="${t}">
      <div class="pic">${bimg(t)}</div>
      ${locked ? `<span class="lock">🔒 指挥塔 ${d.unlockHq} 级</span>` : ''}
      <div class="nm">${d.name}<small>${countOf(t)}/${max}</small></div>
      <div class="d">${info(t)}</div>
      <div class="cost">${costHTML(levelCost(t, 1))}</div></button>`;
  }).join('');
  return `${head('建造', '')}
    <p class="tip" style="margin:-4px 2px 10px">工匠 ${busyBuilders()}/${builders()} 在忙 · 建好的建筑点一下可以升级</p>
    <div class="grid">${cards}</div>`;
}

function ordersHTML() {
  const rows = S.orders.map((o, i) => {
    if (o.cd > 0) return `<div class="order cool">新的订单还有 ${Math.ceil(o.cd)} 秒送到…</div>`;
    const ready = orderReady(o);
    return `<div class="order ${ready ? 'ready' : ''}">
      <div class="items">${o.items.map(it => {
        const ok = S.res[it.res] >= it.n;
        return `<span class="it ${ok ? 'ok' : 'no'}">${ico(it.res, 'ico lg')}${Math.floor(Math.min(S.res[it.res], 9999))}/${it.n}</span>`;
      }).join('')}</div>
      <div class="foot"><span class="rw">报酬 ${ico('coins')} ${o.reward}</span>
        <button class="btn ghost" data-act="skip" data-id="${i}">换一个</button>
        <button class="btn go" data-act="deliver" data-id="${i}" ${ready ? '' : 'disabled'}>交付</button></div></div>`;
  }).join('');
  return `${head('补给订单')}${rows}
    <p class="tip">路过的船队想换点物资。交付后拿金币；注意别把鱼餐和淡水交光了，大家还要吃喝。</p>`;
}

function cityHTML() {
  const staff = staffing();
  let mealIn = 0, waterIn = 0;
  for (const b of S.buildings) {
    if (!working(b)) continue;
    const d = def(b.type);
    if (d.convert?.res === 'meal') mealIn += ratePerMin(b, staff);
    if (d.produce?.res === 'water') waterIn += ratePerMin(b, staff);
  }
  const eat = S.pop * EAT_PER_MIN, drink = S.pop * DRINK_PER_MIN;
  const row = (k: Res, name: string, inn: number, out: number) => {
    const net = inn - out;
    return `${ico(k)}<span>${name}</span><b class="${net >= 0 ? 'plus' : 'minus'}">${net >= 0 ? '+' : ''}${net.toFixed(1)}/分</b>
      <span></span><small style="color:var(--ink-soft)">产 ${inn.toFixed(1)} · 耗 ${out.toFixed(1)}</small><span></span>`;
  };
  return `${head('我的浮城')}
    <div class="stats">
      <div><b>${S.pop}/${housing()}</b><small>幸存者</small></div>
      <div><b>${idleWorkers()}</b><small>闲着的人</small></div>
      <div><b>${Math.round(S.morale)}/${moraleMax()}</b><small>士气</small></div>
      <div><b>${storageCap()}</b><small>仓储上限</small></div>
      <div><b>${S.rafts.length}</b><small>木筏</small></div>
      <div><b>${S.stats.orders}</b><small>完成订单</small></div>
    </div>
    <div class="sub">吃喝收支（每分钟）</div>
    <div class="flow">${row('meal', '鱼餐', mealIn, eat)}${row('water', '淡水', waterIn, drink)}</div>
    <p class="tip">吃饱喝足，士气才会涨；士气够高、帐篷有空位，就会有新的幸存者来投奔。士气越高，大家干活越快。缺吃少喝士气会暴跌，人还会离开。</p>
    <div class="sub">设置</div>
    <div class="row"><div class="main"><b>音效</b></div><button class="toggle ${audio.sound ? 'on' : ''}" data-act="sound"><i></i></button></div>
    <div class="row"><div class="main"><b>背景音乐</b></div><button class="toggle ${audio.music ? 'on' : ''}" data-act="music"><i></i></button></div>
    <div class="actions"><button class="btn danger" data-act="reset">重新开始</button></div>`;
}

function buildingHTML(b: Building) {
  const d = def(b.type), staff = staffing();
  const lvTxt = b.level ? `Lv${b.level}` : '建造中';
  let body = '';
  if (b.build) {
    body = `<div class="uprow"><span>${b.level ? `正在升到 Lv${b.build.to}` : '正在建造'}<small>还要 ${fmtTime(Math.ceil(b.build.left))}</small></span></div>`;
  }
  if (d.produce || d.convert) {
    const need = workersAt(b.type, Math.max(1, b.level)), got = staff.get(b.uid) ?? 0;
    const res = (d.produce?.res ?? d.convert?.res)!;
    const stalled = d.convert && !canAfford(d.convert.from) && b.buffer < bufCap(b);
    body += `<div class="stats">
      <div><b>${ratePerMin(b, staff).toFixed(1)}</b><small>${RES[res].name}/分</small></div>
      <div><b style="color:${got < need ? 'var(--red)' : 'inherit'}">${got}/${need}</b><small>工人</small></div>
      <div><b>${Math.floor(b.buffer)}/${bufCap(b)}</b><small>待收获</small></div></div>
      ${d.convert ? `<p class="tip" style="margin:0 2px 8px">每做 1 份${RES[res].name}消耗 ${Object.entries(d.convert.from).map(([k, v]) => `${v} ${RES[k as Res].name}`).join('、')}${stalled ? ' · <b style="color:var(--red)">原料不够，停工了</b>' : ''}</p>` : ''}
      ${got < need ? `<p class="tip" style="margin:0 2px 8px;color:var(--red)">人手不够，产量打折。多搭帐篷让更多人来。</p>` : ''}
      ${b.buffer >= 1 ? `<button class="btn go big" data-act="collect" style="margin-bottom:10px">收获 ${Math.floor(b.buffer)} ${RES[res].name}</button>` : ''}`;
  } else if (b.type === 'hq') {
    const next = BUILDABLE.filter(t => def(t).unlockHq === b.level + 1).map(t => def(t).name);
    body += `<div class="stats">
      <div><b>${housing()}</b><small>总床位</small></div><div><b>${storageCap()}</b><small>仓储</small></div><div><b>${builders()}</b><small>工匠</small></div></div>
      <p class="tip" style="margin:0 2px 8px">${d.desc}。${b.level < HQ_MAX ? `升到 ${b.level + 1} 级：其他建筑上限 +1 级${next.length ? `，解锁 ${next.join('、')}` : ''}${b.level + 1 === 3 ? '，多一个工匠' : ''}。` : ''}</p>`;
  } else {
    body += `<p class="tip" style="margin:0 2px 8px">${d.desc}。${info(b.type)}${b.level > 1 ? `（×${b.level} 级）` : ''}</p>`;
  }
  const chk = b.build ? null : upgradeCheck(b);
  const up = chk?.cost
    ? `<div class="uprow"><span>升到 <b>Lv${b.level + 1}</b><small>用时 ${fmtTime(chk.time!)}${chk.ok ? '' : ` · ${chk.why}`}</small></span><div class="cost">${costHTML(chk.cost)}</div></div>`
    : chk && !chk.ok ? `<div class="uprow"><span><b>${chk.why}</b></span></div>` : '';
  return `${head(`${d.name} <em>${lvTxt}</em>`, bimg(b.type, 'thumb sm'))}${body}${up}
    <div class="actions">
      ${b.type !== 'hq' ? '<button class="btn danger" data-act="demolish">拆除</button>' : ''}
      ${chk?.cost ? `<button class="btn go" data-act="upgrade" ${chk.ok ? '' : 'disabled'}>升级</button>` : ''}
    </div>`;
}

function setMode(m: typeof view.mode) {
  view.mode = m;
  if (m !== 'build') view.placing = null;
  document.querySelector('.n-raft')!.classList.toggle('on', m === 'raft');
  if (m === 'raft') {
    const c = nextRaftCost();
    hint(`点海面上的「+」扩建木筏 · 每块 ${c.wood} 木材 ${c.coins} 金币`, 'sticky');
  } else if (m === 'none') hint('');
}

function openTab(t: Tab) {
  if (t && t !== tab) sfx.tap();
  tab = t;
  if (t !== 'building') view.selected = null;
  document.querySelectorAll<HTMLElement>('#bottom .nb').forEach(b => b.classList.toggle('on', b.dataset.tab === t || (b.dataset.tab === 'raft' && view.mode === 'raft')));
  renderSheet(true);
}

// ---------- 事件：按钮 ----------
document.querySelectorAll<HTMLElement>('#bottom .nb').forEach(btn => btn.addEventListener('click', () => {
  const t = btn.dataset.tab!;
  if (t === 'raft') {
    openTab(null);
    setMode(view.mode === 'raft' ? 'none' : 'raft');
    sfx.tap();
    return;
  }
  setMode('none');
  openTab(tab === t ? null : t as Tab);
}));

sheet.addEventListener('click', e => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!el) return;
  const act = el.dataset.act, id = el.dataset.id;
  if (act === 'close') return openTab(null);
  if (act === 'pick') {
    const t = id as BType, chk = canBuildType(t);
    if (!chk.ok) return hint(chk.why === '材料不够' ? lackText(levelCost(t, 1)) : chk.why, 'bad');
    view.placing = t;
    view.mode = 'build';
    openTab(null);
    hint(`点发绿光的木筏，放下「${def(t).name}」`, 'sticky');
  }
  const b = S.buildings.find(x => x.uid === view.selected);
  if (act === 'collect' && b) { collect(b); renderSheet(true); }
  if (act === 'upgrade' && b) {
    if (startUpgrade(b)) { sfx.build(); hint(`${def(b.type).name}开始升级`); save(); }
    else { const c = upgradeCheck(b); hint(c.ok ? '' : (c.why === '材料不够' && c.cost ? lackText(c.cost) : c.why), 'bad'); }
    renderSheet(true);
  }
  if (act === 'demolish' && b) {
    if (confirm(`拆掉${def(b.type).name}？只返还四成材料。`)) { demolish(b); openTab(null); hint('已拆除'); save(); }
  }
  if (act === 'deliver') { if (fulfill(Number(id))) { sfx.claim(); save(); renderSheet(true); } }
  if (act === 'skip') { skipOrder(Number(id)); renderSheet(true); }
  if (act === 'sound') { setSound(!audio.sound); renderMute(); renderSheet(true); }
  if (act === 'music') { setMusic(!audio.music); renderMute(); renderSheet(true); }
  if (act === 'reset' && confirm('确定清空存档，重新开始？')) { resetGame(); openTab(null); centerOn(...hqPos()); }
});

questEl.addEventListener('click', e => {
  if ((e.target as HTMLElement).closest('[data-q="claim"]')) {
    if (claimQuest()) { sfx.fanfare(); hint('任务完成！奖励已到账'); save(); }
  }
});

const muteBtn = $('#mute');
function renderMute() { muteBtn.classList.toggle('off', !(audio.sound || audio.music)); }
muteBtn.addEventListener('click', () => { const on = !(audio.sound || audio.music); setSound(on); setMusic(on); renderMute(); if (tab === 'city') renderSheet(true); });
renderMute();
window.addEventListener('pointerdown', unlockAudio, { capture: true });

// ---------- 事件：地图（拖动 / 双指缩放 / 点击）----------
const pts = new Map<number, { x: number; y: number }>();
let dragged = false, startX = 0, startY = 0, pinchD = 0, pinchZ = 1;
canvas.addEventListener('pointerdown', e => {
  try { canvas.setPointerCapture(e.pointerId); } catch { /* 某些浏览器对合成事件会抛错 */ }
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 1) { dragged = false; startX = e.clientX; startY = e.clientY; }
  if (pts.size === 2) { const [a, b] = [...pts.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); pinchZ = view.zoom; dragged = true; }
});
canvas.addEventListener('pointermove', e => {
  const p = pts.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (pts.size === 2) {
    const [a, b] = [...pts.values()];
    const rect = canvas.getBoundingClientRect();
    zoomAt((a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top, pinchZ * Math.hypot(a.x - b.x, a.y - b.y) / pinchD);
    return;
  }
  if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) dragged = true;
  if (dragged) { view.ox += dx; view.oy += dy; clampCamera(); }
});
const endPointer = (e: PointerEvent) => {
  const was = pts.has(e.pointerId);
  pts.delete(e.pointerId);
  if (!was || dragged || pts.size) return;
  const rect = canvas.getBoundingClientRect();
  tapAt(e.clientX - rect.left, e.clientY - rect.top);
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', e => pts.delete(e.pointerId));
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  zoomAt(e.clientX - rect.left, e.clientY - rect.top, view.zoom * (e.deltaY < 0 ? 1.1 : 0.9));
}, { passive: false });

function tapAt(x: number, y: number) {
  // 先看是不是点到了收获针 / 订单气泡
  for (const p of hits.pins) if (Math.hypot(x - p.x, y - p.y) < p.r) {
    const b = S.buildings.find(q => q.uid === p.uid);
    if (b) collect(b);
    return;
  }
  for (const o of hits.orders) if (x > o.x && x < o.x + o.w && y > o.y - 6 && y < o.y + o.h + 10) { setMode('none'); openTab('orders'); return; }

  const [c, r] = toTile(x, y);
  if (view.mode === 'raft') {
    if (canRaft(c, r)) {
      if (buyRaft(c, r)) { sfx.build(); save(); setMode('raft'); }
      else hint(lackText(nextRaftCost()), 'bad');
    } else setMode('none');
    return;
  }
  if (view.mode === 'build' && view.placing) {
    const t = view.placing;
    if (startBuild(t, c, r)) { sfx.build(); hint(`${def(t).name}开工了！`); save(); }
    else if (buildingAt(c, r)) hint('那里已经有建筑了', 'bad');
    else hint('只能建在空木筏上', 'bad');
    view.mode = 'none'; view.placing = null; // 不用 setMode，免得把提示清掉
    return;
  }
  const b = buildingAt(c, r);
  if (b) {
    if (b.buffer >= 1 && working(b) && tab !== 'building') { collect(b); }
    view.selected = b.uid; openTab('building');
    return;
  }
  if (tab) openTab(null);
}

// ---------- 游戏事件 → 声音 / 提示 ----------
rt.onEvent = ev => {
  if (ev.e === 'collect') sfx.coin();
  else if (ev.e === 'full') hint(`${RES[ev.res].name}仓库满了！建仓库或升级指挥塔`, 'bad');
  else if (ev.e === 'built') { sfx.upgrade(); hint(`${def(ev.b.type).name}${ev.b.level > 1 ? `升到 Lv${ev.b.level}` : '建好了'}！`); save(); }
  else if (ev.e === 'arrive') { sfx.pop(); hint('一位新的幸存者划船来投奔了'); }
  else if (ev.e === 'leave') hint('有幸存者受不了，划船离开了…', 'bad');
};

// ---------- 开始画面 ----------
const hqPos = (): [number, number] => { const h = S.buildings.find(b => b.type === 'hq')!; return [h.c, h.r]; };

function showStart(hasSave: boolean, onGo: (fresh: boolean) => void) {
  const el = document.createElement('div');
  el.id = 'start';
  el.innerHTML = `<canvas></canvas>
    <div class="title"><h1>海上<span>浮城</span></h1><p>洪水之后，在海上重建家园</p></div>
    <div class="go"><button class="btn go big" data-a="go">${hasSave ? `继续 · 指挥塔 ${hqLevel()} 级` : '开始求生'}</button>
    ${hasSave ? '<button class="link" data-a="new">重新开始</button>' : ''}</div>`;
  $('#app').appendChild(el);
  // 背景画一小座浮城
  const cv = el.querySelector('canvas')!, g = cv.getContext('2d')!;
  const dpr = window.devicePixelRatio || 1;
  cv.width = el.clientWidth * dpr; cv.height = el.clientHeight * dpr;
  g.scale(dpr, dpr);
  const W = el.clientWidth, H = el.clientHeight, T = Math.min(W / 3.4, 130);
  const at = (c: number, r: number): [number, number] => [W / 2 + (c - r) * T / 2, H * 0.58 + (c + r) * T / 4];
  const tiles: [number, number][] = [];
  for (let r = -1; r <= 1; r++) for (let c = -1; c <= 1; c++) tiles.push([c, r]);
  tiles.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
  for (const [c, r] of tiles) drawRaft(g, ...at(c, r), T, (c + 5) * 7 + r, { n: r > -1, e: c < 1, s: r < 1, w: c > -1 });
  const set: [BType, number, number][] = [['tent', -1, -1], ['dock', 1, -1], ['hq', 0, 0], ['kitchen', -1, 1], ['desal', 1, 1], ['salvage', 0, 1]];
  set.sort((a, b) => a[1] + a[2] - b[1] - b[2]);
  for (const [t, c, r] of set) drawBuilding(g, t, ...at(c, r), T, 2, 0.6);

  el.addEventListener('click', e => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
    if (!a) return;
    if (a === 'new' && !confirm('确定清空存档，重新开始？')) return;
    el.classList.add('leave');
    setTimeout(() => el.remove(), 450);
    onGo(a === 'new');
  });
}

function showModal(html: string, btn: string, after?: () => void) {
  modal.innerHTML = `<div class="box">${html}<button class="btn go big" id="mok">${btn}</button></div>`;
  modal.hidden = false;
  $('#mok').onclick = () => { modal.hidden = true; after?.(); };
}

// ---------- 启动 ----------
const boot = load();
initRender(canvas);
document.querySelectorAll<HTMLImageElement>('#bottom img').forEach(img => {
  img.src = img.dataset.b ? buildingURL(img.dataset.b as BType) : iconURL(img.dataset.i as IconKind, 64);
});
showStart(boot.hasSave, fresh => {
  if (fresh) { resetGame(); centerOn(...hqPos()); }
  last = performance.now();
  if (!boot.hasSave || fresh) {
    showModal(`<div class="ribbon">欢迎来到浮城</div>
      <p>洪水淹没了陆地，你带着几个幸存者在海上搭起了一片木筏。</p>
      <p>· 建筑头上冒出<b>黄色图标</b>，点一下就能收获<br>· 用鲜鱼在<b>厨房</b>做鱼餐，用<b>海水提取厂</b>造淡水，大家每分钟都要吃喝<br>· 跟着下面的<b>任务</b>一步步把浮城建起来</p>`,
    '开工！', () => { paused = false; });
  } else if (boot.away > 0) {
    const gains = Object.entries(boot.gained).map(([k, v]) => `<span>${ico(k as Res)}+${v}</span>`).join('');
    showModal(`<div class="ribbon">欢迎回来</div>
      <p style="text-align:center">你离开了 ${fmtTime(Math.round(boot.away / 60) * 60 || Math.round(boot.away))}，大家没闲着：</p>
      <div class="gains">${gains || '<span>仓库已经满了，什么也没多出来</span>'}</div>`, '继续', () => { paused = false; });
  } else paused = false;
});
requestAnimationFrame(resize);

let last = performance.now(), uiAcc = 0, saveAcc = 0;
function frame(now: number) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (!paused) tick(dt);
  draw(now);
  uiAcc += dt; saveAcc += dt;
  if (hintTimer !== Infinity) { hintTimer -= dt; if (hintTimer <= 0 && hintEl.textContent) hint(''); }
  if (uiAcc > 0.25) { uiAcc = 0; renderHUD(); renderSheet(); }
  if (saveAcc > 5 && !paused) { saveAcc = 0; save(); }
  requestAnimationFrame(frame);
}
renderHUD();
requestAnimationFrame(frame);
document.addEventListener('visibilitychange', () => { if (document.hidden && !paused) save(); });

if (import.meta.env.PROD && location.protocol.startsWith('http') && 'serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__fc = { tick, draw, S: () => S, rt, view };
void levelTime;
