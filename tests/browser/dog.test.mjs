import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createMirrorServer } from '../../server/index.mjs';

let app, browser, base;
const out = new URL('../../test-results/dog/', import.meta.url);
before(async () => {
  await mkdir(out, { recursive: true });
  app = createMirrorServer();
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  base = 'http://127.0.0.1:' + app.server.address().port;
  browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal'] });
});
after(async () => {
  await browser?.close();
  await app?.close();
});

async function open({ mobile = false, failModel = false, holdModel = false } = {}) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    isMobile: mobile,
    hasTouch: mobile,
    serviceWorkers: 'block',
  });
  const errors = [],
    external = [];
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    if (new URL(url).origin !== base) {
      external.push(url);
      return route.abort();
    }
    if (/\/temple-entry\/dog\/shiba\.[a-f0-9]+\.glb/.test(url)) {
      if (failModel) return route.fulfill({ status: 404, body: 'Missing dog' });
      if (holdModel) return;
    }
    if (/\/assets\/game-U0Pmc8tU\.js/.test(url)) {
      const response = await route.fetch();
      const source = await response.text();
      assert.ok(source.includes('this.sanctuary=y,y'));
      return route.fulfill({
        response,
        body: source.replaceAll(
          'this.sanctuary=y,y',
          'globalThis.__dogTestGame=this,globalThis.__dogTestThree={Box3:fn,Vector3:R},globalThis.__dogTestClear=(x,z,r)=>!Ea(x,z,r),this.sanctuary=y,y',
        ),
      });
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base + '/?room=maru-17');
  await page.getByRole('button', { name: '健康', exact: true }).click();
  await page.locator('.entry-card .entry-enter').first().click();
  await page.locator('#game-loading.is-loaded').waitFor({ state: 'attached', timeout: 80000 });
  await page.locator('#temple-entry').waitFor({ state: 'hidden', timeout: 20000 });
  return { context, page, errors, external };
}

