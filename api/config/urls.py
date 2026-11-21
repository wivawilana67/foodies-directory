from django.urls import path

from foodies import views

urlpatterns = [
    path('api/health', views.health),
]
