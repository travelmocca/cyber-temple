import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAP } from './protocol/constants.mjs';
import { translateText } from '../locales/zh-CN.mjs';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

// Route order and range behavior are part of the existing HTTP contract.
export function createRequestHandler({ site, hub }) {
  return async (request, response) => {
    const json = (status, body) => {
      response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end(JSON.stringify(body));
    };
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/__mirror/payment') {
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        });
        response.end(
          translateText(
            '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>로컬 모의 공양</title><body style="background:#eeece3;color:#4d5144;font:18px/1.8 sans-serif;padding:3rem;max-width:40rem;margin:auto"><h1>모의 공양이 완료되었어요</h1><p>이 화면은 로컬 테스트예요. 실제 결제나 송금은 발생하지 않았어요.</p><a href="/">산사로 돌아가기</a></body></html>',
          ),
        );
        return;
      }
      if (url.pathname === '/api/entry-stage') {
        response.writeHead(204);
        response.end();
        return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { allow: 'GET, HEAD' });
        response.end();
        return;
      }
      if (url.pathname === '/api/rooms/village' || url.pathname === '/api/rooms')
        return json(200, hub.directory());
      if (url.pathname === '/__mirror/health')
        return json(200, {
          ok: true,
          map: MAP,
          mode: 'local replacement backend',
          bots: 0,
          connections: hub.sessions.size,
        });
      const decoded = decodeURIComponent(url.pathname);
      if (decoded.split('/').includes('..') || decoded.includes('\\') || decoded.includes('\0')) {
        response.writeHead(403);
        response.end();
        return;
      }
      const isEntry = decoded.startsWith('/temple-entry/');
      const staticRoot = isEntry ? fileURLToPath(new URL('../entry/', import.meta.url)) : site;
      const staticPath = isEntry ? decoded.slice('/temple-entry'.length) : decoded;
      const file = resolve(staticRoot, '.' + (staticPath === '/' ? '/index.html' : staticPath));
      const actual = await realpath(file);
      if (!actual.startsWith(resolve(staticRoot) + sep)) {
        response.writeHead(403);
        response.end();
        return;
      }
      const info = await stat(actual);
      if (!info.isFile()) {
        response.writeHead(404);
        response.end();
        return;
      }
      const headers = {
        'content-type': MIME[extname(file)] ?? 'application/octet-stream',
        'content-length': info.size,
        'accept-ranges': 'bytes',
        'cache-control': 'no-cache',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      };
      let start = 0,
        end = info.size - 1,
        status = 200;
      if (request.headers.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
        if (match && (match[1] || match[2])) {
          if (match[1]) {
            start = Number(match[1]);
            end = match[2] ? Math.min(Number(match[2]), end) : end;
          } else start = Math.max(0, info.size - Number(match[2]));
        } else start = info.size;
        if (
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start < 0 ||
          start > end ||
          start >= info.size
        ) {
          response.writeHead(416, { 'content-range': `bytes */${info.size}` });
          response.end();
          return;
        }
        status = 206;
        headers['content-range'] = `bytes ${start}-${end}/${info.size}`;
        headers['content-length'] = end - start + 1;
      }
      response.writeHead(status, headers);
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      const stream = createReadStream(actual, { start, end });
      stream.on('error', () => response.destroy());
      response.on('close', () => stream.destroy());
      stream.pipe(response);
    } catch (error) {
      response.writeHead(
        ['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : error instanceof URIError ? 400 : 500,
      );
      response.end();
    }
  };
}
