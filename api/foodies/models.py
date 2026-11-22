# Data model of the new stack (D41, D49), mapped from the sheet's "Food List", "Dishes" and "Master" tabs
# (apps-script/src/Config.js). Field names use the English headers (D51). Text limits are enforced by the API
# (Phase 3) with the same rules as cleanValue_ / cleanDish_; the database only caps sizes generously.
# Tables have plain names (places, dishes, …) instead of Django's foodies_<model>, for readable SQL.
import uuid

from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower
from django.utils import timezone


class Person(models.Model):
    """One of the two users. `position` is the order of their Rating / Review columns in the sheet."""

    name = models.CharField(max_length=100)
    email = models.EmailField(unique=True, null=True, blank=True)  # Google Sign-In email, set in Phase 3
    position = models.PositiveSmallIntegerField(unique=True)
    token_version = models.PositiveIntegerField(default=1)  # bump to sign this person out on every device

    class Meta:
        db_table = 'people'
        ordering = ['position']

    def __str__(self):
        return self.name


class MasterOption(models.Model):
    """The sheet's "Master" lists. For ratings, `rank` is the sort order (higher = better)."""

    RATING, TYPE, GENRE, CATEGORY = 'rating', 'type', 'genre', 'category'
    KINDS = [(RATING, 'Rating'), (TYPE, 'Type'), (GENRE, 'Genre'), (CATEGORY, 'Category')]

    kind = models.CharField(max_length=20, choices=KINDS)
    value = models.CharField(max_length=100)
    rank = models.PositiveIntegerField()

    class Meta:
        db_table = 'master_options'
        ordering = ['kind', 'rank']
        constraints = [models.UniqueConstraint(fields=['kind', 'value'], name='unique_option_per_kind')]

    def __str__(self):
        return f'{self.get_kind_display()}: {self.value}'


class Label(models.Model):
    name = models.CharField(max_length=40)

    class Meta:
        db_table = 'labels'
        ordering = ['name']
        constraints = [models.UniqueConstraint(Lower('name'), name='unique_label_name_ci')]

    def __str__(self):
        return self.name

    @classmethod
    def for_name(cls, name):
        """The label with this name ignoring case, or a new one. Returns (label, created)."""
        label = cls.objects.filter(name__iexact=name).first()
        return (label, False) if label else (cls.objects.create(name=name), True)


class Place(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)  # the sheet's App ID
    name = models.CharField(max_length=500)
    country = models.CharField(max_length=500, blank=True)
    city = models.CharField(max_length=500, blank=True)
    district = models.CharField(max_length=500, blank=True)
    landmark = models.CharField(max_length=500, blank=True)
    price = models.CharField(max_length=500, blank=True)
    type = models.CharField(max_length=100, blank=True)
    genre = models.CharField(max_length=100, blank=True)
    category = models.CharField(max_length=100, blank=True)
    labels = models.ManyToManyField(Label, blank=True, related_name='places', db_table='place_labels')
    best_dish = models.CharField(max_length=500, blank=True)  # derived from starred dishes
    instagram = models.CharField(max_length=500, blank=True)
    maps_link = models.CharField(max_length=1000, blank=True)
    closed = models.BooleanField(default=False)
    tried = models.BooleanField(default=False)
    # Filled from Google Places (D12): the phone never sends these.
    google_place_id = models.CharField(max_length=300, blank=True, db_index=True)
    lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    address = models.CharField(max_length=1000, blank=True)
    google_category = models.CharField(max_length=200, blank=True)
    lookup_status = models.CharField(max_length=50, blank=True)
    added_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    version = models.PositiveIntegerField(default=1)  # edit conflict check (D24)

    class Meta:
        db_table = 'places'
        ordering = ['name']

    def __str__(self):
        return self.name


