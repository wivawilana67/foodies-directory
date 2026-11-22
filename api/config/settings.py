# Settings come from environment variables: docker-compose.yml locally, Secret Manager on Cloud Run.
import os
from pathlib import Path

import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ['DJANGO_SECRET_KEY']
DEBUG = os.environ.get('DJANGO_DEBUG') == '1'
# Cloud Run and Firebase Hosting pick the host name; every API call is authenticated in the app.
ALLOWED_HOSTS = os.environ.get('DJANGO_ALLOWED_HOSTS', '*').split(',')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'foodies',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'

TEMPLATES = [{
    'BACKEND': 'django.template.backends.django.DjangoTemplates',
    'APP_DIRS': True,
    'OPTIONS': {'context_processors': [
        'django.template.context_processors.request',
        'django.contrib.auth.context_processors.auth',
        'django.contrib.messages.context_processors.messages',
    ]},
}]

# Admin CSS/JS: collected into the image (Dockerfile) and served by WhiteNoise, under /api/ so Firebase Hosting's
# /api/** rewrite reaches them too.
STATIC_URL = '/api/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Firebase Hosting forwards only a cookie named __session to Cloud Run, so the admin's session uses that name and
# keeps its CSRF token in the session instead of a separate cookie. The phone API uses a header token, not cookies.
SESSION_COOKIE_NAME = '__session'
CSRF_USE_SESSIONS = True
SESSION_COOKIE_SECURE = CSRF_COOKIE_SECURE = not DEBUG
CSRF_TRUSTED_ORIGINS = [o for o in os.environ.get('DJANGO_CSRF_TRUSTED_ORIGINS', '').split(',') if o]

# Google Sign-In (D43): the OAuth client ID the phone signs in with, and the two allowed emails in Person
# position order ("first@gmail.com,second@gmail.com"). Sign-in answers "not configured" until both are set.
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')
ALLOWED_EMAILS = [e.strip().lower() for e in os.environ.get('ALLOWED_EMAILS', '').split(',') if e.strip()]
APP_TOKEN_MAX_AGE = 30 * 24 * 3600  # seconds a signed app token stays valid

# Places API (New) (D6, D7): server key from Secret Manager; lookups refused past these counts (Asia/Jakarta days).
PLACES_API_KEY = os.environ.get('PLACES_API_KEY', '')
PLACES_DAILY_LIMIT = int(os.environ.get('DAILY_LIMIT', '50'))
PLACES_MONTHLY_LIMIT = int(os.environ.get('MONTHLY_LIMIT', '900'))
LOOKUP_CACHE_SECONDS = 600

DATABASES = {'default': dj_database_url.parse(os.environ['DATABASE_URL'], conn_max_age=60, conn_health_checks=True)}
# Neon's pooled connection (PgBouncer, transaction mode) cannot keep server-side cursors open between queries.
DATABASES['default']['DISABLE_SERVER_SIDE_CURSORS'] = True
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

LANGUAGE_CODE = 'en'
TIME_ZONE = 'Asia/Jakarta'
USE_TZ = True

# Cloud Run terminates HTTPS and forwards the original scheme.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {'console': {'class': 'logging.StreamHandler'}},
    'root': {'handlers': ['console'], 'level': 'INFO'},
}
