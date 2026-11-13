import json
from datetime import timedelta

from django.contrib.auth.decorators import login_required
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db.models import Count, Exists, OuterRef
from django.core.paginator import EmptyPage, PageNotAnInteger, Paginator
from django.db import DatabaseError, connection, transaction
from django.http import Http404, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, render
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from .models import (
    Competition,
    Event,
    Match,
    Match360Data,
    MatchPlayer,
    PipelineSettings,
    Player,
    Season,
    SyncRun,
    Team,
    UserAccessProfile,
)
from .explore import analyze_match
from .permissions import app_admin_required
from .statsbomb import PREMIER_LEAGUE_ID, fetch_json, start_premier_league_sync

User = get_user_model()


TABLE_DEFINITIONS = {
    "competitions": (
        Competition.objects.all(),
        [
            ("source_id", "Source ID"),
            ("name", "Competition"),
            ("country", "Country"),
            ("gender", "Gender"),
        ],
    ),
    "seasons": (
        Season.objects.select_related("competition").all(),
        [
            ("source_id", "Source ID"),
            ("name", "Season"),
            ("competition__name", "Competition"),
            ("match_updated", "Source updated"),
        ],
    ),
    "teams": (
        Team.objects.all(),
        [
            ("source_id", "Source ID"),
            ("name", "Team"),
            ("country", "Country"),
        ],
    ),
    "players": (
        Player.objects.all(),
        [
            ("source_id", "Source ID"),
            ("name", "Player"),
            ("country", "Country"),
        ],
    ),
    "matches": (
        Match.objects.select_related("season", "home_team", "away_team").all(),
        [
            ("source_id", "Match ID"),
            ("date", "Date"),
            ("season__name", "Season"),
            ("home_team__name", "Home"),
            ("home_score", "Home score"),
            ("away_team__name", "Away"),
            ("away_score", "Away score"),
            ("match_week", "Match week"),
            ("stadium", "Stadium"),
        ],
    ),
    "lineups": (
        MatchPlayer.objects.select_related("match", "team", "player").all(),
        [
            ("match_id", "Match ID"),
            ("team__name", "Team"),
            ("player__name", "Player"),
            ("jersey_number", "Shirt"),
            ("starting", "Starter"),
            ("positions", "Positions"),
        ],
    ),
    "events": (
        Event.objects.select_related("match", "team", "player").all(),
        [
            ("match_id", "Match ID"),
            ("event_index", "Index"),
            ("minute", "Minute"),
            ("second", "Second"),
            ("event_type", "Event"),
            ("team__name", "Team"),
            ("player__name", "Player"),
            ("possession", "Possession"),
        ],
    ),
}


@require_GET
def readiness(request):
    return HttpResponse("ok")


@login_required
def home(request):
    return render(request, "dashboard/app.html")


@app_admin_required
def postgres_check_page(request):
    return render(request, "dashboard/app.html")


@app_admin_required
def data_sync_page(request):
    return render(request, "dashboard/app.html")


@login_required
def ball_by_ball_page(request):
    return render(request, "dashboard/app.html")


@login_required
def creator_studio_page(request):
    return render(request, "dashboard/app.html")


@login_required
def starting_xi_page(request):
    return render(request, "dashboard/app.html")


@login_required
def explore_page(request):
    return render(request, "dashboard/app.html")


@login_required
def data_table_page(request, table_name):
    if table_name not in TABLE_DEFINITIONS:
        raise Http404("Unknown data table.")
    return render(request, "dashboard/app.html")


@app_admin_required
def admin_users_page(request):
    return render(request, "dashboard/app.html")


@app_admin_required
def admin_pipeline_page(request):
    return render(request, "dashboard/app.html")


@require_GET
@login_required
def data_table_list(request):
    tables = []
    for name, (queryset, _) in TABLE_DEFINITIONS.items():
        tables.append(
            {
                "name": name,
                "label": name.replace("_", " ").title(),
                "count": queryset.count(),
            }
        )
    return JsonResponse({"tables": tables})


