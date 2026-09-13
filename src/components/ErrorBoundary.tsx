import { Component, type ReactNode } from 'react';
import { Button, Card, EmptyState } from './ui';

/**
 * Last line of defence: a render error shows a way out instead of a blank
 * page. Settings (where "Erase everything" lives) may be the thing that broke,
 * so erasing saved data is offered right here.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-xl p-6">
        <Card>
          <EmptyState
            icon="⚠️"
            title="Something went wrong"
            description="The app hit an unexpected error. Reloading usually fixes it. If it keeps happening, your saved data may be damaged; erasing it starts you fresh."
            action={
              <div className="flex flex-wrap justify-center gap-3">
                <Button variant="primary" onClick={() => window.location.reload()}>
                  Reload
                </Button>
                <Button variant="danger" onClick={eraseAndReload}>
                  Erase saved data and reload
                </Button>
              </div>
            }
          />
        </Card>
      </div>
    );
  }
}

function eraseAndReload() {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith('dvm.'))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    /* storage is blocked, so there is nothing saved to erase */
  }
  window.location.reload();
}
