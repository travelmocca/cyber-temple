import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c],
  );
const digest = (value) => createHash('sha256').update(value).digest();
const headers = {
  'cache-control': 'private, no-store',
  'x-robots-tag': 'noindex, nofollow',
  'x-content-type-options': 'nosniff',
  // Native same-origin form POSTs need a usable Origin for the CSRF check.
  'referrer-policy': 'same-origin',
  'content-security-policy':
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};
const shell = (content) => `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>山寺 · 访问统计</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f1efe5;color:#293e33;font:15px/1.75 -apple-system,BlinkMacSystemFont,"Microsoft YaHei",sans-serif}main{max-width:1080px;margin:auto;padding:44px 24px}h1{font:400 30px/1.5 "Songti SC",serif;margin:6px 0 12px}.eyebrow{font-size:11px;letter-spacing:3px;color:#8c784e}.muted{color:#717568;font-size:13px}header{display:flex;justify-content:space-between;gap:20px;align-items:center}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:28px 0}.card,.login{background:#faf8ef;border:1px solid #d3d3c3;border-radius:10px;padding:22px}.card span{display:block;color:#717568;font-size:13px}.card strong{font:400 34px/1.6 Georgia,serif}button,.button{display:inline-block;border:1px solid #293e33;border-radius:5px;background:#293e33;color:#fff;padding:9px 16px;text-decoration:none;font:inherit;cursor:pointer}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #b59960;outline-offset:3px}.outline{background:transparent;color:#293e33}input{width:100%;padding:12px;border:1px solid #b7bea9;border-radius:5px;font:inherit;margin:12px 0 18px}label{display:block}.login{max-width:420px;margin:60px auto}.error{color:#9a3b27}.scroll{overflow:auto;border-top:1px solid #d3d3c3}table{border-collapse:collapse;width:100%;min-width:490px;font-size:14px}th,td{padding:12px;text-align:right;border-bottom:1px solid #dfdfd0;font-variant-numeric:tabular-nums}th:first-child,td:first-child{text-align:left}th{color:#717568;font-weight:400}.bar{display:inline-block;height:5px;background:#7a9271;border-radius:5px;vertical-align:middle;margin-right:8px}footer{margin-top:28px;font-size:12px;color:#717568}@media(max-width:600px){main{padding:25px 14px}.cards{grid-template-columns:repeat(2,1fr);gap:9px}.card{padding:16px}.card strong{font-size:29px}header{align-items:flex-start}.login{margin:30px auto}}
</style><main>${content}</main></html>`;
const loginPage = (message = '') =>
  shell(`<div class="login"><div class="eyebrow">PRIVATE REPORT</div>
<h1>山寺 · 访问统计</h1><p class="muted">输入管理员配置的查看口令。</p>
${message ? `<p class="error" role="alert">${escape(message)}</p>` : ''}
<form method="post" action="/api/report/login"><label for="password">查看口令</label>
<input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256">
<button type="submit">查看统计</button></form></div>`);

function reportPage(report) {
  const cards = [
    ['累计访客 UV', report.total.uv],
    ['累计浏览 PV', report.total.pv],
    ['累计入寺人数', report.total.enteredUsers],
    ['累计入寺次数', report.total.entries],
    ['今日访客 UV', report.today.uv],
    ['今日浏览 PV', report.today.pv],
  ];
  const max = Math.max(1, ...report.days.map((d) => d.pv));
  const time = (value) =>
    escape(new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }));
  return shell(`<header><div><div class="eyebrow">山寺 · PRIVATE REPORT</div><h1>访问统计</h1>
  <p class="muted">开始统计：${time(report.startedAt)}<br>更新于：${time(report.updatedAt)} · 北京时间</p></div>
  <form method="post" action="/api/report/logout"><button class="outline">退出查看</button></form></header>
  <div class="cards">${cards.map(([label, n]) => `<div class="card"><span>${label}</span><strong>${Number(n).toLocaleString('zh-CN')}</strong></div>`).join('')}</div>
  <p><a class="button outline" href="/api/report">刷新统计</a></p><h2>近30天</h2><div class="scroll"><table>
  <thead><tr><th scope="col">日期</th><th scope="col">浏览 PV</th><th scope="col">访客 UV</th><th scope="col">入寺人数</th><th scope="col">入寺次数</th></tr></thead>
  <tbody>${report.days
    .map(
      (d) =>
        `<tr><td>${escape(d.date)}</td>${
          d.collected
            ? `<td><span class="bar" style="width:${Math.round((d.pv / max) * 60)}px"></span>${d.pv}</td><td>${d.uv}</td><td>${d.enteredUsers}</td><td>${d.entries}</td>`
            : '<td colspan="4" class="muted">未采集</td>'
        }</tr>`,
    )
    .join('')}</tbody></table></div>
  <footer>UV按匿名浏览器标识去重，并非账号或真实人数；跨设备、隐私窗口或清除存储会成为不同访客。各日UV不能相加作为累计UV。<br>
  刷新页面计一次PV，选择心愿或换批不重复计数；场景就绪才计入寺。报表访问不计PV；仅记录功能启用后的事件，历史数据无法回补。</footer>`);
}

function body(request, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0,
      failed = false;
    request.on('data', (chunk) => {
      if (failed) return;
      size += chunk.length;
      if (size > limit) {
        failed = true;
        chunks.length = 0;
        reject(Object.assign(new Error('Request too large'), { status: 413 }));
      } else chunks.push(chunk);
    });
    request.once('end', () => {
      if (!failed) resolve(Buffer.concat(chunks).toString('utf8'));
    });
    request.once('error', reject);
    request.once('aborted', () => reject(new Error('Request aborted')));
  });
}

