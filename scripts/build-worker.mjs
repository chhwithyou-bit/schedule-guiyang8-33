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

function buildEnv(extraEnv = {}) {
  return {
    ...process.env,
    PATH: [
      cargoBinDir,
      existsSync(mingwBinDir) ? mingwBinDir : null,
      process.env.PATH || ''
    ].filter(Boolean).join(path.delimiter),
    ...extraEnv
  };
}

function run(command, args, extraEnv = {}) {
  execFileSync(command, args, {
    stdio: 'inherit',
    env: buildEnv(extraEnv)
  });
}

function commandWorks(command, args = ['--version'], extraEnv = {}) {
  try {
    execFileSync(command, args, {
      stdio: 'ignore',
      env: buildEnv(extraEnv)
    });

    return true;
  } catch {
    return false;
  }
}

function ensureRustToolchain() {
  const rustup = resolveExecutable('rustup');
  const cargo = resolveExecutable('cargo');

  if (commandWorks(rustup) && commandWorks(cargo)) {
    return;
  }

  if (isWindows) {
    throw new Error(
      'Rust toolchain is required but rustup/cargo was not found. Install Rust from https://rustup.rs/ and retry.'
    );
  }

  if (!commandWorks('curl') || !commandWorks('sh', ['-c', 'true'])) {
    throw new Error('Rust toolchain is missing and this build host does not have curl/sh to install rustup.');
  }

  const rustupInstallScript = path.join(os.tmpdir(), 'rustup-init.sh');
  run('curl', [
    '--proto',
    '=https',
    '--tlsv1.2',
    '-sSf',
    'https://sh.rustup.rs',
    '-o',
    rustupInstallScript
  ]);
  run(
    'sh',
    [
      rustupInstallScript,
      '-y',
      '--profile',
      'minimal',
      '--default-toolchain',
      process.env.RUSTUP_TOOLCHAIN || 'stable',
      '--target',
      'wasm32-unknown-unknown',
      '--no-modify-path'
    ],
    {
      RUSTUP_INIT_SKIP_PATH_CHECK: 'yes'
    }
  );
}

ensureRustToolchain();

const toolchainEnv = isWindows
  ? { RUSTUP_TOOLCHAIN: process.env.RUSTUP_TOOLCHAIN || 'stable-x86_64-pc-windows-gnu' }
  : { RUSTUP_TOOLCHAIN: process.env.RUSTUP_TOOLCHAIN || 'stable' };

const cargo = resolveExecutable('cargo');
const rustup = resolveExecutable('rustup');
const workerBuild = resolveExecutable('worker-build');

run(rustup, ['target', 'add', 'wasm32-unknown-unknown'], toolchainEnv);
if (!existsSync(workerBuild) && !existsSync(`${workerBuild}.exe`)) {
  run(cargo, ['install', '-q', 'worker-build', '--version', '^0.7'], toolchainEnv);
}
run(workerBuild, ['--release'], toolchainEnv);
