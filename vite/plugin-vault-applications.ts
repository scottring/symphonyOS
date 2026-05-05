// vite/plugin-vault-applications.ts
import type { Plugin } from 'vite';
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { parseApplicationFile, type ParsedApplication } from './parse-application-file';

const VIRTUAL_ID = 'virtual:vault-applications';
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID;

interface Options {
  /** Override vault path (default: VITE_VAULT_DIR or ~/Documents/scotts-world) */
  vaultDir?: string;
  /** Snapshot file path relative to project root */
  snapshotPath?: string;
}

export function vaultApplicationsPlugin(opts: Options = {}): Plugin {
  const vaultDir =
    opts.vaultDir ??
    process.env.VITE_VAULT_DIR ??
    join(homedir(), 'Documents/scotts-world');
  const tasksDir = join(vaultDir, 'tasks');
  const snapshotPath =
    opts.snapshotPath ?? 'src/apps/job-pipeline/data/vault-applications.snapshot.json';

  function readFromVault(): ParsedApplication[] {
    if (!existsSync(tasksDir)) return [];
    const files = readdirSync(tasksDir).filter(
      (f) => f.startsWith('apply-') && f.endsWith('.md'),
    );
    const apps: ParsedApplication[] = [];
    for (const f of files) {
      const raw = readFileSync(join(tasksDir, f), 'utf8');
      const result = parseApplicationFile(f, raw);
      if (result.ok) apps.push(result.value);
      else {
        // eslint-disable-next-line no-console
        console.warn(`[vault-applications] skipping ${f}: ${result.error}`);
      }
    }
    return apps;
  }

  function readFromSnapshot(projectRoot: string): ParsedApplication[] {
    const full = resolve(projectRoot, snapshotPath);
    if (!existsSync(full)) return [];
    try {
      return JSON.parse(readFileSync(full, 'utf8')) as ParsedApplication[];
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[vault-applications] failed to read snapshot: ${(err as Error).message}`);
      return [];
    }
  }

  function writeSnapshot(projectRoot: string, apps: ParsedApplication[]): void {
    try {
      const full = resolve(projectRoot, snapshotPath);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, JSON.stringify(apps, null, 2) + '\n');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[vault-applications] failed to write snapshot: ${(err as Error).message}`);
    }
  }

  let projectRoot = process.cwd();

  return {
    name: 'vault-applications',
    configResolved(config) {
      projectRoot = config.root;
    },
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
      return null;
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return null;
      let apps = readFromVault();
      if (apps.length === 0) {
        apps = readFromSnapshot(projectRoot);
      } else {
        // Refresh snapshot opportunistically when vault is present
        writeSnapshot(projectRoot, apps);
      }
      return `export const applications = ${JSON.stringify(apps)};`;
    },
    handleHotUpdate(ctx) {
      if (!existsSync(tasksDir)) return;
      if (ctx.file.startsWith(tasksDir)) {
        const mod = ctx.server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
        if (mod) {
          ctx.server.moduleGraph.invalidateModule(mod);
          ctx.server.ws.send({ type: 'full-reload' });
        }
      }
    },
    configureServer(server) {
      if (existsSync(tasksDir)) {
        server.watcher.add(tasksDir);
      }
    },
  };
}
