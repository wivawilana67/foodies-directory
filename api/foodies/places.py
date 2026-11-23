"""Places API (New): only SearchText and GetPlace, with the same minimal field mask as apps-script/src/Places.js
(D6). Every field in PLACE_FIELDS can change the billing tier; check Google's pricing page before adding one.

Spend is a feature (D7): every request reserves one unit first and is refused past the daily or monthly limit. The
counter lives in PlacesUsage and is reserved in its own short transaction, never while another lock is held."""
import logging
import re
from datetime import timedelta

import requests
from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from foodies.auth import ApiError
from foodies.maps_link import extract_url, is_maps_url, is_share_url, parse_maps_link, resolve_maps_link, \
    resolve_share_link
from foodies.models import LookupCache, PlacesUsage

log = logging.getLogger(__name__)

PLACES_BASE = 'https://places.googleapis.com/v1/'
PLACE_FIELDS = ['id', 'displayName', 'formattedAddress', 'location', 'primaryType', 'primaryTypeDisplayName',
                'addressComponents', 'googleMapsUri']
PLACES_LANGUAGE = 'en'  # names and addresses in English, so cities are spelled one way (D35)
FETCH_TIMEOUT = 15
MAX_RESULTS = 5


def reserve_quota():
    """Counts one Places request against today's and this month's limit, or refuses it."""
    day = timezone.localdate().isoformat()  # Asia/Jakarta, like the Apps Script's script time zone
    with transaction.atomic():
        for period, limit, label in ((day, settings.PLACES_DAILY_LIMIT, 'Daily'),
                                     (day[:7], settings.PLACES_MONTHLY_LIMIT, 'Monthly')):
            usage, _ = PlacesUsage.objects.select_for_update().get_or_create(period=period)
            if usage.count >= limit:
                raise ApiError(f'{label} lookup limit reached ({limit})', 429)
        PlacesUsage.objects.filter(period__in=(day, day[:7])).update(count=F('count') + 1)


def places_fetch(path, method, field_mask, payload=None):
    if not settings.PLACES_API_KEY:
        raise ApiError('Place lookup is not configured on the server', 503)
    headers = {'X-Goog-Api-Key': settings.PLACES_API_KEY, 'X-Goog-FieldMask': field_mask}
    try:
        response = requests.request(method, PLACES_BASE + path, headers=headers, json=payload, timeout=FETCH_TIMEOUT)
    except requests.RequestException as e:
        log.error('places: %s failed: %s', path.split('?')[0], type(e).__name__)
        raise ApiError('Google Places did not answer, try again', 502) from e
    if response.status_code != 200:
        log.error('places: %s returned %s: %s', path.split('?')[0], response.status_code, response.text[:500])
        raise ApiError(f'Places API error {response.status_code}', 502)
    return response.json()


def to_place(p):
    """A Places result -> our shape. Which address component holds city and district for Indonesian addresses is
    Unverified; the phone shows them as editable defaults (D28)."""
    parts = p.get('addressComponents') or []

    def part(kind):
        return next((c.get('longText', '') for c in parts if kind in (c.get('types') or [])), '')

    location = p.get('location') or {}
    return {
        'placeId': p.get('id', ''),
        'name': (p.get('displayName') or {}).get('text', ''),
        'address': p.get('formattedAddress', ''),
        'lat': location.get('latitude'),
        'lng': location.get('longitude'),
        'country': part('country'),
        'city': part('locality') or part('administrative_area_level_2') or part('administrative_area_level_1'),
        'district': part('sublocality_level_1') or part('sublocality'),
        'googleCategory': (p.get('primaryTypeDisplayName') or {}).get('text') or p.get('primaryType', ''),
        'mapsUrl': p.get('googleMapsUri', ''),
    }


def get_place(place_id):
    if not re.fullmatch(r'[A-Za-z0-9_-]{10,300}', place_id or ''):
        raise ApiError('Bad place ID')
    reserve_quota()
    return to_place(places_fetch(f'places/{place_id}?languageCode={PLACES_LANGUAGE}', 'GET', ','.join(PLACE_FIELDS)))


def search_text(query, near=None, max_results=MAX_RESULTS):
    """near: optional {'lat', 'lng'}, used as a location bias (not a restriction)."""
    reserve_quota()
    payload = {'textQuery': query, 'maxResultCount': max_results, 'languageCode': PLACES_LANGUAGE}
    if near:
        payload['locationBias'] = {'circle': {'center': {'latitude': near['lat'], 'longitude': near['lng']},
                                              'radius': 1000}}
    mask = ','.join('places.' + f for f in PLACE_FIELDS)
    return [to_place(p) for p in places_fetch('places:searchText', 'POST', mask, payload).get('places') or []]


def place_from_link(url):
    """Places for a Google Maps link, or None when the link names no place."""
    info = parse_maps_link(resolve_maps_link(url))
    if info['place_id']:
        return [get_place(info['place_id'])]
    if info['name']:
        return search_text(info['name'], info['near'])
    return None


def lookup(text):
    """The phone's "Add place" input: pasted text with a Maps or share.google link, or a typed name. Results are
    cached for LOOKUP_CACHE_SECONDS so adding one needs only its placeId (D12) and no second paid call."""
    text = str(text or '').strip()[:1000]
    if not text:
        raise ApiError('Paste a link or type a name')
    url = extract_url(text)
    if url:
        if is_share_url(url):
            shared = resolve_share_link(url)
            places = place_from_link(shared['maps_url']) if 'maps_url' in shared else search_text(shared['name'])
        elif is_maps_url(url):
            places = place_from_link(url)
        else:
            raise ApiError('Only Google Maps or share.google links are supported')
        if not places:
            raise ApiError('Could not read a place from that link')
    else:
        places = search_text(text)
    cache_places(places)
    return places


def cache_places(places):
    cutoff = timezone.now() - timedelta(seconds=settings.LOOKUP_CACHE_SECONDS)
    LookupCache.objects.filter(created_at__lt=cutoff).delete()
    for p in places:
        LookupCache.objects.update_or_create(place_id=p['placeId'], defaults={'data': p, 'created_at': timezone.now()})


def cached_or_fetched(place_id):
    """The Google data for a place picked from a recent lookup; fetched again (one paid call) if the cache expired."""
    cutoff = timezone.now() - timedelta(seconds=settings.LOOKUP_CACHE_SECONDS)
    hit = LookupCache.objects.filter(place_id=place_id, created_at__gte=cutoff).first()
    return hit.data if hit else get_place(place_id)
