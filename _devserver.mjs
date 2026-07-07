// _devserver.mjs — 로컬 개발/검증용 정적 파일 서버 (gitignored, 배포와 무관).
// 실행: node _devserver.mjs  → http://localhost:8777/
import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { extname, join, normalize } from 'path';

const ROOT = process.cwd();
const PORT = process.env.PORT || 8777;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/viewer/index.html';
    const fp = normalize(join(ROOT, p));
    if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
    const s = await stat(fp).catch(() => null);
    if (!s || s.isDirectory()) { res.writeHead(404); return res.end('not found: ' + p); }
    const data = await readFile(fp);
    res.writeHead(200, { 'Content-Type': MIME[extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch (e) {
    res.writeHead(500); res.end('err: ' + e.message);
  }
}).listen(PORT, () => console.log(`dev server → http://localhost:${PORT}/  (root: ${ROOT})`));
