import { Link } from 'react-router-dom';
import { buttonClasses, Card, EmptyState } from '@/components/ui';

/** Unknown routes: say the link was bad instead of silently showing home. */
export function NotFoundPage() {
  return (
    <Card>
      <h1 className="sr-only">Page not found</h1>
      <EmptyState
        icon="🧭"
        title="Page not found"
        description="This link does not lead anywhere in the app."
        action={
          <Link to="/" className={buttonClasses('primary')}>
            Go home
          </Link>
        }
      />
    </Card>
  );
}
