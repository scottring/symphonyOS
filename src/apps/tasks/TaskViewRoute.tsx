// src/apps/tasks/TaskViewRoute.tsx
// Pulls :taskId from the URL and renders TaskViewContainer in full-page mode.
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { TaskViewContainer } from './TaskViewContainer';

export function TaskViewRoute() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  if (!taskId) {
    return <div className="p-8 text-center text-neutral-500">No task id in URL.</div>;
  }
  // Back means where you came from. This used to send everyone to a legacy
  // /tasks-new/today route: a step opened from /season returned to Today
  // (Scott, 2026-09-20). A deep link with no in-app history goes to Today.
  const onBack = () => { if (location.key !== 'default') navigate(-1); else navigate('/today') };
  return <TaskViewContainer taskId={taskId} onBack={onBack} />;
}
