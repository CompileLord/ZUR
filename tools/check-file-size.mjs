#!/usr/bin/env node
// Rejects code files larger than 20 KiB.
//   node tools/check-file-size.mjs --staged   pre-commit: checks the staged version of added/modified files
//   node tools/check-file-size.mjs --all      CI: checks every tracked file
// Files listed in tools/file-size-baseline.json predate the rule: they may not grow past their
// recorded size, and must be split and removed from the baseline (never added to it).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const MAX_BYTES = 20 * 1024;
const CODE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|css|scss|html|sh|py|sql)$/;
const EXEMPT = /^(docs|screenshots)\//;

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

export function isChecked(path) {
  return CODE.test(path) && !EXEMPT.test(path);
}

export function findViolations(entries, baseline) {
  const violations = [];
  for (const { path, bytes } of entries) {
    if (!isChecked(path) || bytes <= MAX_BYTES) continue;
    const allowed = baseline[path];
    if (allowed === undefined) violations.push(`${path}: ${kib(bytes)} exceeds the ${kib(MAX_BYTES)} limit. Split it into smaller modules.`);
    else if (bytes > allowed) violations.push(`${path}: ${kib(bytes)} grew past its legacy size ${kib(allowed)}. Legacy oversized files may only shrink.`);
  }
  return violations;
}

/** Baseline entries for files that were split or deleted; they must be removed so the list only shrinks. */
export function findStaleBaseline(entries, baseline) {
  const sizes = new Map(entries.map(({ path, bytes }) => [path, bytes]));
  return Object.keys(baseline)
    .filter((path) => !sizes.has(path) || sizes.get(path) <= MAX_BYTES)
    .map((path) => `${path}: listed in tools/file-size-baseline.json but no longer oversized. Remove the entry.`);
}

const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

function stagedEntries() {
  const paths = git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z').split('\0').filter(Boolean);
  return paths.map((path) => ({ path, bytes: Number(git('cat-file', '-s', `:${path}`).trim()) }));
}

function trackedEntries() {
  return git('ls-files', '-z').split('\0').filter(Boolean).filter(isChecked).map((path) => {
    try { return { path, bytes: readFileSync(path).length }; } catch { return { path, bytes: 0 }; }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = git('rev-parse', '--show-toplevel').trim();
  process.chdir(root);
  let baseline = {};
  try { baseline = JSON.parse(readFileSync('tools/file-size-baseline.json', 'utf8')); } catch { /* no legacy files */ }
  const all = process.argv.includes('--all');
  const entries = all ? trackedEntries() : stagedEntries();
  const violations = [...findViolations(entries, baseline), ...(all ? findStaleBaseline(entries, baseline) : [])];
  if (violations.length) {
    console.error(`File size check failed (max ${kib(MAX_BYTES)} per code file):\n  ${violations.join('\n  ')}`);
    process.exit(1);
  }
}
