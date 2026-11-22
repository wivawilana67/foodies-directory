from datetime import timedelta
from unittest import mock

from django.test import SimpleTestCase, override_settings
from django.utils import timezone

from foodies.auth import ApiError
from foodies.maps_link import extract_url, parse_maps_link, resolve_maps_link, resolve_share_link
from foodies.models import LookupCache, Place, PlacesUsage
from foodies.test_api import ApiTestCase

GOOGLE_RESULT = {
    'id': 'ChIJabcdefghij123', 'displayName': {'text': 'Warung A'}, 'formattedAddress': 'Jl. A 1, Jakarta',
    'location': {'latitude': -6.195, 'longitude': 106.823}, 'primaryType': 'restaurant',
    'primaryTypeDisplayName': {'text': 'Restaurant'}, 'googleMapsUri': 'https://maps.google.com/?cid=1',
    'addressComponents': [
        {'longText': 'Menteng', 'types': ['sublocality_level_1', 'sublocality']},
        {'longText': 'Central Jakarta', 'types': ['locality']},
        {'longText': 'Indonesia', 'types': ['country']},
    ],
}


def places_response(body, status=200):
    response = mock.Mock(status_code=status, text='{}')
    response.json.return_value = body
    return response


def redirect(location, status=302):
    return mock.Mock(status_code=status, headers={'Location': location} if location else {})


class MapsLinkTests(SimpleTestCase):
    def test_extract_url_from_shared_text(self):
        self.assertEqual(extract_url('Warung A\nhttps://maps.app.goo.gl/abc123 enjoy'), 'https://maps.app.goo.gl/abc123')
        self.assertEqual(extract_url('just a name'), '')

    def test_parse_long_links(self):
        url = ('https://www.google.com/maps/place/Warung+A/@-6.19,106.82,17z/data=!3m1!4b1!4m6!3m5'
               '!1s0x0:0x1!8m2!3d-6.195!4d106.823!16s%2Fg%2F1!19sChIJabcdefghij123')
        self.assertEqual(parse_maps_link(url), {'place_id': 'ChIJabcdefghij123', 'name': 'Warung A',
                                                'near': {'lat': -6.195, 'lng': 106.823}})
        search = 'https://www.google.com/maps/search/?api=1&query=Soto+Betawi&query_place_id=ChIJxyzxyzxyz1'
        self.assertEqual(parse_maps_link(search)['place_id'], 'ChIJxyzxyzxyz1')
        self.assertEqual(parse_maps_link('https://maps.google.com/?q=Soto+Betawi')['name'], 'Soto Betawi')
        coords = parse_maps_link('https://maps.google.com/?q=-6.2,106.8')
        self.assertEqual((coords['name'], coords['near']), ('', {'lat': -6.2, 'lng': 106.8}))

    @mock.patch('foodies.maps_link.requests.get')
    def test_short_link_followed_one_hop_at_a_time(self, get):
        get.return_value = redirect('https://www.google.com/maps/place/Warung+A/@-6.19,106.82,17z')
        self.assertTrue(resolve_maps_link('https://maps.app.goo.gl/abc').startswith('https://www.google.com/maps/place/'))
        self.assertFalse(get.call_args.kwargs['allow_redirects'])

    @mock.patch('foodies.maps_link.requests.get')
    def test_never_follows_a_redirect_off_google(self, get):
        get.return_value = redirect('https://evil.example/steal')
        with self.assertRaisesMessage(ApiError, 'did not lead to Google Maps'):
            resolve_maps_link('https://maps.app.goo.gl/abc')
        self.assertEqual(get.call_count, 1)
        with self.assertRaises(ApiError):
            resolve_maps_link('https://evil.example/x')

    @mock.patch('foodies.maps_link.requests.get')
    def test_share_link_to_search_gives_the_name(self, get):
        get.return_value = redirect('https://www.google.com/search?q=Warung+A+Jakarta&kgmid=x')
        self.assertEqual(resolve_share_link('https://share.google/abc'), {'name': 'Warung A Jakarta'})


