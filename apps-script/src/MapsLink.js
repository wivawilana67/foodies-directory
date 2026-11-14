// Google Maps links: find, resolve short links, and read the place ID / name / pin from a long URL.
// The URL patterns below come from observed links, not from a Google spec; test with real links.

function extractUrl_(text) {
  const m = String(text).match(/https?:\/\/[^\s<>"']+/);
  return m ? m[0] : '';
}

function isMapsUrl_(url) {
  const m = String(url).match(/^https?:\/\/([^/?#:]+)(\/[^?#]*)?/i);
  if (!m) return false;
  const host = m[1].toLowerCase();
  const path = m[2] || '/';
  return host === 'maps.app.goo.gl'
    || (host === 'goo.gl' && path.indexOf('/maps') === 0)
    || /^maps\.google\.[a-z.]+$/.test(host)
    || (/^(www\.)?google\.[a-z.]+$/.test(host) && path.indexOf('/maps') === 0);
}

// Follows short-link redirects one hop at a time (reading the Location header) and only ever fetches Maps hosts.
function resolveMapsLink_(url) {
  for (let hop = 0; hop < 5; hop++) {
    const consent = url.match(/^https:\/\/consent\.google\.[a-z.]+\/.*[?&]continue=([^&]+)/i);
    if (consent) url = safeDecode_(consent[1]);
    if (!isMapsUrl_(url)) throw new Error('Link did not lead to Google Maps');
    if (!/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl)\//i.test(url)) return url;
    const resp = UrlFetchApp.fetch(url, { followRedirects: false, muteHttpExceptions: true });
    const headers = resp.getAllHeaders();
    const next = headers.Location || headers.location;
    if (!next) throw new Error('Short link did not redirect (HTTP ' + resp.getResponseCode() + ')');
    url = String(next);
  }
  throw new Error('Too many redirects');
}

// Returns {placeId, name, near}; any part may be empty.
function parseMapsLink_(url) {
  const text = safeDecode_(url);
  const id = text.match(/(?:query_place_id=|place_id[:=]|!19s)(ChIJ[\w-]+)/);
  const path = url.match(/\/maps\/place\/([^/@?]+)/);
  const q = url.match(/[?&](?:q|query)=([^&#]+)/);
  const qText = q ? decodePlus_(q[1]) : '';
  const qIsCoords = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(qText);
  const pin = text.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
    || text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
    || (qIsCoords && qText.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/));
  return {
    placeId: id ? id[1] : '',
    name: path ? decodePlus_(path[1]) : (qIsCoords ? '' : qText),
    near: pin ? { lat: Number(pin[1]), lng: Number(pin[2]) } : null,
  };
}

function decodePlus_(s) {
  return safeDecode_(String(s).replace(/\+/g, ' ')).trim();
}

function safeDecode_(s) {
  try {
    return decodeURIComponent(s);
  } catch (err) {
    return s;
  }
}
