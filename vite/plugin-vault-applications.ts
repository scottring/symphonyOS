// vite/plugin-vault-applications.ts
import type { Plugin, ViteDevServer, PreviewServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { parseApplicationFile, type ParsedApplication } from './parse-application-file';
import {
  writeApplicationFile,
  type ApplicationPatch,
} from './write-application-file';
import {
  createApplicationFile,
  type NewApplicationInput,
} from './create-application-file';

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
      server.middlewares.use(makeWriteMiddleware(tasksDir, server));
    },
    configurePreviewServer(server) {
      // Same write-back middleware works against `vite preview` since the
      // Mac Mini kiosk runs under preview, not pure static.
      server.middlewares.use(makeWriteMiddleware(tasksDir, server));
    },
  };
}

type ServerLike = ViteDevServer | PreviewServer;

function isDevServer(s: ServerLike): s is ViteDevServer {
  return (s as ViteDevServer).moduleGraph !== undefined;
}

function makeWriteMiddleware(tasksDir: string, server: ServerLike) {
  return async function vaultApplicationsMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: (err?: unknown) => void,
  ) {
    if (!req.url || !req.method) return next();
    // Match POST /__vault/applications (create) or /__vault/applications/<slug> (patch).
    const createMatch = /^\/__vault\/applications\/?(?:[?#].*)?$/.exec(req.url);
    const patchMatch = /^\/__vault\/applications\/([^/?#]+)(?:[?#].*)?$/.exec(req.url);
    if (!createMatch && !patchMatch) return next();
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'method not allowed' }));
      return;
    }
    if (!existsSync(tasksDir)) {
      res.statusCode = 503;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'vault tasks directory not found' }));
      return;
    }
    let body = '';
    try {
      for await (const chunk of req) body += chunk;
    } catch (err) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: `read body failed: ${(err as Error).message}` }));
      return;
    }
    let payload: unknown;
    try {
      payload = body ? JSON.parse(body) : {};
    } catch (err) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: `invalid json: ${(err as Error).message}` }));
      return;
    }

    if (patchMatch) {
      const slug = patchMatch[1];
      const result = writeApplicationFile(tasksDir, slug, payload as ApplicationPatch);
      if (!result.ok) {
        res.statusCode = result.status;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: result.error }));
        return;
      }
      // Invalidate the virtual module so the next request reads the new state.
      if (isDevServer(server)) {
        const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
      }
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(result.value));
      return;
    }

    // Create flow: POST /__vault/applications
    const result = createApplicationFile(tasksDir, payload as NewApplicationInput);
    if (!result.ok) {
      res.statusCode = result.status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: result.error }));
      return;
    }
    if (isDevServer(server)) {
      const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
      if (mod) server.moduleGraph.invalidateModule(mod);
    }
    res.statusCode = 201;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(result.value));
  };
}
