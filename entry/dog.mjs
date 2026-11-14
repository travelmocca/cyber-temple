export const DOG_BOUNDS = Object.freeze({ minX: -5.5, maxX: 5.5, minZ: 31, maxZ: 42 });
const RADIUS = 0.55;
const SPEED = 0.72;
const HEIGHT = 0.65;
const MODEL_URL = new URL('./dog/shiba.4c8d4d9361a3.glb', import.meta.url);

export function createDogPatrol({ random = Math.random, isWalkable = () => true } = {}) {
  const { minX, maxX, minZ, maxZ } = DOG_BOUNDS;
  const state = { x: -2.8, z: 40.5, yaw: Math.PI, speed: 0, phase: 'idle', radius: RADIUS };
  let target;
  let remaining = 2 + random() * 3;
  const valid = (x, z) =>
    x >= minX + RADIUS &&
    x <= maxX - RADIUS &&
    z >= minZ + RADIUS &&
    z <= maxZ - RADIUS &&
    isWalkable(x, z, RADIUS);
  const sample = () => ({
    x: minX + RADIUS + random() * (maxX - minX - RADIUS * 2),
    z: minZ + RADIUS + random() * (maxZ - minZ - RADIUS * 2),
  });
  if (!valid(state.x, state.z)) {
    let found = false;
    for (let n = 0; n < 80 && !found; n++) {
      const point = sample();
      if (valid(point.x, point.z)) {
        Object.assign(state, point);
        found = true;
      }
    }
    if (!found) throw new Error('No walkable courtyard position for the dog');
  }
  function stop() {
    target = undefined;
    state.speed = 0;
    state.phase = 'idle';
    remaining = 2 + random() * 3;
  }
  function clearPath(point) {
    const steps = Math.ceil(Math.hypot(point.x - state.x, point.z - state.z) / 0.12);
    for (let n = 1; n <= steps; n++)
      if (
        !valid(
          state.x + ((point.x - state.x) * n) / steps,
          state.z + ((point.z - state.z) * n) / steps,
        )
      )
        return false;
    return true;
  }
  return {
    state,
    update(delta) {
      if (!Number.isFinite(delta) || delta <= 0) return;
      const dt = Math.min(delta, 0.05);
      if (!target) {
        remaining -= dt;
        if (remaining > 0) return;
        for (let n = 0; n < 24; n++) {
          const point = sample();
          if (Math.hypot(point.x - state.x, point.z - state.z) >= 1.4 && clearPath(point)) {
            target = point;
            break;
          }
        }
        if (!target) return stop();
      }
      const dx = target.x - state.x;
      const dz = target.z - state.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.015) return stop();
      const heading = Math.atan2(dx, dz);
      const turn = Math.atan2(Math.sin(heading - state.yaw), Math.cos(heading - state.yaw));
      state.yaw += Math.max(-dt * 3.5, Math.min(dt * 3.5, turn));
      if (Math.abs(turn) > dt * 3.5 + 0.01) return;
      state.yaw = heading;
      const step = Math.min(distance, SPEED * dt);
      const x = state.x + (dx / distance) * step;
      const z = state.z + (dz / distance) * step;
      if (!valid(x, z)) return stop();
      Object.assign(state, { x, z, speed: step / dt, phase: 'walk' });
    },
  };
}

