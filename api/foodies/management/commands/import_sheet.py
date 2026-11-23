"""Import CSV exports of the sheet's "Food List", "Dishes" and "Master" tabs into Postgres.

Re-runnable: places and dishes are matched by their App ID / Dish ID, so a second run updates rows instead of
duplicating them. The sheet's Photos columns are ignored: the new app has no photos for now (D57).
Everything runs in one transaction: any error rolls the whole import back, and --dry-run always does.

    python manage.py import_sheet --people "Name1,Name2" --places food-list.csv --dishes dishes.csv --master master.csv
"""
import csv
import re
import uuid
from datetime import datetime
from decimal import Decimal, InvalidOperation

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from foodies.clean import split_list
from foodies.models import AuditLog, Dish, Label, MasterOption, Person, Place, PlaceRating

# Old Indonesian headers (apps-script/src/Setup.js OLD_HEADERS), for sheets where renameHeadersToEnglish has not run.
OLD_HEADERS = {
    'Nama Resto': 'Name',
    'Negara': 'Country',
    'Kota': 'City',
    'Lokasi': 'District',
    'Jalan / Patokan': 'Landmark',
    'Range Harga (Per Orang)': 'Price Range (Per Person)',
    'Tipe Foodies': 'Type',
    'Genre Foodies': 'Genre',
    'Jenis Foodies': 'Category',
    'Link Instagram': 'Instagram Link',
    'Link Google': 'Google Maps Link',
}

# Place model field -> "Food List" header. Rating / Review columns are per person and handled separately.
PLACE_COLUMNS = {
    'name': 'Name',
    'country': 'Country',
    'city': 'City',
    'district': 'District',
    'landmark': 'Landmark',
    'price': 'Price Range (Per Person)',
    'type': 'Type',
    'genre': 'Genre',
    'category': 'Category',
    'best_dish': 'Best Dish',
    'instagram': 'Instagram Link',
    'maps_link': 'Google Maps Link',
    'google_place_id': 'Place ID',
    'address': 'Address',
    'google_category': 'Google Category',
    'lookup_status': 'Lookup Status',
}
MASTER_COLUMNS = {
    MasterOption.RATING: 'Ratings',
    MasterOption.TYPE: 'Type',
    MasterOption.GENRE: 'Genre',
    MasterOption.CATEGORY: 'Category',
}


def norm_header(h):
    """Header text as the Apps Script compares it (whitespace collapsed), with old names mapped to English."""
    h = re.sub(r'\s+', ' ', h or '').strip()
    return OLD_HEADERS.get(h, h)


def read_csv(path):
    try:
        with open(path, newline='', encoding='utf-8-sig') as f:
            rows = list(csv.reader(f))
    except OSError as e:
        raise CommandError(f'Cannot read {path}: {e}') from e
    if not rows:
        raise CommandError(f'{path} is empty')
    headers = [norm_header(h) for h in rows[0]]
    return headers, [dict(zip(headers, (c.strip() for c in row))) for row in rows[1:]]


def is_checked(value):
    """Same rule as isChecked_ in Sheet.js: a ticked checkbox (TRUE in CSV) or yes / y / true / sudah."""
    return bool(re.fullmatch(r'yes|y|true|sudah', value or '', re.IGNORECASE))


def to_decimal(value):
    try:
        return Decimal(value) if value else None
    except InvalidOperation:
        return None


def to_uuid(value):
    try:
        return uuid.UUID(value)
    except (ValueError, TypeError, AttributeError):
        return None


