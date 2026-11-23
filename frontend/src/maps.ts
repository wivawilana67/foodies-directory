// Google Maps JavaScript API for the collection map (D50, D62), loaded with Google's documented script URL
// (no npm package) only when a map is first shown. The browser key and Map ID are public by design: the key is
// restricted to this site's addresses and to the Maps JavaScript API in Google Cloud, never committed, and comes
// from the GitHub environment variables MAPS_KEY / MAP_ID at build time. Plain pins (Advanced Markers need the Map ID).

const KEY = import.meta.env.VITE_MAPS_KEY ?? '';
export const MAP_ID = import.meta.env.VITE_MAP_ID ?? '';
export const mapsConfigured = Boolean(KEY && MAP_ID);

let loading: Promise<void> | null = null;

export function loadMaps(): Promise<void> {
  loading ??= new Promise<void>((resolve, reject) => {
    const callback = '__foodiesMapsReady';
    (window as unknown as Record<string, () => void>)[callback] = resolve;
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key: KEY, v: 'weekly', loading: 'async', libraries: 'marker', callback })}`;
    script.async = true;
    script.onerror = () => {
      loading = null; // allow another try, e.g. after coming back online
      script.remove();
      reject(new Error('Could not load Google Maps. Check your connection.'));
    };
    document.head.append(script);
  });
  return loading;
}
