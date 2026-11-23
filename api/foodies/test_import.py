import csv
import tempfile
import uuid
from io import StringIO
from pathlib import Path

from django.core.management import CommandError, call_command
from django.test import TestCase
from django.utils import timezone

from foodies.models import AuditLog, Dish, Label, MasterOption, Person, Place, PlaceRating

PLACE_A, PLACE_B, DISH_1 = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())

FOOD_LIST = [
    ['UniqueName', 'Name', 'Country', 'City', 'District', 'Landmark', 'Rating (Ana)', 'Rating (Budi)',
     'Price Range (Per Person)', 'Type', 'Genre', 'Category', 'Labels', 'Best Dish', 'Review (Ana)', 'Review (Budi)',
     'Instagram Link', 'Google Maps Link', 'Closed', 'Have Tried?', 'App ID', 'Place ID', 'Lat', 'Lng', 'Address',
     'Google Category', 'Added At', 'Lookup Status', 'Photos'],
    ['Warung A - Indonesia', 'Warung A', 'Indonesia', 'Jakarta', 'Menteng', 'Near the park', '8', 'HEAVEN!',
     '50k', 'Restaurant', 'Indonesian', 'Main', 'Spicy, cheap, spicy', 'Soto', 'Great', 'Ok',
     '', 'https://maps.app.goo.gl/x', 'FALSE', 'TRUE', PLACE_A, 'ChIJa', '-6.195', '106.823', 'Jl. A',
     'Restaurant', '2026-11-15 10:30:00', 'found', 'drive1, drive2'],
    ['', 'No ID Cafe', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
     '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
]
DISHES = [
    ['Dish ID', 'App ID', 'UniqueName', 'Dish', 'Price', 'Liked', 'Best', 'Note', 'Added At', 'Photos'],
    [DISH_1, PLACE_A, 'Warung A - Indonesia', 'Soto', '25k', 'Yes', 'TRUE', 'Rich broth', '2026-11-16 12:00:00',
     'drive3'],
    [str(uuid.uuid4()), str(uuid.uuid4()), '', 'Orphan dish', '', '', 'FALSE', '', '', ''],
]
MASTER = [
    ['Ratings', 'Type', 'Genre', 'Category'],
    ['7', 'Restaurant', 'Indonesian', 'Main'],
    ['8', 'Cafe', 'Japanese', ''],
    ['HEAVEN!', '', '', ''],
]


class ImportSheetTests(TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)

    def csv_file(self, name, rows):
        path = Path(self.dir.name) / name
        with open(path, 'w', newline='', encoding='utf-8') as f:
            csv.writer(f).writerows(rows)
        return str(path)

    def run_import(self, places=FOOD_LIST, **extra):
        out, err = StringIO(), StringIO()
        call_command('import_sheet', people='Ana, Budi', places=self.csv_file('places.csv', places),
                     dishes=self.csv_file('dishes.csv', DISHES), master=self.csv_file('master.csv', MASTER),
                     stdout=out, stderr=err, **extra)
        return out.getvalue(), err.getvalue()

    def test_imports_places_ratings_labels_dishes_and_master_and_ignores_photos(self):
        out, err = self.run_import()
        place = Place.objects.get(id=PLACE_A)
        self.assertEqual((place.name, place.city, place.type, place.category), ('Warung A', 'Jakarta', 'Restaurant', 'Main'))
        self.assertEqual((place.tried, place.closed, str(place.lat), place.google_place_id), (True, False, '-6.195000', 'ChIJa'))
        self.assertEqual(timezone.localtime(place.added_at).strftime('%Y-%m-%d %H:%M'), '2026-11-15 10:30')  # Jakarta time
        self.assertEqual(sorted(place.labels.values_list('name', flat=True)), ['Spicy', 'cheap'])
        scores = {r.person.name: (r.score, r.review) for r in place.ratings.all()}
        self.assertEqual(scores, {'Ana': ('8', 'Great'), 'Budi': ('HEAVEN!', 'Ok')})
        self.assertFalse(hasattr(place, 'photos'))  # the sheet's Photos column is ignored (D57)
        dish = Dish.objects.get(id=DISH_1)
        self.assertEqual((dish.place_id, dish.liked, dish.best, dish.note), (place.id, 'Yes', True, 'Rich broth'))
        ranks = list(MasterOption.objects.filter(kind='rating').values_list('value', 'rank'))
        self.assertEqual(ranks, [('7', 1), ('8', 2), ('HEAVEN!', 3)])
        self.assertIn('No ID Cafe', err)
        self.assertIn('Orphan dish', err)
        self.assertIn('Imported: 1 places', out)
        self.assertEqual(AuditLog.objects.filter(action='import').count(), 1)

    def test_rerun_updates_instead_of_duplicating(self):
        self.run_import()
        changed = [row[:] for row in FOOD_LIST]
        changed[1][3] = 'Bandung'
        self.run_import(places=changed)
        self.assertEqual(Place.objects.count(), 1)
        self.assertEqual(Place.objects.get(id=PLACE_A).city, 'Bandung')
        self.assertEqual((PlaceRating.objects.count(), Dish.objects.count(), Label.objects.count()), (2, 1, 2))
        self.assertEqual(Person.objects.count(), 2)

    def test_old_indonesian_headers_are_accepted(self):
        old = [row[:] for row in FOOD_LIST]
        old[0][1:4] = ['Nama Resto', 'Negara', 'Kota']
        self.run_import(places=old)
        self.assertEqual(Place.objects.get(id=PLACE_A).city, 'Jakarta')

    def test_dry_run_saves_nothing(self):
        out, _ = self.run_import(dry_run=True)
        self.assertIn('Dry run, nothing saved', out)
        self.assertEqual((Place.objects.count(), Person.objects.count(), AuditLog.objects.count()), (0, 0, 0))

    def test_rejects_bad_people_and_missing_columns(self):
        with self.assertRaisesMessage(CommandError, 'two names'):
            call_command('import_sheet', people='Ana', places='x.csv')
        with self.assertRaisesMessage(CommandError, 'App ID'):
            self.run_import(places=[['Name'], ['Warung A']])
        self.assertEqual(Place.objects.count(), 0)
