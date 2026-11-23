import { useEffect, useState } from 'react';
import { copyText, toast } from './Toast';
import { areaOf, averageRank, coordsOf, distanceKm, formatKm, getPosition, placeText, text, unique } from './format';
import type { Coords } from './format';
import type { Data, Place } from './types';

// The All, Wishlist and Near me tabs (port of web/list.js): one list with shared filters, sorted by score, or by
// distance on Near me. Filter choices stay while switching tabs because this component stays mounted.

export type Tab = 'all' | 'wishlist' | 'near';

const FILTERS = [
  ['type', 'Any type', 'Type'],
  ['genre', 'Any genre', 'Genre'],
  ['category', 'Any category', 'Category'],
  ['city', 'Any city', 'City'],
] as const;
type FilterKey = (typeof FILTERS)[number][0];
const NO_FILTERS: Record<FilterKey, string> = { type: '', genre: '', category: '', city: '' };

const badge = (label: string, cls = '') => <span key={`${cls}:${label}`} className={`badge ${cls}`}>{label}</span>;

function PlaceCard({ place, data, distance, onOpen }: { place: Place; data: Data; distance?: number; onOpen: (id: string) => void }) {
  const scores = data.people
    .map((person) => {
      const score = text(place.ratings[String(person.id)]?.score);
      return score && `${person.name} ${score}`;
    })
    .filter(Boolean)
    .join(' · ');
  return (
    <li className="card">
      <button type="button" className="card-main" onClick={() => onOpen(place.id)}>
        <h3>{place.name}</h3>
        <p className="meta">{[areaOf(place), distance !== undefined && Number.isFinite(distance) ? formatKm(distance) : ''].filter(Boolean).join(' — ')}</p>
        <p className="meta">{[place.type, place.genre, place.category].map(text).filter(Boolean).join(' · ')}</p>
        {scores && <p className="scores">{scores}</p>}
        <p className="badges">
          {place.tried ? badge('Tried') : badge('Wishlist', 'wish')}
          {place.closed && badge('Closed', 'closed')}
          {place.labels.map((l) => badge(l, 'label'))}
        </p>
      </button>
      <button type="button" className="icon-button" title="Copy name, location and link" aria-label={`Copy ${place.name}`} onClick={() => copyText(placeText(place))}>
        ⧉
      </button>
    </li>
  );
}

type Props = { data: Data; tab: Tab; status: string; onRefresh: () => void; onOpen: (id: string) => void };

export function PlaceList({ data, tab, status, onRefresh, onOpen }: Props) {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(NO_FILTERS);
  const [picked, setPicked] = useState<string[]>([]); // label chips turned on; a place must carry all of them
  const [showClosed, setShowClosed] = useState(false);
  const [nearWishlist, setNearWishlist] = useState(false);
  const [here, setHere] = useState<Coords | null>(null);
  const [locStatus, setLocStatus] = useState('');
  const near = tab === 'near';

  async function locate() {
    setLocStatus('Finding your location…');
    try {
      setHere(await getPosition());
      setLocStatus('');
    } catch (e) {
      setLocStatus(`Location unavailable: ${(e as Error).message}`);
    }
  }

  // Opening Near me without a location asks for it once.
  useEffect(() => {
    if (near && !here) locate();
  }, [near]);

  // Filtering and sorting run on every render: cheap even for 1,000+ places.
  const choices = Object.fromEntries(FILTERS.map(([key]) => [key, unique(data.places.map((p) => p[key]))])) as Record<FilterKey, string[]>;
  const labels = unique(data.places.flatMap((p) => p.labels));
  // A chosen filter or label that no place has any more (after a refresh) no longer filters.
  const active = FILTERS.map(([key]) => [key, choices[key].includes(filters[key]) ? filters[key] : ''] as const).filter(([, v]) => v);
  const activeLabels = picked.filter((l) => labels.includes(l));

  const q = search.trim().toLowerCase();
  const wishlistOnly = tab === 'wishlist' || (near && nearWishlist);
  const list = data.places.filter(
    (p) =>
      (showClosed || !p.closed) &&
      (!wishlistOnly || !p.tried) &&
      active.every(([key, v]) => text(p[key]) === v) &&
      activeLabels.every((l) => p.labels.includes(l)) &&
      (!q ||
        [p.name, p.landmark, p.district, p.city, p.country, p.bestDish, p.type, p.genre, p.category, ...p.labels]
          .join(' ')
          .toLowerCase()
          .includes(q)),
  );
  const distance = new Map<Place, number>();
  if (near && here) {
    list.forEach((p) => {
      const c = coordsOf(p);
      distance.set(p, c ? distanceKm(here, c) : Infinity);
    });
    list.sort((a, b) => distance.get(a)! - distance.get(b)!);
  } else {
    const rank = new Map(list.map((p) => [p, averageRank(p, data.options.rating)]));
    list.sort((a, b) => rank.get(b)! - rank.get(a)! || text(a.name).localeCompare(text(b.name)));
  }

  function toggleLabel(label: string) {
    setPicked((now) => (now.includes(label) ? now.filter((l) => l !== label) : [...now, label]));
  }

  function copyList() {
    if (!list.length) return toast('Nothing to copy');
    copyText(list.map(placeText).join('\n\n'), `Copied ${list.length} place${list.length === 1 ? '' : 's'}`);
  }

  return (
    <section>
      <div className="filters">
        <input type="search" placeholder="Search name, city, dish, craving" aria-label="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
        {near && (
          <div className="row">
            <button type="button" className="button" onClick={locate}>Update my location</button>
            <label className="check">
              <input type="checkbox" checked={nearWishlist} onChange={(e) => setNearWishlist(e.target.checked)} /> Wishlist only
            </label>
          </div>
        )}
        <details>
          <summary>Filters{active.length ? ` (${active.length})` : ''}</summary>
          <div className="grid2">
            {FILTERS.map(([key, any, label]) => (
              <select key={key} aria-label={label} value={active.find(([k]) => k === key)?.[1] ?? ''} onChange={(e) => setFilters({ ...filters, [key]: e.target.value })}>
                <option value="">{any}</option>
                {choices[key].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            ))}
          </div>
          <label className="check">
            <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show closed places
          </label>
        </details>
        {labels.length > 0 && (
          <div className="chips scroll" aria-label="Labels">
            {labels.map((l) => (
              <button key={l} type="button" className="chip" aria-pressed={activeLabels.includes(l)} onClick={() => toggleLabel(l)}>{l}</button>
            ))}
          </div>
        )}
        <div className="row">
          <span className="count muted">{list.length} of {data.places.length} places</span>
          <button type="button" className="button" onClick={copyList}>Copy list</button>
          <button type="button" className="button" onClick={onRefresh}>Refresh</button>
        </div>
      </div>
      <p className="muted" role="status">{[status, near ? locStatus : ''].filter(Boolean).join(' ')}</p>
      <ul className="cards">
        {list.map((p) => <PlaceCard key={p.id} place={p} data={data} distance={distance.get(p)} onOpen={onOpen} />)}
      </ul>
    </section>
  );
}
