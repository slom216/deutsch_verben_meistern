import { Suspense } from 'react';
import { HashRouter } from 'react-router-dom';
import { AppRoutes } from './routes';
import { Spinner } from './components/ui';

/**
 * Hash routing keeps the app deployable as static files from any path without
 * server rewrite rules.
 */
export function App() {
  return (
    <HashRouter>
      <Suspense fallback={<Spinner />}>
        <AppRoutes />
      </Suspense>
    </HashRouter>
  );
}
