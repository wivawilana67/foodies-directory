import { useState } from 'react';
import { ApiError, patchPlace } from './api';
import { text, unique } from './format';
import type { Data, Place, Rating } from './types';

// Edit form (port of openForm / formFields in web/place.js). Sends only changed fields and ratings with the
// version it opened (D24); a 409 offers to load the latest version. The API checks every value again (clean.py).

const NEW = '__new__';
type Kind = 'text' | 'url' | 'choice' | 'suggest' | 'check';
type Values = Pick<Place, 'name' | 'country' | 'city' | 'district' | 'landmark' | 'type' | 'genre' | 'category' | 'price' | 'instagram' | 'mapsLink' | 'tried' | 'closed'>;
type Field = [keyof Values, string, Kind];

// Scores and labels sit between these two groups, as in the live form.
const TOP: Field[] = [
  ['name', 'Name', 'text'],
  ['country', 'Country', 'suggest'],
  ['city', 'City', 'suggest'],
  ['district', 'District / area', 'suggest'],
  ['landmark', 'Street / landmark', 'text'],
  ['type', 'Type', 'choice'],
  ['genre', 'Genre', 'choice'],
  ['category', 'Category', 'choice'],
];
const BOTTOM: Field[] = [
  ['price', 'Price per person', 'text'],
  ['instagram', 'Instagram (link or @name)', 'url'],
  ['mapsLink', 'Google Maps link', 'url'],
  ['closed', 'Closed for good', 'check'],
];
const KEYS = [...TOP, ['tried'] as const, ...BOTTOM].map(([key]) => key);

// A Master list as a select; "+ Add new…" shows a text box. A value missing from the list is still offered.
function ChoiceField({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  const [adding, setAdding] = useState(false);
  const list = value && !options.includes(value) && !adding ? [...options, value] : options;
  return (
    <label className="field">
      {label}
      <select value={adding ? NEW : value} onChange={(e) => { setAdding(e.target.value === NEW); onChange(e.target.value === NEW ? '' : e.target.value); }}>
        <option value="">—</option>
        {list.map((v) => <option key={v} value={v}>{v}</option>)}
        <option value={NEW}>+ Add new…</option>
      </select>
      {adding && <input maxLength={100} placeholder="New value" autoFocus value={value} onChange={(e) => onChange(e.target.value)} />}
    </label>
  );
}

const hasLabel = (labels: string[], l: string) => labels.some((c) => c.toLowerCase() === l.toLowerCase());

// A label still typed in the box when saving counts too.
function withDraft(labels: string[], draft: string) {
  const v = draft.replace(/,/g, ' ').trim();
  return v && !hasLabel(labels, v) ? [...labels, v] : labels;
}

// Chosen labels as removable chips, a box for a new one, and tap-to-add chips for labels used on other places.
// A div, not a label: a <label> would forward taps on its text to the first chip.
function LabelsField({ labels, used, draft, onDraft, onChange }: { labels: string[]; used: string[]; draft: string; onDraft: (v: string) => void; onChange: (l: string[]) => void }) {
  const add = () => {
    onChange(withDraft(labels, draft));
    onDraft('');
  };
  return (
    <div className="field">
      Labels
      <div className="chips">
        {labels.map((l) => <button key={l} type="button" className="chip on" onClick={() => onChange(labels.filter((x) => x !== l))}>{l} ×</button>)}
      </div>
      <div className="row">
        <input maxLength={40} placeholder="New label, e.g. Date night" value={draft} onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }} />
        <button type="button" className="button" onClick={add}>Add</button>
      </div>
      <div className="chips">
        {used.filter((l) => !hasLabel(labels, l)).map((l) => <button key={l} type="button" className="chip" onClick={() => onChange([...labels, l])}>+ {l}</button>)}
      </div>
    </div>
  );
}

type Props = { place: Place; data: Data; onSaved: (p: Place) => void; onRefresh: () => Promise<void> };

