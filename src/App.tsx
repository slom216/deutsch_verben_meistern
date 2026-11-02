import { Suspense } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './routes';
import { Spinner } from './components/ui';
import { ErrorBoundary } from './components/ErrorBoundary';

/**
 * Path routing, so every verb has its own crawlable URL. The host must serve
 * index.html for unknown paths (Cloudflare Pages does when there is no 404.html).
 */
export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<Spinner />}>
          <AppRoutes />
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
