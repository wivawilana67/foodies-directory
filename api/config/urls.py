from django.contrib import admin
from django.urls import path

from foodies import views

urlpatterns = [
    path('api/health', views.health),
    path('api/admin/', admin.site.urls),
]