@require_GET
@login_required
def data_table_rows(request, table_name):
    definition = TABLE_DEFINITIONS.get(table_name)
    if definition is None:
        raise Http404("Unknown data table.")
    queryset, columns = definition
    queryset = queryset.order_by(*[field for field, _ in columns if field != "positions"])
    paginator = Paginator(queryset, 50)
    page_number = request.GET.get("page", 1)
    try:
        page = paginator.page(page_number)
    except PageNotAnInteger:
        page = paginator.page(1)
    except EmptyPage:
        page = paginator.page(paginator.num_pages or 1)

    field_names = [field for field, _ in columns]
    return JsonResponse(
        {
            "table": table_name,
            "columns": [{"key": field, "label": label} for field, label in columns],
            "rows": list(page.object_list.values(*field_names)),
            "total": paginator.count,
            "page": page.number,
            "pages": paginator.num_pages,
            "page_size": paginator.per_page,
        }
    )


@require_GET
@login_required
def explore_options(request):
    def selected_id(name):
        value = request.GET.get(name, "")
        if not value:
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            raise ValueError(f"{name} must be a valid integer.")

    try:
        competition_id = selected_id("competition")
        season_id = selected_id("season")
        match_id = selected_id("match")
        team_id = selected_id("team")
    except ValueError as error:
        return JsonResponse({"detail": str(error)}, status=400)

    competitions = Competition.objects.filter(
        Exists(
            Event.objects.filter(
                match__season__competition_id=OuterRef("pk")
            )
        )
    )
    if competition_id:
        competitions = competitions.filter(source_id=competition_id)
    competitions = competitions.order_by("name")

    seasons = Season.objects.filter(
        Exists(Event.objects.filter(match__season_id=OuterRef("pk")))
    )
    if competition_id:
        seasons = seasons.filter(competition_id=competition_id)
    seasons = seasons.order_by("-name")

    matches = Match.objects.filter(Exists(Event.objects.filter(match_id=OuterRef("pk"))))
    if season_id:
        matches = matches.filter(season_id=season_id)
    elif competition_id:
        matches = matches.filter(season__competition_id=competition_id)
    matches = matches.select_related("season", "home_team", "away_team")
    matches = matches.order_by("-date", "source_id")
    if match_id:
        matches = matches.filter(source_id=match_id)

    teams = Team.objects.none()
    players = MatchPlayer.objects.none()
    if match_id:
        lineups = MatchPlayer.objects.filter(match_id=match_id)
        if team_id:
            lineups = lineups.filter(team_id=team_id)
        selected_match = Match.objects.filter(source_id=match_id).values(
            "home_team_id", "away_team_id"
        ).first()
        if selected_match:
            teams = Team.objects.filter(
                source_id__in=(
                    selected_match["home_team_id"],
                    selected_match["away_team_id"],
                )
            ).order_by("name")
        players = lineups.select_related("player", "team").order_by(
            "team__name", "player__name"
        )

    return JsonResponse({
        "competitions": [
            {"id": item.source_id, "name": item.name} for item in competitions
        ],
        "seasons": [
            {
                "id": item.source_id,
                "name": item.name,
                "competition_id": item.competition_id,
            }
            for item in seasons
        ],
        "matches": [
            {
                "id": item.source_id,
                "date": item.date.isoformat() if item.date else None,
                "season": item.season.name,
                "season_id": item.season_id,
                "home_team": item.home_team.name,
                "home_team_id": item.home_team_id,
                "home_score": item.home_score,
                "away_team": item.away_team.name,
                "away_team_id": item.away_team_id,
                "away_score": item.away_score,
            }
            for item in matches
        ],
        "teams": [{"id": item.source_id, "name": item.name} for item in teams],
        "players": [
            {
                "id": item.player_id,
                "name": item.player.name,
                "team_id": item.team_id,
            }
            for item in players
        ],
    })


@require_GET
@login_required
def explore_data(request):
    def selected_int(name, default=None):
        value = request.GET.get(name)
        if value in (None, ""):
            return default
        try:
            return int(value)
        except (TypeError, ValueError):
            raise ValueError(f"{name} must be a valid integer.")

    try:
        match_id = selected_int("match")
        minute_start = selected_int("minute_start", 0)
        minute_end = selected_int("minute_end", 130)
        team_id = selected_int("team")
        player_id = selected_int("player")
    except ValueError as error:
        return JsonResponse({"detail": str(error)}, status=400)

    if match_id is None:
        return JsonResponse({"detail": "match is required."}, status=400)
    if minute_start < 0 or minute_end > 130 or minute_start > minute_end:
        return JsonResponse(
            {"detail": "Minute range must be between 0 and 130 with start before end."},
            status=400,
        )
    phase = request.GET.get("phase", "all")
    if phase not in {"all", "open_play", "set_piece", "counterpress"}:
        return JsonResponse({"detail": "phase is invalid."}, status=400)
    group_by = request.GET.get("group_by", "player")
    if group_by not in {"player", "team", "match"}:
        return JsonResponse({"detail": "group_by is invalid."}, status=400)

    match = get_object_or_404(
        Match.objects.select_related("season", "home_team", "away_team"),
        source_id=match_id,
    )
    return JsonResponse(analyze_match(
        match,
        minute_start=minute_start,
        minute_end=minute_end,
        phase=phase,
        team_id=team_id,
        player_id=player_id,
        group_by=group_by,
    ))


