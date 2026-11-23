import { useState } from 'react';
import { ApiError, patchPlace } from './api';
import { httpsUrl, locationOf, mapsHref, placeText, text } from './format';
import { copyText, toast } from './Toast';
import type { Data, Place } from './types';

// Place detail (port of renderPlace in web/place.js, without photos: D57). Tapping a dish opens it in DishForm.

const LIKED = { Yes: '👍', No: '👎', '': '' };

async function sharePlace(p: Place) {
  try {
    await navigator.share({ title: text(p.name), text: placeText(p) });
  } catch (e) {
    if ((e as Error).name !== 'AbortError') toast('Could not open the share menu');
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="detail-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

type Props = {
  place: Place; data: Data; notice?: string; onEdit: () => void; onDish: (dishId?: string) => void;
  onSaved: (p: Place) => void; onRefresh: () => Promise<void>;
};

export function PlaceDetail({ place, data, notice = '', onEdit, onDish, onSaved, onRefresh }: Props) {
  const [status, setStatus] = useState(notice);
  const [busy, setBusy] = useState(false);
  const instagram = httpsUrl(place.instagram);
  const dishes = data.dishes.filter((d) => d.place === place.id);

  async function toggleTried() {
    setBusy(true);
    setStatus('Saving…');
    try {
      onSaved(await patchPlace(place, { tried: !place.tried }));
      setStatus('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        await onRefresh();
        setStatus('This place was changed on the other phone. It now shows the latest version; try again.');
      } else setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <button type="button" className="link" onClick={() => history.back()}>← Back</button>
      <h2>{place.name}</h2>
      <p className="meta">{locationOf(place)}</p>
      <p className="meta">{[place.type, place.genre, place.category].map(text).filter(Boolean).join(' · ')}</p>
      <p className="badges">
        <span className={`badge ${place.tried ? '' : 'wish'}`}>{place.tried ? 'Tried' : 'Wishlist'}</span>
        {place.closed && <span className="badge">Closed</span>}
        {place.labels.map((l) => <span key={l} className="badge label">{l}</span>)}
      </p>
      <div className="row actions">
        <a className="button primary" href={mapsHref(place)} target="_blank" rel="noopener">Maps</a>
        {instagram && <a className="button" href={instagram} target="_blank" rel="noopener">Instagram</a>}
        <button type="button" className="button" onClick={() => copyText(placeText(place))}>Copy</button>
        {typeof navigator.share === 'function' && <button type="button" className="button" onClick={() => sharePlace(place)}>Share</button>}
        <button type="button" className="button" disabled={busy} onClick={toggleTried}>{place.tried ? 'Move to wishlist' : 'Mark as tried'}</button>
        <button type="button" className="button" onClick={onEdit}>Edit</button>
      </div>
      <p className="muted" role="status">{status}</p>
      <Section title="Scores">
        {data.people.map((person) => {
          const rating = place.ratings[String(person.id)];
          return (
            <div key={person.id} className="person">
              <p className="score"><strong>{person.name}</strong> {text(rating?.score) || '—'}</p>
              {text(rating?.review) && <p className="review">{rating!.review}</p>}
            </div>
          );
        })}
      </Section>
      <Section title="Price per person"><p>{text(place.price) || '—'}</p></Section>
      <Section title="Best dish"><p>{text(place.bestDish) || 'Star a dish below to set it.'}</p></Section>
      <Section title="Dishes">
        {dishes.length ? (
          <ul className="dishes">
            {dishes.map((d) => (
              <li key={d.id}>
                <button type="button" className="dish" onClick={() => onDish(d.id)}>
                  <span className="dish-name">{[LIKED[d.liked], d.name, d.best ? '⭐' : ''].filter(Boolean).join(' ')}</span>
                  {text(d.price) && <span className="muted">{d.price}</span>}
                  {text(d.note) && <span className="dish-note muted">{d.note}</span>}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No dishes yet.</p>
        )}
        <button type="button" className="button" onClick={() => onDish()}>+ Add dish</button>
      </Section>
      {text(place.address) && <p className="muted">{place.address}</p>}
    </section>
  );
}
