import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const cli = fileURLToPath(new URL('../node_modules/vinext/dist/cli.js', import.meta.url));
const result = spawnSync(process.execPath, [cli, 'build'], {
  stdio: 'inherit',
  cwd: projectRoot,
  env: { ...process.env, FINANCE_RUNTIME: 'node' },
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
