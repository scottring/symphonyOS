import { lazy } from 'react'

// Project views
export const ProjectsList = lazy(() =>
  import('./project/ProjectsList').then(m => ({ default: m.ProjectsList }))
)
export const ProjectView = lazy(() =>
  import('./project/ProjectViewRedesign').then(m => ({ default: m.ProjectViewRedesign }))
)

// Original ProjectView (for rollback)
export const ProjectViewOriginal = lazy(() =>
  import('./project/ProjectView').then(m => ({ default: m.ProjectView }))
)

// Routine views
export const RoutinesList = lazy(() =>
  import('./routine/RoutinesList').then(m => ({ default: m.RoutinesList }))
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

// Original TaskView (for rollback)
export const TaskViewOriginal = lazy(() =>
  import('./task/TaskView').then(m => ({ default: m.TaskView }))
)

// Contact view (desktop)
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
