import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const testDir = new URL('../tests/', import.meta.url);
const testFiles = readdirSync(testDir)
  .filter(name => name.startsWith('test-') && name.endsWith('.js'))
  .sort();

for (const testFile of testFiles) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(testFile, testDir))], {
    stdio: 'inherit'
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