// The host supplies its own Three.js classes so no second renderer/library is loaded.
export function createTempleDog(three, { scene, isWalkable, groundHeight }) {
  const {
    Group,
    Box3,
    Vector3,
    AnimationMixer,
    GLTFLoader,
    Mesh,
    PlaneGeometry,
    MeshBasicMaterial,
    DataTexture,
  } = three;
  const root = new Group();
  root.name = '庭院小狗 · 柴犬';
  root.userData.runtimeDynamic = true;
  root.visible = false;
  scene.add(root);
  const state = (root.userData.templeDog = { status: 'loading' });
  const abort = new AbortController();
  let disposed = false;
  let model, mixer, active, idle, walk, patrol;
  const shadowPixels = new Uint8Array(32 * 32 * 4);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const offset = (y * 32 + x) * 4;
      const radius = Math.hypot((x - 15.5) / 15.5, (y - 15.5) / 15.5);
      shadowPixels[offset + 3] = Math.max(0, Math.exp(-radius * radius * 3) - Math.exp(-3)) * 255;
    }
  const shadowTexture = new DataTexture(shadowPixels, 32, 32);
  shadowTexture.needsUpdate = true;
  const shadow = new Mesh(
    new PlaneGeometry(1.05, 0.65),
    new MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  root.add(shadow);

  function releaseModel() {
    if (!model) return;
    mixer?.stopAllAction();
    mixer?.uncacheRoot(model);
    const resources = new Set();
    model.traverse((node) => {
      if (!node.isMesh) return;
      resources.add(node.geometry);
      if (node.skeleton) resources.add(node.skeleton);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        resources.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
      }
    });
    for (const resource of resources) resource.dispose();
    model.removeFromParent();
    model = mixer = undefined;
  }

  const ready = (async () => {
    const response = await fetch(MODEL_URL, { signal: abort.signal });
    if (!response.ok) throw new Error('Dog model HTTP ' + response.status);
    const buffer = await response.arrayBuffer();
    if (disposed) return false;
    const gltf = await new GLTFLoader().parseAsync(buffer, new URL('.', MODEL_URL).href);
    model = gltf.scene;
    if (disposed) {
      releaseModel();
      return false;
    }
    const idleClip = gltf.animations.find((clip) => /\|Idle$/.test(clip.name));
    const walkClip = gltf.animations.find((clip) => /\|Walk$/.test(clip.name));
    if (!idleClip || !walkClip) throw new Error('Dog model requires idle and walk animations');
    mixer = new AnimationMixer(model);
    idle = mixer.clipAction(idleClip);
    walk = mixer.clipAction(walkClip);
    active = idle;
    idle.play();
    mixer.update(0);
    model.updateMatrixWorld(true);
    const box = new Box3().setFromObject(model, true);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    if (!Number.isFinite(size.y) || size.y <= 0) throw new Error('Invalid dog model bounds');
    const scale = HEIGHT / size.y;
    model.scale.multiplyScalar(scale);
    model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    model.traverse((node) => {
      if (!node.isMesh) return;
      // The source FBX conversion gives fur metallic material; use matte fur in this scene.
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        material.metalness = 0;
        material.roughness = 0.9;
      }
    });
    patrol = createDogPatrol({ isWalkable });
    root.add(model);
    Object.assign(state, patrol.state, { status: 'ready', height: HEIGHT });
    root.position.set(state.x, groundHeight(state.x, state.z), state.z);
    root.rotation.y = state.yaw;
    root.visible = true;
    return true;
  })().catch((error) => {
    releaseModel();
    if (!disposed) {
      state.status = 'error';
      state.error = error.message;
      console.warn('庭院小狗暂时无法加载：', error.message);
    }
    return false;
  });

  return {
    root,
    ready,
    update(delta) {
      if (disposed || state.status !== 'ready') return;
      const dt = Number.isFinite(delta) && delta > 0 ? Math.min(delta, 0.05) : 0;
      patrol.update(dt);
      Object.assign(state, patrol.state);
      root.position.set(state.x, groundHeight(state.x, state.z), state.z);
      root.rotation.y = state.yaw;
      const next = state.phase === 'walk' ? walk : idle;
      if (active !== next) {
        next.reset().play();
        active.crossFadeTo(next, 0.22, false);
        active = next;
      }
      walk.timeScale = state.speed / SPEED;
      mixer.update(dt);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      state.status = 'disposed';
      abort.abort();
      releaseModel();
      shadow.geometry.dispose();
      shadow.material.dispose();
      shadowTexture.dispose();
      root.removeFromParent();
    },
  };
}
