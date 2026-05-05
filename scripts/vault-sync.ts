#!/usr/bin/env node
// Reads ~/Documents/scotts-world/tasks/apply-*.md and writes the parsed
// snapshot to src/apps/job-pipeline/data/vault-applications.snapshot.json.
// The Vite plugin uses this file as a fallback when the vault is not present.

import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { parseApplicationFile, type ParsedApplication } from '../vite/parse-application-file';

const vaultDir = process.env.VITE_VAULT_DIR ?? join(homedir(), 'Documents/scotts-world');
const tasksDir = join(vaultDir, 'tasks');
const snapshotPath = resolve('src/apps/job-pipeline/data/vault-applications.snapshot.json');

if (!existsSync(tasksDir)) {
  console.error(`[vault-sync] tasks dir not found at ${tasksDir}`);
  process.exit(1);
}

const files = readdirSync(tasksDir).filter(
  (f) => f.startsWith('apply-') && f.endsWith('.md'),
);

const apps: ParsedApplication[] = [];
const errors: string[] = [];
for (const f of files) {
  const raw = readFileSync(join(tasksDir, f), 'utf8');
  const result = parseApplicationFile(f, raw);
  if (result.ok) apps.push(result.value);
  else errors.push(`${f}: ${result.error}`);
}

mkdirSync(dirname(snapshotPath), { recursive: true });
writeFileSync(snapshotPath, JSON.stringify(apps, null, 2) + '\n');

console.log(`[vault-sync] wrote ${apps.length} applications to ${snapshotPath}`);
if (errors.length > 0) {
  console.log(`[vault-sync] ${errors.length} files skipped:`);
  for (const e of errors) console.log(`  - ${e}`);
  process.exit(0); // partial success is OK
}
