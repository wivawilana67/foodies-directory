"""Fill an empty local database with made-up sample places, dishes and Master lists, to build screens against.

Local only: refuses unless DJANGO_DEBUG=1 (never set on Cloud Run), and refuses when places already exist, so it
never mixes with imported data. Wipe the local database first with `docker compose down -v` if needed.

    python manage.py seed_sample
"""
from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from foodies.models import Dish, Label, MasterOption, Person, Place, PlaceRating

RATINGS = ['Meh', 'Okay', 'Good', 'Great', 'HEAVEN!']
OPTIONS = {
    MasterOption.RATING: RATINGS,
    MasterOption.TYPE: ['Restaurant', 'Cafe', 'Street food', 'Bakery'],
    MasterOption.GENRE: ['Indonesian', 'Japanese', 'Western', 'Chinese'],
    MasterOption.CATEGORY: ['Main', 'Snack', 'Dessert', 'Drinks'],
}
CITIES = {  # city -> (country, lat, lng, districts)
    'Jakarta': ('Indonesia', -6.2, 106.82, ['Menteng', 'Kemang', 'Kelapa Gading']),
    'Bandung': ('Indonesia', -6.91, 107.61, ['Dago', 'Braga']),
    'Denpasar': ('Indonesia', -8.65, 115.22, ['Sanur', 'Renon']),
    'Singapore': ('Singapore', 1.29, 103.85, ['Chinatown', 'Bugis']),
}
# name, city, type, genre, category, price, labels, tried, closed, score 1, score 2, dishes [(name, liked, best)]
PLACES = [
    ('Sample Soto House', 'Jakarta', 'Restaurant', 'Indonesian', 'Main', '30k–50k', ['Spicy', 'Cheap'], True, False,
     'HEAVEN!', 'Great', [('Soto ayam', 'Yes', True), ('Perkedel', 'Yes', False)]),
    ('Demo Ramen Bar', 'Jakarta', 'Restaurant', 'Japanese', 'Main', '100k–150k', ['Date night'], True, False,
     'Good', 'Great', [('Tonkotsu ramen', 'Yes', True), ('Gyoza', 'No', False)]),
    ('Example Kopi Corner', 'Jakarta', 'Cafe', 'Indonesian', 'Drinks', '25k–40k', ['Work friendly', 'Wifi'], True,
     False, 'Okay', '', [('Es kopi susu', 'Yes', True)]),
    ('Test Martabak Stall', 'Jakarta', 'Street food', 'Indonesian', 'Snack', '20k–60k', ['Late night', 'Cheap'],
     False, False, '', '', []),
    ('Placeholder Dim Sum', 'Jakarta', 'Restaurant', 'Chinese', 'Main', '80k–120k', ['Family'], True, True,
     'Great', 'Good', [('Har gow', 'Yes', True), ('Siu mai', 'Yes', False)]),
    ('Mock Bakery Dago', 'Bandung', 'Bakery', 'Western', 'Snack', '15k–40k', ['Breakfast'], True, False,
     'Good', 'Okay', [('Croissant', 'Yes', True)]),
    ('Sample Batagor Spot', 'Bandung', 'Street food', 'Indonesian', 'Snack', '15k–25k', ['Cheap', 'Spicy'], False,
     False, '', '', []),
    ('Demo Steak Braga', 'Bandung', 'Restaurant', 'Western', 'Main', '150k–250k', ['Date night'], True, False,
     'Meh', 'Okay', [('Sirloin', 'No', False), ('Mashed potato', 'Yes', True)]),
    ('Example Gelato Lab', 'Bandung', 'Cafe', 'Western', 'Dessert', '30k–50k', ['Sweet'], False, False, '', '', []),
    ('Test Babi Guling', 'Denpasar', 'Restaurant', 'Indonesian', 'Main', '50k–80k', ['Must try', 'Spicy'], True,
     False, 'HEAVEN!', 'HEAVEN!', [('Babi guling special', 'Yes', True)]),
    ('Placeholder Beach Cafe', 'Denpasar', 'Cafe', 'Western', 'Drinks', '60k–100k', ['Sunset', 'Work friendly'],
     False, False, '', '', []),
    ('Mock Sushi Sanur', 'Denpasar', 'Restaurant', 'Japanese', 'Main', '120k–200k', ['Date night'], False, False,
     '', '', []),
    ('Sample Chicken Rice', 'Singapore', 'Street food', 'Chinese', 'Main', 'SGD 5–8', ['Must try', 'Cheap'], True,
     False, 'Great', 'HEAVEN!', [('Roasted chicken rice', 'Yes', True), ('Soup', '', False)]),
    ('Demo Laksa Stall', 'Singapore', 'Street food', 'Chinese', 'Main', 'SGD 6–9', ['Spicy'], False, False, '', '',
     []),
    ('Example Kaya Toast', 'Singapore', 'Cafe', 'Chinese', 'Snack', 'SGD 4–7', ['Breakfast'], True, False,
     'Good', 'Good', [('Kaya toast set', 'Yes', True)]),
    ('Test Ice Kacang', 'Singapore', 'Street food', 'Chinese', 'Dessert', 'SGD 3–5', ['Sweet'], False, False, '',
     '', []),
]


class Command(BaseCommand):
    help = 'Fill an empty local database with sample data (DJANGO_DEBUG=1 only).'

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError('seed_sample runs only with DJANGO_DEBUG=1 (local development)')
        if Place.objects.exists():
            raise CommandError('The database already has places; seed_sample only fills an empty one')
        people = [Person.objects.get_or_create(position=i, defaults={'name': f'Person {i}'})[0] for i in (1, 2)]
        for kind, values in OPTIONS.items():
            for rank, value in enumerate(values, start=1):
                MasterOption.objects.get_or_create(kind=kind, value=value, defaults={'rank': rank})
        for n, (name, city, type_, genre, category, price, labels, tried, closed, score1, score2,
                dishes) in enumerate(PLACES):
            country, lat, lng, districts = CITIES[city]
            place = Place.objects.create(
                name=name, country=country, city=city, district=districts[n % len(districts)], type=type_,
                genre=genre, category=category, price=price, tried=tried, closed=closed, lookup_status='manual',
                lat=Decimal(str(round(lat + (n % 5) * 0.011, 6))), lng=Decimal(str(round(lng + (n % 3) * 0.013, 6))),
                best_dish=', '.join(d[0] for d in dishes if d[2]))
            place.labels.set([Label.for_name(label)[0] for label in labels])
            for person, score in zip(people, (score1, score2)):
                if score:
                    PlaceRating.objects.create(place=place, person=person, score=score, review=f'Sample review: {score}')
            for dish, liked, best in dishes:
                Dish.objects.create(place=place, name=dish, liked=liked, best=best)
        self.stdout.write(f'Added {len(PLACES)} sample places. Next: python manage.py dev_token')
