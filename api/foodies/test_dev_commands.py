from io import StringIO

from django.core.management import CommandError, call_command
from django.test import TestCase, override_settings

from foodies.models import Dish, MasterOption, Person, Place

EMAILS = ['person1@example.com', 'person2@example.com']


@override_settings(DEBUG=True, ALLOWED_EMAILS=EMAILS)
class DevCommandTests(TestCase):
    def test_seed_sample_fills_an_empty_database_once(self):
        call_command('seed_sample', stdout=StringIO())
        self.assertEqual(Place.objects.count(), 16)
        self.assertTrue(Dish.objects.filter(best=True).exists())
        self.assertEqual(MasterOption.objects.filter(kind='rating').order_by('-rank').first().value, 'HEAVEN!')
        with self.assertRaises(CommandError):
            call_command('seed_sample', stdout=StringIO())

    def test_dev_token_signs_in_as_the_person(self):
        out = StringIO()
        call_command('dev_token', '--person', '2', stdout=out, stderr=StringIO())
        me = self.client.get('/api/auth/me', HTTP_AUTHORIZATION='Bearer ' + out.getvalue().strip())
        self.assertEqual(me.status_code, 200)
        self.assertEqual(Person.objects.get(position=2).email, EMAILS[1])

    def test_dev_commands_refuse_outside_debug(self):
        with override_settings(DEBUG=False):
            for command in ('seed_sample', 'dev_token'):
                with self.assertRaises(CommandError):
                    call_command(command, stdout=StringIO(), stderr=StringIO())
        self.assertFalse(Place.objects.exists())
