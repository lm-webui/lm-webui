import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const desktopDir = resolve(new URL('..', import.meta.url).pathname);
const repoDir = resolve(desktopDir, '..');
const rootPackagePath = resolve(repoDir, 'package.json');
const desktopPackagePath = resolve(desktopDir, 'package.json');
const tauriConfigPath = resolve(desktopDir, 'src-tauri/tauri.conf.json');
const cargoPath = resolve(desktopDir, 'src-tauri/Cargo.toml');

const rootPackage = JSON.parse(await readFile(rootPackagePath, 'utf8'));
const version = rootPackage.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`Invalid root version: ${version}`);
}

const tauriConfig = JSON.parse(await readFile(tauriConfigPath, 'utf8'));
tauriConfig.version = version;
await writeFile(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`);

const desktopPackage = JSON.parse(await readFile(desktopPackagePath, 'utf8'));
desktopPackage.version = version;
await writeFile(desktopPackagePath, `${JSON.stringify(desktopPackage, null, 2)}\n`);

const cargo = await readFile(cargoPath, 'utf8');
const cargoVersionPattern = /^(version\s*=\s*")[^"]+(")/m;
if (!cargoVersionPattern.test(cargo)) {
  throw new Error('Could not update desktop Cargo.toml version');
}
const updatedCargo = cargo.replace(cargoVersionPattern, (_match, prefix, suffix) => `${prefix}${version}${suffix}`);
await writeFile(cargoPath, updatedCargo);
console.log(`Desktop version synchronized to ${version}`);
