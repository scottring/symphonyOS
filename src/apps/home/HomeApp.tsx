// src/apps/home/HomeApp.tsx
import { Routes, Route, Navigate } from 'react-router-dom'
import { HomeOverview } from './HomeOverview'
import { SpaceView } from './SpaceView'
import { AssetView } from './AssetView'

export function HomeApp() {
  return (
    <Routes>
      <Route index element={<HomeOverview />} />
      <Route path="space/:id" element={<SpaceView />} />
      <Route path="asset/:id" element={<AssetView />} />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  )
}
