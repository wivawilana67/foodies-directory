import logging
import uuid

from django.db import connection, transaction
from django.db.models import F, Max
from django.http import JsonResponse
from django.views.decorators.http import require_GET

from django.conf import settings

from foodies import payload, places as google_places, storage
from foodies.auth import ApiError, api, issue_token, person_for_email, verify_google_credential
from foodies.clean import (OPTION_FIELDS, clean_collection, clean_dish, clean_place_changes, clean_ratings,
                           text)
from foodies.models import (AuditLog, Collection, CollectionPlace, Dish, Label, MasterOption, Person, Photo, Place,
                            PlaceRating)

log = logging.getLogger(__name__)
MAX_PLACES_PER_ADD = 500


@require_GET
def health(request):
    """Liveness plus one database round trip, so a deploy proves the database connection works."""
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
    except Exception:
        log.exception('health: database check failed')
        return JsonResponse({'ok': False, 'error': 'Database unavailable'}, status=503)
    return JsonResponse({'ok': True})


# --- helpers ---------------------------------------------------------------------------------------------------

def get_object(model, pk, lock=False):
    """The row with this UUID, optionally locked for the rest of the transaction; a clear 404 otherwise."""
    try:
        pk = uuid.UUID(str(pk))
    except ValueError:
        pk = None
    query = model.objects.select_for_update() if lock else model.objects
    obj = query.filter(pk=pk).first() if pk else None
    if not obj:
        raise ApiError('Not found; refresh and try again', 404)
    return obj


def audit(person, action, entity, entity_id, changes=None):
    AuditLog.objects.create(person=person, action=action, entity=entity, entity_id=str(entity_id),
                            changes=changes or {})
    log.info('%s %s %s by person %s', action, entity, entity_id, person.pk)


def check_version(obj, version, what):
    if not isinstance(version, int) or isinstance(version, bool):
        raise ApiError('version is required')
    if version != obj.version:
        raise ApiError(f'This {what} was changed somewhere else. Refresh and try again.', 409)


def append_options(fields):
    """New Type / Genre / Category values join the end of their Master list (appendOptions_)."""
    for field in OPTION_FIELDS & fields.keys():
        value = fields[field]
        if value and not MasterOption.objects.filter(kind=field, value=value).exists():
            top = MasterOption.objects.filter(kind=field).aggregate(m=Max('rank'))['m'] or 0
            MasterOption.objects.create(kind=field, value=value, rank=top + 1)


def set_labels(place, names):
    place.labels.set([Label.for_name(n)[0] for n in names])


def save_ratings(place, ratings):
    """Applies {personId: {score?, review?}}; returns the changes as {"rating<id>.<field>": [old, new]}."""
    diff = {}
    for person_id, entry in ratings.items():
        rating, _ = PlaceRating.objects.get_or_create(place=place, person_id=person_id)
        for field, value in entry.items():
            if getattr(rating, field) != value:
                diff[f'rating{person_id}.{field}'] = [getattr(rating, field), value]
                setattr(rating, field, value)
        rating.save()
    return diff


def clean_ratings_for(data):
    rating_values = set(MasterOption.objects.filter(kind=MasterOption.RATING).values_list('value', flat=True))
    person_ids = set(Person.objects.values_list('id', flat=True))
    return clean_ratings(data.get('ratings', {}), rating_values, person_ids)


def sync_best_dish(place):
    """The place's Best Dish is the names of its starred dishes (syncBestDish_). Derived, so it does not bump the
    place's version: starring a dish never makes the other phone's place edit conflict."""
    best = ', '.join(place.dishes.filter(best=True).order_by('added_at').values_list('name', flat=True))
    if place.best_dish != best:
        Place.objects.filter(pk=place.pk).update(best_dish=best)
    return best


def place_out(place_id):
    return payload.place_json(payload.places_query().get(pk=place_id))


# --- sign-in ---------------------------------------------------------------------------------------------------

@api('POST', auth=False)
def auth_google(request):
    email, name = verify_google_credential(request.data.get('credential'))
    person = person_for_email(email, name)
    log.info('auth: person %s signed in', person.pk)
    return {'token': issue_token(person), 'person': payload.person_json(person)}


@api('GET')
def me(request):
    return {'person': payload.person_json(request.person)}


@api('POST')
def sign_out_everywhere(request):
    Person.objects.filter(pk=request.person.pk).update(token_version=F('token_version') + 1)
    log.info('auth: person %s signed out everywhere', request.person.pk)
    return {}


# --- data ------------------------------------------------------------------------------------------------------

@api('GET')
def bootstrap(request):
    return payload.bootstrap()


@api('POST')
def lookup(request):
    """Phone "Add place": a pasted Maps / share.google link or a typed name -> up to 5 Google results."""
    return {'places': google_places.lookup(request.data.get('input'))}


def google_values(google):
    """Model fields filled from a Google result: defaults for the user fields, plus the app-owned fields."""
    return {
        'name': google['name'], 'country': google['country'], 'city': google['city'],
        'district': google['district'], 'maps_link': google['mapsUrl'], 'google_place_id': google['placeId'],
        'lat': google['lat'], 'lng': google['lng'], 'address': google['address'],
        'google_category': google['googleCategory'],
    }


