"""Server-side input checks, ported from the Apps Script (cleanValue_ / cleanLabels_ in Sheet.js, cleanDish_ in
Dishes.js, isMapsUrl_ in MapsLink.js) with the same limits and messages. The phone never decides what is valid."""
import re
from urllib.parse import urlsplit

from foodies.auth import ApiError

# Place fields the phone may set (EDITABLE_FIELDS), as API name -> model field. Ratings are sent separately.
PLACE_FIELDS = {
    'name': 'name', 'country': 'country', 'city': 'city', 'district': 'district', 'landmark': 'landmark',
    'price': 'price', 'type': 'type', 'genre': 'genre', 'category': 'category', 'instagram': 'instagram',
    'mapsLink': 'maps_link', 'closed': 'closed', 'tried': 'tried',
}
CHECKBOXES = {'closed', 'tried'}
OPTION_FIELDS = {'type', 'genre', 'category'}  # new values are appended to their Master list


def split_list(value):
    """A list or comma-separated text -> unique, non-blank items; first spelling wins, case-insensitive."""
    items = value if isinstance(value, list) else str(value or '').split(',')
    out = []
    for item in (str(s).strip() for s in items):
        if item and item.lower() not in (o.lower() for o in out):
            out.append(item)
    return out


def text(value, limit, label):
    s = '' if value is None else str(value).strip()
    if len(s) > limit:
        raise ApiError(f'{label} is too long')
    return s


def is_maps_url(url):
    try:
        parts = urlsplit(str(url))
    except ValueError:
        return False
    if parts.scheme not in ('http', 'https'):
        return False
    host, path = (parts.hostname or '').lower(), parts.path or '/'
    return (host == 'maps.app.goo.gl'
            or (host == 'goo.gl' and path.startswith('/maps'))
            or bool(re.fullmatch(r'maps\.google\.[a-z.]+', host))
            or (bool(re.fullmatch(r'(www\.)?google\.[a-z.]+', host)) and path.startswith('/maps')))


def clean_labels(value):
    labels = split_list(value)
    if any(len(s) > 40 for s in labels):
        raise ApiError('A label is too long (max 40 characters)')
    if len(labels) > 20:
        raise ApiError('Too many labels (max 20)')
    return labels


def clean_place_field(field, value):
    """One editable place field (API name) -> clean value for the model."""
    if field in CHECKBOXES:
        return value is True
    s = text(value, 200, field)
    if field == 'instagram' and s:
        if re.fullmatch(r'@?[\w.]{1,30}', s):
            s = 'https://www.instagram.com/' + s.lstrip('@') + '/'
        if not re.match(r'https://(www\.|m\.)?instagram\.com/', s, re.IGNORECASE):
            raise ApiError('Instagram must be an https://instagram.com link or @name')
    if field == 'mapsLink' and s and not (s.lower().startswith('https://')
                                          and (is_maps_url(s) or s.lower().startswith('https://share.google/'))):
        raise ApiError('Google link must be a Google Maps link')
    return s


def clean_place_changes(changes):
    """{apiField: value} -> {modelField: value}; unknown fields are refused, like cleanFields_."""
    if not isinstance(changes, dict):
        raise ApiError('changes must be an object')
    out = {}
    for field, value in changes.items():
        if field == 'labels':
            out['labels'] = clean_labels(value)
        elif field in PLACE_FIELDS:
            out[PLACE_FIELDS[field]] = clean_place_field(field, value)
        else:
            raise ApiError(f'Field cannot be edited: {field}')
    return out


def clean_ratings(ratings, rating_values, person_ids):
    """{personId: {score, review}} -> {personId: {...}}; a score must be in the Master "Ratings" list."""
    if not isinstance(ratings, dict):
        raise ApiError('ratings must be an object')
    out = {}
    for key, entry in ratings.items():
        try:
            person_id = int(key)
        except (TypeError, ValueError) as e:
            raise ApiError('Unknown person in ratings') from e
        if person_id not in person_ids or not isinstance(entry, dict):
            raise ApiError('Unknown person in ratings')
        clean = {}
        if 'score' in entry:
            clean['score'] = text(entry['score'], 200, 'rating')
            if clean['score'] and clean['score'] not in rating_values:
                raise ApiError(f'Unknown rating: {clean["score"]}')
        if 'review' in entry:
            clean['review'] = text(entry['review'], 1000, 'review')
        out[person_id] = clean
    return out


def clean_dish(data):
    out = {
        'name': text(data.get('name'), 100, 'Dish'),
        'price': text(data.get('price'), 50, 'Price'),
        'note': text(data.get('note'), 300, 'Note'),
        'liked': str(data.get('liked') or ''),
        'best': data.get('best') is True,
    }
    if not out['name']:
        raise ApiError('Dish name is required')
    if out['liked'] not in ('', 'Yes', 'No'):
        raise ApiError('Liked must be Yes, No or empty')
    return out


def clean_collection(data, partial=False):
    out = {}
    if not partial or 'name' in data:
        out['name'] = text(data.get('name'), 100, 'Collection name')
        if not out['name']:
            raise ApiError('Collection name is required')
    if not partial or 'note' in data:
        out['note'] = text(data.get('note'), 1000, 'Note')
    return out
