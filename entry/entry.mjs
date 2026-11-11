import { recommend } from './recommend.mjs';

const app = document.getElementById('app');
app.hidden = true;
const entrance = document.createElement('main');
entrance.id = 'temple-entry';
entrance.dataset.step = 'wishes';
entrance.innerHTML = `
  <header class="entry-mast"><a href="/" class="entry-brand">山寺<span>一念入山</span></a><span class="entry-edition">各地佛寺 · 一处清静</span></header>
  <div class="entry-panel">
  <section class="entry-intro"><p class="entry-eyebrow">把心事，暂寄山间</p><h1>此刻，你想求什么？</h1><p class="entry-lead">选一个心愿，遇见五座有缘的佛寺。</p></section>
  <nav class="entry-categories" aria-label="祈愿类型"></nav>
  <p id="entry-status" role="status" aria-live="polite">正在准备寺院名录…</p>
  <section class="entry-results" aria-label="推荐寺院" hidden><div class="entry-results-head"><div><button id="entry-back-wishes" class="entry-back" type="button">← 返回心愿</button><h2 id="entry-results-title">先选一个心愿</h2></div><button id="entry-refresh" type="button" hidden>换一批 <span aria-hidden="true">↻</span></button></div><div class="entry-cards"></div></section>
  <section class="entry-detail" aria-labelledby="entry-detail-title" hidden><button class="entry-close entry-back" type="button" aria-label="返回推荐寺院">← 返回推荐</button><div id="entry-detail-content"></div></section>
  <footer class="entry-footer">以统一虚拟场景呈现各地佛寺文化。</footer>
  </div>
  <section class="entry-loading" role="status" aria-live="polite" hidden><p class="entry-eyebrow">山门将启</p><h2 id="entry-loading-title"></h2><p id="entry-loading-status">正在准备山间风景，请稍候…</p><div class="entry-loading-line" aria-hidden="true"></div><button class="entry-retry" type="button" hidden>重新入寺</button></section>`;
document.body.append(entrance);
const categoriesElement = entrance.querySelector('.entry-categories');
const cards = entrance.querySelector('.entry-cards');
const status = entrance.querySelector('#entry-status');
const refresh = entrance.querySelector('#entry-refresh');
const panel = entrance.querySelector('.entry-panel');
const detailSection = entrance.querySelector('.entry-detail');
const results = entrance.querySelector('.entry-results');
const loading = entrance.querySelector('.entry-loading');
const detail = entrance.querySelector('#entry-detail-content');
const rounds = new Map();
const storageKey = 'temple-entry-v1';
let catalog,
  selectedCategory,
  selectedTemple,
  detailTrigger,
  entering = false;

function saveState() {
  try {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({ category: selectedCategory, temple: selectedTemple, rounds: [...rounds] }),
    );
  } catch {
    /* Storage-disabled browsers can still use the entrance. */
  }
}

function restoreState() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey));
    if (!saved || !catalog.categories.some((c) => c.id === saved.category)) return;
    selectedCategory = saved.category;
    selectedTemple = saved.temple;
    for (const [categoryId, batch] of saved.rounds ?? []) {
      const pool = catalog.temples.filter(
        (t) => t.enabled !== false && t.wishes.some((w) => w.categoryId === categoryId),
      );
      const valid = new Set(pool.map((t) => t.id));
      const ids = [...new Set(batch.ids)].filter((id) => valid.has(id)).slice(0, 5);
      if (!ids.length) continue;
      const seen = [...new Set([...batch.seen, ...ids])].filter((id) => valid.has(id));
      if (ids.length < Math.min(5, pool.length)) {
        rounds.set(categoryId, recommend(catalog.temples, categoryId, seen, ids));
        continue;
      }
      rounds.set(categoryId, {
        ids,
        seen,
        total: pool.length,
        repeated: !!batch.repeated,
        newRound: false,
      });
    }
  } catch {
    rounds.clear();
    selectedCategory = undefined;
    selectedTemple = undefined;
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function sceneReady(signal) {
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(check);
    const timer = setTimeout(() => finish(new Error('scene timeout')), 90000);
    function finish(error) {
      clearTimeout(timer);
      observer.disconnect();
      signal.removeEventListener('abort', abort);
      error ? reject(error) : resolve();
    }
    function abort() {
      finish(new Error('scene observation cancelled'));
    }
    function check() {
      if (app.querySelector('#sansa-boot.is-error, #game-loading[role="alert"]'))
        return finish(new Error('scene unavailable'));
      if (
        app.querySelector('#game-loading.is-loaded') &&
        app.querySelector('canvas[data-engine]')?.dataset.position
      )
        finish();
    }
    observer.observe(app, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'data-position', 'role'],
    });
    signal.addEventListener('abort', abort, { once: true });
    check();
  });
}

