import { useState } from 'react';
import { api } from './api';
import type { Dish, Place } from './types';

// Add / edit a dish (port of web/dishes.js, without photos: D57). Dish edits are last-write-wins (D25); every reply
// carries the place's new Best Dish, the names of its starred dishes.

export type DishReply = { dish?: Dish; bestDish: string };

const LIKED: [Dish['liked'], string][] = [['Yes', '👍 Yes'], ['No', '👎 No'], ['', 'Not sure']];

type Props = { place: Place; dish?: Dish; onSaved: (reply: DishReply, removed?: string) => void };

export function DishForm({ place, dish, onSaved }: Props) {
  const [values, setValues] = useState({
    name: dish?.name ?? '', price: dish?.price ?? '', note: dish?.note ?? '', liked: dish?.liked ?? '', best: dish?.best ?? false,
  });
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const set = (key: keyof typeof values, value: string | boolean) => setValues({ ...values, [key]: value });

  async function run(call: () => Promise<DishReply>, removed?: string) {
    setBusy(true);
    setStatus(removed ? 'Deleting…' : 'Saving…');
    try {
      onSaved(await call(), removed);
      history.back();
    } catch (e) {
      setStatus((e as Error).message);
      setBusy(false);
    }
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    const body = { ...values, name: values.name.trim(), price: values.price.trim(), note: values.note.trim() };
    if (!body.name) return setStatus('Dish name is required');
    run(() => (dish ? api<DishReply>(`/api/dishes/${dish.id}`, 'PATCH', body) : api<DishReply>('/api/dishes', 'POST', { ...body, place: place.id })));
  }

  // Two taps: the first asks, the second deletes.
  function remove() {
    if (!dish) return;
    if (!confirming) return setConfirming(true);
    run(() => api<DishReply>(`/api/dishes/${dish.id}`, 'DELETE'), dish.id);
  }

  return (
    <section>
      <button type="button" className="link" onClick={() => history.back()}>← Back</button>
      <h2>{dish ? 'Edit dish' : `New dish at ${place.name}`}</h2>
      <form onSubmit={save}>
        <label>Dish <input maxLength={100} required value={values.name} onChange={(e) => set('name', e.target.value)} /></label>
        <label>Price <input maxLength={50} placeholder="45k" value={values.price} onChange={(e) => set('price', e.target.value)} /></label>
        <fieldset className="liked">
          <legend>Liked it?</legend>
          {LIKED.map(([value, label]) => (
            <label key={value}>
              <input type="radio" name="liked" checked={values.liked === value} onChange={() => set('liked', value)} /> {label}
            </label>
          ))}
        </fieldset>
        <label className="check">
          <input type="checkbox" checked={values.best} onChange={(e) => set('best', e.target.checked)} /> ⭐ Best dish here
        </label>
        <label>Note <textarea rows={2} maxLength={300} value={values.note} onChange={(e) => set('note', e.target.value)} /></label>
        <div className="row">
          <button type="submit" className="button primary" disabled={busy}>Save</button>
          {dish && <button type="button" className="button" disabled={busy} onClick={remove}>{confirming ? 'Tap again to delete' : 'Delete'}</button>}
        </div>
      </form>
      <p className="muted" role="status">{status}</p>
    </section>
  );
}