@override_settings(PLACES_API_KEY='test-key', PLACES_DAILY_LIMIT=3, PLACES_MONTHLY_LIMIT=900)
class LookupAndAddTests(ApiTestCase):
    def lookup(self, text):
        return self.call('post', '/api/lookup', {'input': text})

    @mock.patch('foodies.places.requests.request')
    def test_typed_name_searches_and_caches(self, request):
        request.return_value = places_response({'places': [GOOGLE_RESULT]})
        response = self.lookup('warung a jakarta')
        self.assertEqual(response.status_code, 200)
        place = response.json()['places'][0]
        self.assertEqual((place['name'], place['city'], place['district'], place['country']),
                         ('Warung A', 'Central Jakarta', 'Menteng', 'Indonesia'))
        method, url = request.call_args.args
        self.assertEqual((method, url), ('POST', 'https://places.googleapis.com/v1/places:searchText'))
        self.assertEqual(request.call_args.kwargs['headers']['X-Goog-Api-Key'], 'test-key')
        self.assertIn('places.addressComponents', request.call_args.kwargs['headers']['X-Goog-FieldMask'])
        self.assertEqual(request.call_args.kwargs['json']['languageCode'], 'en')
        self.assertTrue(LookupCache.objects.filter(place_id='ChIJabcdefghij123').exists())

    @mock.patch('foodies.places.requests.request')
    @mock.patch('foodies.maps_link.requests.get')
    def test_maps_link_with_place_id_uses_get_place(self, get, request):
        get.return_value = redirect('https://www.google.com/maps/place/Warung+A/data=!19sChIJabcdefghij123')
        request.return_value = places_response(GOOGLE_RESULT)
        self.assertEqual(self.lookup('look https://maps.app.goo.gl/xyz').status_code, 200)
        self.assertEqual(request.call_args.args[0], 'GET')
        self.assertIn('places/ChIJabcdefghij123?languageCode=en', request.call_args.args[1])

    def test_other_links_are_refused_without_a_paid_call(self):
        response = self.lookup('https://example.com/place')
        self.assertIn('Only Google Maps', response.json()['error'])
        self.assertEqual(PlacesUsage.objects.count(), 0)

    @mock.patch('foodies.places.requests.request')
    def test_daily_limit_refuses_and_counts_month(self, request):
        request.return_value = places_response({'places': []})
        for _ in range(3):
            self.assertEqual(self.lookup('soto').status_code, 200)
        refused = self.lookup('soto')
        self.assertEqual(refused.status_code, 429)
        self.assertIn('Daily lookup limit reached (3)', refused.json()['error'])
        self.assertEqual(request.call_count, 3)
        today = timezone.localdate().isoformat()
        self.assertEqual(PlacesUsage.objects.get(period=today[:7]).count, 3)

    @mock.patch('foodies.places.requests.request')
    def test_google_error_is_reported(self, request):
        request.return_value = places_response({}, status=403)
        self.assertEqual(self.lookup('soto').json()['error'], 'Places API error 403')

    @override_settings(PLACES_API_KEY='')
    def test_not_configured(self):
        self.assertEqual(self.lookup('soto').status_code, 503)

    @mock.patch('foodies.places.requests.request')
    def test_add_from_lookup_uses_cache_and_phone_fields_win(self, request):
        request.return_value = places_response({'places': [GOOGLE_RESULT]})
        self.lookup('warung a')
        response = self.call('post', '/api/places', {'placeId': 'ChIJabcdefghij123',
                                                     'fields': {'city': 'Jakarta', 'name': '', 'type': 'Restaurant'}})
        self.assertEqual(request.call_count, 1)  # no second paid call
        place = response.json()['place']
        self.assertEqual((place['name'], place['city'], place['district'], place['lookupStatus']),
                         ('Warung A', 'Jakarta', 'Menteng', 'added'))
        self.assertEqual((place['lat'], place['lng'], place['placeId']), (-6.195, 106.823, 'ChIJabcdefghij123'))
        again = self.call('post', '/api/places', {'placeId': 'ChIJabcdefghij123', 'fields': {}}).json()
        self.assertEqual((again['duplicate'], again['place']['id']), (True, place['id']))
        self.assertEqual(Place.objects.count(), 1)

    @mock.patch('foodies.places.requests.request')
    def test_add_after_cache_expired_fetches_once(self, request):
        LookupCache.objects.create(place_id='ChIJabcdefghij123', data={},
                                   created_at=timezone.now() - timedelta(minutes=11))
        request.return_value = places_response(GOOGLE_RESULT)
        response = self.call('post', '/api/places', {'placeId': 'ChIJabcdefghij123', 'fields': {}})
        self.assertEqual(response.json()['place']['name'], 'Warung A')
        self.assertEqual(request.call_args.args[0], 'GET')

    def test_add_rejects_a_malformed_place_id(self):
        response = self.call('post', '/api/places', {'placeId': '../../etc', 'fields': {}})
        self.assertEqual(response.json()['error'], 'Bad place ID')