def to_datetime(value):
    """ISO dates only ("2026-11-15 10:30:00" or "2026-11-15T03:30:00.000Z"). Other formats return None, because
    a sheet's locale makes "03/04/2026" ambiguous (Unverified which format a real export uses)."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        return None
    return dt if timezone.is_aware(dt) else timezone.make_aware(dt)


class Command(BaseCommand):
    help = 'Import CSV exports of the "Food List", "Dishes" and "Master" tabs (re-runnable).'

    def add_arguments(self, parser):
        parser.add_argument('--people', required=True,
                            help='The two names in the Rating (<name>) headers, in sheet order: "Name1,Name2"')
        parser.add_argument('--places', required=True, help='CSV export of "Food List"')
        parser.add_argument('--dishes', help='CSV export of "Dishes"')
        parser.add_argument('--master', help='CSV export of "Master"')
        parser.add_argument('--dry-run', action='store_true', help='Check everything, then roll back')

    def handle(self, *args, **opts):
        names = [n.strip() for n in opts['people'].split(',') if n.strip()]
        if len(names) != 2:
            raise CommandError('--people must hold two names separated by a comma')
        self.counts = {'places': 0, 'ratings': 0, 'dishes': 0, 'options': 0, 'labels': 0}
        self.warnings = []
        with transaction.atomic():
            people = self.import_people(names)
            if opts['master']:
                self.import_master(opts['master'])
            self.import_places(opts['places'], people)
            if opts['dishes']:
                self.import_dishes(opts['dishes'])
            AuditLog.objects.create(action='import', entity='sheet', changes=self.counts)
            if opts['dry_run']:
                transaction.set_rollback(True)
        for w in self.warnings:
            self.stderr.write(f'warning: {w}')
        summary = ', '.join(f'{n} {k}' for k, n in self.counts.items())
        self.stdout.write(('Dry run, nothing saved: ' if opts['dry_run'] else 'Imported: ') + summary)

    def import_people(self, names):
        people = []
        for position, name in enumerate(names, start=1):
            person, _ = Person.objects.update_or_create(position=position, defaults={'name': name})
            people.append(person)
        return people

    def import_master(self, path):
        headers, rows = read_csv(path)
        for kind, header in MASTER_COLUMNS.items():
            if header not in headers:
                self.warnings.append(f'Master: no "{header}" column')
                continue
            values = []  # the column top to bottom, blanks and repeats dropped; values may contain commas
            for value in (r.get(header, '') for r in rows):
                if value and value not in values:
                    values.append(value)
            for rank, value in enumerate(values, start=1):
                MasterOption.objects.update_or_create(kind=kind, value=value, defaults={'rank': rank})
                self.counts['options'] += 1

    def import_places(self, path, people):
        headers, rows = read_csv(path)
        missing = [h for h in ('Name', 'App ID') if h not in headers]
        if missing:
            raise CommandError(f'Food List: missing column(s) {", ".join(missing)}')
        ratings = set(MasterOption.objects.filter(kind=MasterOption.RATING).values_list('value', flat=True))
        for line, row in enumerate(rows, start=2):
            if not row.get('Name'):
                continue
            place_id = to_uuid(row.get('App ID'))
            if not place_id:
                self.warnings.append(f'Food List row {line} ("{row["Name"]}"): no valid App ID, skipped. '
                                     'Open the live app once so it assigns App IDs, then export again.')
                continue
            fields = {f: row.get(h, '') for f, h in PLACE_COLUMNS.items()}
            fields.update(closed=is_checked(row.get('Closed')), tried=is_checked(row.get('Have Tried?')),
                          lat=to_decimal(row.get('Lat')), lng=to_decimal(row.get('Lng')))
            added = to_datetime(row.get('Added At'))
            if added:
                fields['added_at'] = added
            place, _ = Place.objects.update_or_create(id=place_id, defaults=fields)
            self.counts['places'] += 1
            place.labels.set([self.label(n) for n in split_list(row.get('Labels'))])
            for person in people:
                score = row.get(f'Rating ({person.name})', '')
                if score and ratings and score not in ratings:
                    self.warnings.append(f'Food List row {line}: rating "{score}" is not in the Master list')
                PlaceRating.objects.update_or_create(place=place, person=person, defaults={
                    'score': score, 'review': row.get(f'Review ({person.name})', '')})
                self.counts['ratings'] += 1

    def import_dishes(self, path):
        headers, rows = read_csv(path)
        missing = [h for h in ('Dish ID', 'App ID', 'Dish') if h not in headers]
        if missing:
            raise CommandError(f'Dishes: missing column(s) {", ".join(missing)}')
        for line, row in enumerate(rows, start=2):
            dish_id, place_id = to_uuid(row.get('Dish ID')), to_uuid(row.get('App ID'))
            if not dish_id or not row.get('Dish'):
                continue
            place = Place.objects.filter(id=place_id).first() if place_id else None
            if not place:
                self.warnings.append(f'Dishes row {line} ("{row["Dish"]}"): its place is not imported, skipped')
                continue
            liked = row.get('Liked', '')
            fields = {'place': place, 'name': row['Dish'], 'price': row.get('Price', ''),
                      'liked': liked if liked in ('Yes', 'No') else '', 'best': is_checked(row.get('Best')),
                      'note': row.get('Note', '')}
            added = to_datetime(row.get('Added At'))
            if added:
                fields['added_at'] = added
            Dish.objects.update_or_create(id=dish_id, defaults=fields)
            self.counts['dishes'] += 1

    def label(self, name):
        label, created = Label.for_name(name)
        self.counts['labels'] += created
        return label

