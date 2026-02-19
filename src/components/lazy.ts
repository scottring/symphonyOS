import { lazy } from 'react'

// Project views - Switch to ProjectsListRedesign to test new layout
export const ProjectsList = lazy(() =>
  import('./project/ProjectsListRedesign').then(m => ({ default: m.ProjectsListRedesign }))
)
export const ProjectView = lazy(() =>
  import('./project/ProjectViewRedesign').then(m => ({ default: m.ProjectViewRedesign }))
)

// Routine views - Switch to RoutinesListRedesign to test new layout
export const RoutinesList = lazy(() =>
  import('./routine/RoutinesListRedesign').then(m => ({ default: m.RoutinesListRedesign }))
)
export const RoutineForm = lazy(() =>
  import('./routine/RoutineForm').then(m => ({ default: m.RoutineForm }))
)
export const RoutineInput = lazy(() =>
  import('./routine/RoutineInput').then(m => ({ default: m.RoutineInput }))
)

// Task view (desktop) - Switch to TaskViewRedesign to test new layout
export const TaskView = lazy(() =>
  import('./task/TaskViewRedesign').then(m => ({ default: m.TaskViewRedesign }))
)

// Contact view (desktop)
export const ContactView = lazy(() =>
  import('./contact/ContactViewRedesign').then(m => ({ default: m.ContactViewRedesign }))
)

// Recipe viewer
export const RecipeViewer = lazy(() =>
  import('./recipe/RecipeViewer').then(m => ({ default: m.RecipeViewer }))
)

// Auth (only for logged-out state)
export const AuthForm = lazy(() =>
  import('./AuthForm').then(m => ({ default: m.AuthForm }))
)

// Calendar connect banner
export const CalendarConnect = lazy(() =>
  import('./CalendarConnect').then(m => ({ default: m.CalendarConnect }))
)

// Onboarding
export const OnboardingWizard = lazy(() =>
  import('./onboarding/OnboardingWizard').then(m => ({ default: m.OnboardingWizard }))
)

// Goals views
export const GoalsList = lazy(() =>
  import('./goals/GoalsList').then(m => ({ default: m.GoalsList }))
)
export const GoalView = lazy(() =>
  import('./goals/GoalView').then(m => ({ default: m.GoalView }))
)

// Settings
export const SettingsPage = lazy(() =>
  import('./settings/SettingsPage').then(m => ({ default: m.SettingsPage }))
)

// Planning Workspace
export const PlanningWorkspace = lazy(() =>
  import('./planning-workspace/PlanningWorkspace').then(m => ({ default: m.PlanningWorkspace }))
)
