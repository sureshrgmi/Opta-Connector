from django.urls import path

from . import views

app_name = "dashboard"

urlpatterns = [
    path("healthz/", views.readiness, name="readiness"),
    path("", views.home, name="home"),
    path("postgres-check/", views.postgres_check_page, name="postgres_check"),
    path("data/sync/", views.data_sync_page, name="data_sync"),
    path("tables/<str:table_name>/", views.data_table_page, name="data_table"),
    path("api/postgres-health/", views.postgres_health, name="postgres_health"),
    path("api/data/tables/", views.data_table_list, name="data_table_list"),
    path(
        "api/data/tables/<str:table_name>/",
        views.data_table_rows,
        name="data_table_rows",
    ),
    path("api/data/sync/", views.statsbomb_sync_status, name="statsbomb_sync_status"),
    path(
        "api/data/sync/start/",
        views.start_statsbomb_sync,
        name="start_statsbomb_sync",
    ),
]
