from django.test import TestCase


class HealthTests(TestCase):
    def test_ok_with_database(self):
        response = self.client.get('/api/health')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'ok': True})

    def test_get_only(self):
        self.assertEqual(self.client.post('/api/health').status_code, 405)
