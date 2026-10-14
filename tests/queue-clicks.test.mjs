import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import * as model from '../src/model.js';
import * as configurations from '../src/configurations.js';
import * as display from '../src/display-state.js';

const source = (await readFile(new URL('../src/app.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');

async function organizer() {
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      handlers: {}, innerHTML: '', textContent: '', className: '',
      classList: { toggle() {} }, hidePopover() {},
      addEventListener(type, handler) { (this.handlers[type] ||= []).push(handler); }
    });
    return elements.get(selector);
  };
  const context = vm.createContext({
    ...model, ...configurations, ...display, crypto: webcrypto,
    document: {
      querySelector: element, querySelectorAll: () => [], addEventListener() {},
      documentElement: { dataset: {}, classList: { toggle() {} } }
    },
    window: { matchMedia: () => ({ matches: false }), addEventListener() {} },
    localStorage: { getItem: () => null },
    setInterval() {}, setTimeout() {}, clearTimeout() {}
  });
  const session = await vm.runInContext(`(async () => { ${source}\n return session; })()`, context);
  session.attending = ['a', 'b', 'c', 'd', 'e'];
  const dispatch = async (type, id, detail, { available = true, button = 0 } = {}) => {
    const player = { dataset: { player: id }, closest: selector => selector === '[data-drop-available]' && available ? {} : null };
    const event = {
      button, detail, clientX: 100, clientY: 200, preventDefault() {},
      target: { closest: selector => selector === '[data-player][draggable]' ? player : null }
    };
    for (const handler of element('#app').handlers[type] || []) await handler(event);
  };
  return { session, dispatch, toast: element('#toast') };
}

const queued = session => Array.from(session.queue, match => Array.from(match.players));

test('rapid click pairs queue successive players at the same cursor position', async () => {
  const { session, dispatch, toast } = await organizer();
  for (const [index, id] of ['a', 'b', 'c', 'd', 'e'].entries()) {
    await dispatch('click', id, index * 2 + 1);
    assert.equal(model.availablePlayers(session).length, 5 - index);
    await dispatch('click', id, index * 2 + 2);
    // The native dblclick after the first pair must not queue the next row.
    if (index === 0) await dispatch('dblclick', 'b', 2);
    assert.equal(model.availablePlayers(session).length, 4 - index);
  }
  assert.deepEqual(queued(session), [['a', 'b', 'c', 'd'], ['e', null, null, null]]);
  assert.equal(toast.textContent, '');
});

test('ordinary double clicks still work when the browser restarts its click count', async () => {
  const { session, dispatch } = await organizer();
  for (const id of ['a', 'b']) {
    await dispatch('click', id, 1);
    await dispatch('click', id, 2);
  }
  assert.deepEqual(queued(session), [['a', 'b', null, null]]);
});

test('single clicks, odd click counts, keyboard clicks, and other mouse buttons do not queue players', async () => {
  const { session, dispatch } = await organizer();
  for (const detail of [0, 1, 3, 5]) await dispatch('click', 'a', detail);
  await dispatch('click', 'a', 2, { button: 1 });
  await dispatch('click', 'a', 2, { button: 2 });
  assert.deepEqual(queued(session), []);
});

test('rapid clicks on queued or live plates do not trigger available-player quick placement', async () => {
  const { session, dispatch, toast } = await organizer();
  await dispatch('click', 'a', 2);
  await dispatch('click', 'a', 4, { available: false });
  session.live.court = { players: ['b', 'c', 'd', 'e'] };
  await dispatch('click', 'b', 6, { available: false });
  assert.deepEqual(queued(session), [['a', null, null, null]]);
  assert.equal(toast.textContent, '');
});