export function createReportHandler({ analytics, password = '' }) {
  const configured =
    typeof password === 'string' && password.length >= 12 && password.length <= 256;
  const failures = new Map();
  const sign = (payload) => createHmac('sha256', password).update(payload).digest('hex');
  function authorized(request) {
    if (!configured) return false;
    const value = request.headers.cookie
      ?.split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith('temple_report='))
      ?.slice('temple_report='.length);
    if (!value) return false;
    const [expires, nonce, signature, extra] = value.split('.');
    if (
      extra ||
      !/^\d{13}$/.test(expires) ||
      Number(expires) <= Date.now() ||
      !/^[a-f0-9]{32}$/.test(nonce) ||
      !/^[a-f0-9]{64}$/.test(signature)
    )
      return false;
    return timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(sign(`${expires}.${nonce}`), 'hex'),
    );
  }
  const sameOrigin = (request) => {
    try {
      return (
        new URL(request.headers.origin).host === request.headers.host &&
        (!request.headers['sec-fetch-site'] || request.headers['sec-fetch-site'] === 'same-origin')
      );
    } catch {
      return false;
    }
  };
  return async (request, response, url) => {
    const path = url.pathname;
    if (
      !['/api/analytics', '/api/report', '/api/report/login', '/api/report/logout'].includes(path)
    )
      return false;
    const send = (status, content, type = 'text/html; charset=utf-8', extra = {}) => {
      response.writeHead(status, { ...headers, 'content-type': type, ...extra });
      response.end(request.method === 'HEAD' ? undefined : content);
    };
    const json = (status, value) =>
      send(status, JSON.stringify(value), 'application/json; charset=utf-8');
    try {
      if (path === '/api/report' && ['GET', 'HEAD'].includes(request.method)) {
        if (!configured) send(503, loginPage('管理员尚未设置REPORT_PASSWORD（需12至256字符）。'));
        else if (!authorized(request)) {
          if (url.searchParams.get('format') === 'json')
            json(401, { error: 'Authentication required' });
          else send(200, loginPage());
        } else {
          const report = analytics.report();
          if (url.searchParams.get('format') === 'json') json(200, report);
          else send(200, reportPage(report));
        }
        return true;
      }
      if (request.method !== 'POST') {
        send(405, '', undefined, { allow: path === '/api/report' ? 'GET, HEAD' : 'POST' });
        return true;
      }
      if (!sameOrigin(request)) {
        request.resume();
        json(403, { error: 'Same-origin requests required' });
        return true;
      }
      if (path === '/api/analytics') {
        const type = request.headers['content-type']?.split(';')[0].trim().toLowerCase();
        if (type !== 'application/json') {
          request.resume();
          json(415, { error: 'JSON required' });
          return true;
        }
        const data = await body(request, 1024);
        let event;
        try {
          event = JSON.parse(data);
        } catch {
          json(400, { error: 'Invalid JSON' });
          return true;
        }
        try {
          analytics.record(event);
        } catch (error) {
          if (error.message === 'Invalid analytics event') {
            json(400, { error: error.message });
            return true;
          }
          throw error;
        }
        send(204, '');
        return true;
      }
      if (!configured) {
        request.resume();
        send(503, loginPage('管理员尚未设置REPORT_PASSWORD（需12至256字符）。'));
        return true;
      }
      const secure =
        request.socket.encrypted ||
        new URL(request.headers.origin).protocol === 'https:' ||
        request.headers['x-forwarded-proto']?.split(',')[0].trim() === 'https';
      const cookie = (value, age) =>
        `temple_report=${value}; Path=/api/report; Max-Age=${age}; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
      if (path === '/api/report/logout') {
        request.resume();
        send(303, '', undefined, { location: '/api/report', 'set-cookie': cookie('', 0) });
        return true;
      }
      if (path !== '/api/report/login') {
        request.resume();
        send(405, '', undefined, { allow: 'GET, HEAD' });
        return true;
      }
      if (
        request.headers['content-type']?.split(';')[0].trim().toLowerCase() !==
        'application/x-www-form-urlencoded'
      ) {
        request.resume();
        json(415, { error: 'Form encoding required' });
        return true;
      }
      const address = request.socket.remoteAddress ?? 'unknown';
      const limited = () => {
        const state = failures.get(address);
        if (!state || state.until <= Date.now() || state.count < 8) return false;
        request.resume();
        send(429, loginPage('尝试次数过多，请10分钟后再试。'), undefined, { 'retry-after': '600' });
        return true;
      };
      if (limited()) return true;
      const submitted = new URLSearchParams(await body(request, 4096)).get('password') ?? '';
      // Other requests may finish while this body is uploading; use fresh shared state.
      if (limited()) return true;
      const failed = failures.get(address);
      if (!timingSafeEqual(digest(submitted), digest(password))) {
        const state =
          failed && failed.until > Date.now() ? failed : { count: 0, until: Date.now() + 600000 };
        state.count++;
        if (failures.size >= 512 && !failures.has(address))
          failures.delete(failures.keys().next().value);
        failures.set(address, state);
        send(401, loginPage('口令不正确。'));
        return true;
      }
      failures.delete(address);
      const payload = `${Date.now() + 8 * 3600000}.${randomBytes(16).toString('hex')}`;
      send(303, '', undefined, {
        location: '/api/report',
        'set-cookie': cookie(`${payload}.${sign(payload)}`, 8 * 3600),
      });
      return true;
    } catch (error) {
      if (!error.status) console.error('Statistics request failed:', error.code ?? error.name);
      if (!response.destroyed && !response.headersSent)
        json(error.status ?? 503, { error: '统计服务暂不可用' });
      return true;
    }
  };
}
