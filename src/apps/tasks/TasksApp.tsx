// src/apps/tasks/TasksApp.tsx
import { Routes, Route, Navigate } from 'react-router-dom';

// IMPORTANT: this is a placeholder during P4. It will gradually absorb
// Today/Inbox/TaskView from App.tsx in subsequent tasks.

export function TasksApp() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="today" replace />} />
      <Route path="today" element={<div>tasks app: today (P4 in progress)</div>} />
      <Route path="inbox" element={<div>tasks app: inbox (P4 in progress)</div>} />
      <Route path="task/:taskId" element={<div>tasks app: task detail (P4 in progress)</div>} />
    </Routes>
  );
}
