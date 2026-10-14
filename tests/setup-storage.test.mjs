import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSetupStorage } from '../desktop/setup-storage.js';
import { normalizeConfigurations, addConfiguration, renameConfiguration, selectConfiguration, configurationSetup } from '../src/configurations.js';

async function storageFixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'quematcher-configs-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'setup.json');
  return { file, storage: createSetupStorage(file) };
}

test('migration backs up the original file and preserves both configurations after reopening', async t => {
  const { file, storage } = await storageFixture(t);
  const original = JSON.stringify({ players: [{ id: 'p', name: 'Alex', level: 'blue' }], courts: [{ id: 'c', number: 1 }] });
  await fs.writeFile(file, original);
  const loaded = await storage.load();
  const next = addConfiguration(loaded, 'Saturday');
  await storage.save(next);
  assert.equal(await fs.readFile(`${file}.legacy-backup`, 'utf8'), original);
  const reopened = await createSetupStorage(file).load();
  assert.deepEqual(reopened, next);
  assert.deepEqual(configurationSetup(selectConfiguration(reopened, 'default')), configurationSetup(loaded));
  await storage.save(renameConfiguration(reopened, 'default', 'Friday'));
  assert.equal(await fs.readFile(`${file}.legacy-backup`, 'utf8'), original);
});

test('invalid saves leave the existing file intact, and a subsequent valid save works', async t => {
  const { file, storage } = await storageFixture(t);
  const initial = normalizeConfigurations(null);
  await storage.save(initial);
  const before = await fs.readFile(file, 'utf8');
  await assert.rejects(storage.save({ ...initial, activeConfigId: 'missing' }));
  assert.equal(await fs.readFile(file, 'utf8'), before);
  const renamed = renameConfiguration(initial, 'default', 'Club');
  await storage.save(renamed);
  assert.deepEqual(await storage.load(), renamed);
});

test('valid IPC payloads save regardless of object key order', async t => {
  const { storage } = await storageFixture(t);
  const payload = {
    configs: [{ courts: [{ number: 1, id: 'court' }], players: [{ level: 'blue', name: 'Alex', id: 'player' }], name: 'Club', id: 'default' }],
    activeConfigId: 'default', version: 1
  };
  await storage.save(structuredClone(payload));
  assert.deepEqual(await storage.load(), normalizeConfigurations(payload));
});

test('unexpected session fields are still rejected without changing the file', async t => {
  const { file, storage } = await storageFixture(t);
  const initial = normalizeConfigurations(null);
  await storage.save(initial);
  const before = await fs.readFile(file, 'utf8');
  await assert.rejects(storage.save({ ...initial, queue: [] }), /Invalid configuration/);
  assert.equal(await fs.readFile(file, 'utf8'), before);
});

test('queued saves write complete configuration stores in order', async t => {
  const { storage } = await storageFixture(t);
  const first = normalizeConfigurations(null);
  const second = addConfiguration(first, 'Weekend');
  await Promise.all([storage.save(first), storage.save(second)]);
  assert.deepEqual(await storage.load(), second);
});

test('corrupt or unsupported saved data is reported without rewriting it', async t => {
  const { file, storage } = await storageFixture(t);
  for (const original of ['{broken', JSON.stringify({ version: 2, configs: [] })]) {
    await fs.writeFile(file, original);
    await assert.rejects(storage.load(), /could not be read/);
    assert.equal(await fs.readFile(file, 'utf8'), original);
  }
});
