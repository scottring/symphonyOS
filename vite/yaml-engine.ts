// vite/yaml-engine.ts
//
// Shared gray-matter options for parsing/stringifying apply files.
//
// gray-matter ships an internal js-yaml@3 that uses DEFAULT_SCHEMA. That
// schema coerces unquoted ISO date literals (e.g. `applied: 2026-04-15`)
// into JavaScript Date objects on parse, which then round-trip on stringify
// as `2026-04-15T00:00:00.000Z`. That mangles the human-edited vault file
// format. The js-yaml JSON_SCHEMA keeps numbers, booleans, and null as
// scalars but leaves ISO-date-like strings untouched.
//
// We use the top-level js-yaml v4 (whose API renamed safeLoad/safeDump to
// load/dump) for both parse and stringify so gray-matter never sees a Date.
import yaml from 'js-yaml';
import type matter from 'gray-matter';

type MatterOptions = NonNullable<Parameters<typeof matter>[1]>;

export const matterOptions: MatterOptions = {
  engines: {
    yaml: {
      parse: (s: string) =>
        (yaml.load(s, { schema: yaml.JSON_SCHEMA }) ?? {}) as object,
      stringify: (o: object) =>
        yaml.dump(o, { schema: yaml.JSON_SCHEMA, lineWidth: -1 }),
    },
  },
};
