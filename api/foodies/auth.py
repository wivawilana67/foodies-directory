"""Sign-in (D43) and the request wrapper every API view uses.

Flow: the phone signs in with Google (Google Identity Services) and sends the Google ID token once to
POST /api/auth/google. It is checked with Google's library (signature, audience = our client ID, expiry,
verified email) and the email must be in ALLOWED_EMAILS. The API then returns its own signed app token,
which the phone sends as `Authorization: Bearer <token>` on every call. A header instead of a cookie,
because Firebase Hosting forwards only the `__session` cookie and a header needs no CSRF protection.
"""
import json
import logging
from functools import wraps

from django.conf import settings
from django.core import signing
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from foodies.models import Person

log = logging.getLogger(__name__)
TOKEN_SALT = 'foodies.app-token'


class ApiError(Exception):
    """An error whose message is safe to show on the phone."""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.message, self.status = message, status


def verify_google_credential(credential):
    """Returns the verified email from a Google ID token, or raises ApiError."""
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    if not settings.GOOGLE_CLIENT_ID or not settings.ALLOWED_EMAILS:
        raise ApiError('Sign-in is not configured on the server', 503)
    if not isinstance(credential, str) or not credential:
        raise ApiError('Missing Google credential')
    try:
        info = id_token.verify_oauth2_token(credential, google_requests.Request(), settings.GOOGLE_CLIENT_ID)
    except ValueError as e:
        log.warning('auth: Google token rejected: %s', e)
        raise ApiError('Google sign-in failed, try again', 401) from e
    if not info.get('email_verified'):
        raise ApiError('This Google account has no verified email', 403)
    return info['email'].lower(), info.get('given_name') or info.get('name') or ''


def person_for_email(email, display_name):
    """The Person allowed for this email: ALLOWED_EMAILS order matches Person.position."""
    if email not in settings.ALLOWED_EMAILS:
        log.warning('auth: refused an email that is not on the allowlist')
        raise ApiError('This Google account is not allowed to use this app', 403)
    position = settings.ALLOWED_EMAILS.index(email) + 1
    person, _ = Person.objects.get_or_create(position=position, defaults={'name': display_name or email})
    if person.email != email:
        person.email = email
        person.save(update_fields=['email'])
    return person


def issue_token(person):
    return signing.dumps({'p': person.pk, 'v': person.token_version}, salt=TOKEN_SALT, compress=True)


def person_from_request(request):
    header = request.headers.get('Authorization', '')
    if not header.startswith('Bearer '):
        raise ApiError('Please sign in', 401)
    try:
        data = signing.loads(header[7:], salt=TOKEN_SALT, max_age=settings.APP_TOKEN_MAX_AGE)
    except signing.BadSignature as e:  # includes SignatureExpired
        raise ApiError('Your sign-in has expired, please sign in again', 401) from e
    person = Person.objects.filter(pk=data.get('p')).first()
    if not person or person.token_version != data.get('v') or person.email not in settings.ALLOWED_EMAILS:
        raise ApiError('Please sign in again', 401)
    return person


def api(*methods, auth=True):
    """Wraps a view: allowed methods, sign-in check, JSON body in request.data, JSON reply {"ok": true, ...},
    clear errors. CSRF is off for these views because they use the Authorization header, not cookies."""

    def decorate(view):
        @csrf_exempt
        @wraps(view)
        def wrapper(request, *args, **kwargs):
            try:
                if request.method not in methods:
                    raise ApiError('Method not allowed', 405)
                request.person = person_from_request(request) if auth else None
                request.data = {}
                if request.method in ('POST', 'PATCH') and request.body:
                    try:
                        request.data = json.loads(request.body)
                    except ValueError as e:
                        raise ApiError('Bad JSON') from e
                    if not isinstance(request.data, dict):
                        raise ApiError('Bad JSON')
                response = JsonResponse({'ok': True, **view(request, *args, **kwargs)})
            except ApiError as e:
                response = JsonResponse({'ok': False, 'error': e.message}, status=e.status)
            except Exception:
                log.exception('%s %s failed', request.method, request.path)
                response = JsonResponse({'ok': False, 'error': 'Something went wrong on the server'}, status=500)
            response['Cache-Control'] = 'no-store'  # never cached by Firebase Hosting or the phone
            return response

        return wrapper

    return decorate
