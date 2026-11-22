# Django admin: the table view of all data that replaces reading the Sheet on a computer (D41).
from django.contrib import admin

from foodies import models


class RatingInline(admin.TabularInline):
    model = models.PlaceRating
    extra = 0


class DishInline(admin.TabularInline):
    model = models.Dish
    extra = 0
    fields = ['name', 'price', 'liked', 'best', 'note']


class PlacePhotoInline(admin.TabularInline):
    model = models.Photo
    fk_name = 'place'
    extra = 0
    fields = ['position', 'key', 'thumb_key', 'drive_id']


@admin.register(models.Place)
class PlaceAdmin(admin.ModelAdmin):
    list_display = ['name', 'city', 'district', 'type', 'genre', 'category', 'tried', 'closed', 'added_at']
    list_filter = ['tried', 'closed', 'country', 'city', 'type', 'genre', 'category']
    search_fields = ['name', 'city', 'district', 'landmark', 'best_dish', 'labels__name']
    filter_horizontal = ['labels']
    readonly_fields = ['id', 'updated_at', 'version']
    inlines = [RatingInline, DishInline, PlacePhotoInline]


@admin.register(models.Dish)
class DishAdmin(admin.ModelAdmin):
    list_display = ['name', 'place', 'price', 'liked', 'best', 'added_at']
    list_filter = ['liked', 'best']
    search_fields = ['name', 'place__name', 'note']
    readonly_fields = ['id']


class EntryInline(admin.TabularInline):
    model = models.CollectionPlace
    extra = 0
    autocomplete_fields = ['place']


@admin.register(models.Collection)
class CollectionAdmin(admin.ModelAdmin):
    list_display = ['name', 'created_by', 'created_at']
    search_fields = ['name', 'note']
    readonly_fields = ['id', 'created_at', 'updated_at', 'version']
    inlines = [EntryInline]


@admin.register(models.AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ['at', 'person', 'action', 'entity', 'entity_id']
    list_filter = ['action', 'entity']

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(models.MasterOption)
class MasterOptionAdmin(admin.ModelAdmin):
    list_display = ['kind', 'value', 'rank']
    list_filter = ['kind']


admin.site.register([models.Person, models.Label, models.Photo, models.PlaceRating, models.PlacesUsage])
admin.site.site_header = 'Foodies Directory'
