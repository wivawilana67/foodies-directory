import { useState } from 'react';
import { ApiError, api } from './api';
import { CollectionMap } from './CollectionMap';
import { averageRank, placeText, text, unique } from './format';
import { PlaceCard } from './PlaceList';
import { copyText, toast } from './Toast';
import type { Collection, Data } from './types';

// Collections (D49, D62): named lists of places, e.g. for a trip. The Collections tab lists them; a collection
// shows its places as cards or on a map, filtered by Type chips. Places are added from Select in All / Wishlist,
// from a place's detail, or with "+ Add places" here. Name and note edits carry `version` (409 when stale).

type Reply = { collection: Collection };
const count = (n: number) => `${n} place${n === 1 ? '' : 's'}`;
const placesOf = (c: Collection, data: Data) => data.places.filter((p) => c.placeIds.includes(p.id));

function Back() {
  return <button type="button" className="link" onClick={() => history.back()}>← Back</button>;
}

// One name box that creates a collection; used by the tab and by "Add to collection".
function NewCollection({ label, onCreated }: { label: string; onCreated: (c: Collection) => Promise<void> | void }) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setStatus('Give the collection a name');
    setBusy(true);
    try {
      const { collection } = await api<Reply>('/api/collections', 'POST', { name: name.trim(), note: '' });
      setName('');
      setStatus('');
      await onCreated(collection);
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={create} className="fields">
      <div className="row">
        <input maxLength={100} placeholder="New collection, e.g. Bandung trip" aria-label="New collection name" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="button primary" disabled={busy}>{label}</button>
      </div>
      <p className="muted" role="status">{status}</p>
    </form>
  );
}