@require_GET
@app_admin_required
def admin_users(request):
    users = User.objects.select_related("access_profile").order_by("email", "id")
    return JsonResponse(
        {
            "users": [
                {
                    "id": user.pk,
                    "name": user.get_full_name() or user.email or user.get_username(),
                    "email": user.email,
                    "role": (
                        UserAccessProfile.Role.ADMIN
                        if user.is_superuser
                        else user.access_profile.role
                    ),
                    "is_active": user.is_active,
                    "is_superuser": user.is_superuser,
                    "date_joined": user.date_joined.isoformat(),
                    "last_login": user.last_login.isoformat() if user.last_login else None,
                }
                for user in users
            ]
        }
    )


@require_POST
@app_admin_required
def admin_update_user(request, user_id):
    try:
        payload = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({"error": "Request body must be valid JSON."}, status=400)
    if not isinstance(payload, dict):
        return JsonResponse({"error": "Request body must be a JSON object."}, status=400)

    requested_role = payload.get("role")
    requested_active = payload.get("is_active")
    if requested_role is not None and requested_role not in UserAccessProfile.Role.values:
        return JsonResponse({"error": "Role must be Analyst or Admin."}, status=400)
    if requested_active is not None and not isinstance(requested_active, bool):
        return JsonResponse({"error": "is_active must be a boolean."}, status=400)
    if requested_role is None and requested_active is None:
        return JsonResponse({"error": "No user changes were provided."}, status=400)

    with transaction.atomic():
        PipelineSettings.objects.select_for_update().get(pk=1)
        target = get_object_or_404(User.objects.select_for_update(), pk=user_id)
        if target.is_superuser:
            return JsonResponse(
                {"error": "Django superuser accounts cannot be changed here."},
                status=400,
            )

        profile, _ = UserAccessProfile.objects.select_for_update().get_or_create(
            user=target
        )
        new_role = requested_role or profile.role
        new_active = requested_active if requested_active is not None else target.is_active
        loses_admin_access = (
            profile.role == UserAccessProfile.Role.ADMIN
            and (new_role != UserAccessProfile.Role.ADMIN or not new_active)
        )
        if loses_admin_access:
            other_admin_exists = (
                User.objects.filter(is_superuser=True, is_active=True)
                .exclude(pk=target.pk)
                .exists()
                or UserAccessProfile.objects.filter(
                    role=UserAccessProfile.Role.ADMIN,
                    user__is_active=True,
                )
                .exclude(user_id=target.pk)
                .exists()
            )
            if not other_admin_exists:
                return JsonResponse(
                    {"error": "At least one active Admin must remain."},
                    status=400,
                )

        profile.role = new_role
        profile.save(update_fields=["role", "updated_at"])
        if target.is_active != new_active:
            target.is_active = new_active
            target.save(update_fields=["is_active"])

    return JsonResponse(
        {
            "id": target.pk,
            "role": profile.role,
            "is_active": target.is_active,
        }
    )


def pipeline_settings_payload(settings):
    return {
        "source": "StatsBomb Open Data",
        "competition": "Premier League",
        "sync_enabled": settings.sync_enabled,
        "max_workers": settings.max_workers,
        "request_timeout_seconds": settings.request_timeout_seconds,
        "request_retries": settings.request_retries,
        "updated_at": settings.updated_at.isoformat(),
    }


@require_GET
@app_admin_required
def admin_pipeline_settings(request):
    settings = PipelineSettings.current()
    return JsonResponse(pipeline_settings_payload(settings))


