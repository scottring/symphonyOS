import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {resolve} from 'node:path'
const catalog=JSON.parse(readFileSync(new URL('./coverage.json',import.meta.url)))
const root=resolve(import.meta.dirname,'../..')
const files=[...new Set(catalog.entries.flatMap(e=>e.supportingTestFiles)),'scripts/conversation-bench','src/components/canvas/ConversationStrip.test.tsx','src/components/canvas/ConversationChat.test.tsx','src/components/canvas/ChangeCard.test.tsx','src/shell/ShellLayout.test.tsx','src/components/home/week/WeekViewV2.test.tsx','src/hooks/useSupabaseTasks.test.ts','src/components/layout/QuickCapture.test.tsx','src/lib/voiceOnboarding/transport.test.ts','src/lib/conversationActions.test.ts','src/hooks/useSymphonyAssistant.test.ts','supabase/functions/symphony-agent/proposalEvidence.test.ts','supabase/functions/symphony-agent/experience.test.ts']
mkdirSync(resolve(import.meta.dirname,'reports'),{recursive:true})
const output=resolve(import.meta.dirname,'reports/offline-tests.json')
const result=spawnSync(process.execPath,[resolve(root,'node_modules/vitest/vitest.mjs'),'run',...files,'--reporter=json',`--outputFile=${output}`],{cwd:root,stdio:'inherit'})
const tests=JSON.parse(readFileSync(output,'utf8'))
const rows=catalog.entries.map(e=>({id:e.id,intent:e.intent,supportingTests:e.supportingTestFiles.map(file=>({file,status:tests.testResults.find(r=>r.name===resolve(root,file))?.status??'not-run'})),certification:'supporting checks only; full model journey not implied'}))
writeFileSync(resolve(import.meta.dirname,'reports/offline-coverage.json'),JSON.stringify({at:new Date().toISOString(),tests:tests.numTotalTests,passed:tests.numPassedTests,failed:tests.numFailedTests,catalog:rows},null,2)+'\n')
process.exitCode=result.status??1
