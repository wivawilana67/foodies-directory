"""JSON shapes sent to the phone (camelCase for the React app). Querysets passed in should prefetch what they read."""
from foodies import storage
from foodies.models import Collection, Dish, MasterOption, Person, Place


def photo_json(photo):
    """URLs the phone shows: the bucket copy, or until copy_drive_photos has run, the old Drive thumbnail URL
    (undocumented, D36)."""
    if photo.key:
        url, thumb = storage.public_url(photo.key), storage.public_url(photo.thumb_key or photo.key)
    else:
        url = f'https://drive.google.com/thumbnail?id={photo.drive_id}&sz=w1600'
        thumb = f'https://drive.google.com/thumbnail?id={photo.drive_id}&sz=w320'
    return {'id': str(photo.id), 'position': photo.position, 'url': url, 'thumbUrl': thumb}


def place_json(p):
    return {
        'id': str(p.id), 'name': p.name, 'country': p.country, 'city': p.city, 'district': p.district,
        'landmark': p.landmark, 'price': p.price, 'type': p.type, 'genre': p.genre, 'category': p.category,
        'labels': [label.name for label in p.labels.all()], 'bestDish': p.best_dish, 'instagram': p.instagram,
        'mapsLink': p.maps_link, 'closed': p.closed, 'tried': p.tried, 'placeId': p.google_place_id,
        'lat': float(p.lat) if p.lat is not None else None, 'lng': float(p.lng) if p.lng is not None else None,
        'address': p.address, 'googleCategory': p.google_category, 'lookupStatus': p.lookup_status,
        'addedAt': p.added_at.isoformat(), 'version': p.version,
        'ratings': {str(r.person_id): {'score': r.score, 'review': r.review} for r in p.ratings.all()},
        'photos': [photo_json(ph) for ph in p.photos.all()],
    }


def dish_json(d):
    return {
        'id': str(d.id), 'place': str(d.place_id), 'name': d.name, 'price': d.price, 'liked': d.liked,
        'best': d.best, 'note': d.note, 'addedAt': d.added_at.isoformat(),
        'photos': [photo_json(ph) for ph in d.photos.all()],
    }


def collection_json(c):
    return {
        'id': str(c.id), 'name': c.name, 'note': c.note, 'version': c.version,
        'createdBy': c.created_by_id, 'createdAt': c.created_at.isoformat(),
        'placeIds': [str(e.place_id) for e in c.entries.all()],
    }


def person_json(person):
    return {'id': person.id, 'name': person.name, 'position': person.position}


def places_query():
    return Place.objects.prefetch_related('labels', 'ratings', 'photos')


def bootstrap():
    """Everything the phone needs in one payload, like the Apps Script `list` action."""
    options = {kind: [] for kind, _ in MasterOption.KINDS}
    for o in MasterOption.objects.order_by('kind', 'rank'):
        options[o.kind].append(o.value)
    return {
        'people': [person_json(p) for p in Person.objects.all()],
        'options': options,
        'places': [place_json(p) for p in places_query()],
        'dishes': [dish_json(d) for d in Dish.objects.prefetch_related('photos')],
        'collections': [collection_json(c) for c in Collection.objects.prefetch_related('entries')],
    }
