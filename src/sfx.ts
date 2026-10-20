// 音效和背景音乐全部用 WebAudio 现场合成，不需要音频文件。
const PREF_KEY = 'floatcity-audio';

let ac: AudioContext | null = null;
let master: GainNode, sfxBus: GainNode, musicBus: GainNode;
let noiseBuf: AudioBuffer;

export const audio = { sound: true, music: true };
try { Object.assign(audio, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch { /* 无存储 */ }

function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(audio)); } catch { /* 无存储 */ } }

/** 浏览器要求用户点一下之后才能出声 */
export function unlockAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain(); master.gain.value = 0.8; master.connect(ac.destination);
  sfxBus = ac.createGain(); sfxBus.gain.value = audio.sound ? 1 : 0; sfxBus.connect(master);
  musicBus = ac.createGain(); musicBus.gain.value = audio.music ? 0.32 : 0; musicBus.connect(master);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  startMusic();
}

export function setSound(on: boolean) {
  audio.sound = on; savePrefs();
  if (ac) sfxBus.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, 0.05);
}
export function setMusic(on: boolean) {
  audio.music = on; savePrefs();
  if (ac) musicBus.gain.setTargetAtTime(on ? 0.32 : 0, ac.currentTime, 0.2);
}

document.addEventListener('visibilitychange', () => {
  if (!ac) return;
  if (document.hidden) ac.suspend(); else ac.resume();
});

// ---------- 合成积木 ----------
function tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, bus: GainNode, slideTo?: number) {
  if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g); g.connect(bus);
  o.start(start); o.stop(start + dur + 0.05);
}
function noise(start: number, dur: number, vol: number, filterFreq: number, q = 1, sweepTo?: number) {
  if (!ac) return;
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(filterFreq, start);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, start + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  s.connect(f); f.connect(g); g.connect(sfxBus);
  s.start(start); s.stop(start + dur);
}

const last: Record<string, number> = {};
/** 同一种声音限频，避免游客多时吵成一片 */
function throttle(key: string, gapMs: number) {
  const now = performance.now();
  if (now - (last[key] ?? 0) < gapMs) return false;
  last[key] = now;
  return true;
}

// ---------- 音效 ----------
export const sfx = {
  coin() {
    if (!ac || !audio.sound || !throttle('coin', 110)) return;
    const t = ac.currentTime, p = 1 + Math.random() * 0.06;
    tone(1318 * p, t, 0.09, 'square', 0.035, sfxBus);
    tone(1976 * p, t + 0.06, 0.16, 'square', 0.03, sfxBus);
  },
  splash() {
    if (!ac || !audio.sound || !throttle('splash', 400)) return;
    const t = ac.currentTime;
    noise(t, 0.35, 0.12, 1800, 0.8, 500);
    tone(500, t, 0.12, 'sine', 0.05, sfxBus, 180);
  },
  pop() { // 捡垃圾
    if (!ac || !audio.sound) return;
    const t = ac.currentTime;
    tone(300, t, 0.1, 'sine', 0.2, sfxBus, 900);
    tone(1200, t + 0.06, 0.08, 'triangle', 0.06, sfxBus);
  },
  recycle() {
    if (!ac || !audio.sound || !throttle('recycle', 600)) return;
    tone(700, ac.currentTime, 0.08, 'triangle', 0.05, sfxBus, 1100);
  },
  build() {
    if (!ac || !audio.sound) return;
    const t = ac.currentTime;
    tone(110, t, 0.25, 'sine', 0.35, sfxBus, 55);
    noise(t, 0.12, 0.15, 400, 1);
    [523, 659, 784].forEach((f, i) => tone(f, t + 0.12 + i * 0.07, 0.25, 'triangle', 0.08, sfxBus));
  },
  upgrade() {
    if (!ac || !audio.sound) return;
    const t = ac.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.06, 0.3, 'square', 0.04, sfxBus));
  },
  tap() {
    if (!ac || !audio.sound || !throttle('tap', 50)) return;
    tone(880, ac.currentTime, 0.05, 'triangle', 0.06, sfxBus, 660);
  },
  error() {
    if (!ac || !audio.sound) return;
    const t = ac.currentTime;
    tone(220, t, 0.12, 'square', 0.05, sfxBus);
    tone(165, t + 0.1, 0.18, 'square', 0.05, sfxBus);
  },
  claim() {
    if (!ac || !audio.sound) return;
    const t = ac.currentTime;
    [784, 988, 1175, 1568].forEach((f, i) => tone(f, t + i * 0.05, 0.25, 'square', 0.035, sfxBus));
    noise(t + 0.15, 0.4, 0.04, 6000, 2);
  },
  fanfare() { // 打烊 / 乐园升级
    if (!ac || !audio.sound) return;
    const t = ac.currentTime;
    const notes: [number, number, number][] = [[523, 0, 0.15], [659, 0.15, 0.15], [784, 0.3, 0.15], [1047, 0.45, 0.5]];
    for (const [f, s, d] of notes) { tone(f, t + s, d, 'square', 0.05, sfxBus); tone(f / 2, t + s, d, 'triangle', 0.08, sfxBus); }
  },
};

// ---------- 背景音乐：末日海上的慵懒小调，8 小节循环 ----------
const BPM = 104;
const BEAT = 60 / BPM;
// C 大调五声音阶，0 表示休止
const MELODY = [
  659, 0, 784, 880, 784, 0, 659, 587, 523, 0, 587, 659, 587, 0, 0, 0,
  659, 0, 784, 880, 1047, 0, 880, 784, 880, 0, 784, 659, 784, 0, 0, 0,
  880, 0, 1047, 880, 784, 0, 659, 784, 659, 0, 587, 523, 587, 0, 659, 0,
  523, 0, 587, 659, 784, 0, 659, 587, 523, 0, 0, 0, 523, 0, 0, 0,
];
const BASS = [131, 131, 196, 196, 110, 110, 147, 147, 175, 175, 131, 131, 147, 147, 196, 196];

let nextNote = 0, step = 0, musicTimer = 0;

function startMusic() {
  if (!ac || musicTimer) return;
  nextNote = ac.currentTime + 0.2;
  musicTimer = window.setInterval(() => {
    if (!ac || ac.state !== 'running') return;
    while (nextNote < ac.currentTime + 0.25) {
      const half = BEAT / 2;
      const m = MELODY[step % MELODY.length];
      if (m) {
        tone(m, nextNote, half * 1.6, 'triangle', 0.09, musicBus);
        tone(m * 2, nextNote, half * 0.6, 'sine', 0.02, musicBus);
      }
      if (step % 4 === 0) tone(BASS[(step / 4) % BASS.length], nextNote, BEAT * 1.6, 'sine', 0.16, musicBus);
      if (step % 4 === 2) { // 轻轻的沙锤
        const s = ac.createBufferSource(); s.buffer = noiseBuf;
        const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
        const g = ac.createGain(); g.gain.setValueAtTime(0.05, nextNote); g.gain.exponentialRampToValueAtTime(0.0001, nextNote + 0.06);
        s.connect(f); f.connect(g); g.connect(musicBus); s.start(nextNote); s.stop(nextNote + 0.07);
      }
      nextNote += half;
      step++;
    }
  }, 60);
}
