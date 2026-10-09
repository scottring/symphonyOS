import {defineConfig} from 'vitest/config'
export default defineConfig({test:{environment:'node',include:['scripts/living-canvas/model.test.ts']}})
