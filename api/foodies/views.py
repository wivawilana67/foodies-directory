import logging

from django.db import connection
from django.http import JsonResponse
from django.views.decorators.http import require_GET

log = logging.getLogger(__name__)


@require_GET
def health(request):
    """Liveness plus one database round trip, so a deploy proves the database connection works."""
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
    except Exception:
        log.exception('health: database check failed')
        return JsonResponse({'ok': False, 'error': 'Database unavailable'}, status=503)
    return JsonResponse({'ok': True})
