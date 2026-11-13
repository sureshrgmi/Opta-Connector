from django.urls import path

from . import views

app_name = "dashboard"

urlpatterns = [
    path("healthz/", views.readiness, name="readiness"),
    path("", views.home, name="home"),
    path("postgres-check/", views.postgres_check_page, name="postgres_check"),
    path("data/sync/", views.data_sync_page, name="data_sync"),
    path("ball-by-ball/", views.ball_by_ball_page, name="ball_by_ball"),
    path("creator-studio/", views.creator_studio_page, name="creator_studio"),
    path(
        "creator-studio/starting-xi/",
        views.starting_xi_page,
        name="starting_xi",
    ),
    path("explore/", views.explore_page, name="explore"),
    path("workspace-admin/users/", views.admin_users_page, name="admin_users_page"),
    path(
        "workspace-admin/data-pipeline/",
        views.admin_pipeline_page,
        name="admin_pipeline_page",
    ),
    path("tables/<str:table_name>/", views.data_table_page, name="data_table"),
    path("api/postgres-health/", views.postgres_health, name="postgres_health"),
    path("api/data/tables/", views.data_table_list, name="data_table_list"),
    path("api/admin/users/", views.admin_users, name="admin_users"),
    path(
        "api/admin/users/<int:user_id>/",
        views.admin_update_user,
        name="admin_update_user",
    ),
    path(
        "api/admin/data-pipeline/",
        views.admin_pipeline_settings,
        name="admin_pipeline_settings",
    ),
    path(
        "api/admin/data-pipeline/update/",
        views.admin_update_pipeline_settings,
        name="admin_update_pipeline_settings",
    ),
    path(
        "api/data/tables/<str:table_name>/",
        views.data_table_rows,
        name="data_table_rows",
    ),
    path(
        "api/ball-by-ball/matches/",
        views.ball_by_ball_matches,
        name="ball_by_ball_matches",
    ),
    path(
        "api/creator/starting-xi/teams/",
        views.starting_xi_teams,
        name="starting_xi_teams",
    ),
    path(
        "api/creator/starting-xi/teams/<int:team_id>/players/",
        views.starting_xi_players,
        name="starting_xi_players",
    ),
    path("api/explore/options/", views.explore_options, name="explore_options"),
    path("api/explore/data/", views.explore_data, name="explore_data"),
    path(
        "api/ball-by-ball/matches/<int:match_id>/events/",
        views.ball_by_ball_events,
        name="ball_by_ball_events",
    ),
    path(
        "api/ball-by-ball/matches/<int:match_id>/360/",
        views.ball_by_ball_360,
        name="ball_by_ball_360",
    ),
    path("api/data/sync/", views.statsbomb_sync_status, name="statsbomb_sync_status"),
    path(
        "api/data/sync/start/",
        views.start_statsbomb_sync,
        name="start_statsbomb_sync",
    ),
]
