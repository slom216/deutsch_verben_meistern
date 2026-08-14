import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { DashboardPage } from './pages/DashboardPage';

/**
 * Route table, kept separate from the router itself so the application can be
 * mounted under a hash router in the browser and a memory router in tests.
 * There are no loaders or actions, so the plain routing API is all we need.
 */

const PracticePage = lazy(() =>
  import('./pages/PracticePage').then((m) => ({ default: m.PracticePage })),
);
const LibraryPage = lazy(() =>
  import('./pages/LibraryPage').then((m) => ({ default: m.LibraryPage })),
);
const ProgressPage = lazy(() =>
  import('./pages/ProgressPage').then((m) => ({ default: m.ProgressPage })),
);
const AchievementsPage = lazy(() =>
  import('./pages/AchievementsPage').then((m) => ({ default: m.AchievementsPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="practice" element={<PracticePage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="library/:verbId" element={<LibraryPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="achievements" element={<AchievementsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<DashboardPage />} />
      </Route>
    </Routes>
  );
}
