"""Google Maps and share.google links: find a link in pasted text, follow short links and share links one hop at a
time, and read the place ID / name / pin from a long Maps URL. Ported from apps-script/src/MapsLink.js.

The URL patterns come from observed links, not a Google spec (Unverified; test with real links). Only Google Maps,
share.google and Google Search/consent hosts are ever fetched, checked before every hop, so a pasted link cannot make
the server fetch other sites."""
import re
from urllib.parse import unquote, urlsplit

import requests

from foodies.auth import ApiError

FETCH_TIMEOUT = 10
MAX_HOPS = 5
CONSENT = re.compile(r'^https://consent\.google\.[a-z.]+/.*[?&]continue=([^&]+)', re.IGNORECASE)


def extract_url(text):
    m = re.search(r'https?://[^\s<>"\']+', str(text))
    return m.group(0) if m else ''


def _host_path(url):
    try:
        parts = urlsplit(str(url))
    except ValueError:
        return '', '', ''
    return parts.scheme, (parts.hostname or '').lower(), parts.path or '/'


def is_maps_url(url):
    scheme, host, path = _host_path(url)
    if scheme not in ('http', 'https'):
        return False
    return (host == 'maps.app.goo.gl'
            or (host == 'goo.gl' and path.startswith('/maps'))
            or bool(re.fullmatch(r'maps\.google\.[a-z.]+', host))
            or (bool(re.fullmatch(r'(www\.)?google\.[a-z.]+', host)) and path.startswith('/maps')))


def is_share_url(url):
    return _host_path(url)[1] == 'share.google'


def _decode(s):
    return unquote(str(s))


def _decode_plus(s):
    return _decode(str(s).replace('+', ' ')).strip()


def _next_hop(url, what):
    """The Location of a redirect, without following it."""
    try:
        response = requests.get(url, allow_redirects=False, timeout=FETCH_TIMEOUT)
    except requests.RequestException as e:
        raise ApiError(f'Could not open the {what}, try again') from e
    location = response.headers.get('Location')
    if not location:
        raise ApiError(f'{what.capitalize()} did not redirect (HTTP {response.status_code})')
    return location


def resolve_maps_link(url):
    """A short Maps link (maps.app.goo.gl, goo.gl/maps) -> the long Maps URL it redirects to."""
    for _ in range(MAX_HOPS):
        consent = CONSENT.match(url)
        if consent:
            url = _decode(consent.group(1))
        if not is_maps_url(url):
            raise ApiError('Link did not lead to Google Maps')
        if not re.match(r'^https?://(maps\.app\.goo\.gl|goo\.gl)/', url, re.IGNORECASE):
            return url
        url = _next_hop(url, 'short link')
    raise ApiError('Too many redirects')


def resolve_share_link(url):
    """share.google links redirect to a Google Search page whose q= is the place name, or to Maps.
    Returns {'maps_url': ...} or {'name': ...}. The hops were seen from a PC on 2026-11-17 (Unverified from a server)."""
    for _ in range(MAX_HOPS):
        consent = CONSENT.match(url)
        if consent:
            url = _decode(consent.group(1))
        if is_maps_url(url):
            return {'maps_url': url}
        if re.match(r'^https://(www\.)?google\.[a-z.]+/search\?', url, re.IGNORECASE):
            q = re.search(r'[?&]q=([^&#]+)', url)
            if q and _decode_plus(q.group(1)):
                return {'name': _decode_plus(q.group(1))}
        if not is_share_url(url) and not re.match(r'^https://(www\.)?google\.[a-z.]+/share\.google([?#]|$)', url,
                                                  re.IGNORECASE):
            break
        url = _next_hop(url, 'share link')
    raise ApiError('Share link did not lead to a place')


def parse_maps_link(url):
    """{'place_id', 'name', 'near'} from a long Maps URL; any part may be empty / None."""
    text = _decode(url)
    place_id = re.search(r'(?:query_place_id=|place_id[:=]|!19s)(ChIJ[\w-]+)', text)
    path = re.search(r'/maps/place/([^/@?]+)', url)
    q = re.search(r'[?&](?:q|query)=([^&#]+)', url)
    q_text = _decode_plus(q.group(1)) if q else ''
    q_is_coords = bool(re.fullmatch(r'-?\d+\.\d+,\s*-?\d+\.\d+', q_text))
    pin = (re.search(r'!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)', text)
           or re.search(r'@(-?\d+\.\d+),(-?\d+\.\d+)', text)
           or (q_is_coords and re.search(r'(-?\d+\.\d+),\s*(-?\d+\.\d+)', q_text)))
    return {
        'place_id': place_id.group(1) if place_id else '',
        'name': _decode_plus(path.group(1)) if path else ('' if q_is_coords else q_text),
        'near': {'lat': float(pin.group(1)), 'lng': float(pin.group(2))} if pin else None,
    }
