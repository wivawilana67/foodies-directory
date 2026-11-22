from unittest import mock

from django.test import TestCase, override_settings

from foodies.auth import issue_token
from foodies.models import AuditLog, Collection, Dish, Label, MasterOption, Person, Place, PlaceRating

EMAILS = ['ana@example.com', 'budi@example.com']


def google_info(email, verified=True):
    return {'email': email, 'email_verified': verified, 'given_name': email.split('@')[0].title()}


@override_settings(GOOGLE_CLIENT_ID='test-client', ALLOWED_EMAILS=EMAILS)
class ApiTestCase(TestCase):
    def setUp(self):
        self.ana = Person.objects.create(name='Ana', position=1, email=EMAILS[0])
        self.budi = Person.objects.create(name='Budi', position=2, email=EMAILS[1])
        for rank, value in enumerate(['7', '8', 'HEAVEN!'], start=1):
            MasterOption.objects.create(kind='rating', value=value, rank=rank)
        MasterOption.objects.create(kind='type', value='Restaurant', rank=1)
        self.auth = {'HTTP_AUTHORIZATION': 'Bearer ' + issue_token(self.ana)}

    def call(self, method, path, data=None, auth=True):
        kwargs = dict(self.auth) if auth else {}
        if data is not None:
            kwargs.update(data=data, content_type='application/json')
        return getattr(self.client, method)(path, **kwargs)