@api('POST')
def places(request):
    """Adds a place: from a lookup result (`placeId`; Google data comes from the server's cache, never from the
    phone, D12) or typed by hand. The phone's non-empty fields win over Google's defaults. A place already in the
    directory (same Google place ID) is not added twice: the reply says `duplicate` and returns it."""
    fields = clean_place_changes(request.data.get('fields', {}))
    ratings = clean_ratings_for(request.data)
    labels = fields.pop('labels', [])
    place_id = request.data.get('placeId')
    values = {}
    if place_id:
        existing = Place.objects.filter(google_place_id=place_id).first()
        if existing:
            return {'duplicate': True, 'place': place_out(existing.pk)}
        values = {**google_values(google_places.cached_or_fetched(str(place_id))), 'lookup_status': 'added'}
    values.update({f: v for f, v in fields.items() if v != ''})
    values.setdefault('lookup_status', 'manual')
    if not values.get('name'):
        raise ApiError('Name is required')
    with transaction.atomic():
        place = Place.objects.create(**values)
        set_labels(place, labels)
        save_ratings(place, ratings)
        append_options(values)
        audit(request.person, 'create', 'place', place.pk,
              {**{k: v for k, v in values.items() if k not in ('lat', 'lng')}, 'labels': labels})
    return {'duplicate': False, 'place': place_out(place.pk)}


@api('PATCH')
def place_detail(request, place_id):
    """Edits a place. Refused with 409 if it changed since the phone loaded it (D24, via `version`)."""
    changes = clean_place_changes(request.data.get('changes', {}))
    ratings = clean_ratings_for(request.data)
    if changes.get('name') == '':
        raise ApiError('Name is required')
    with transaction.atomic():
        place = get_object(Place, place_id, lock=True)
        check_version(place, request.data.get('version'), 'place')
        labels = changes.pop('labels', None)
        diff = {f: [getattr(place, f), v] for f, v in changes.items() if getattr(place, f) != v}
        for field in diff:
            setattr(place, field, changes[field])
        if labels is not None:
            old = [label.name for label in place.labels.all()]
            if [n.lower() for n in sorted(old, key=str.lower)] != [n.lower() for n in sorted(labels, key=str.lower)]:
                set_labels(place, labels)
                diff['labels'] = [old, labels]
        diff.update(save_ratings(place, ratings))
        if diff:
            place.version += 1
            place.save()
            append_options(changes)
            audit(request.person, 'update', 'place', place.pk, diff)
    return {'place': place_out(place.pk)}


@api('POST')
def dishes(request):
    fields = clean_dish(request.data)
    with transaction.atomic():
        place = get_object(Place, request.data.get('place'), lock=True)
        dish = Dish.objects.create(place=place, **fields)
        best = sync_best_dish(place)
        audit(request.person, 'create', 'dish', dish.pk, {**fields, 'place': str(place.pk)})
    return {'dish': payload.dish_json(dish), 'bestDish': best}


@api('PATCH', 'DELETE')
def dish_detail(request, dish_id):
    """Dish edits are last-write-wins, as in the sheet (D25)."""
    with transaction.atomic():
        dish = get_object(Dish, dish_id, lock=True)
        place = dish.place
        if request.method == 'DELETE':
            keys = [k for ph in dish.photos.all() for k in (ph.key, ph.thumb_key)]
            dish.delete()
            audit(request.person, 'delete', 'dish', dish_id, {'name': dish.name, 'place': str(place.pk)})
            transaction.on_commit(lambda: storage.delete_objects(keys))
            return {'bestDish': sync_best_dish(place)}
        fields = clean_dish({**payload.dish_json(dish), **request.data})
        diff = {f: [getattr(dish, f), v] for f, v in fields.items() if getattr(dish, f) != v}
        for field in diff:
            setattr(dish, field, fields[field])
        dish.save()
        best = sync_best_dish(place)
        if diff:
            audit(request.person, 'update', 'dish', dish.pk, diff)
    return {'dish': payload.dish_json(dish), 'bestDish': best}


def collection_out(collection_id):
    return payload.collection_json(Collection.objects.prefetch_related('entries').get(pk=collection_id))


@api('POST')
def collections(request):
    fields = clean_collection(request.data)
    with transaction.atomic():
        collection = Collection.objects.create(created_by=request.person, **fields)
        audit(request.person, 'create', 'collection', collection.pk, fields)
    return {'collection': collection_out(collection.pk)}


@api('PATCH', 'DELETE')
def collection_detail(request, collection_id):
    with transaction.atomic():
        collection = get_object(Collection, collection_id, lock=True)
        if request.method == 'DELETE':
            collection.delete()
            audit(request.person, 'delete', 'collection', collection_id, {'name': collection.name})
            return {}
        check_version(collection, request.data.get('version'), 'collection')
        fields = clean_collection(request.data, partial=True)
        diff = {f: [getattr(collection, f), v] for f, v in fields.items() if getattr(collection, f) != v}
        if diff:
            for field in diff:
                setattr(collection, field, fields[field])
            collection.version += 1
            collection.save()
            audit(request.person, 'update', 'collection', collection.pk, diff)
    return {'collection': collection_out(collection.pk)}


