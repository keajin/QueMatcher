import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfigurations, activeConfiguration, configurationSetup, updateConfigurationSetup, addConfiguration, renameConfiguration, selectConfiguration } from '../src/configurations.js';

const legacy = { players: [{ id: 'alex', name: 'Alex', level: 'green' }], courts: [{ id: 'court', number: 3 }] };

test('existing roster and courts migrate into a default configuration without changing identities', () => {
  const store = normalizeConfigurations(legacy);
  assert.equal(activeConfiguration(store).name, 'Default configuration');
  assert.deepEqual(configurationSetup(store), legacy);
  assert.deepEqual(normalizeConfigurations(JSON.parse(JSON.stringify(store))), store);
});

test('renaming retains configuration identity, players, and courts', () => {
  const store = normalizeConfigurations(legacy);
  const next = renameConfiguration(store, 'default', ' Friday social ');
  assert.equal(next.activeConfigId, store.activeConfigId);
  assert.equal(activeConfiguration(next).name, 'Friday social');
  assert.deepEqual(configurationSetup(next), legacy);
  assert.equal(activeConfiguration(store).name, 'Default configuration');
});

test('creating and editing one configuration preserves the other saved setups', () => {
  const initial = normalizeConfigurations(legacy);
  const added = addConfiguration(initial, 'Weekend');
  assert.deepEqual(configurationSetup(added), { players: [], courts: [] });
  const weekend = { players: [{ id: 'jo', name: 'Jo', level: 'red' }], courts: [{ id: 'other-court', number: 3 }] };
  const edited = updateConfigurationSetup(added, weekend);
  const renamed = renameConfiguration(edited, edited.activeConfigId, 'Saturday');
  const restored = selectConfiguration(renamed, 'default');
  assert.deepEqual(configurationSetup(restored), legacy);
  assert.deepEqual(configurationSetup(selectConfiguration(restored, added.activeConfigId)), weekend);
  assert.equal(initial.configs.length, 1);
});

test('empty and duplicate names are rejected without changing saved configurations', () => {
  const store = addConfiguration(normalizeConfigurations(legacy), 'Weekend');
  assert.throws(() => addConfiguration(store, ' weekend '), /already exists/);
  assert.throws(() => renameConfiguration(store, 'default', 'WEEKEND'), /already exists/);
  assert.throws(() => addConfiguration(store, '  '), /configuration name/);
  assert.throws(() => addConfiguration(store, 'x'.repeat(81)), /configuration name/);
  assert.equal(store.configs.length, 2);
});

test('invalid saved formats cannot silently discard configurations', () => {
  const store = normalizeConfigurations(legacy);
  assert.throws(() => normalizeConfigurations({ ...store, version: 2 }), /unsupported/);
  assert.throws(() => normalizeConfigurations({ ...store, activeConfigId: 'missing' }), /could not be found/);
  assert.throws(() => normalizeConfigurations({ ...store, configs: [...store.configs, store.configs[0]] }), /identity/);
  assert.throws(() => normalizeConfigurations({ ...store, configs: [{ ...store.configs[0], courts: [{ id: 'invalid', number: 0 }] }] }), /invalid players or courts/);
});

test('session state is excluded from saved configurations', () => {
  const store = normalizeConfigurations(legacy);
  const withSession = { ...store, attending: ['alex'], queue: ['match'], live: { court: 'match' } };
  assert.deepEqual(normalizeConfigurations(withSession), store);
});
