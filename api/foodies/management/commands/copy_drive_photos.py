"""Copy photos imported from the old Drive folder (Photo.drive_id set, no bucket key yet) into PHOTO_BUCKET.

Each photo is fetched twice through Drive's thumbnail URL, the same one the live app shows (1600 px full, 320 px
thumb; undocumented, D36, so Unverified), because the files are shared "anyone with the link". Only Google hosts are
fetched. Re-runnable: copied photos are skipped. Needs Google credentials, so it runs as a Cloud Run job, not locally.

    python manage.py copy_drive_photos [--limit 50] [--dry-run]
"""
from urllib.parse import urlsplit

import requests
from django.core.management.base import BaseCommand

from foodies import storage
from foodies.models import Photo

DRIVE_THUMB = 'https://drive.google.com/thumbnail?id={id}&sz=w{width}'
FETCH_TIMEOUT = 30


def is_google_host(url):
    host = (urlsplit(url).hostname or '').lower()
    return host == 'drive.google.com' or host.endswith('.googleusercontent.com')


def fetch_image(drive_id, width):
    response = requests.get(DRIVE_THUMB.format(id=drive_id, width=width), timeout=FETCH_TIMEOUT)
    if not all(is_google_host(r.url) for r in [*response.history, response]):
        raise ValueError('redirected outside Google')
    content_type = response.headers.get('Content-Type', '').split(';')[0]
    if response.status_code != 200 or not content_type.startswith('image/'):
        raise ValueError(f'HTTP {response.status_code}, {content_type or "no content type"}')
    return response.content, content_type


class Command(BaseCommand):
    help = 'Copy Drive photos (drive_id, no key yet) into the photo bucket (re-runnable).'

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=0, help='Copy at most this many photos (0 = all)')
        parser.add_argument('--dry-run', action='store_true', help='Only count what would be copied')

    def handle(self, *args, **opts):
        todo = Photo.objects.filter(key='').exclude(drive_id='').order_by('added_at')
        if opts['limit']:
            todo = todo[:opts['limit']]
        todo = list(todo)
        if opts['dry_run']:
            self.stdout.write(f'Dry run: {len(todo)} photos to copy')
            return
        storage.bucket()  # fail early if the bucket is not configured
        copied, failed = 0, 0
        for photo in todo:
            full, thumb = storage.keys_for(photo.id)
            try:
                for key, width in ((full, 1600), (thumb, 320)):
                    data, content_type = fetch_image(photo.drive_id, width)
                    storage.upload_bytes(key, data, content_type)
            except (ValueError, requests.RequestException) as e:
                failed += 1
                self.stderr.write(f'warning: photo {photo.id} (Drive {photo.drive_id}) not copied: {e}')
                continue
            Photo.objects.filter(pk=photo.pk).update(key=full, thumb_key=thumb)
            copied += 1
        self.stdout.write(f'Copied {copied} photos, {failed} failed')