class SignInTests(ApiTestCase):
    def sign_in(self, info):
        with mock.patch('google.oauth2.id_token.verify_oauth2_token', return_value=info) as verify:
            response = self.call('post', '/api/auth/google', {'credential': 'google-jwt'}, auth=False)
        return response, verify

    def test_allowed_email_gets_a_working_token(self):
        response, verify = self.sign_in(google_info('Budi@example.com'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(verify.call_args.args[2], 'test-client')  # audience = our client ID
        body = response.json()
        self.assertEqual(body['person']['id'], self.budi.id)
        me = self.client.get('/api/auth/me', HTTP_AUTHORIZATION='Bearer ' + body['token'])
        self.assertEqual(me.json()['person']['name'], 'Budi')

    def test_other_or_unverified_emails_are_refused(self):
        self.assertEqual(self.sign_in(google_info('eve@example.com'))[0].status_code, 403)
        self.assertEqual(self.sign_in(google_info(EMAILS[0], verified=False))[0].status_code, 403)

    def test_invalid_google_token_is_refused(self):
        with mock.patch('google.oauth2.id_token.verify_oauth2_token', side_effect=ValueError('bad')):
            response = self.call('post', '/api/auth/google', {'credential': 'x'}, auth=False)
        self.assertEqual(response.status_code, 401)

    def test_first_sign_in_creates_the_person(self):
        self.budi.delete()
        response, _ = self.sign_in(google_info(EMAILS[1]))
        self.assertEqual(Person.objects.get(position=2).email, EMAILS[1])
        self.assertEqual(response.status_code, 200)

    @override_settings(GOOGLE_CLIENT_ID='')
    def test_not_configured(self):
        self.assertEqual(self.call('post', '/api/auth/google', {'credential': 'x'}, auth=False).status_code, 503)

    def test_requests_need_a_valid_token(self):
        self.assertEqual(self.call('get', '/api/bootstrap', auth=False).status_code, 401)
        bad = self.client.get('/api/bootstrap', HTTP_AUTHORIZATION='Bearer forged')
        self.assertEqual(bad.status_code, 401)

    def test_sign_out_everywhere_revokes_old_tokens(self):
        self.assertEqual(self.call('post', '/api/auth/sign-out-everywhere', {}).status_code, 200)
        self.assertEqual(self.call('get', '/api/auth/me').status_code, 401)

    def test_removed_from_allowlist_means_signed_out(self):
        with override_settings(ALLOWED_EMAILS=[EMAILS[1]]):
            self.assertEqual(self.call('get', '/api/auth/me').status_code, 401)


class PlaceTests(ApiTestCase):
    def add(self, **fields):
        return self.call('post', '/api/places', {'fields': {'name': 'Warung A', **fields}})

    def test_add_manual_place_with_labels_and_new_option(self):
        response = self.add(city='Jakarta', type='Cafe', labels='Spicy, spicy, cheap', instagram='@warung.a')
        self.assertEqual(response.status_code, 200)
        place = response.json()['place']
        self.assertEqual((place['lookupStatus'], place['instagram']), ('manual', 'https://www.instagram.com/warung.a/'))
        self.assertCountEqual(place['labels'], ['Spicy', 'cheap'])
        self.assertTrue(MasterOption.objects.filter(kind='type', value='Cafe', rank=2).exists())
        self.assertEqual(AuditLog.objects.get(action='create').person, self.ana)

    def test_add_validates_like_the_sheet(self):
        for fields, message in [({'name': ''}, 'Name is required'),
                                ({'mapsLink': 'https://evil.example/x'}, 'Google Maps link'),
                                ({'instagram': 'https://evil.example'}, 'Instagram'),
                                ({'labels': ['x' * 41]}, 'too long'),
                                ({'secret': 1}, 'cannot be edited'),
                                ({'landmark': 'x' * 201}, 'too long')]:
            response = self.add(**fields)
            self.assertEqual(response.status_code, 400, fields)
            self.assertIn(message, response.json()['error'])
        self.assertEqual(Place.objects.count(), 0)

    def test_edit_with_version_check_ratings_and_audit(self):
        place = self.add().json()['place']
        changes = {'version': place['version'], 'changes': {'city': 'Bandung', 'tried': True},
                   'ratings': {str(self.budi.id): {'score': 'HEAVEN!', 'review': 'Yes!'}}}
        response = self.call('patch', f'/api/places/{place["id"]}', changes)
        self.assertEqual(response.status_code, 200)
        edited = response.json()['place']
        self.assertEqual((edited['city'], edited['tried'], edited['version']), ('Bandung', True, 2))
        self.assertEqual(edited['ratings'][str(self.budi.id)], {'score': 'HEAVEN!', 'review': 'Yes!'})
        log = AuditLog.objects.get(action='update')
        self.assertEqual(log.changes['city'], ['', 'Bandung'])
        stale = self.call('patch', f'/api/places/{place["id"]}', {**changes, 'changes': {'city': 'Bogor'}})
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(Place.objects.get().city, 'Bandung')

    def test_edit_rejects_unknown_rating_and_missing_version(self):
        place = self.add().json()['place']
        bad_rating = self.call('patch', f'/api/places/{place["id"]}',
                               {'version': 1, 'ratings': {str(self.ana.id): {'score': '11'}}})
        self.assertIn('Unknown rating', bad_rating.json()['error'])
        self.assertEqual(self.call('patch', f'/api/places/{place["id"]}', {'changes': {}}).status_code, 400)
        self.assertEqual(PlaceRating.objects.count(), 0)

    def test_unknown_place_is_404(self):
        self.assertEqual(self.call('patch', '/api/places/not-a-uuid', {'version': 1}).status_code, 404)

    def test_bootstrap_has_everything(self):
        place_id = self.add(labels=['Spicy']).json()['place']['id']
        Dish.objects.create(place_id=place_id, name='Soto')
        Collection.objects.create(name='Trip')
        body = self.call('get', '/api/bootstrap').json()
        self.assertEqual([p['name'] for p in body['people']], ['Ana', 'Budi'])
        self.assertEqual(body['options']['rating'], ['7', '8', 'HEAVEN!'])
        self.assertEqual((len(body['places']), len(body['dishes']), len(body['collections'])), (1, 1, 1))
        self.assertEqual(body['places'][0]['labels'], ['Spicy'])


class DishTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.place = Place.objects.create(name='Warung A')

    def test_starred_dishes_set_best_dish_without_bumping_version(self):
        a = self.call('post', '/api/dishes', {'place': str(self.place.id), 'name': 'Soto', 'best': True}).json()
        b = self.call('post', '/api/dishes', {'place': str(self.place.id), 'name': 'Sate', 'best': True}).json()
        self.assertEqual(b['bestDish'], 'Soto, Sate')
        unstar = self.call('patch', f'/api/dishes/{a["dish"]["id"]}', {'best': False}).json()
        self.assertEqual((unstar['bestDish'], unstar['dish']['name']), ('Sate', 'Soto'))
        deleted = self.call('delete', f'/api/dishes/{b["dish"]["id"]}').json()
        self.assertEqual(deleted['bestDish'], '')
        self.place.refresh_from_db()
        self.assertEqual((self.place.best_dish, self.place.version), ('', 1))

    def test_dish_validation(self):
        response = self.call('post', '/api/dishes', {'place': str(self.place.id), 'name': 'Soto', 'liked': 'Maybe'})
        self.assertIn('Liked must be', response.json()['error'])
        self.assertEqual(self.call('post', '/api/dishes', {'place': str(self.place.id)}).status_code, 400)


class CollectionTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.places = [Place.objects.create(name=f'Place {i}') for i in range(3)]
        self.collection = self.call('post', '/api/collections', {'name': 'Saigon trip'}).json()['collection']
        self.url = f'/api/collections/{self.collection["id"]}'

    def test_add_is_idempotent_and_remove_works(self):
        ids = [str(p.id) for p in self.places[:2]]
        self.call('post', f'{self.url}/places', {'placeIds': ids})
        again = self.call('post', f'{self.url}/places', {'placeIds': ids + [str(self.places[2].id)]}).json()
        self.assertEqual(len(again['collection']['placeIds']), 3)
        left = self.call('delete', f'{self.url}/places/{self.places[0].id}').json()
        self.assertEqual(len(left['collection']['placeIds']), 2)
        self.assertEqual(Collection.objects.get().created_by, self.ana)

    def test_unknown_places_add_nothing(self):
        response = self.call('post', f'{self.url}/places', {'placeIds': [str(self.places[0].id), 'nope']})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(Collection.objects.get().entries.count(), 0)

    def test_rename_with_version_and_delete(self):
        renamed = self.call('patch', self.url, {'version': 1, 'name': 'Hanoi'}).json()['collection']
        self.assertEqual((renamed['name'], renamed['version']), ('Hanoi', 2))
        self.assertEqual(self.call('patch', self.url, {'version': 1, 'note': 'x'}).status_code, 409)
        self.assertEqual(self.call('patch', self.url, {'version': 2, 'name': ''}).status_code, 400)
        self.assertEqual(self.call('delete', self.url).status_code, 200)
        self.assertEqual(Place.objects.count(), 3)  # deleting a collection keeps its places


class WrapperTests(ApiTestCase):
    def test_wrong_method_bad_json_and_no_cache(self):
        self.assertEqual(self.call('get', '/api/places').status_code, 405)
        bad = self.client.post('/api/places', data='{', content_type='application/json', **self.auth)
        self.assertEqual(bad.json(), {'ok': False, 'error': 'Bad JSON'})
        self.assertEqual(self.call('get', '/api/bootstrap')['Cache-Control'], 'no-store')

    def test_labels_are_shared_ignoring_case(self):
        self.call('post', '/api/places', {'fields': {'name': 'A', 'labels': ['Spicy']}})
        self.call('post', '/api/places', {'fields': {'name': 'B', 'labels': ['SPICY']}})
        self.assertEqual(Label.objects.count(), 1)
