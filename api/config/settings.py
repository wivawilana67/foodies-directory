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

# Under /api/ so Firebase Hosting's /api/** rewrite reaches them too. runserver serves admin CSS locally (DEBUG);
# serving it on Cloud Run is open (docs/decisions.md D53).
STATIC_URL = '/api/static/'

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
