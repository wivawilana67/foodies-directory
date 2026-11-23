import { useState } from 'react';
import { api } from './api';
import { THEMES, getTheme, saveTheme } from './theme';

// iPhone Safari has no install prompt: a hint instead, unless already opened from the home screen.
const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const INSTALLED = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

// Settings: who is signed in, theme, sign out here or everywhere (a second tap confirms; no browser dialogs).
export function Settings({ name, onSignOut }: { name: string; onSignOut: (message: string) => void }) {
  const [confirm, setConfirm] = useState(false);
  const [status, setStatus] = useState('');
  const [theme, setTheme] = useState(getTheme);

  async function signOutEverywhere() {
    if (!confirm) return setConfirm(true);
    setStatus('Signing out everywhere…');
    try {
      await api('/api/auth/sign-out-everywhere', 'POST');
      onSignOut('Signed out on every device.');
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  return (
    <section className="fields">
      <button type="button" className="link" onClick={() => history.back()}>← Back</button>
      <h2>Settings</h2>
      <p>Signed in as <strong>{name}</strong>.</p>
      <div className="row">
        <button type="button" className="button" onClick={() => onSignOut('')}>Sign out</button>
        <button type="button" className="button" onClick={signOutEverywhere}>
          {confirm ? 'Tap again to sign out everywhere' : 'Sign out on every device'}
        </button>
      </div>
      <p className="muted" role="status">{status}</p>
      <fieldset className="liked">
        <legend>Theme</legend>
        {THEMES.map((t) => (
          <label key={t}>
            <input type="radio" name="theme" checked={theme === t} onChange={() => { saveTheme(t); setTheme(t); }} /> {t[0].toUpperCase() + t.slice(1)}
          </label>
        ))}
      </fieldset>
      {IOS && !INSTALLED && <p className="muted">Optional: to get a home-screen icon, tap Share, then “Add to Home Screen”.</p>}
    </section>
  );
}