async function enterTemple(temple) {
  if (entering) return;
  entering = true;
  selectedTemple = temple.id;
  saveState();
  globalThis.__templeEntry = Object.freeze({ id: temple.id, plaqueName: temple.plaqueName });
  document.title = `${temple.plaqueName} · 山寺`;
  entrance.dataset.step = 'loading';
  panel.hidden = true;
  loading.hidden = false;
  entrance.querySelector('#entry-loading-title').textContent = `即将进入 · ${temple.plaqueName}`;
  app.hidden = false;
  app.inert = true;
  // The original game listens on window; inert alone only blocks element interaction.
  const inputController = new AbortController();
  const blockGameKeys = (event) => event.stopImmediatePropagation();
  for (const type of ['keydown', 'keyup'])
    window.addEventListener(type, blockGameKeys, { capture: true, signal: inputController.signal });
  const controller = new AbortController();
  try {
    // Attach readiness and error observation before loading the original asynchronous boot.
    await Promise.all([import('/assets/index-qXYao_lF.js'), sceneReady(controller.signal)]);
    entrance.classList.add('is-revealing');
    await new Promise((resolve) =>
      setTimeout(resolve, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240),
    );
    entrance.hidden = true;
    app.inert = false;
    inputController.abort();
  } catch {
    loading.dataset.state = 'error';
    entrance.querySelector('#entry-loading-status').textContent =
      '风景暂时未能准备好。重新入寺会保留你的选择。';
    const retry = loading.querySelector('.entry-retry');
    retry.hidden = false;
    retry.onclick = () => location.reload();
    retry.focus();
  } finally {
    controller.abort();
  }
}

function templeContent(temple, full = false) {
  const wrapper = element('div', 'entry-card-content');
  wrapper.append(element('p', 'entry-location', `${temple.region} · ${temple.city}`));
  const heading = element(full ? 'h2' : 'h3', '', temple.name);
  if (full) heading.tabIndex = -1;
  if (full) heading.id = 'entry-detail-title';
  wrapper.append(
    heading,
    element('p', 'entry-hook', temple.headline),
    element('p', 'entry-description', temple.description),
  );
  const wish = temple.wishes.find((w) => w.categoryId === selectedCategory);
  wrapper.append(
    element(
      'p',
      'entry-types',
      '适配心愿 · ' +
        temple.wishes
          .map((w) => catalog.categories.find((c) => c.id === w.categoryId)?.label)
          .filter(Boolean)
          .join(' / '),
    ),
  );
  if (temple.id === selectedTemple) wrapper.append(element('span', 'entry-basis', '上次选择'));
  wrapper.append(element('span', 'entry-basis', wish.basisLabel));
  if (full) {
    wrapper.append(
      element('h3', '', '为何适合这个心愿'),
      element('p', 'entry-description', wish.reason),
    );
    wrapper.append(
      element(
        'p',
        'entry-description',
        temple.tradition + (temple.scopeNote ? '。' + temple.scopeNote : ''),
      ),
    );
    if (temple.historicalSite)
      wrapper.append(
        element('p', 'entry-description', '历史佛寺文化条目，现实活动及开放状态请另行核实。'),
      );
    const sources = element('div', 'entry-sources');
    sources.append(element('h3', '', '文化资料'));
    const sourceList = new Map([...temple.sources, ...(wish.sources ?? [])].map((s) => [s.url, s]));
    for (const source of sourceList.values()) {
      if (!source.url.startsWith('https://')) continue;
      const link = element('a', '', source.title);
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      sources.append(link);
    }
    wrapper.append(sources);
  } else wrapper.append(element('p', 'entry-reason', wish.reason));
  const actions = element('div', 'entry-actions');
  if (!full) {
    const more = element('button', 'entry-more', '寺院介绍');
    more.type = 'button';
    more.setAttribute('aria-label', `查看${temple.name}介绍`);
    more.onclick = () => {
      detailTrigger = more;
      detail.replaceChildren(templeContent(temple, true));
      entrance.dataset.step = 'detail';
      results.hidden = true;
      detailSection.hidden = false;
      detail.querySelector('h2').focus();
      panel.scrollTop = 0;
    };
    actions.append(more);
  }
  const enter = element('button', 'entry-enter', '进入寺院');
  enter.type = 'button';
  enter.setAttribute('aria-label', `进入${temple.name}`);
  enter.onclick = () => enterTemple(temple);
  actions.append(enter);
  wrapper.append(actions);
  return wrapper;
}

