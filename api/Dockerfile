# One image for local dev (docker compose overrides the command), CI tests and Cloud Run.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8080

# postgresql-client provides pg_dump for the nightly backup job.
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

RUN useradd --create-home --uid 1000 app
USER app

CMD ["sh", "-c", "exec gunicorn config.wsgi --bind 0.0.0.0:$PORT --workers 2 --timeout 60"]
