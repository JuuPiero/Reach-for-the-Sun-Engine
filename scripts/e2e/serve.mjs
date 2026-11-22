#!/usr/bin/env node
// Minimal static file server for testing packaged builds:
//   node scripts/e2e/game/serve.mjs <dir> [port=5284] [pidFile]
// Serves <dir> (index.html for folders), no caching. Writes its PID to pidFile when given (stop it with that PID).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const [dirArg, portArg = '5284', pidFile] = process.argv.slice(2);
if (!dirArg) {
  console.error('usage: node scripts/e2e/game/serve.mjs <dir> [port] [pidFile]');
  process.exit(1);
}
const root = path.resolve(dirArg);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.ini': 'text/plain; charset=utf-8',
};
const server = http.createServer((req, res) => {
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  let file = path.join(root, rel);
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
server.listen(Number(portArg), '127.0.0.1', () => {
  if (pidFile) fs.writeFileSync(pidFile, String(process.pid));
  console.log(`Serving ${root} on http://127.0.0.1:${portArg}/ (pid ${process.pid})`);
});
