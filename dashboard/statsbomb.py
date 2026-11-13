import json
import logging
import ssl
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Thread
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import certifi
from django.db import IntegrityError, close_old_connections, transaction
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime, parse_time

from .models import (
    Competition,
    Event,
    Match,
    MatchPlayer,
    PipelineSettings,
    Player,
    Season,
    SyncRun,
    Team,
)

logger = logging.getLogger(__name__)

OPEN_DATA_ROOT = "https://raw.githubusercontent.com/statsbomb/open-data/master/data"
PREMIER_LEAGUE_ID = 2
SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())


def fetch_json(path, *, allow_missing=False):
    pipeline_settings = PipelineSettings.current()
    request_timeout = pipeline_settings.request_timeout_seconds
    request_retries = pipeline_settings.request_retries
    if allow_missing:
        request_timeout = min(request_timeout, 15)
        request_retries = min(request_retries, 2)
    request = Request(
        f"{OPEN_DATA_ROOT}/{path}",
        headers={"User-Agent": "TechnicalArea/1.0", "Accept": "application/json"},
    )
    last_error = None
    for attempt in range(request_retries):
        try:
            with urlopen(
                request,
                timeout=request_timeout,
                context=SSL_CONTEXT,
            ) as response:
                return json.load(response)
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
            if isinstance(error, HTTPError) and error.code == 404 and allow_missing:
                return None
            last_error = error
            if isinstance(error, HTTPError) and error.code == 404:
                break
            if attempt + 1 < request_retries:
                time.sleep(attempt + 1)
    raise RuntimeError(f"Unable to read StatsBomb Open Data file {path}: {last_error}")


def _date(value):
    return parse_date(value) if value else None


def _datetime(value):
    if not value:
        return None
    parsed = parse_datetime(value)
    if parsed and timezone.is_naive(parsed):
        return timezone.make_aware(parsed)
    return parsed


def _team(data, cache=None):
    team_id = data.get("team_id")
    if not team_id:
        return None
    if cache is not None and team_id in cache:
        return cache[team_id]
    team, _ = Team.objects.get_or_create(
        source_id=team_id,
        defaults={
            "name": data.get("team_name") or data.get("name") or f"Team {team_id}",
            "country": (data.get("country") or {}).get("name", ""),
        },
    )
    if cache is not None:
        cache[team_id] = team
    return team


def _player(data, cache=None):
    player_id = data.get("id") or data.get("player_id")
    if not player_id:
        return None
    if cache is not None and player_id in cache:
        return cache[player_id]
    player, _ = Player.objects.get_or_create(
        source_id=player_id,
        defaults={
            "name": data.get("name") or data.get("player_name") or f"Player {player_id}",
            "country": (data.get("country") or {}).get("name", ""),
        },
    )
    if cache is not None:
        cache[player_id] = player
    return player


def _ensure_match_teams(match_data):
    result = {}
    for side in ("home_team", "away_team"):
        team_data = match_data.get(side) or {}
        team_id = team_data.get(f"{side}_id")
        if team_id:
            team, _ = Team.objects.get_or_create(
                source_id=team_id,
                defaults={
                    "name": team_data.get(f"{side}_name") or f"Team {team_id}",
                    "country": (team_data.get("country") or {}).get("name", ""),
                },
            )
            result[side] = team
    return result


def _match_source_updated(match_data, season_updated):
    return _datetime(
        match_data.get("last_updated")
        or match_data.get("match_updated")
        or season_updated
    )


def _import_match(match_data, season):
    close_old_connections()
    try:
        match_id = match_data["match_id"]
        teams = _ensure_match_teams(match_data)
        if "home_team" not in teams or "away_team" not in teams:
            raise ValueError(f"Match {match_id} has incomplete team data.")
        source_updated = _match_source_updated(match_data, season.match_updated)
        existing = Match.objects.filter(source_id=match_id).only(
            "source_updated"
        ).first()
        match, _ = Match.objects.update_or_create(
            source_id=match_id,
            defaults={
                "season": season,
                "date": _date(match_data.get("match_date")),
                "kick_off": parse_time(match_data.get("kick_off"))
                if match_data.get("kick_off")
                else None,
                "home_team": teams["home_team"],
                "away_team": teams["away_team"],
                "home_score": match_data.get("home_score"),
                "away_score": match_data.get("away_score"),
                "match_week": match_data.get("match_week"),
                "stage": (match_data.get("competition_stage") or {}).get("name", ""),
                "stadium": (match_data.get("stadium") or {}).get("name", ""),
                "referee": (match_data.get("referee") or {}).get("name", ""),
                "source_updated": existing.source_updated if existing else None,
                "raw_data": match_data,
            },
        )
        if (
            existing
            and existing.source_updated == source_updated
            and Event.objects.filter(match=match).exists()
        ):
            return "unchanged"

        events = fetch_json(f"events/{match_id}.json")
        lineups = fetch_json(f"lineups/{match_id}.json")
        with transaction.atomic():
            Event.objects.filter(match=match).delete()
            MatchPlayer.objects.filter(match=match).delete()

            team_cache = {team.source_id: team for team in teams.values()}
            player_cache = {}
            lineup_rows = []
            lineup_data = lineups if isinstance(lineups, list) else lineups.get("lineup", [])
            for team_data in lineup_data:
                team = _team(
                    {
                        "team_id": team_data.get("team_id"),
                        "team_name": team_data.get("team_name"),
                    },
                    team_cache,
                )
                if team is None:
                    continue
                for player_data in team_data.get("lineup", []):
                    player = _player(player_data, player_cache)
                    if player is None:
                        continue
                    lineup_rows.append(
                        MatchPlayer(
                            match=match,
                            team=team,
                            player=player,
                            jersey_number=player_data.get("jersey_number"),
                            starting=any(
                                position.get("start_reason") == "Starting XI"
                                or position.get("from") in (0, 0.0, "00:00")
                                for position in player_data.get("positions") or []
                            ),
                            positions=player_data.get("positions") or [],
                        )
                    )
            MatchPlayer.objects.bulk_create(lineup_rows, ignore_conflicts=True)

            event_rows = []
            for event_index, event_data in enumerate(events):
                team = _team(
                    {
                        "team_id": (event_data.get("team") or {}).get("id"),
                        "team_name": (event_data.get("team") or {}).get("name"),
                    },
                    team_cache,
                )
                player = _player(event_data.get("player") or {}, player_cache)
                event_id = event_data.get("id")
                if not event_id:
                    continue
                event_rows.append(
                    Event(
                        source_id=uuid.UUID(event_id),
                        match=match,
                        event_index=event_data.get("index", event_index),
                        period=event_data.get("period", 0),
                        minute=event_data.get("minute", 0),
                        second=event_data.get("second", 0),
                        event_type=(event_data.get("type") or {}).get("name", "Unknown"),
                        team=team,
                        player=player,
                        possession=event_data.get("possession"),
                        raw_data=event_data,
                    )
                )
            Event.objects.bulk_create(event_rows, batch_size=1000)
            match.source_updated = source_updated
            match.save(update_fields=["source_updated"])
        return "updated"
    finally:
        close_old_connections()


