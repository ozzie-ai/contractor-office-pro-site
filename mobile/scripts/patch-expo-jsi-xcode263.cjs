#!/usr/bin/env node
// Temporary compatibility workaround for expo-modules-jsi 58.0.22 with Xcode 26.3.
// This is intentionally scoped to that toolchain; remove when upgrading Xcode.
// The project's actual source files are not modified.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

if (process.platform !== 'darwin') {
  console.log('[Xcode 26.3 patch] Non-macOS host: skipping.');
  process.exit(0);
}

let version;
try {
  const output = execFileSync('xcodebuild', ['-version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  version = output.match(/^Xcode\s+(\d+\.\d+)/m)?.[1];
} catch {
  console.log('[Xcode 26.3 patch] Xcode unavailable: skipping.');
  process.exit(0);
}
if (version !== '26.3') {
  console.log(`[Xcode 26.3 patch] Xcode ${version || 'unknown'}: no patch required.`);
  process.exit(0);
}

const filepath = path.join(__dirname, '..', 'node_modules', 'expo-modules-jsi', 'apple', 'Sources',
  'ExpoModulesJSI', 'Runtime', 'Values', 'JavaScriptObject.swift');
if (!fs.existsSync(filepath)) {
  console.error('[Xcode 26.3 patch] ExpoModulesJSI source not found. Install npm dependencies first.');
  process.exit(1);
}

const oldFirst = `    // The isolated closure below runs synchronously on this thread.
    nonisolated(unsafe) let slot = buffer.baseAddress!`;
const newFirst = `    let slot = buffer.baseAddress!
    // The isolated closure below runs synchronously on this thread.
    // Capture an integer address rather than a non-Sendable Swift pointer.
    let slotAddress = UInt(bitPattern: slot)`;
const oldSecond = `      try JavaScriptActor.assumeIsolated {
        try encode(JavaScriptValue.Slot(slot), runtime)`;
const newSecond = `      try JavaScriptActor.assumeIsolated {
        let slot = UnsafeMutablePointer<facebook.jsi.Value>(bitPattern: slotAddress)!
        try encode(JavaScriptValue.Slot(slot), runtime)`;

const source = fs.readFileSync(filepath, 'utf8');
if (source.includes('let slotAddress = UInt(bitPattern: slot)') &&
    source.includes('UnsafeMutablePointer<facebook.jsi.Value>(bitPattern: slotAddress)!')) {
  console.log('[Xcode 26.3 patch] Already applied.');
  process.exit(0);
}
if (source.split(oldFirst).length !== 2 || source.split(oldSecond).length !== 2) {
  console.error('[Xcode 26.3 patch] Unexpected upstream Swift source. No modifications made.');
  process.exit(1);
}
fs.writeFileSync(filepath, source.replace(oldFirst, newFirst).replace(oldSecond, newSecond), 'utf8');
console.log('[Xcode 26.3 patch] Applied ExpoModulesJSI Swift pointer workaround.');
