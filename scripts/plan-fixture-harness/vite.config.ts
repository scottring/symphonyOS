// A no-write fixture harness for the Week, Season and Month pages — the REAL
// components and CSS, with the data hooks swapped for in-memory fakes and
// made-up tasks (mocks/fixtures.ts). Nothing reaches Supabase: every write
// lands in memory and vanishes on reload. For layout and interaction review
// without signing in (docs/planning/2026-10-08-week-walkthrough-fixes.md).
//
//   npx vite --config scripts/plan-fixture-harness/vite.config.ts
//   http://localhost:5233/scripts/plan-fixture-harness/index.html            Week, month beside it
//   …/index.html?ref=0                                                        Week, month hidden
//   …/index.html?page=season | ?page=month                                    Season / Month
//   …/index.html?weekStart=sat | sun | mon                                    the week's first day (default Saturday)
//   …&layout=journal                                                          open in Open journal (Week or Month)
import path from 'path'
import { defineConfig, mergeConfig } from 'vite'
import base from '../../vite.config'

const root = path.resolve(__dirname, '../..')
const mocks = path.resolve(__dirname, 'mocks')
const hooks = ['usePlanningSession', 'useGatedTaskActions', 'useAuth', 'useFamilyMembers', 'useActionableInstances', 'useDayPlan', 'useHouseholdSeasons', 'useDayLoadEvents']

export default mergeConfig(base, defineConfig({
  root,
  server: { port: 5233, strictPort: true },
  resolve: {
    alias: [
      // The fakes re-export the real modules, then override what they fake.
      { find: /^@real\/(.*)$/, replacement: `${root}/src/$1` },
      { find: /^@\/hooks\/useSupabaseTasks$/, replacement: `${mocks}/useSupabaseTasks.ts` },
      // The week start comes from the URL, Saturday by default (cadenceConfig.ts).
      { find: /^@\/lib\/cadence\/config$/, replacement: `${mocks}/cadenceConfig.ts` },
      ...hooks.map((n) => ({ find: new RegExp(`^@/hooks/${n}$`), replacement: `${mocks}/${n}.ts` })),
      { find: /^@\/hooks\/useGuidedPlan$/, replacement: `${mocks}/useGuidedPlan.tsx` },
      { find: /^@\/contexts\/GoalsContext$/, replacement: `${mocks}/GoalsContext.tsx` },
      { find: /^@\/components\/guide\/GuideBar$/, replacement: `${mocks}/GuideBar.tsx` },
      { find: /^\.\/AddArea$/, replacement: `${mocks}/AddArea.tsx` },
      { find: /^\.\/FromPaper$/, replacement: `${mocks}/FromPaper.tsx` },
    ],
  },
}))
