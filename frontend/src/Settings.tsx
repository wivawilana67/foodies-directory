import { useState } from 'react';
import { api } from './api';

// Settings: who is signed in, sign out here, or everywhere (a second tap confirms; no browser dialogs).
export function Settings({ name, onSignOut }: { name: string; onSignOut: (message: string) => void }) {
  const [confirm, setConfirm] = useState(false);
  const [status, setStatus] = useState('');

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
    </section>
  );
}
