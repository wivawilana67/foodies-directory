import { useEffect, useRef, useState } from 'react';

// Temporary Phase 3 check page (replaced by the real screens in Phase 4): API health, Google Sign-In against
// POST /api/auth/google, and a Places lookup with the app token. See api/CLAUDE.md for the API contract.

type Health = 'checking' | 'ok' | 'down';
type Person = { id: number; name: string };
type Found = { placeId: string; name: string; address: string };

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
const TOKEN_KEY = 'foodies.token';

function loadToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveToken(token: string) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private browsing: the token lasts only for this page load.
  }
}

async function api<T>(path: string, token: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data as T;
}

function loadGoogleScript(): Promise<void> {
  if (window.google) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Google Sign-In'));
    document.head.appendChild(script);
  });
}

export function App() {
  const [health, setHealth] = useState<Health>('checking');
  const [token, setToken] = useState(loadToken);
  const [person, setPerson] = useState<Person | null>(null);
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Found[]>([]);
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((body: { ok?: boolean }) => setHealth(body.ok ? 'ok' : 'down'))
      .catch(() => setHealth('down'));
  }, []);

  useEffect(() => {
    if (!token) return;
    api<{ person: Person }>('/api/auth/me', token)
      .then((r) => setPerson(r.person))
      .catch((e: Error) => {
        setStatus(e.message);
        setToken('');
        saveToken('');
      });
  }, [token]);

  useEffect(() => {
    if (token || !CLIENT_ID || !buttonRef.current) return;
    const parent = buttonRef.current;
    loadGoogleScript()
      .then(() => {
        window.google!.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: ({ credential }) => {
            setStatus('Signing in…');
            api<{ token: string; person: Person }>('/api/auth/google', '', { credential })
              .then((r) => {
                saveToken(r.token);
                setToken(r.token);
                setPerson(r.person);
                setStatus('');
              })
              .catch((e: Error) => setStatus(e.message));
          },
        });
        window.google!.accounts.id.renderButton(parent, { theme: 'outline', size: 'large', text: 'signin_with' });
      })
      .catch((e: Error) => setStatus(e.message));
  }, [token]);

  function signOut() {
    saveToken('');
    setToken('');
    setPerson(null);
    setFound([]);
    window.google?.accounts.id.disableAutoSelect();
  }

  function lookup(event: React.FormEvent) {
    event.preventDefault();
    setStatus('Looking up…');
    api<{ places: Found[] }>('/api/lookup', token, { input: query })
      .then((r) => {
        setFound(r.places);
        setStatus(r.places.length ? '' : 'No results');
      })
      .catch((e: Error) => setStatus(e.message));
  }

  return (
    <main>
      <h1>Foodies Directory</h1>
      <p>API: {health}</p>
      {!CLIENT_ID && <p>Sign-in is not configured in this build.</p>}
      {person ? (
        <>
          <p>
            Signed in as {person.name}. <button onClick={signOut}>Sign out</button>
          </p>
          <form onSubmit={lookup}>
            <label htmlFor="lookup">Look up a place (name or Google Maps link)</label>
            <br />
            <input id="lookup" value={query} onChange={(e) => setQuery(e.target.value)} />
            <button type="submit" disabled={!query.trim()}>
              Look up
            </button>
          </form>
          <ul>
            {found.map((p) => (
              <li key={p.placeId}>
                {p.name} — {p.address}
              </li>
            ))}
          </ul>
        </>
      ) : (
        !token && <div ref={buttonRef} />
      )}
      <p role="status">{status}</p>
    </main>
  );
}
