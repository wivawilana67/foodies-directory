"""backup_db: a real pg_dump of the test database, checked with pg_restore; Google's upload is replaced."""
import hashlib
import os
import re
from unittest import mock

from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection
from django.test import TransactionTestCase

from foodies.management.commands.backup_db import direct_url
from foodies.models import Place


class FakeResponse:
    def __init__(self, status_code):
        self.status_code = status_code


class FakeSession:
    def __init__(self, status=200):
        self.status, self.posts = status, []

    def post(self, url, params, data, headers, timeout):
        self.posts.append({'url': url, 'params': params, 'body': data.read(), 'type': headers['Content-Type']})
        return FakeResponse(self.status)


def test_database_url(password=None):
    s = connection.settings_dict
    return f"postgres://{s['USER']}:{password or s['PASSWORD']}@{s['HOST']}:{s['PORT'] or 5432}/{s['NAME']}"


class BackupTests(TransactionTestCase):
    def run_backup(self, session, url=None):
        env = {'BACKUP_BUCKET': 'foodies-backups-test', 'DATABASE_URL': url or test_database_url()}
        with mock.patch.dict(os.environ, env), \
                mock.patch('google.auth.default', return_value=(None, None)), \
                mock.patch('google.auth.transport.requests.AuthorizedSession', return_value=session):
            call_command('backup_db', stdout=open(os.devnull, 'w'))

    def test_dump_is_checked_and_uploaded_without_overwriting(self):
        Place.objects.create(name='Backup Test Warung')
        session = FakeSession()
        self.run_backup(session)
        dump, sha = session.posts
        self.assertRegex(dump['params']['name'], r'^foodies-\d{4}-\d{2}-\d{2}-\d{4}\.dump$')
        self.assertEqual(sha['params']['name'], dump['params']['name'] + '.sha256')
        self.assertTrue(all(p['params']['ifGenerationMatch'] == '0' for p in session.posts))
        self.assertIn('/b/foodies-backups-test/o', dump['url'])
        self.assertTrue(dump['body'].startswith(b'PGDMP'))  # pg_dump custom format
        self.assertEqual(sha['body'].decode(), f"{hashlib.sha256(dump['body']).hexdigest()}  {dump['params']['name']}\n")

    def test_failed_upload_fails_the_job(self):
        with self.assertRaisesMessage(CommandError, 'failed with status 403'):
            self.run_backup(FakeSession(status=403))

    def test_failed_dump_does_not_upload_or_show_the_password(self):
        session = FakeSession()
        with self.assertRaises(CommandError) as raised:
            self.run_backup(session, test_database_url(password='wrong-secret-123'))
        self.assertNotIn('wrong-secret-123', str(raised.exception))
        self.assertEqual(session.posts, [])

    def test_settings_are_required(self):
        with mock.patch.dict(os.environ, {'BACKUP_BUCKET': ''}), self.assertRaisesMessage(CommandError, 'must be set'):
            call_command('backup_db')

    def test_neon_pooled_host_becomes_direct(self):
        self.assertEqual(direct_url('postgres://u:p@ep-cool-1-pooler.ap-southeast-1.aws.neon.tech/foodies?sslmode=require'),
                         'postgres://u:p@ep-cool-1.ap-southeast-1.aws.neon.tech/foodies?sslmode=require')
        self.assertEqual(direct_url('postgres://u:p@db:5432/foodies'), 'postgres://u:p@db:5432/foodies')
        self.assertFalse(re.search('pooler', direct_url('postgres://a-pooler.b/c')))
