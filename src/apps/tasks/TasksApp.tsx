// src/apps/tasks/TasksApp.tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { ListsProvider } from '@/contexts/ListsContext';
import { NotesProvider } from '@/contexts/NotesContext';
import { GoalsProvider } from '@/contexts/GoalsContext';
import { HomeViewContainer } from './HomeViewContainer';

// IMPORTANT: this is the parallel /tasks-new path during P4. It mirrors what
// App.tsx renders for /today, /inbox, /task/:id but uses the new Shell+app
// machinery (selection-driven detail panel via URL ?detail=task:<id>).
//
// The legacy paths /, /today, /inbox keep working until the cutover in P4.8.
// Those paths still render <App />; nothing in this file affects them.

export function TasksApp() {
  return (
    <GoalsProvider>
      <ListsProvider>
        <NotesProvider>
          <Routes>
            <Route path="/" element={<Navigate to="today" replace />} />
            <Route path="today" element={<HomeViewContainer />} />
            <Route path="inbox" element={<div>tasks app: inbox (P4 in progress)</div>} />
            <Route path="task/:taskId" element={<div>tasks app: task detail (P4 in progress)</div>} />
          </Routes>
        </NotesProvider>
      </ListsProvider>
    </GoalsProvider>
  );
}
