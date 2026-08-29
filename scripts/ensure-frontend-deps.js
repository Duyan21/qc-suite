// Skips `npm install` when frontend/node_modules already matches
// frontend/package-lock.json, so a repeat `npm run dev` doesn't rewrite
// node_modules under a Vite dev server that's still running from a
// previous invocation and watching those files (that live rewrite can
// crash Vite outright).
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const frontendDir = path.join(__dirname, '..', 'frontend')
const lockFile = path.join(frontendDir, 'package-lock.json')
const stampFile = path.join(frontendDir, 'node_modules', '.package-lock.json')

const lockMtime = fs.existsSync(lockFile) ? fs.statSync(lockFile).mtimeMs : 0
const stampMtime = fs.existsSync(stampFile) ? fs.statSync(stampFile).mtimeMs : -1

if (stampMtime >= lockMtime) {
  console.log('[install:frontend] frontend/node_modules already matches package-lock.json, skipping npm install')
  process.exit(0)
}

console.log('[install:frontend] package-lock.json changed, running npm install...')
execSync('npm install', { cwd: frontendDir, stdio: 'inherit' })