test(
  'desktop and mobile render the licensed dog, patrol safely, animate and release resources',
  { timeout: 160000 },
  async () => {
    for (const mobile of [false, true]) {
      const { context, page, errors, external } = await open({ mobile });
      try {
        assert.equal(
          await page.evaluate(() => Boolean(globalThis.__dogTestGame.sanctuary.templeDog)),
          true,
        );
        assert.equal(
          await page.evaluate(() => globalThis.__dogTestGame.sanctuary.templeDog.ready),
          true,
        );
        await page.evaluate(() => globalThis.__dogTestGame.sanctuary.completeDetail());
        const result = await page.evaluate(() => {
          const g = globalThis.__dogTestGame;
          g.setRenderingActive(false);
          const dog = g.sanctuary.templeDog;
          const root = dog.root;
          const { Box3, Vector3 } = globalThis.__dogTestThree;
          const model = root.children.find((child) => child.isGroup);
          root.updateMatrixWorld(true);
          const size = new Box3().setFromObject(model, true).getSize(new Vector3());
          const start = { ...root.userData.templeDog };
          const states = new Set();
          const visited = new Set();
          let maxBodyRadius = 0;
          function measureBody() {
            root.updateMatrixWorld(true);
            const point = new Vector3();
            model.traverse((node) => {
              if (!node.isSkinnedMesh) return;
              for (let n = 0; n < node.geometry.attributes.position.count; n++) {
                node.getVertexPosition(n, point).applyMatrix4(node.matrixWorld);
                root.worldToLocal(point);
                maxBodyRadius = Math.max(maxBodyRadius, Math.hypot(point.x, point.z));
              }
            });
          }
          measureBody();
          let travelled = 0,
            safe = true,
            grounded = true;
          const bones = [];
          model.traverse((node) => {
            if (node.isBone) bones.push(node);
          });
          const poseBefore = bones.map((bone) => [
            ...bone.position.toArray(),
            ...bone.quaternion.toArray(),
          ]);
          for (let i = 0; i < 3600; i++) {
            const before = { ...root.userData.templeDog };
            dog.update(0.05);
            const s = root.userData.templeDog;
            states.add(s.phase);
            visited.add(`${s.x.toFixed(0)},${s.z.toFixed(0)}`);
            travelled += Math.hypot(s.x - before.x, s.z - before.z);
            safe &&=
              globalThis.__dogTestClear(s.x, s.z, s.radius) &&
              s.x >= -5.5 &&
              s.x <= 5.5 &&
              s.z >= 31 &&
              s.z <= 42;
            grounded &&= Number.isFinite(root.position.y) && Math.abs(root.position.y + 1.14) < 0.4;
            if (i % 120 === 0) measureBody();
          }
          const animatedBones = bones.filter((bone, index) =>
            [...bone.position.toArray(), ...bone.quaternion.toArray()].some(
              (value, n) => Math.abs(value - poseBefore[index][n]) > 1e-5,
            ),
          ).length;
          const yaw = root.rotation.y;
          g.camera.position.set(
            root.position.x + Math.sin(yaw) * 1.8 + Math.cos(yaw) * 1.1,
            root.position.y + 0.9,
            root.position.z + Math.cos(yaw) * 1.8 - Math.sin(yaw) * 1.1,
          );
          g.camera.lookAt(root.position.x, root.position.y + 0.3, root.position.z);
          g.renderer.render(g.scene, g.camera);
          return {
            size: size.toArray(),
            start,
            end: root.userData.templeDog,
            states: [...states].sort(),
            travelled,
            visited: visited.size,
            safe,
            grounded,
            maxBodyRadius,
            bones: bones.length,
            animatedBones,
            cats: Boolean(g.sanctuary.cafe25Cat && g.sanctuary.cafe25PondCat),
            ready: g.isReady,
          };
        });
        await writeFile(
          new URL(mobile ? 'mobile.json' : 'desktop.json', out),
          JSON.stringify(result, null, 2),
        );
        assert.equal(result.ready, true);
        assert.equal(result.cats, true);
        assert.ok(result.bones >= 20);
        // The dog is measured during a live pose; walking lowers the head and body.
        assert.ok(result.size[1] > 0.55 && result.size[1] < 0.75);
        assert.deepEqual(result.states, ['idle', 'walk']);
        assert.ok(result.travelled > 20);
        assert.ok(result.visited > 10);
        assert.equal(result.safe, true);
        assert.equal(result.grounded, true);
        assert.ok(result.maxBodyRadius <= result.end.radius);
        assert.ok(result.animatedBones > 5);
        assert.deepEqual(errors, []);
        assert.deepEqual(external, []);
        await page.addStyleTag({
          content:
            'body *{visibility:hidden!important}canvas[data-engine]{visibility:visible!important}',
        });
        await page.screenshot({
          path: fileURLToPath(new URL(mobile ? 'mobile.png' : 'desktop.png', out)),
        });
        const released = await page.evaluate(() => {
          const dog = globalThis.__dogTestGame.sanctuary.templeDog;
          const resources = new Set();
          dog.root.traverse((node) => {
            if (!node.isMesh) return;
            resources.add(node.geometry);
            for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
              resources.add(material);
              for (const value of Object.values(material))
                if (value?.isTexture) resources.add(value);
            }
          });
          const counts = new Map([...resources].map((resource) => [resource, 0]));
          for (const resource of resources)
            resource.addEventListener('dispose', () =>
              counts.set(resource, counts.get(resource) + 1),
            );
          dog.dispose();
          dog.dispose();
          dog.update(1);
          return {
            removed: dog.root.parent === null,
            status: dog.root.userData.templeDog.status,
            counts: [...counts.values()],
          };
        });
        assert.equal(released.removed, true);
        assert.equal(released.status, 'disposed');
        assert.ok(released.counts.length > 5);
        assert.ok(released.counts.every((count) => count === 1));
      } finally {
        await context.close();
      }
    }
  },
);

test(
  'missing model and cancellation during download never block temple entry',
  { timeout: 150000 },
  async () => {
    for (const holdModel of [false, true]) {
      const { context, page, errors } = await open({ failModel: !holdModel, holdModel });
      try {
        const result = await page.evaluate(async (held) => {
          const g = globalThis.__dogTestGame;
          const dog = g.sanctuary.templeDog;
          if (!held) await dog.ready;
          const before = dog.root.userData.templeDog.status;
          dog.dispose();
          await dog.ready;
          return {
            before,
            after: dog.root.userData.templeDog.status,
            removed: dog.root.parent === null,
            ready: g.isReady,
          };
        }, holdModel);
        assert.equal(result.before, holdModel ? 'loading' : 'error');
        assert.equal(result.after, 'disposed');
        assert.equal(result.removed, true);
        assert.equal(result.ready, true);
        assert.deepEqual(errors, []);
      } finally {
        await context.close();
      }
    }
  },
);
