// 把 dist/ 打成一个独立的 html 文件，方便直接发给别人（微信/QQ/邮件）。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

let html = readFileSync('dist/index.html', 'utf8');
html = html.replace(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/, (_, p) => {
  const js = readFileSync(`dist/${p}`, 'utf8').replace(/<\/script/g, '<\/script');
  return `<script type="module">${js}</script>`;
});
html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/, (_, p) =>
  `<style>${readFileSync(`dist/${p}`, 'utf8')}</style>`);
const svg = readFileSync('public/icon.svg', 'utf8');
html = html.replace('href="./icon.svg"', `href="data:image/svg+xml,${encodeURIComponent(svg)}"`);
html = html.replace(/\s*<link rel="manifest"[^>]*>/, '');
if (/src="\.\/assets|href="\.\/assets/.test(html)) throw new Error('还有外部资源没内联');
mkdirSync('分享', { recursive: true });
writeFileSync('分享/海上浮城.html', html);
console.log(`分享/海上浮城.html  ${(html.length / 1024).toFixed(0)} KB`);
