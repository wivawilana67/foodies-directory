import { useEffect, useRef, useState } from 'react';
import { api } from './api';

// Google Sign-In (D43, D54): Google Identity Services gives an ID token, POST /api/auth/google swaps it for the
// app token. In the Vite dev server only (import.meta.env.DEV, never in a build) a token from
// `manage.py dev_token` can be pasted instead, since local Docker has no Google client ID.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

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

export function SignIn({ message, onToken }: { message: string; onToken: (token: string) => void }) {
  const [status, setStatus] = useState(message);
  const [devToken, setDevToken] = useState('');
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!CLIENT_ID || !buttonRef.current) return;
    const parent = buttonRef.current;
    loadGoogleScript()
      .then(() => {
        window.google!.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: ({ credential }) => {
            setStatus('Signing in…');
            api<{ token: string }>('/api/auth/google', 'POST', { credential })
              .then((r) => onToken(r.token))
              .catch((e: Error) => setStatus(e.message));
          },
        });
        window.google!.accounts.id.renderButton(parent, { theme: 'outline', size: 'large', text: 'signin_with' });
      })
      .catch((e: Error) => setStatus(e.message));
  }, [onToken]);

  return (
    <section className="signin">
      <h2>Foodies Directory</h2>
      <p>Sign in with your Google account to see your places.</p>
      {CLIENT_ID ? <div ref={buttonRef} className="google-button" /> : <p className="muted">Sign-in is not configured in this build.</p>}
      {import.meta.env.DEV && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (devToken.trim()) onToken(devToken.trim());
          }}
        >
          <label>
            <span>Local dev token (from <code>manage.py dev_token</code>)</span>
            <input type="password" autoComplete="off" value={devToken} onChange={(e) => setDevToken(e.target.value)} />
          </label>
          <button type="submit" className="button">Use dev token</button>
        </form>
      )}
      <p className="muted" role="status">{status}</p>
    </section>
  );
}
