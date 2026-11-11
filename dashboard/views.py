from django.contrib.auth.decorators import login_required
from django.core.paginator import EmptyPage, PageNotAnInteger, Paginator
from django.db import DatabaseError, connection
from django.http import Http404, HttpResponse, JsonResponse
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from .models import Competition, Event, Match, MatchPlayer, Player, Season, SyncRun, Team
from .statsbomb import start_premier_league_sync


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


@login_required
def postgres_check_page(request):
    return render(request, "dashboard/app.html")


@login_required
def data_sync_page(request):
    return render(request, "dashboard/app.html")


@login_required
def data_table_page(request, table_name):
    if table_name not in TABLE_DEFINITIONS:
        raise Http404("Unknown data table.")
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
@login_required
def start_statsbomb_sync(request):
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
