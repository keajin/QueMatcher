import fs from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { normalizeConfigurations } from '../src/configurations.js';

export function createSetupStorage(filePath) {
  let pendingSave = Promise.resolve();
  return {
    async load() {
      try { return normalizeConfigurations(JSON.parse(await fs.readFile(filePath, 'utf8'))); }
      catch (error) {
        if (error.code === 'ENOENT') return normalizeConfigurations(null);
        throw new Error('Saved configurations could not be read. Your existing file has not been changed.', { cause: error });
      }
    },
    save(value) {
      const operation = pendingSave.catch(() => {}).then(async () => {
        if (value?.version !== 1) throw new Error('Invalid configuration data.');
        const data = normalizeConfigurations(value);
        if (!isDeepStrictEqual(data, value)) throw new Error('Invalid configuration data.');
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        // Keep the single-roster file recoverable after migrating to configurations.
        try {
          const previous = await fs.readFile(filePath, 'utf8');
          const legacy = JSON.parse(previous);
          if (!legacy.configs && !legacy.version) {
            try { await fs.writeFile(`${filePath}.legacy-backup`, previous, { encoding: 'utf8', flag: 'wx' }); }
            catch (error) { if (error.code !== 'EEXIST') throw error; }
          }
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
        const temporaryPath = `${filePath}.tmp`;
        await fs.writeFile(temporaryPath, JSON.stringify(data, null, 2), 'utf8');
        await fs.rename(temporaryPath, filePath);
      });
      pendingSave = operation;
      return operation;
    }
  };
}
