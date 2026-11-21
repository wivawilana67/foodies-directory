import { useEffect, useState } from 'react';

type Health = 'checking' | 'ok' | 'down';

// Phase 1 placeholder: proves the page reaches the API (and the API its database) in each environment.
export function App() {
  const [health, setHealth] = useState<Health>('checking');

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((body: { ok?: boolean }) => setHealth(body.ok ? 'ok' : 'down'))
      .catch(() => setHealth('down'));
  }, []);

  return (
    <main>
      <h1>Foodies Directory</h1>
      <p role="status">API: {health}</p>
    </main>
  );
}
