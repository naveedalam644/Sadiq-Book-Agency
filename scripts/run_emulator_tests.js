import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const userProfile = process.env.USERPROFILE || 'C:\\Users\\SALMAN COMPUTERS';
const candidateJavaHome = path.join(userProfile, '.jdk', 'jdk-21.0.6+7');
const javaHome = process.env.JAVA_HOME && fs.existsSync(process.env.JAVA_HOME)
  ? process.env.JAVA_HOME
  : (fs.existsSync(candidateJavaHome) ? candidateJavaHome : undefined);

const env = { ...process.env };
if (javaHome) {
  env.JAVA_HOME = javaHome;
  const binPath = path.join(javaHome, 'bin');
  if (!env.PATH.includes(binPath)) {
    env.PATH = `${binPath};${env.PATH}`;
  }
}

console.log('====================================================================');
console.log(' SADIQ BOOK AGENCY — FIREBASE EMULATOR SECURITY TEST RUNNER');
console.log('====================================================================');
if (javaHome) {
  console.log(`[JAVA_HOME]: ${javaHome}`);
} else {
  console.log('[WARN]: JAVA_HOME not set; using system default java');
}

const testScript = process.argv[2] || 'tests/firestore_security_rules_emulator_verification.ts';
const cmd = `firebase.cmd emulators:exec --only firestore,auth "node --experimental-strip-types ${testScript}"`;

console.log(`[EXECUTING]: ${cmd}\n`);

const child = spawn(cmd, {
  env,
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => {
  process.exit(code || 0);
});

