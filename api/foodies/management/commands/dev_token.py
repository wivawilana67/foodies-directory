"""Print an app token for local development, where Google Sign-In is not configured.

Local only: refuses unless DJANGO_DEBUG=1 (never set on Cloud Run). The person is the one at --person in
ALLOWED_EMAILS (docker-compose.yml sets two example.com addresses), created or matched like a real sign-in.
Paste the token into the sign-in screen of the Vite dev server (http://localhost:5173).

    python manage.py dev_token [--person 2]
"""
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from foodies.auth import issue_token, person_for_email


class Command(BaseCommand):
    help = 'Print an app token for local development (DJANGO_DEBUG=1 only).'

    def add_arguments(self, parser):
        parser.add_argument('--person', type=int, default=1, help='Position in ALLOWED_EMAILS (1 or 2)')

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError('dev_token runs only with DJANGO_DEBUG=1 (local development)')
        position = options['person']
        if not 1 <= position <= len(settings.ALLOWED_EMAILS):
            raise CommandError('ALLOWED_EMAILS has no email at that position')
        person = person_for_email(settings.ALLOWED_EMAILS[position - 1], f'Person {position}')
        self.stderr.write(f'Token for {person.name} (valid {settings.APP_TOKEN_MAX_AGE // 86400} days):')
        self.stdout.write(issue_token(person))