function showBatch(next = false) {
  const category = catalog.categories.find((c) => c.id === selectedCategory);
  if (!category) return;
  entrance.dataset.step = 'results';
  results.hidden = false;
  detailSection.hidden = true;
  let batch = rounds.get(category.id);
  if (!batch || next) {
    batch = recommend(catalog.temples, category.id, batch?.seen, batch?.ids);
    rounds.set(category.id, batch);
  }
  for (const button of categoriesElement.children)
    button.setAttribute('aria-pressed', String(button.dataset.category === category.id));
  entrance.querySelector('#entry-results-title').textContent = `${category.label} · 为你遇见`;
  refresh.hidden = batch.total === 0;
  status.textContent =
    batch.total === 0
      ? '暂时还没有适配的寺院，换一个心愿看看。'
      : `${category.prompt}。本类共 ${batch.total} 座，已遇见 ${batch.seen.length} 座。` +
        (batch.newRound
          ? ' 已开启新一轮。'
          : batch.repeated
            ? ' 部分寺院已展示过。'
            : batch.seen.length === batch.total
              ? ' 本类已看完，可再逛一轮。'
              : '');
  cards.replaceChildren();
  for (const id of batch.ids) {
    const temple = catalog.temples.find((t) => t.id === id);
    const card = element('article', 'entry-card');
    card.dataset.templeId = id;
    card.append(templeContent(temple));
    cards.append(card);
  }
  saveState();
}

async function loadCatalog() {
  status.textContent = '正在准备寺院名录…';
  try {
    const response = await fetch('/temple-entry/catalog.json');
    if (!response.ok) throw new Error('catalog unavailable');
    catalog = await response.json();
    restoreState();
    categoriesElement.replaceChildren();
    for (const category of catalog.categories) {
      const button = element('button', 'entry-category', category.label);
      button.type = 'button';
      button.dataset.category = category.id;
      button.setAttribute('aria-pressed', 'false');
      button.onclick = () => {
        selectedCategory = category.id;
        showBatch();
      };
      categoriesElement.append(button);
    }
    status.textContent = '求财、求缘，或只是求一份心安。选一个心愿，便可启程。';
    if (selectedCategory) showBatch();
  } catch {
    status.textContent = '寺院名录暂时无法加载。';
    const retry = element('button', 'entry-retry', '重新加载');
    retry.onclick = loadCatalog;
    status.append(' ', retry);
  }
}
refresh.onclick = () => showBatch(true);
function backToResults() {
  entrance.dataset.step = 'results';
  detailSection.hidden = true;
  results.hidden = false;
  detailTrigger?.focus();
}
entrance.querySelector('.entry-close').onclick = backToResults;
entrance.querySelector('#entry-back-wishes').onclick = () => {
  entrance.dataset.step = 'wishes';
  results.hidden = true;
  categoriesElement.querySelector('[aria-pressed="true"]')?.focus();
};
entrance.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && entrance.dataset.step === 'detail') backToResults();
});
loadCatalog();
