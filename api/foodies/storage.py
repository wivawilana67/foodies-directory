"""Own photos in the Cloud Storage bucket PHOTO_BUCKET (D44, D47, D50).

Upload: the API signs two short-lived PUT URLs (full 1600 px and thumb 320 px JPEG, made on the phone); the phone
uploads straight to the bucket; then the API checks both objects (exist, JPEG, size) before saving the Photo row.
Object names are random UUIDs chosen by the server, never by the phone. Objects are readable by URL (a custom role with
storage.objects.get for allUsers, no listing), keeping the "anyone with the link" model of D36.

On Cloud Run there is no private key: URLs are signed through the IAM signBlob API, which needs api-runtime to hold
Service Account Token Creator on itself (Phase 3 setup round)."""
import functools
import logging
from datetime import timedelta

from django.conf import settings

from foodies.auth import ApiError

log = logging.getLogger(__name__)
JPEG_START = b'\xff\xd8\xff'
UPLOAD_MINUTES = 10


def _require_bucket():
    if not settings.PHOTO_BUCKET:
        raise ApiError('Photo storage is not configured on the server', 503)


@functools.cache
def _client():
    from google.cloud import storage
    return storage.Client()


def bucket():
    _require_bucket()
    try:
        return _client().bucket(settings.PHOTO_BUCKET)
    except Exception as e:  # no Google credentials, e.g. local Docker
        log.error('storage: no client: %s', type(e).__name__)
        raise ApiError('Photo storage is not configured on the server', 503) from e


def keys_for(photo_id):
    return f'photos/{photo_id}.jpg', f'photos/{photo_id}-thumb.jpg'


def public_url(key):
    return f'https://storage.googleapis.com/{settings.PHOTO_BUCKET}/{key}'


def upload_headers():
    """Headers the phone must send with its PUT; the size range makes Cloud Storage refuse bigger files
    (enforcement for V4 signed PUTs is Unverified, so register_upload checks the size again)."""
    return {'Content-Type': 'image/jpeg', 'x-goog-content-length-range': f'0,{settings.MAX_PHOTO_BYTES}'}


def signed_put_url(key):
    import google.auth
    from google.auth.transport import requests as google_requests

    blob = bucket().blob(key)
    try:
        credentials, _ = google.auth.default()
        credentials.refresh(google_requests.Request())
        return blob.generate_signed_url(
            version='v4', method='PUT', expiration=timedelta(minutes=UPLOAD_MINUTES), headers=upload_headers(),
            service_account_email=credentials.service_account_email, access_token=credentials.token)
    except ApiError:
        raise
    except Exception as e:
        log.exception('storage: could not sign an upload URL')
        raise ApiError('Could not prepare the upload, try again', 503) from e


def check_uploaded(key):
    """Raises ApiError unless the object exists, is at most MAX_PHOTO_BYTES and starts like a JPEG.
    A bad upload is deleted."""
    blob = bucket().get_blob(key)
    if blob is None:
        raise ApiError('Upload not found; try again')
    if blob.size > settings.MAX_PHOTO_BYTES:
        blob.delete()
        raise ApiError('Photo is too large')
    if blob.download_as_bytes(start=0, end=len(JPEG_START) - 1) != JPEG_START:
        blob.delete()
        raise ApiError('Only JPEG photos are accepted')


def upload_bytes(key, data, content_type):
    bucket().blob(key).upload_from_string(data, content_type=content_type)


def delete_objects(keys):
    """Deletes objects; one already gone is logged, not an error (the database is the source of truth).
    The bucket's soft delete keeps deleted objects recoverable for a while."""
    from google.api_core.exceptions import NotFound

    for key in filter(None, keys):
        try:
            bucket().blob(key).delete()
        except NotFound:
            log.warning('storage: %s was already gone', key)
