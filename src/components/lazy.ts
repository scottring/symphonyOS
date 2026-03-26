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
export const ContactsList = lazy(() =>
  import('./contact/ContactsList').then(m => ({ default: m.ContactsList }))
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
export const GoalPlanningChat = lazy(() =>
  import('./goals/GoalPlanningChat').then(m => ({ default: m.GoalPlanningChat }))
)

// Settings
export const SettingsPage = lazy(() =>
  import('./settings/SettingsPage').then(m => ({ default: m.SettingsPage }))
)

export const FocusMode = lazy(() =>
  import('./focus/FocusMode').then(m => ({ default: m.FocusMode }))
)
export const PlanningSession = lazy(() =>
  import('./planning/PlanningSession').then(m => ({ default: m.PlanningSession }))
)

// Detail panel (only renders when an item is selected)
export const DetailPanelRedesign = lazy(() =>
  import('./detail/DetailPanelRedesign').then(m => ({ default: m.DetailPanelRedesign }))
)

// Lists views
export const ListsList = lazy(() =>
  import('./list/ListsList').then(m => ({ default: m.ListsList }))
)
export const ListView = lazy(() =>
  import('./list/ListView').then(m => ({ default: m.ListView }))
)

// Notes page
export const NotesPage = lazy(() =>
  import('./notes/NotesPage').then(m => ({ default: m.NotesPage }))
)

// History
export const CompletedTasksView = lazy(() =>
  import('./history/CompletedTasksView').then(m => ({ default: m.CompletedTasksView }))
)

// Meeting notes
export const MeetingNotesView = lazy(() =>
  import('./meeting/MeetingNotesView').then(m => ({ default: m.MeetingNotesView }))
)