@api('POST')
def collection_places(request, collection_id):
    """Adds places (a list of ids); places already in the collection are left as they are."""
    ids = request.data.get('placeIds')
    if not isinstance(ids, list) or not ids:
        raise ApiError('placeIds must be a non-empty list')
    if len(ids) > MAX_PLACES_PER_ADD:
        raise ApiError(f'Add at most {MAX_PLACES_PER_ADD} places at a time')
    try:
        wanted = {uuid.UUID(text(i, 64, 'place id')) for i in ids}
    except ValueError as e:
        raise ApiError('Unknown place; refresh and try again', 404) from e
    with transaction.atomic():
        collection = get_object(Collection, collection_id, lock=True)
        found = set(Place.objects.filter(pk__in=wanted).values_list('pk', flat=True))
        if found != wanted:
            raise ApiError('Unknown place; refresh and try again', 404)
        CollectionPlace.objects.bulk_create(
            [CollectionPlace(collection=collection, place_id=pk, added_by=request.person) for pk in wanted],
            ignore_conflicts=True)
        audit(request.person, 'add', 'collection', collection.pk, {'places': sorted(str(pk) for pk in wanted)})
    return {'collection': collection_out(collection.pk)}


@api('DELETE')
def collection_place(request, collection_id, place_id):
    with transaction.atomic():
        collection = get_object(Collection, collection_id, lock=True)
        removed, _ = CollectionPlace.objects.filter(collection=collection, place_id=place_id).delete()
        if removed:
            audit(request.person, 'remove', 'collection', collection.pk, {'place': str(place_id)})
    return {'collection': collection_out(collection.pk)}


# --- photos ----------------------------------------------------------------------------------------------------

def photo_owner(data, lock=False):
    """The place or dish a photo belongs to: exactly one of `place` / `dish`."""
    if bool(data.get('place')) == bool(data.get('dish')):
        raise ApiError('Give either place or dish')
    return {'place': get_object(Place, data['place'], lock)} if data.get('place') else \
        {'dish': get_object(Dish, data['dish'], lock)}


def photos_out(owner):
    return [payload.photo_json(ph) for ph in Photo.objects.filter(**owner).order_by('position')]


def check_photo_room(owner):
    if Photo.objects.filter(**owner).count() >= settings.MAX_PHOTOS:
        raise ApiError(f'Up to {settings.MAX_PHOTOS} photos each')


@api('POST')
def photo_upload_url(request):
    """Step 1 of adding a photo: two signed PUT URLs (full + thumb) for a new, server-chosen photo id."""
    owner = photo_owner(request.data)
    check_photo_room(owner)
    photo_id = uuid.uuid4()
    full, thumb = storage.keys_for(photo_id)
    headers = storage.upload_headers()
    return {'photoId': str(photo_id), 'expiresInMinutes': storage.UPLOAD_MINUTES,
            'upload': {'url': storage.signed_put_url(full), 'headers': headers},
            'thumbUpload': {'url': storage.signed_put_url(thumb), 'headers': headers}}


@api('POST')
def photos(request):
    """Step 2: after both PUTs succeeded, checks the uploads and adds the photo at the end (the first is the cover)."""
    try:
        photo_id = uuid.UUID(str(request.data.get('photoId')))
    except ValueError as e:
        raise ApiError('Bad photo id') from e
    full, thumb = storage.keys_for(photo_id)
    photo_owner(request.data)  # 404 early, before touching the bucket
    storage.check_uploaded(full)
    storage.check_uploaded(thumb)
    with transaction.atomic():
        owner = photo_owner(request.data, lock=True)
        check_photo_room(owner)
        if Photo.objects.filter(pk=photo_id).exists():
            raise ApiError('This photo was already added')
        top = Photo.objects.filter(**owner).aggregate(m=Max('position'))['m']
        photo = Photo.objects.create(id=photo_id, key=full, thumb_key=thumb,
                                     position=0 if top is None else top + 1, **owner)
        kind, obj = next(iter(owner.items()))
        audit(request.person, 'add', 'photo', photo.pk, {kind: str(obj.pk)})
    return {'photo': payload.photo_json(photo), 'photos': photos_out(owner)}


@api('DELETE')
def photo_detail(request, photo_id):
    with transaction.atomic():
        photo = get_object(Photo, photo_id, lock=True)
        owner = {'place': photo.place} if photo.place_id else {'dish': photo.dish}
        keys = [photo.key, photo.thumb_key]
        photo.delete()
        audit(request.person, 'delete', 'photo', photo_id, {'drive_id': photo.drive_id, 'key': photo.key})
        transaction.on_commit(lambda: storage.delete_objects(keys))
    return {'photos': photos_out(owner)}
