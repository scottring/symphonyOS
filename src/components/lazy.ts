import { lazy } from 'react'

// Project views - Switch to ProjectsListRedesign to test new layout
export const ProjectsList = lazy(() =>
  import('./project/ProjectsListRedesign').then(m => ({ default: m.ProjectsListRedesign }))
)
export const ProjectView = lazy(() =>
  import('./project/ProjectViewRedesign').then(m => ({ default: m.ProjectViewRedesign }))
)

// Original ProjectsList (for rollback)
export const ProjectsListOriginal = lazy(() =>
  import('./project/ProjectsList').then(m => ({ default: m.ProjectsList }))
)

// Original ProjectView (for rollback)
export const ProjectViewOriginal = lazy(() =>
  import('./project/ProjectView').then(m => ({ default: m.ProjectView }))
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

// Original RoutinesList (for rollback)
export const RoutinesListOriginal = lazy(() =>
  import('./routine/RoutinesList').then(m => ({ default: m.RoutinesList }))
)

// Task view (desktop) - Switch to TaskViewRedesign to test new layout
export const TaskView = lazy(() =>
  import('./task/TaskViewRedesign').then(m => ({ default: m.TaskViewRedesign }))
)

// Original TaskView (for rollback)
export const TaskViewOriginal = lazy(() =>
  import('./task/TaskView').then(m => ({ default: m.TaskView }))
)

// Contact views
export const ContactsList = lazy(() =>
  import('./contact/ContactsList').then(m => ({ default: m.ContactsList }))
)
export const ContactView = lazy(() =>
  import('./contact/ContactViewRedesign').then(m => ({ default: m.ContactViewRedesign }))
)

// Original ContactView (for rollback)
export const ContactViewOriginal = lazy(() =>
  import('./contact/ContactView').then(m => ({ default: m.ContactView }))
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
  import('./onboarding').then(m => ({ default: m.OnboardingWizard }))
)

// Settings
export const SettingsPage = lazy(() =>
  import('./settings/SettingsPage').then(m => ({ default: m.SettingsPage }))
)