@require_POST
@app_admin_required
def admin_update_pipeline_settings(request):
    try:
        payload = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({"error": "Request body must be valid JSON."}, status=400)
    if not isinstance(payload, dict):
        return JsonResponse({"error": "Request body must be a JSON object."}, status=400)

    allowed_fields = {
        "sync_enabled",
        "max_workers",
        "request_timeout_seconds",
        "request_retries",
    }
    if payload.keys() - allowed_fields:
        return JsonResponse({"error": "Unknown pipeline settings were provided."}, status=400)
    if not payload:
        return JsonResponse({"error": "No pipeline settings were provided."}, status=400)

    settings = PipelineSettings.current()
    for field in allowed_fields & payload.keys():
        value = payload[field]
        if field == "sync_enabled":
            valid = isinstance(value, bool)
        else:
            valid = isinstance(value, int) and not isinstance(value, bool)
        if not valid:
            return JsonResponse({"error": f"{field} has an invalid value."}, status=400)
        setattr(settings, field, value)
    try:
        settings.full_clean()
    except ValidationError as error:
        return JsonResponse({"error": error.message_dict}, status=400)
    settings.save()
    return JsonResponse(pipeline_settings_payload(settings))


@require_GET
@login_required
def ball_by_ball_matches(request):
    matches = (
        Match.objects.filter(
            season__competition__source_id=PREMIER_LEAGUE_ID,
            events__isnull=False,
        )
        .select_related("season", "home_team", "away_team")
        .annotate(event_count=Count("events"))
        .order_by("-date", "source_id")
    )
    return JsonResponse(
        {
            "matches": [
                {
                    "id": match.source_id,
                    "date": match.date.isoformat() if match.date else None,
                    "season": match.season.name,
                    "home_team": match.home_team.name,
                    "home_team_id": match.home_team_id,
                    "home_score": match.home_score,
                    "away_team": match.away_team.name,
                    "away_team_id": match.away_team_id,
                    "away_score": match.away_score,
                    "event_count": match.event_count,
                }
                for match in matches
            ]
        }
    )


@require_GET
@login_required
def starting_xi_teams(request):
    teams = Team.objects.filter(matchplayer__isnull=False).distinct().order_by("name")
    return JsonResponse({
        "teams": [{"id": team.source_id, "name": team.name} for team in teams]
    })


def _starting_position_name(positions):
    if not isinstance(positions, list):
        return None
    position_rows = [item for item in positions if isinstance(item, dict)]
    preferred_rows = [
        item for item in position_rows
        if item.get("start_reason") == "Starting XI"
        or item.get("from") in (0, 0.0, "00:00")
    ]
    for item in [*preferred_rows, *position_rows]:
        position = item.get("position")
        if isinstance(position, str):
            return position
        if isinstance(position, dict) and isinstance(position.get("name"), str):
            return position["name"]
    return None


@require_GET
@login_required
def starting_xi_players(request, team_id):
    team = get_object_or_404(Team, source_id=team_id)
    latest = (
        MatchPlayer.objects.filter(team=team, match__date__isnull=False)
        .order_by("-match__date", "-match_id")
        .values("match_id", "match__date", "match__season__name")
        .first()
    )
    if latest is None:
        latest = (
            MatchPlayer.objects.filter(team=team)
            .order_by("-match_id")
            .values("match_id", "match__date", "match__season__name")
            .first()
        )

    players = []
    if latest:
        players = [
            {
                "id": lineup.player_id,
                "name": lineup.player.name,
                "jersey_number": lineup.jersey_number,
                "starting": lineup.starting,
                "position": _starting_position_name(lineup.positions),
            }
            for lineup in MatchPlayer.objects.filter(
                team=team,
                match_id=latest["match_id"],
            )
            .select_related("player")
            .order_by("jersey_number", "player__name")
        ]
    return JsonResponse({
        "team": {"id": team.source_id, "name": team.name},
        "latest_match": {
            "date": latest["match__date"],
            "season": latest["match__season__name"],
        } if latest else None,
        "players": players,
    })


