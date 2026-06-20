import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const isWindows = process.platform === 'win32';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const cargoHome = process.env.CARGO_HOME || path.join(os.homedir(), '.cargo');
const cargoBinDir = path.join(cargoHome, 'bin');
const mingwBinDir = 'C:\\ProgramData\\mingw64\\mingw64\\bin';
const llvmMingwBinDir = path.join(
  os.homedir(),
  'AppData',
  'Local',
  'Microsoft',
  'WinGet',
  'Packages',
  'MartinStorsjo.LLVM-MinGW.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe',
  'llvm-mingw-20260602-ucrt-x86_64',
  'bin'
);
export const PREBUILT_WORKER_FILES = [
  'build/index.js',
  'build/index_bg.wasm',
  'build/package.json',
  'build/worker/shim.mjs'
];

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
      existsSync(llvmMingwBinDir) ? llvmMingwBinDir : null,
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

export function hasPrebuiltWorkerBundle(rootDir = repoRoot) {
  return PREBUILT_WORKER_FILES.every((relativePath) =>
    existsSync(path.join(rootDir, relativePath))
  );
}

function detectRustToolchain() {
  const rustup = resolveExecutable('rustup');
  const cargo = resolveExecutable('cargo');

  return {
    rustup,
    cargo,
    hasRustup: commandWorks(rustup),
    hasCargo: commandWorks(cargo)
  };
}

function ensureRustToolchain() {
  let toolchain = detectRustToolchain();
  if (toolchain.hasCargo) {
    return toolchain;
  }

  if (!isWindows) {
    if (!commandWorks('curl') || !commandWorks('sh', ['-c', 'true'])) {
      return toolchain;
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
    toolchain = detectRustToolchain();
  }

  return toolchain;
}

function fallbackToPrebuiltWorker(reason) {
  if (!hasPrebuiltWorkerBundle()) {
    throw new Error(`${reason} No prebuilt worker bundle was found in build/.`);
  }

  console.warn(
    `${reason} Reusing the checked-in worker bundle from build/ instead of rebuilding.`
  );
}

export function main() {
  const toolchain = ensureRustToolchain();
  if (!toolchain.hasCargo) {
    const installHint = isWindows
      ? 'Rust toolchain is required but rustup/cargo was not found. Install Rust from https://rustup.rs/ and retry.'
      : 'Rust toolchain is missing and this build host does not have a usable cargo installation.';
    fallbackToPrebuiltWorker(installHint);
    return;
  }

  const toolchainEnv = isWindows
    ? { RUSTUP_TOOLCHAIN: process.env.RUSTUP_TOOLCHAIN || 'stable-x86_64-pc-windows-gnullvm' }
    : { RUSTUP_TOOLCHAIN: process.env.RUSTUP_TOOLCHAIN || 'stable' };
  const workerBuild = resolveExecutable('worker-build');

  if (toolchain.hasRustup) {
    run(toolchain.rustup, ['target', 'add', 'wasm32-unknown-unknown'], toolchainEnv);
  } else {
    console.warn('rustup was not found; skipping wasm target installation and using the existing cargo toolchain.');
  }

  if (!commandWorks(workerBuild, ['--version'], toolchainEnv)) {
    run(toolchain.cargo, ['install', '-q', 'worker-build', '--version', '^0.7'], toolchainEnv);
  }

  run(workerBuild, ['--release'], toolchainEnv);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
