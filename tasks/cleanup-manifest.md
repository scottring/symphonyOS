# Symphony OS Cleanup Manifest

## Context
Decided on 2026-03-26 to prune ~21,800 lines of dead/unused code. A prior worktree did this successfully (build passed) but was never merged. The Sidebar/MoreSheet pruning commit landed, but everything else remains.

## Phase 1: Delete Files

### Old Component Versions (superseded by Redesign versions, confirmed unused)
- `src/components/detail/DetailPanel.tsx` + `DetailPanel.test.tsx`
- `src/components/task/TaskView.tsx` + `TaskView.test.tsx`
- `src/components/project/ProjectView.tsx` + `ProjectView.test.tsx`
- `src/components/contact/ContactView.tsx` + `ContactView.test.tsx`
- `src/components/project/ProjectsList.tsx` + `ProjectsList.test.tsx`
- `src/components/routine/RoutinesList.tsx` + `RoutinesList.test.tsx`

### Coaching System (entire directories)
- `src/components/layer/` (QuickAssessment, DomainDetail, DeepAssessmentChat, index)
- `src/components/playbook/` (BlockEditor, EveningReflection, PlaybookBlockCard, PlaybookItemRow, QuickReactBar, QuickTagBubbles, WeeklyPlannerGrid, index)
- `src/components/planning-workspace/` (12 files — PlanningWorkspace, WorkspaceList/View, ResourceCard/List/Detail, AddResourceModal, DraftRuleCard/List, WeeklyReviewTab, WeeklyStats, BlockFeedbackCard)
- `src/components/coaching/` (CoachingHub, CoachingTip, index)
- `src/components/review/` (WeeklyReview, WeeklyReview.test)
- `src/components/rules/` (RulesView)

### Coaching in Other Directories
- `src/components/detail/CoachingTipsSection.tsx`
- `src/components/detail/CoachingActionsSection.tsx`
- `src/components/detail/BlockPreviewCard.tsx`
- `src/components/schedule/SundayNudgeBanner.tsx`
- `src/components/settings/ImportPlaybook.tsx`

### Coaching Hooks (12 files)
- `src/hooks/usePlaybook.ts`
- `src/hooks/useDeepAssessment.ts`
- `src/hooks/useDomainAssessments.ts`
- `src/hooks/useEveningReflections.ts`
- `src/hooks/useResearchWorkspaces.ts`
- `src/hooks/useFamilyRules.ts`
- `src/hooks/useWeeklyFeedback.ts`
- `src/hooks/useIntelligenceLayers.ts`
- `src/hooks/useAIPlaybookSuggestions.ts`
- `src/hooks/useCoachingInjection.ts`
- `src/hooks/useResponsibilities.ts`
- `src/hooks/usePlanningResources.ts`

### Coaching Types, Config, Lib
- `src/types/coaching.ts`
- `src/types/playbook.ts`
- `src/types/intelligence-layer.ts`
- `src/types/layer.ts`
- `src/config/layers.ts`
- `src/config/fallback-playbook.ts`
- `src/lib/coachingMatcher.ts` + `coachingMatcher.test.ts`
- `src/lib/coachingInjectionUtils.ts`
- `src/lib/outcomeLanguage.ts`
- `src/lib/depthInference.ts`

### Dead Edge Functions (delete entire directories)
- `supabase/functions/find-charging-stations/`
- `supabase/functions/find-charging-stations-nrel/`
- `supabase/functions/generate-packing-list/`
- `supabase/functions/generate-weekly-playbook/`
- `supabase/functions/suggest-rules-from-research/`
- `supabase/functions/deep-assessment/`
- `supabase/functions/coaching-block-generate/`

## Phase 2: Edit Files (remove coaching references)

### App.tsx (biggest edit)
- Remove coaching imports (lines 71-85 area)
- Remove coaching lazy imports
- Remove coaching hook calls and destructured values (~lines 159-231)
- Remove coaching state (activeLayerSlug, coachingNavStack, coachingSubView, activeDomainSlug, timelineEditingBlock, activeLayerDbId, activeLayerConfig, reviewWeekOf, planningOpen)
- Remove coaching nav helpers (pushCoachingView, popCoachingView)
- Remove 'rules' and 'coaching' from stateView type (already done in Sidebar but check App.tsx type)
- Remove BlockEditor rendering
- Remove entire coaching view rendering block (~lines 2091-2328)
- Remove coaching props passed to TodaySchedule, DetailPanel

### TodaySchedule.tsx
- Remove EveningReflection import + rendering
- Remove SundayNudgeBanner import + rendering (already removed from schedule?)
- Remove onOpenBlockEditor prop and handler
- Remove playbook block rendering logic

### DetailPanelRedesign.tsx
- Remove CoachingTipsSection import + rendering (~line 2479)
- Remove CoachingActionsSection import + rendering (~line 2483-2492)
- Remove coaching-related props (blocks, onAddBlock, onUpdateBlock, onOpenBlockEditor, hideCoaching, coachingMatches)

### Sidebar.tsx
- Already done (pruning commit removed coaching nav)

### MoreSheet.tsx
- Already done (pruning commit)

### ScheduleActionsContext.tsx
- Remove coaching type imports (EveningReflectionData, PlaybookInstance, QuickReact, FamilyRule, DayType)
- Remove coaching fields from context type and provider

### SettingsPage.tsx
- Remove useIntelligenceLayers import + usage
- Remove Layers/Coaching tab rendering
- Remove ImportPlaybook import + usage

### lazy.ts
- Remove coaching lazy imports (PlanningWorkspace, CoachingHub, QuickAssessment, DomainDetail, DeepAssessmentChat, RulesView, BlockEditor, WeeklyPlannerGrid)

### Wall components (minor)
- WallItemDetail.tsx: remove `case 'playbook'` from switch statements
- WallRoadMap.tsx: remove `case 'playbook'` from switch statements

### timeline.ts (types)
- Remove 'playbook' from TimelineItemType if present

## Phase 3: Verify
- Run `npm run build` (must pass clean)
- Run `npm test` (fix any test failures from deleted imports)
- Run the app and verify day view, projects, routines, contacts, settings all work

## Phase 4: After Cleanup
- Simplify App.tsx into focused context providers
- Wire wall system into sidebar navigation
- Then proceed to Open Brain integration (see memory/project_open_brain_integration.md for full plan)