def sync_premier_league(run_id):
    run = SyncRun.objects.get(pk=run_id)
    run.status = SyncRun.Status.RUNNING
    run.save(update_fields=["status"])
    failures = []
    summary = {"matches_updated": 0, "matches_unchanged": 0, "matches_failed": 0}
    try:
        pipeline_settings = PipelineSettings.current()
        if not pipeline_settings.sync_enabled:
            raise RuntimeError("StatsBomb syncing is disabled in Admin → Data Pipeline.")
        competition_rows = fetch_json("competitions.json")
        seasons = [
            row for row in competition_rows if row["competition_id"] == PREMIER_LEAGUE_ID
        ]
        if not seasons:
            raise RuntimeError("Premier League seasons were not found in the Open Data source.")

        competition, _ = Competition.objects.update_or_create(
            source_id=PREMIER_LEAGUE_ID,
            defaults={
                "name": "Premier League",
                "country": "England",
                "gender": "male",
                "raw_data": {"source": "StatsBomb Open Data"},
            },
        )

        season_matches = []
        for season_data in seasons:
            season, _ = Season.objects.update_or_create(
                source_id=season_data["season_id"],
                defaults={
                    "competition": competition,
                    "name": season_data["season_name"],
                    "match_updated": _datetime(season_data.get("match_updated")),
                },
            )
            matches = fetch_json(
                f"matches/{PREMIER_LEAGUE_ID}/{season_data['season_id']}.json"
            )
            season_matches.extend((match_data, season) for match_data in matches)

        with ThreadPoolExecutor(max_workers=pipeline_settings.max_workers) as executor:
            futures = {
                executor.submit(_import_match, match_data, season): match_data["match_id"]
                for match_data, season in season_matches
            }
            for future in as_completed(futures):
                match_id = futures[future]
                try:
                    result = future.result()
                    summary[
                        "matches_unchanged" if result == "unchanged" else "matches_updated"
                    ] += 1
                except Exception as error:
                    logger.exception("StatsBomb import failed for match %s", match_id)
                    summary["matches_failed"] += 1
                    failures.append(f"Match {match_id}: {error}")

        summary.update(
            {
                "seasons": len(seasons),
                "competitions": Competition.objects.count(),
                "teams": Team.objects.count(),
                "players": Player.objects.count(),
                "matches": Match.objects.filter(season__competition=competition).count(),
                "events": Event.objects.filter(
                    match__season__competition=competition
                ).count(),
            }
        )
        run.summary = summary
        run.error = "\n".join(failures[:20])
        run.status = (
            SyncRun.Status.PARTIAL
            if failures
            else SyncRun.Status.SUCCEEDED
        )
    except Exception as error:
        logger.exception("StatsBomb Premier League sync failed")
        run.status = SyncRun.Status.FAILED
        run.error = str(error)
        run.summary = summary
    finally:
        run.completed_at = timezone.now()
        run.is_active = False
        run.save(
            update_fields=[
                "status",
                "summary",
                "error",
                "completed_at",
                "is_active",
            ]
        )
        close_old_connections()


def start_premier_league_sync():
    if not PipelineSettings.current().sync_enabled:
        raise RuntimeError("StatsBomb syncing is disabled in Admin → Data Pipeline.")
    active = SyncRun.objects.filter(is_active=True).first()
    if active:
        return active, False
    try:
        run = SyncRun.objects.create(
            source="StatsBomb Open Data · Premier League",
            status=SyncRun.Status.QUEUED,
            is_active=True,
        )
    except IntegrityError:
        active = SyncRun.objects.filter(is_active=True).first()
        if active is None:
            raise
        return active, False

    Thread(
        target=sync_premier_league,
        args=(run.pk,),
        name=f"statsbomb-sync-{run.pk}",
        daemon=True,
    ).start()
    return run, True
