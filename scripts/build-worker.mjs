import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const isWindows = process.platform === 'win32';
const cargoHome = process.env.CARGO_HOME || path.join(os.homedir(), '.cargo');
const cargoBinDir = path.join(cargoHome, 'bin');
const mingwBinDir = 'C:\\ProgramData\\mingw64\\mingw64\\bin';

function resolveExecutable(name) {
  const candidates = isWindows
    ? [
        path.join(cargoBinDir, `${name}.exe`),
        path.join(cargoBinDir, `${name}.cmd`),
        path.join(cargoBinDir, `${name}.bat`)
      ]
    : [path.join(cargoBinDir, name)];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return name;
}

function run(command, args, extraEnv = {}) {
  execFileSync(command, args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      PATH: [
        cargoBinDir,
        existsSync(mingwBinDir) ? mingwBinDir : null,
        process.env.PATH || ''
      ].filter(Boolean).join(path.delimiter),
      ...extraEnv
    }
  });
}

const cargo = resolveExecutable('cargo');
const rustup = resolveExecutable('rustup');
const workerBuild = resolveExecutable('worker-build');

const toolchainEnv = isWindows
  ? { RUSTUP_TOOLCHAIN: process.env.RUSTUP_TOOLCHAIN || 'stable-x86_64-pc-windows-gnu' }
  : {};

run(rustup, ['target', 'add', 'wasm32-unknown-unknown'], toolchainEnv);
if (!existsSync(workerBuild) && !existsSync(`${workerBuild}.exe`)) {
  run(cargo, ['install', '-q', 'worker-build', '--version', '^0.7'], toolchainEnv);
}
run(workerBuild, ['--release'], toolchainEnv);
