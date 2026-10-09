import {defineConfig} from 'vitest/config'
export default defineConfig({test:{environment:'node',include:['scripts/living-canvas/*.test.ts','scripts/today-study/*.test.ts','scripts/plan-shapes/*.test.ts']}})
