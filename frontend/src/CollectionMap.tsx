import { useEffect, useRef, useState } from 'react';
import { coordsOf } from './format';
import { MAP_ID, loadMaps, mapsConfigured } from './maps';
import { PlaceCard } from './PlaceList';
import type { Data, Place } from './types';

// The Map view of a collection (D50, D62): plain pins for places with coordinates; tapping a pin shows the place's
// card under the map. Each time this view opens counts as one map load (Google's Dynamic Maps SKU).

type Props = { places: Place[]; data: Data; onOpen: (id: string) => void };

export function CollectionMap({ places, data, onOpen }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState(mapsConfigured ? 'Loading the map…' : 'The map is not set up in this build yet.');
  const [selected, setSelected] = useState<Place | null>(null);
  const located = places.filter((p) => coordsOf(p));
  const ids = located.map((p) => p.id).join();

  useEffect(() => {
    if (!mapsConfigured) return;
    let live = true;
    loadMaps()
      .then(() => {
        if (!live || !box.current) return;
        map.current = new google.maps.Map(box.current, {
          mapId: MAP_ID, disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy', clickableIcons: false,
        });
        setReady(true);
        setStatus('');
      })
      .catch((e: Error) => live && setStatus(e.message));
    return () => {
      live = false;
    };
  }, []);

  // Pins follow the collection and the Type chips; the map zooms to show them all.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const bounds = new google.maps.LatLngBounds();
    const pins = located.map((p) => {
      const position = coordsOf(p)!;
      bounds.extend(position);
      const pin = new google.maps.marker.AdvancedMarkerElement({ map: m, position, title: p.name, gmpClickable: true });
      pin.addListener('click', () => setSelected(p));
      return pin;
    });
    if (located.length === 1) {
      m.setCenter(coordsOf(located[0])!);
      m.setZoom(15);
    } else if (located.length) m.fitBounds(bounds, 40);
    else {
      m.setCenter({ lat: -2.5, lng: 118 }); // Indonesia
      m.setZoom(4);
    }
    setSelected(null);
    return () => pins.forEach((pin) => (pin.map = null));
  }, [ready, ids]);

  const missing = places.length - located.length;
  return (
    <div className="fields">
      {mapsConfigured && <div ref={box} className="map" />}
      <p className="muted" role="status">
        {[status, missing ? `${missing} place${missing === 1 ? ' has' : 's have'} no location, so no pin.` : ''].filter(Boolean).join(' ')}
      </p>
      {selected && (
        <ul className="cards">
          <PlaceCard place={selected} data={data} onOpen={onOpen} />
        </ul>
      )}
    </div>
  );
}
