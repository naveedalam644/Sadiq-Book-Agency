import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';

const userProfile = process.env.USERPROFILE || 'C:\\Users\\SALMAN COMPUTERS';
const targetDir = path.join(userProfile, '.jdk');
const zipPath = path.join(targetDir, 'openjdk.zip');

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

console.log('Downloading Microsoft OpenJDK 21 for Windows x64...');
const url = 'https://aka.ms/download-jdk/microsoft-jdk-21.0.6-windows-x64.zip';
const res = await fetch(url);
if (!res.ok) {
  throw new Error(`Failed to download OpenJDK: ${res.statusText}`);
}

const fileStream = fs.createWriteStream(zipPath);
await finished(Readable.fromWeb(res.body).pipe(fileStream));
console.log('Download complete. Extracting via tar...');

execSync(`tar -xf "${zipPath}" -C "${targetDir}"`, { stdio: 'inherit' });
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

// Find java.exe in targetDir
const files = fs.readdirSync(targetDir);
console.log('Target dir contents:', files);
const jdkDir = files.find(f => f.startsWith('jdk-') || f.includes('21'));
if (jdkDir) {
  const javaExe = path.join(targetDir, jdkDir, 'bin', 'java.exe');
  if (fs.existsSync(javaExe)) {
    console.log('Found Java executable at:', javaExe);
    const ver = execSync(`"${javaExe}" -version`, { encoding: 'utf-8' });
    console.log('Java Version:\n', ver);
  }
}