// The Collections tab: newest first.
export function CollectionList({ data, onOpen, onSaved }: { data: Data; onOpen: (id: string) => void; onSaved: (c: Collection) => void }) {
  const list = [...data.collections].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <section>
      <NewCollection label="Create" onCreated={(c) => { onSaved(c); onOpen(c.id); }} />
      {list.length ? (
        <ul className="cards">
          {list.map((c) => (
            <li key={c.id} className="card">
              <button type="button" className="card-main" onClick={() => onOpen(c.id)}>
                <h3>{c.name}</h3>
                <p className="meta">{count(c.placeIds.length)}</p>
                {text(c.note) && <p className="meta">{c.note}</p>}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No collections yet. Create one for a trip or a craving, then add places to it.</p>
      )}
    </section>
  );
}

type ViewProps = {
  collection: Collection; data: Data; onOpen: (placeId: string) => void; onEdit: () => void; onAddPlaces: () => void;
  onSaved: (c: Collection) => void; onDeleted: (id: string) => void;
};

export function CollectionView({ collection, data, onOpen, onEdit, onAddPlaces, onSaved, onDeleted }: ViewProps) {
  const [mode, setMode] = useState<'list' | 'map'>('list');
  const [type, setType] = useState('');
  const [confirm, setConfirm] = useState(''); // 'delete', or the id of a place waiting for its second tap
  const [status, setStatus] = useState('');
  const places = placesOf(collection, data);
  const types = unique(places.map((p) => p.type));
  const rank = (p: (typeof places)[number]) => averageRank(p, data.options.rating);
  const shown = places
    .filter((p) => !types.includes(type) || text(p.type) === type)
    .sort((a, b) => rank(b) - rank(a) || text(a.name).localeCompare(text(b.name)));

  async function run(call: () => Promise<void>) {
    setStatus('Saving…');
    try {
      await call();
      setStatus('');
    } catch (e) {
      setStatus((e as Error).message);
    }
    setConfirm('');
  }

  // Second tap removes; the place itself stays in the directory.
  function remove(placeId: string) {
    if (confirm !== placeId) return setConfirm(placeId);
    run(async () => onSaved((await api<Reply>(`/api/collections/${collection.id}/places/${placeId}`, 'DELETE')).collection));
  }

  function deleteCollection() {
    if (confirm !== 'delete') return setConfirm('delete');
    run(async () => {
      await api(`/api/collections/${collection.id}`, 'DELETE');
      onDeleted(collection.id);
      history.back();
    });
  }

  function copyList() {
    if (!shown.length) return toast('Nothing to copy');
    copyText([collection.name, ...shown.map(placeText)].join('\n\n'), `Copied ${count(shown.length)}`);
  }

  return (
    <section>
      <Back />
      <h2>{collection.name}</h2>
      {text(collection.note) && <p className="review">{collection.note}</p>}
      <div className="row actions">
        <button type="button" className="button primary" onClick={onAddPlaces}>+ Add places</button>
        <button type="button" className="button" onClick={copyList}>Copy list</button>
        <button type="button" className="button" onClick={onEdit}>Edit</button>
        <button type="button" className="button" onClick={deleteCollection}>{confirm === 'delete' ? 'Tap again to delete' : 'Delete'}</button>
      </div>
      <p className="muted" role="status">{status}</p>
      <div className="fields">
        <div className="chips" aria-label="View">
          <button type="button" className="chip" aria-pressed={mode === 'list'} onClick={() => setMode('list')}>List</button>
          <button type="button" className="chip" aria-pressed={mode === 'map'} onClick={() => setMode('map')}>Map</button>
          <span className="count muted">{count(shown.length)}</span>
        </div>
        {types.length > 1 && (
          <div className="chips scroll" aria-label="Type">
            {types.map((t) => (
              <button key={t} type="button" className="chip" aria-pressed={type === t} onClick={() => setType(type === t ? '' : t)}>{t}</button>
            ))}
          </div>
        )}
        {mode === 'map' ? (
          <CollectionMap places={shown} data={data} onOpen={onOpen} />
        ) : shown.length ? (
          <ul className="cards">
            {shown.map((p) => (
              <PlaceCard key={p.id} place={p} data={data} onOpen={onOpen}
                action={<button type="button" className="button" onClick={() => remove(p.id)}>{confirm === p.id ? 'Remove?' : 'Remove'}</button>} />
            ))}
          </ul>
        ) : (
          <p className="muted">No places yet. Tap + Add places, or use Select in All or Wishlist.</p>
        )}
      </div>
    </section>
  );
}

type FormProps = { collection: Collection; onSaved: (c: Collection) => void; onRefresh: () => Promise<void> };

// Name and note; keyed by version in App.tsx, so "Load latest" restarts it with the other phone's values.
export function CollectionForm({ collection, onSaved, onRefresh }: FormProps) {
  const [name, setName] = useState(collection.name);
  const [note, setNote] = useState(collection.note);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setStatus('Collection name is required');
    setBusy(true);
    setStatus('Saving…');
    try {
      const body = { version: collection.version, name: name.trim(), note: note.trim() };
      onSaved((await api<Reply>(`/api/collections/${collection.id}`, 'PATCH', body)).collection);
      history.back();
    } catch (e) {
      setConflict(e instanceof ApiError && e.status === 409);
      setStatus((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <section>
      <Back />
      <h2>Edit {collection.name}</h2>
      <form onSubmit={save}>
        <label>Name <input maxLength={100} required value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Note <textarea rows={3} maxLength={1000} placeholder="Dates, who is coming, what to try" value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <p className="muted" role="status">{status}</p>
        {conflict && <button type="button" className="button" onClick={onRefresh}>Load latest (drops your edits)</button>}
        <button type="submit" className="button primary" disabled={busy}>Save</button>
      </form>
    </section>
  );
}

type AddToProps = { ids: string[]; data: Data; onSaved: (c: Collection) => void };

// Adds the given places to a collection picked here, or to a new one. Places already in it are left alone.
export function AddToCollection({ ids, data, onSaved }: AddToProps) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const list = [...data.collections].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  async function add(c: Collection) {
    setBusy(true);
    setStatus('Adding…');
    try {
      const { collection } = await api<Reply>(`/api/collections/${c.id}/places`, 'POST', { placeIds: ids });
      onSaved(collection);
      toast(`Added to ${collection.name}`);
      history.back();
    } catch (e) {
      setStatus((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <section>
      <Back />
      <h2>Add {count(ids.length)} to a collection</h2>
      <p className="muted" role="status">{status}</p>
      {list.length > 0 && (
        <ul className="cards">
          {list.map((c) => {
            const has = ids.every((id) => c.placeIds.includes(id));
            return (
              <li key={c.id} className="card">
                <button type="button" className="card-main" disabled={busy || has} onClick={() => add(c)}>
                  <h3>{c.name}</h3>
                  <p className="meta">{has ? 'Already in it' : count(c.placeIds.length)}</p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <h3>Or a new collection</h3>
      <NewCollection label="Create and add" onCreated={(c) => { onSaved(c); return add(c); }} />
    </section>
  );
}
