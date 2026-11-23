import { useState } from 'react';
import { api } from './api';
import { text } from './format';
import type { LookupResult } from './types';

// Add tab (port of web/add.js): paste a Google Maps or share.google link, or type a name; one lookup (paid, so
// only on Search); pick a result to open the new-place form. Android can share a link straight in (`shared`).

type Props = { shared: string; onPick: (google: LookupResult) => void; onManual: (name: string) => void };

export function AddPlace({ shared, onPick, onManual }: Props) {
  const [input, setInput] = useState(shared);
  const [results, setResults] = useState<LookupResult[]>([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function lookup(event: React.FormEvent) {
    event.preventDefault();
    if (!input.trim()) return;
    setBusy(true);
    setStatus('Looking up…');
    setResults([]);
    try {
      const { places } = await api<{ places: LookupResult[] }>('/api/lookup', 'POST', { input: input.trim() });
      setResults(places);
      setStatus(places.length ? 'Pick the right place:' : 'No match. Try adding the city to the name.');
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function paste() {
    try {
      setInput(await navigator.clipboard.readText());
    } catch {
      setStatus('Paste is blocked here. Long-press the box and choose Paste.');
    }
  }

  return (
    <section>
      <form onSubmit={lookup}>
        <label>
          Paste a Google Maps link or type a name
          <textarea rows={3} placeholder="https://maps.app.goo.gl/…  or  Bakmi GM Bandung" value={input} onChange={(e) => setInput(e.target.value)} />
        </label>
        <div className="row">
          <button type="button" className="button" onClick={paste}>Paste</button>
          <button type="submit" className="button primary" disabled={busy}>Search</button>
        </div>
      </form>
      <p className="muted" role="status">{status}</p>
      <ul className="cards">
        {results.map((r) => (
          <li key={r.placeId} className="card">
            <div className="card-main">
              <h3>{r.name}</h3>
              <p className="meta">{[r.googleCategory, r.address].map(text).filter(Boolean).join(' — ')}</p>
            </div>
            <button type="button" className="button primary" onClick={() => onPick(r)}>Pick</button>
          </li>
        ))}
      </ul>
      <button type="button" className="link" onClick={() => onManual(/^https?:\/\//.test(input.trim()) ? '' : input.trim())}>
        Not on Google Maps? Add it by name
      </button>
    </section>
  );
}
