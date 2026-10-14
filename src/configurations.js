import { normalizeSetup, uid } from './model.js';

export function normalizeConfigurations(input) {
  if (!input || (!('configs' in input) && !('version' in input))) {
    const setup = normalizeSetup(input);
    return { version: 1, activeConfigId: 'default', configs: [{ id: 'default', name: 'Default configuration', ...setup }] };
  }
  if (input.version !== 1 || !Array.isArray(input.configs) || !input.configs.length) throw new Error('Saved configurations have an unsupported or invalid format.');
  const ids = new Set(), names = new Set();
  const configs = input.configs.map(config => {
    if (!config || typeof config.id !== 'string' || !config.id || ids.has(config.id)) throw new Error('Saved configurations contain an invalid identity.');
    const name = configurationName(config.name);
    if (names.has(name.toLowerCase())) throw new Error('Saved configuration names must be unique.');
    if (!Array.isArray(config.players) || !Array.isArray(config.courts)) throw new Error('A saved configuration is missing its roster or courts.');
    const setup = normalizeSetup(config);
    if (setup.players.length !== config.players.length || setup.courts.length !== config.courts.length) throw new Error('A saved configuration contains invalid players or courts.');
    ids.add(config.id); names.add(name.toLowerCase());
    return { id: config.id, name, ...setup };
  });
  if (!ids.has(input.activeConfigId)) throw new Error('The selected configuration could not be found.');
  return { version: 1, activeConfigId: input.activeConfigId, configs };
}

function configurationName(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 80) throw new Error('Enter a configuration name between 1 and 80 characters.');
  return value.trim();
}

function checkName(store, value, excludingId = null) {
  const name = configurationName(value);
  if (store.configs.some(config => config.id !== excludingId && config.name.toLowerCase() === name.toLowerCase())) throw new Error('That configuration name already exists.');
  return name;
}

export function activeConfiguration(store) {
  const config = store.configs.find(item => item.id === store.activeConfigId);
  if (!config) throw new Error('The selected configuration could not be found.');
  return config;
}

export function configurationSetup(store) {
  const { players, courts } = activeConfiguration(store);
  return { players, courts };
}

export function updateConfigurationSetup(store, setup) {
  const next = { ...store, configs: store.configs.map(config => config.id === store.activeConfigId ? { ...config, ...normalizeSetup(setup) } : config) };
  return normalizeConfigurations(next);
}

export function addConfiguration(store, value) {
  const name = checkName(store, value);
  const config = { id: uid(), name, players: [], courts: [] };
  return { ...store, activeConfigId: config.id, configs: [...store.configs, config] };
}

export function renameConfiguration(store, id, value) {
  if (!store.configs.some(config => config.id === id)) throw new Error('This configuration could not be found.');
  const name = checkName(store, value, id);
  return { ...store, configs: store.configs.map(config => config.id === id ? { ...config, name } : config) };
}

export function selectConfiguration(store, id) {
  if (!store.configs.some(config => config.id === id)) throw new Error('This configuration could not be found.');
  return { ...store, activeConfigId: id };
}
