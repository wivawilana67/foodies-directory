// Places API (New). Only two methods are used: SearchText and GetPlace.
// Every field in PLACE_FIELDS can change the billing tier; check Google's pricing page before adding one.

const PLACES_BASE = 'https://places.googleapis.com/v1/';
const PLACE_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'primaryType',
  'primaryTypeDisplayName',
  'addressComponents',
  'googleMapsUri',
];

function getPlace_(placeId) {
  if (!/^[A-Za-z0-9_-]{10,300}$/.test(placeId)) throw new Error('Bad place ID');
  reserveQuota_();
  return toPlace_(placesFetch_('places/' + placeId, 'get', PLACE_FIELDS.join(',')));
}

// near: optional {lat, lng} used as a location bias (not a restriction).
function searchText_(query, near, max) {
  reserveQuota_();
  const payload = { textQuery: query, maxResultCount: max };
  if (near) payload.locationBias = { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 1000 } };
  const mask = PLACE_FIELDS.map((f) => 'places.' + f).join(',');
  return (placesFetch_('places:searchText', 'post', mask, payload).places || []).map(toPlace_);
}

function placesFetch_(path, method, fieldMask, payload) {
  const options = {
    method: method,
    muteHttpExceptions: true,
    headers: { 'X-Goog-Api-Key': getProp_(PROP.apiKey), 'X-Goog-FieldMask': fieldMask },
  };
  if (payload) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }
  const resp = UrlFetchApp.fetch(PLACES_BASE + path, options);
  const code = resp.getResponseCode();
  if (code !== 200) {
    console.error('placesFetch_', path, code, resp.getContentText().slice(0, 500));
    throw new Error('Places API error ' + code);
  }
  return JSON.parse(resp.getContentText());
}

// Unverified: which address component holds the city and the district for Indonesian addresses.
// The phone shows these as editable defaults, so a wrong guess is fixed before saving.
function toPlace_(p) {
  const parts = p.addressComponents || [];
  const part = (type) => (parts.find((c) => (c.types || []).indexOf(type) >= 0) || {}).longText || '';
  return {
    placeId: p.id,
    name: (p.displayName || {}).text || '',
    address: p.formattedAddress || '',
    lat: p.location ? p.location.latitude : '',
    lng: p.location ? p.location.longitude : '',
    country: part('country'),
    city: part('locality') || part('administrative_area_level_2') || part('administrative_area_level_1'),
    district: part('sublocality_level_1') || part('sublocality'),
    googleCategory: (p.primaryTypeDisplayName || {}).text || p.primaryType || '',
    mapsUrl: p.googleMapsUri || '',
  };
}

function cachePlaces_(places) {
  if (!places.length) return;
  const entries = {};
  places.forEach((p) => {
    entries['place:' + p.placeId] = JSON.stringify(p);
  });
  CacheService.getScriptCache().putAll(entries, LOOKUP_CACHE_SECONDS);
}

function getCachedPlace_(placeId) {
  const hit = CacheService.getScriptCache().get('place:' + placeId);
  return hit ? JSON.parse(hit) : null;
}

// Places for a Google Maps link, or null when the link names no place.
function placeFromLink_(url, max) {
  const info = parseMapsLink_(resolveMapsLink_(url));
  if (info.placeId) return [getPlace_(info.placeId)];
  if (info.name) return searchText_(info.name, info.near, max);
  return null;
}

// Phone "Add place": input is a pasted or shared text holding a Maps link, or a typed name.
function lookup_(body) {
  const input = String(body.input || '').trim().slice(0, 1000);
  if (!input) throw new Error('Paste a link or type a name');
  const url = extractUrl_(input);
  let places;
  if (url) {
    if (!isMapsUrl_(url)) throw new Error('Only Google Maps links are supported');
    places = placeFromLink_(url, 5);
    if (!places) throw new Error('Could not read a place from that link');
  } else {
    places = searchText_(input, null, 5);
  }
  cachePlaces_(places);
  return { places };
}
