// src/apps/tasks/TaskViewRoute.tsx
// Pulls :taskId from the URL and renders TaskViewContainer in full-page mode.
import { useNavigate, useParams } from 'react-router-dom';
import { TaskViewContainer } from './TaskViewContainer';

export function TaskViewRoute() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  if (!taskId) {
    return <div className="p-8 text-center text-neutral-500">No task id in URL.</div>;
  }
  return <TaskViewContainer taskId={taskId} onBack={() => navigate('/tasks-new/today')} />;
}