export function PlaceForm({ place, data, onSaved, onRefresh }: Props) {
  const [values, setValues] = useState<Values>(() => Object.fromEntries(KEYS.map((k) => [k, place[k]])) as Values);
  const [labels, setLabels] = useState(place.labels);
  const [draft, setDraft] = useState('');
  const [ratings, setRatings] = useState<Record<string, Rating>>(() =>
    Object.fromEntries(data.people.map((p) => [p.id, place.ratings[String(p.id)] ?? { score: '', review: '' }])));
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const set = (key: keyof Values, value: string | boolean) => setValues({ ...values, [key]: value });
  const setRating = (id: number, field: keyof Rating, value: string) => setRatings({ ...ratings, [id]: { ...ratings[id], [field]: value } });

  function field([key, label, kind]: Field) {
    const value = values[key];
    if (kind === 'check') {
      return (
        <label key={key} className="check">
          <input type="checkbox" checked={value as boolean} onChange={(e) => set(key, e.target.checked)} /> {label}
        </label>
      );
    }
    if (kind === 'choice') {
      return <ChoiceField key={key} label={label} options={data.options[key as 'type' | 'genre' | 'category']} value={value as string} onChange={(v) => set(key, v)} />;
    }
    // url fields stay type="text" so "@name" is accepted; inputMode still brings up the URL keyboard.
    return (
      <label key={key} className="field">
        {label}
        <input type="text" maxLength={200} value={value as string} onChange={(e) => set(key, e.target.value)}
          {...(kind === 'url' ? { inputMode: 'url', autoCapitalize: 'off' } : {})}
          {...(kind === 'suggest' ? { list: `suggest-${key}`, autoComplete: 'off' } : {})} />
        {kind === 'suggest' && (
          <datalist id={`suggest-${key}`}>
            {unique(data.places.map((p) => p[key])).map((v) => <option key={v} value={v} />)}
          </datalist>
        )}
      </label>
    );
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const finalLabels = withDraft(labels, draft);
    const changes: Record<string, unknown> = {};
    for (const key of KEYS) {
      const value = values[key];
      if (typeof value === 'boolean' ? value !== place[key] : text(value) !== text(place[key])) changes[key] = typeof value === 'boolean' ? value : text(value);
    }
    if (finalLabels.join('\n') !== place.labels.join('\n')) changes.labels = finalLabels;
    const ratingChanges: Record<string, Partial<Rating>> = {};
    for (const person of data.people) {
      const before = place.ratings[String(person.id)];
      const entry: Partial<Rating> = {};
      for (const f of ['score', 'review'] as const) {
        if (text(ratings[person.id][f]) !== text(before?.[f])) entry[f] = text(ratings[person.id][f]);
      }
      if (Object.keys(entry).length) ratingChanges[person.id] = entry;
    }
    if (!text(values.name)) return setStatus('Name is required');
    if (!Object.keys(changes).length && !Object.keys(ratingChanges).length) return history.back();
    setBusy(true);
    setStatus('Saving…');
    try {
      onSaved(await patchPlace(place, changes, ratingChanges));
      history.back();
    } catch (e) {
      setConflict(e instanceof ApiError && e.status === 409);
      setStatus((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <section>
      <button type="button" className="link" onClick={() => history.back()}>← Back</button>
      <h2>Edit {place.name}</h2>
      <form onSubmit={save}>
        <div className="fields">
          {TOP.map(field)}
          <LabelsField labels={labels} used={unique(data.places.flatMap((p) => p.labels))} draft={draft} onDraft={setDraft} onChange={setLabels} />
          {field(['tried', 'We have tried it', 'check'])}
          {data.people.map((person) => (
            <div key={person.id} className="fields">
              <label className="field">
                {person.name}'s score
                <select value={ratings[person.id].score} onChange={(e) => setRating(person.id, 'score', e.target.value)}>
                  <option value="">—</option>
                  {[...new Set([...data.options.rating, ratings[person.id].score].filter(Boolean))].map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
              <label className="field">
                {person.name}'s review
                <textarea rows={3} maxLength={1000} value={ratings[person.id].review} onChange={(e) => setRating(person.id, 'review', e.target.value)} />
              </label>
            </div>
          ))}
          {BOTTOM.map(field)}
        </div>
        <p className="muted" role="status">{status}</p>
        {conflict && <button type="button" className="button" onClick={onRefresh}>Load latest (drops your edits)</button>}
        <button type="submit" className="button primary" disabled={busy}>Save</button>
      </form>
    </section>
  );
}