class PlaceRating(models.Model):
    """A person's score (a Master rating value) and review of a place."""

    place = models.ForeignKey(Place, on_delete=models.CASCADE, related_name='ratings')
    person = models.ForeignKey(Person, on_delete=models.PROTECT, related_name='ratings')
    score = models.CharField(max_length=100, blank=True)
    review = models.TextField(blank=True)

    class Meta:
        db_table = 'place_ratings'
        ordering = ['person__position']
        constraints = [models.UniqueConstraint(fields=['place', 'person'], name='one_rating_per_person')]

    def __str__(self):
        return f'{self.place} / {self.person}: {self.score}'


class Dish(models.Model):
    LIKED = [('', '—'), ('Yes', 'Yes'), ('No', 'No')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)  # the sheet's Dish ID
    place = models.ForeignKey(Place, on_delete=models.CASCADE, related_name='dishes')
    name = models.CharField(max_length=500)
    price = models.CharField(max_length=200, blank=True)
    liked = models.CharField(max_length=3, choices=LIKED, blank=True)
    best = models.BooleanField(default=False)
    note = models.TextField(blank=True)
    added_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'dishes'
        ordering = ['added_at']
        verbose_name_plural = 'dishes'

    def __str__(self):
        return self.name


class Photo(models.Model):
    """An own photo of a place or a dish (D44). `key` / `thumb_key` are Cloud Storage object names (Phase 3);
    `drive_id` is the source file in the old Drive folder, kept until the photo is copied to the bucket."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    place = models.ForeignKey(Place, on_delete=models.CASCADE, null=True, blank=True, related_name='photos')
    dish = models.ForeignKey(Dish, on_delete=models.CASCADE, null=True, blank=True, related_name='photos')
    position = models.PositiveSmallIntegerField(default=0)  # 0 = cover
    key = models.CharField(max_length=300, blank=True)
    thumb_key = models.CharField(max_length=300, blank=True)
    drive_id = models.CharField(max_length=200, blank=True)
    added_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'photos'
        ordering = ['position']
        constraints = [
            models.CheckConstraint(
                condition=Q(place__isnull=False, dish__isnull=True) | Q(place__isnull=True, dish__isnull=False),
                name='photo_has_one_owner',
            ),
        ]

    def __str__(self):
        return f'Photo {self.position} of {self.place or self.dish}'


class PlacesUsage(models.Model):
    """Places API spend counter (D7): one row per day ("2026-11-22") and per month ("2026-11")."""

    period = models.CharField(max_length=10, unique=True)
    count = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'places_usage'
        ordering = ['-period']
        verbose_name_plural = 'places usage'

    def __str__(self):
        return f'{self.period}: {self.count}'


class AuditLog(models.Model):
    """Every write: who changed what, with old and new values (the Sheet's version history, D42)."""

    at = models.DateTimeField(auto_now_add=True)
    person = models.ForeignKey(Person, on_delete=models.SET_NULL, null=True, blank=True)
    action = models.CharField(max_length=20)  # create / update / delete / import
    entity = models.CharField(max_length=50)
    entity_id = models.CharField(max_length=64, blank=True)
    changes = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'audit_log'
        ordering = ['-at']

    def __str__(self):
        return f'{self.at:%Y-%m-%d %H:%M} {self.action} {self.entity} {self.entity_id}'


class Collection(models.Model):
    """A named list of places (D49)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    note = models.TextField(blank=True)
    places = models.ManyToManyField(Place, through='CollectionPlace', related_name='collections')
    created_by = models.ForeignKey(Person, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    version = models.PositiveIntegerField(default=1)

    class Meta:
        db_table = 'collections'
        ordering = ['name']

    def __str__(self):
        return self.name


class CollectionPlace(models.Model):
    collection = models.ForeignKey(Collection, on_delete=models.CASCADE, related_name='entries')
    place = models.ForeignKey(Place, on_delete=models.CASCADE, related_name='collection_entries')
    added_at = models.DateTimeField(auto_now_add=True)
    added_by = models.ForeignKey(Person, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')

    class Meta:
        db_table = 'collection_places'
        ordering = ['added_at']
        constraints = [models.UniqueConstraint(fields=['collection', 'place'], name='place_once_per_collection')]

    def __str__(self):
        return f'{self.place} in {self.collection}'
