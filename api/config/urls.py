from django.contrib import admin
from django.urls import path

from foodies import views

urlpatterns = [
    path('api/health', views.health),
    path('api/auth/google', views.auth_google),
    path('api/auth/me', views.me),
    path('api/auth/sign-out-everywhere', views.sign_out_everywhere),
    path('api/bootstrap', views.bootstrap),
    path('api/lookup', views.lookup),
    path('api/places', views.places),
    path('api/places/<str:place_id>', views.place_detail),
    path('api/dishes', views.dishes),
    path('api/dishes/<str:dish_id>', views.dish_detail),
    path('api/photos/upload-url', views.photo_upload_url),
    path('api/photos', views.photos),
    path('api/photos/<str:photo_id>', views.photo_detail),
    path('api/collections', views.collections),
    path('api/collections/<str:collection_id>', views.collection_detail),
    path('api/collections/<str:collection_id>/places', views.collection_places),
    path('api/collections/<str:collection_id>/places/<uuid:place_id>', views.collection_place),
    path('api/admin/', admin.site.urls),
]
