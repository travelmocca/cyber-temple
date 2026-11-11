// Construction rules operate on the state owned by the Activities facade.
export function work(state, visitor, action) {
  const station =
    action === 'drop'
      ? { x: -9.05, z: -25.04 }
      : action === 'take'
        ? { x: -2.9, z: 2.05 }
        : { x: -6.8, z: 2.05 };
  if (
    Math.hypot(visitor.position.x - station.x, visitor.position.z - station.z) >
    (action === 'drop' ? 0.9 : 1.3)
  )
    return false;
  let worker = state.workers.find((worker) => worker.id === visitor.id);
  let delivery;
  if (action === 'equip') {
    if (!worker && state.participation() !== 'complete')
      state.workers.push({ id: visitor.id, stage: 'helmet' });
    else if (!worker) return false;
  } else if (action === 'take') {
    if (worker?.stage !== 'helmet' || state.participation() === 'complete') return false;
    worker.stage = 'carrying';
  } else if (action === 'drop') {
    if (worker?.stage !== 'carrying') return false;
    worker.stage = 'helmet';
    if (state.tiles < 1000) state.tiles++;
    else delivery = state.options.deliver?.();
  } else if (action === 'return') {
    if (worker?.stage !== 'helmet') return false;
    state.workers = state.workers.filter((worker) => worker.id !== visitor.id);
  } else return false;
  state.broadcast({
    type: 'construction-state',
    state: state.construction(),
    serverTime: state.now(),
  });
  state.options.changed?.();
  return delivery || true;
}

export function participation(state) {
  return state.options.participation?.() ?? (state.tiles >= 1000 ? 'complete' : 'local');
}

export function construction(state) {
  return {
    tiles: state.tiles,
    workers: structuredClone(state.workers),
    rules: { goal: 1000, participation: state.participation() },
  };
}
