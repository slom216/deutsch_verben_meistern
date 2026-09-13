import { lazy, useEffect, type ReactNode } from 'react';
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
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

/** Sets the document title for a route, so tabs and history can tell pages apart. */
function Titled({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · Deutsch Verben Meister`;
  }, [title]);
  return children;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Titled title="Home"><DashboardPage /></Titled>} />
        <Route path="practice" element={<Titled title="Practice"><PracticePage /></Titled>} />
        <Route path="library" element={<Titled title="Verbs"><LibraryPage /></Titled>} />
        <Route path="library/:verbId" element={<Titled title="Verbs"><LibraryPage /></Titled>} />
        <Route path="progress" element={<Titled title="Progress"><ProgressPage /></Titled>} />
        <Route path="achievements" element={<Titled title="Badges"><AchievementsPage /></Titled>} />
        <Route path="settings" element={<Titled title="Settings"><SettingsPage /></Titled>} />
        <Route path="*" element={<Titled title="Page not found"><NotFoundPage /></Titled>} />
      </Route>
    </Routes>
  );
}