@require_GET
@login_required
def ball_by_ball_events(request, match_id):
    match = get_object_or_404(
        Match.objects.select_related("season", "home_team", "away_team"),
        source_id=match_id,
        season__competition__source_id=PREMIER_LEAGUE_ID,
    )
    events = (
        Event.objects.filter(match=match)
        .select_related("team", "player")
        .order_by("event_index")
    )

    def coordinate(value):
        if (
            isinstance(value, list)
            and len(value) >= 2
            and all(
                isinstance(point, (int, float)) and not isinstance(point, bool)
                for point in value[:2]
            )
        ):
            return value[:2]
        return None

    def end_coordinate(raw_data):
        for action_name in ("pass", "shot", "carry", "dribble"):
            action = raw_data.get(action_name)
            if isinstance(action, dict):
                result = coordinate(action.get("end_location"))
                if result:
                    return result
        return None

    return JsonResponse(
        {
            "match": {
                "id": match.source_id,
                "date": match.date.isoformat() if match.date else None,
                "season": match.season.name,
                "home_team": match.home_team.name,
                "home_team_id": match.home_team_id,
                "home_score": match.home_score,
                "away_team": match.away_team.name,
                "away_team_id": match.away_team_id,
                "away_score": match.away_score,
            },
            "events": [
                {
                    "id": str(event.source_id),
                    "index": event.event_index,
                    "period": event.period,
                    "minute": event.minute,
                    "second": event.second,
                    "type": event.event_type,
                    "team": event.team.name if event.team else None,
                    "team_id": event.team_id,
                    "player": event.player.name if event.player else None,
                    "player_id": event.player_id,
                    "possession": event.possession,
                    "location": coordinate(event.raw_data.get("location")),
                    "end_location": end_coordinate(event.raw_data),
                    "raw_data": event.raw_data,
                }
                for event in events
            ],
        }
    )


@require_GET
@login_required
def ball_by_ball_360(request, match_id):
    match = get_object_or_404(
        Match.objects.select_related("season__competition"),
        source_id=match_id,
        season__competition__source_id=PREMIER_LEAGUE_ID,
    )
    cached = Match360Data.objects.filter(match=match).first()
    refresh_missing_data = (
        cached is not None
        and not cached.available
        and cached.checked_at < timezone.now() - timedelta(days=1)
    )
    if cached is None or refresh_missing_data:
        try:
            frames = fetch_json(f"three-sixty/{match_id}.json", allow_missing=True)
        except RuntimeError as error:
            return JsonResponse(
                {"detail": "StatsBomb 360 data could not be loaded.", "error": str(error)},
                status=502,
            )
        if frames is not None and not isinstance(frames, list):
            return JsonResponse(
                {"detail": "StatsBomb returned an invalid 360 data payload."},
                status=502,
            )
        defaults = {"available": bool(frames), "frames": frames or []}
        if cached is None:
            cached, _ = Match360Data.objects.get_or_create(
                match=match,
                defaults=defaults,
            )
        else:
            cached.available = defaults["available"]
            cached.frames = defaults["frames"]
            cached.save(update_fields=["available", "frames", "checked_at"])
    return JsonResponse(
        {
            "available": cached.available,
            "checked_at": cached.checked_at,
            "frames": cached.frames,
        }
    )


@require_GET
@app_admin_required
def statsbomb_sync_status(request):
    latest = SyncRun.objects.first()
    return JsonResponse(
        {
            "active": SyncRun.objects.filter(is_active=True).exists(),
            "latest": (
                {
                    "id": latest.pk,
                    "status": latest.status,
                    "started_at": latest.started_at,
                    "completed_at": latest.completed_at,
                    "summary": latest.summary,
                    "error": latest.error,
                }
                if latest
                else None
            ),
            "source": "StatsBomb Open Data",
            "competition": "Premier League",
            "available_seasons": ["2015/2016", "2003/2004"],
        }
    )


@require_POST
@app_admin_required
def start_statsbomb_sync(request):
    if not PipelineSettings.current().sync_enabled:
        return JsonResponse(
            {"error": "StatsBomb syncing is disabled in Admin → Data Pipeline."},
            status=403,
        )
    run, started = start_premier_league_sync()
    return JsonResponse(
        {
            "id": run.pk,
            "status": run.status,
            "started": started,
        },
        status=202 if started else 200,
    )


@require_GET
@login_required
def postgres_health(request):
    checked_at = timezone.now()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except DatabaseError:
        return JsonResponse(
            {
                "status": "error",
                "message": "Could not connect to PostgreSQL.",
                "checked_at": checked_at.isoformat(),
            },
            status=503,
        )

    return JsonResponse(
        {
            "status": "ok",
            "message": "PostgreSQL connection is healthy.",
            "checked_at": checked_at.isoformat(),
        }
    )
