// Package the approved glossy source. This never regenerates placeholder art.
// Development-time dependency: Python 3 + Pillow. Runtime remains dependency-free.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const result = spawnSync('python', [fileURLToPath(new URL('./art/package-icons.py', import.meta.url))], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
