// One-time refactor audit against the saved implementation; not a runtime dependency.
import prettier from 'prettier';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const ignored = new Set([
  'start',
  'end',
  'loc',
  'extra',
  'comments',
  'leadingComments',
  'trailingComments',
  'innerComments',
  'tokens',
  'errors',
]);
function normalize(value, names = {}, receiver) {
  if (Array.isArray(value)) return value.map((item) => normalize(item, names, receiver));
  if (!value || typeof value !== 'object') return value;
  if (receiver && value.type === 'ThisExpression') return { type: 'Identifier', name: receiver };
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, item]) => item !== undefined && !ignored.has(key) && !key.startsWith('__'))
      .map(([key, item]) => [
        key,
        value.type === 'Identifier' && key === 'name'
          ? (names[item] ?? item)
          : normalize(item, names, receiver),
      ]),
  );
}
async function program(path) {
  return (
    await prettier.__debug.parse(await readFile(new URL(path, root), 'utf8'), { parser: 'babel' })
  ).ast.program;
}
const unwrap = (node) => (node.type === 'ExportNamedDeclaration' ? node.declaration : node);
const declaration = (ast, name) => ast.body.map(unwrap).find((node) => node?.id?.name === name);
const method = (klass, name) => klass.body.body.find((node) => node.key.name === name);
const variable = (body, name) =>
  body.body
    .filter((node) => node.type === 'VariableDeclaration')
    .flatMap((node) => node.declarations)
    .find((node) => node.id.name === name);
const checks = [];
function compare(name, before, after, names = {}, receiver) {
  try {
    assert.deepEqual(normalize(before, names, receiver), normalize(after));
  } catch {
    throw Error(`Executable AST changed: ${name}`);
  }
  checks.push({ name, executableAstIdentical: true });
}
const oldPath = '.snapshots/pre-maintainability-refactor-2026-11-11/server/';
const oldIndex = declaration(await program(oldPath + 'index.mjs'), 'createMirrorServer');
const httpBody = variable(oldIndex.body, 'server').init.arguments[0].body;
const newHttp = declaration(await program('server/http.mjs'), 'createRequestHandler');
compare('HTTP handler', httpBody, newHttp.body.body[0].argument.body, {
  req: 'request',
  res: 'response',
});
const upgrade = oldIndex.body.body.find(
  (node) =>
    node.type === 'ExpressionStatement' && node.expression.arguments?.[0]?.value === 'upgrade',
);
const transport = declaration(
  await program('server/websocket.mjs'),
  'attachWebSocketTransport',
);
compare('WebSocket upgrade and message handlers', upgrade, transport.body.body[0], {
  req: 'request',
  ws: 'connection',
});

const oldPresence = declaration(await program(oldPath + 'presence.mjs'), 'PresenceHub');
const newPresence = declaration(await program('server/presence.mjs'), 'PresenceHub');
for (const entry of oldPresence.body.body) {
  const name = entry.key.name;
  if (name === 'receive') continue;
  const names = { s: 'session', r: 'currentRoom', v: 'visitor', w: 'otherVisitor' };
  if (name === 'tick') Object.assign(names, { k: 'token', v: 'saved' });
  compare('PresenceHub.' + name, entry.body, method(newPresence, name).body, names);
}
const dispatcher = declaration(
  await program('server/protocol/dispatch.mjs'),
  'dispatchMessage',
);
compare(
  'message dispatch, validation and request caching',
  method(oldPresence, 'receive').body,
  dispatcher.body,
  { s: 'session', m: 'message', r: 'room', v: 'visitor', a: 'activities', w: 'otherVisitor' },
  'hub',
);

const oldActivities = await program(oldPath + 'activities.mjs');
const facade = declaration(oldActivities, 'Activities');
const currentFacade = declaration(await program('server/activities.mjs'), 'Activities');
for (const name of ['constructor', 'remove'])
  compare('Activities.' + name, method(facade, name).body, method(currentFacade, name).body, {
    w: 'worker',
  });
for (const [file, names, rename] of [
  [
    'incense',
    ['nearIncense', 'queueChanged', 'join', 'leave', 'start', 'offer', 'tick'],
    { v: 'visitor', o: 'offering' },
  ],
  ['construction', ['work', 'participation', 'construction'], { v: 'visitor', w: 'worker' }],
]) {
  const current = await program('server/activities/' + file + '.mjs');
  for (const name of names)
    compare(
      file + '.' + name,
      method(facade, name).body,
      declaration(current, name).body,
      rename,
      'state',
    );
}
compare(
  'Cafe25 class',
  declaration(oldActivities, 'Cafe25'),
  declaration(await program('server/activities/cafe25.mjs'), 'Cafe25'),
  { v: 'visitor', p: 'payload', a: 'accountState', c: 'candidateCup', o: 'offer', e: 'effect' },
);
await writeFile(
  new URL('runtime-ast-comparison.json', import.meta.url),
  JSON.stringify(checks, null, 2) + '\n',
);
console.log({ executableAstChecks: checks.length, passed: checks.length });
