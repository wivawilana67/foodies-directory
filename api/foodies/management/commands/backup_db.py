"""Nightly backup (D63): pg_dump of the whole database into the private backup bucket, checked before upload.

Runs as the Cloud Run job `foodies-backup` (started each night by Cloud Scheduler) under the `backup-runner`
service account, which may only create objects in the bucket: it cannot read, overwrite or delete a backup.
Each run writes `foodies-<Jakarta date>-<time>.dump` (pg_dump custom format, compressed) plus a `.sha256` file;
the bucket's lifecycle rule deletes copies after 30 days. Restore: README → "Restore a backup".

    BACKUP_BUCKET=<bucket> python manage.py backup_db
"""
import hashlib
import logging
import os
import subprocess
import tempfile
from urllib.parse import quote, urlsplit, urlunsplit

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

log = logging.getLogger(__name__)
UPLOAD_URL = 'https://storage.googleapis.com/upload/storage/v1/b/{bucket}/o'
MUST_HAVE = 'TABLE DATA public places'  # a dump that reads back without this is not a usable backup


def direct_url(url):
    """Neon's pooled host (`…-pooler.…`) runs PgBouncer in transaction mode; pg_dump should use the direct host."""
    parts = urlsplit(url)
    return urlunsplit(parts._replace(netloc=parts.netloc.replace('-pooler.', '.')))


def upload(session, bucket, name, path, content_type):
    """Uploads one object; `ifGenerationMatch=0` refuses to replace an existing one."""
    with open(path, 'rb') as f:
        response = session.post(UPLOAD_URL.format(bucket=quote(bucket, safe='')),
                                params={'uploadType': 'media', 'name': name, 'ifGenerationMatch': '0'},
                                data=f, headers={'Content-Type': content_type}, timeout=300)
    if response.status_code != 200:
        raise CommandError(f'Upload of {name} failed with status {response.status_code}')


class Command(BaseCommand):
    help = 'Back up the database to the BACKUP_BUCKET Cloud Storage bucket (checked with pg_restore first).'

    def handle(self, *args, **options):
        bucket = os.environ.get('BACKUP_BUCKET', '')
        database_url = os.environ.get('DATABASE_URL', '')
        if not bucket or not database_url:
            raise CommandError('BACKUP_BUCKET and DATABASE_URL must be set')
        name = f"foodies-{timezone.localtime():%Y-%m-%d-%H%M}.dump"
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, name)
            # The connection string is passed as an argument, never logged; errors show pg_dump's own message.
            dump = subprocess.run(['pg_dump', '--format=custom', '--no-owner', '--no-privileges', '--file', path,
                                   '--dbname', direct_url(database_url)], capture_output=True, text=True)
            if dump.returncode:
                raise CommandError(f'pg_dump failed: {dump.stderr.strip()[-500:]}')
            check = subprocess.run(['pg_restore', '--list', path], capture_output=True, text=True)
            if check.returncode or MUST_HAVE not in check.stdout:
                raise CommandError(f'The dump did not read back completely: {check.stderr.strip()[-500:]}')
            digest = hashlib.sha256()
            with open(path, 'rb') as f:
                for block in iter(lambda: f.read(1 << 20), b''):
                    digest.update(block)
            sha_path = path + '.sha256'
            with open(sha_path, 'w') as f:
                f.write(f'{digest.hexdigest()}  {name}\n')  # the format `sha256sum -c` reads

            import google.auth  # only needed here; tests replace the session
            from google.auth.transport.requests import AuthorizedSession
            credentials, _ = google.auth.default(scopes=['https://www.googleapis.com/auth/devstorage.read_write'])
            session = AuthorizedSession(credentials)
            upload(session, bucket, name, path, 'application/octet-stream')
            upload(session, bucket, name + '.sha256', sha_path, 'text/plain')
            size = os.path.getsize(path)
        log.info('backup: uploaded %s (%d bytes)', name, size)
        self.stdout.write(f'Backed up {name} ({size} bytes)')
