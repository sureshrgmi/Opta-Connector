import json
from datetime import date
from io import BytesIO
from types import SimpleNamespace
from urllib.error import HTTPError
from unittest.mock import MagicMock, patch

from django.contrib.auth.models import AnonymousUser, User
from django.db import DatabaseError
from django.core.management import call_command
from django.test import RequestFactory, SimpleTestCase, TestCase

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
from .statsbomb import _datetime, fetch_json
from .views import postgres_health


class PostgresHealthTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()

    def request_as(self, user):
        request = self.factory.get("/api/postgres-health/")
        request.user = user
        return request

    def test_readiness_endpoint_is_public(self):
        response = self.client.get("/healthz/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"ok")

    def test_returns_healthy_status_after_successful_query(self):
        db_connection = MagicMock()
        with patch("dashboard.views.connection", db_connection):
            response = postgres_health(
                self.request_as(SimpleNamespace(is_authenticated=True))
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.content)["status"], "ok")
        db_connection.cursor.return_value.__enter__.return_value.execute.assert_called_once_with(
            "SELECT 1"
        )

    def test_returns_service_unavailable_when_database_fails(self):
        db_connection = MagicMock()
        db_connection.cursor.side_effect = DatabaseError("offline")
        with patch(
            "dashboard.views.connection", db_connection
        ):
            response = postgres_health(
                self.request_as(SimpleNamespace(is_authenticated=True))
            )

        self.assertEqual(response.status_code, 503)
        payload = json.loads(response.content)
        self.assertEqual(payload["status"], "error")
        self.assertIn("checked_at", payload)

    def test_requires_authentication(self):
        response = postgres_health(self.request_as(AnonymousUser()))

        self.assertEqual(response.status_code, 302)

    def test_tables_and_sync_pages_require_authentication(self):
        for path in (
            "/tables/matches/",
            "/data/sync/",
            "/ball-by-ball/",
            "/creator-studio/",
            "/creator-studio/starting-xi/",
            "/explore/",
            "/api/data/sync/",
            "/api/ball-by-ball/matches/",
            "/api/ball-by-ball/matches/1001/360/",
            "/api/explore/options/",
            "/api/explore/data/",
            "/api/creator/starting-xi/teams/",
            "/api/creator/starting-xi/teams/1/players/",
        ):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 302)


class StatsBombSourceTests(SimpleTestCase):
    @patch("dashboard.statsbomb.PipelineSettings.current")
    @patch("dashboard.statsbomb.urlopen")
    def test_fetch_json_reads_official_source_response(
        self, urlopen_mock, settings_mock
    ):
        settings_mock.return_value = SimpleNamespace(
            request_retries=1,
            request_timeout_seconds=9,
        )
        response = MagicMock()
        response.__enter__.return_value = BytesIO(b'[{"match_id": 123}]')
        urlopen_mock.return_value = response

        payload = fetch_json("matches/2/27.json")

        self.assertEqual(payload, [{"match_id": 123}])
        request = urlopen_mock.call_args.args[0]
        self.assertIn("statsbomb/open-data/master/data/matches/2/27.json", request.full_url)
        self.assertEqual(urlopen_mock.call_args.kwargs["timeout"], 9)

    @patch("dashboard.statsbomb.PipelineSettings.current")
    @patch("dashboard.statsbomb.urlopen", side_effect=HTTPError(
        "https://example.test/three-sixty/1001.json", 404, "Not Found", {}, None
    ))
    def test_optional_source_file_404_returns_none(self, _urlopen_mock, settings_mock):
        settings_mock.return_value = SimpleNamespace(
            request_retries=2,
            request_timeout_seconds=9,
        )

        payload = fetch_json("three-sixty/1001.json", allow_missing=True)

        self.assertIsNone(payload)

    def test_naive_source_timestamps_are_made_timezone_aware(self):
        parsed = _datetime("2025-12-17T14:38:00.447595")

        self.assertIsNotNone(parsed)
        self.assertIsNotNone(parsed.utcoffset())


class BallByBallTests(TestCase):
    def setUp(self):
        self.client.force_login(
            User.objects.create_user(
                username="analyst", password="test-password"
            )
        )
        competition = Competition.objects.create(
            source_id=2,
            name="Premier League",
        )
        season = Season.objects.create(
            source_id=27,
            competition=competition,
            name="2015/2016",
        )
        home_team = Team.objects.create(source_id=1, name="Home FC")
        away_team = Team.objects.create(source_id=2, name="Away FC")
        player = Player.objects.create(source_id=11, name="Test Player")
        self.match = Match.objects.create(
            source_id=1001,
            season=season,
            home_team=home_team,
            away_team=away_team,
            home_score=1,
            away_score=0,
        )
        Event.objects.create(
            source_id="00000000-0000-0000-0000-000000000001",
            match=self.match,
            event_index=1,
            period=1,
            minute=3,
            second=12,
            event_type="Pass",
            team=home_team,
            player=player,
            possession=1,
            raw_data={
                "location": [30, 40],
                "pass": {"end_location": [45, 50], "length": 16.4},
            },
        )

    def test_ball_by_ball_page_loads_for_signed_in_users(self):
        response = self.client.get("/ball-by-ball/")

        self.assertEqual(response.status_code, 200)

    def test_creator_studio_page_loads_for_signed_in_users(self):
        response = self.client.get("/creator-studio/")

        self.assertEqual(response.status_code, 200)

    def test_starting_xi_page_loads_for_signed_in_users(self):
        response = self.client.get("/creator-studio/starting-xi/")

        self.assertEqual(response.status_code, 200)

    def test_starting_xi_api_returns_teams_and_latest_player_shirt_numbers(self):
        self.match.date = date(2016, 5, 1)
        self.match.save(update_fields=["date"])
        player = Player.objects.get(source_id=11)
        MatchPlayer.objects.create(
            match=self.match,
            team=self.match.home_team,
            player=player,
            jersey_number=10,
            starting=True,
            positions=[{
                "position": "Goalkeeper",
                "start_reason": "Starting XI",
            }],
        )

        teams_response = self.client.get("/api/creator/starting-xi/teams/")
        roster_response = self.client.get(
            f"/api/creator/starting-xi/teams/{self.match.home_team_id}/players/"
        )

        self.assertEqual(teams_response.status_code, 200)
        self.assertEqual(
            teams_response.json()["teams"],
            [{"id": self.match.home_team_id, "name": self.match.home_team.name}],
        )
        self.assertEqual(roster_response.status_code, 200)
        payload = roster_response.json()
        self.assertEqual(payload["latest_match"]["date"], "2016-05-01")
        self.assertEqual(
            payload["players"],
            [{
                "id": player.source_id,
                "name": player.name,
                "jersey_number": 10,
                "starting": True,
                "position": "Goalkeeper",
            }],
        )

    def test_explore_page_loads_for_signed_in_users(self):
        response = self.client.get("/explore/")

        self.assertEqual(response.status_code, 200)

    def test_explore_options_return_competition_and_match_filters(self):
        response = self.client.get(
            "/api/explore/options/",
            {"match": self.match.source_id},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["competitions"][0]["id"], 2)
        self.assertEqual(payload["seasons"][0]["id"], 27)
        self.assertEqual(payload["matches"][0]["id"], self.match.source_id)
        self.assertEqual(
            {team["id"] for team in payload["teams"]},
            {self.match.home_team_id, self.match.away_team_id},
        )

    def test_explore_data_returns_filtered_match_events_and_metrics(self):
        player = Player.objects.get(source_id=11)
        MatchPlayer.objects.create(
            match=self.match,
            team=self.match.home_team,
            player=player,
            jersey_number=9,
            starting=True,
        )
        Event.objects.create(
            source_id="00000000-0000-0000-0000-000000000002",
            match=self.match,
            event_index=2,
            period=1,
            minute=40,
            second=5,
            event_type="Shot",
            team=self.match.home_team,
            player=player,
            raw_data={
                "location": [110, 40],
                "shot": {
                    "statsbomb_xg": 0.4,
                    "outcome": {"name": "Goal"},
                },
                "play_pattern": {"name": "Regular Play"},
            },
        )

        response = self.client.get(
            "/api/explore/data/",
            {
                "match": self.match.source_id,
                "minute_start": 30,
                "minute_end": 50,
                "phase": "open_play",
                "group_by": "player",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload["events"]), 1)
        self.assertEqual(payload["events"][0]["type"], "Shot")
        self.assertEqual(payload["summary"]["shots"], 1)
        self.assertAlmostEqual(payload["summary"]["xg"], 0.4)
        self.assertEqual(payload["groups"][0]["player_id"], player.source_id)

    def test_explore_data_validates_filters_and_requires_match(self):
        missing_match = self.client.get("/api/explore/data/")
        invalid_phase = self.client.get(
            "/api/explore/data/",
            {"match": self.match.source_id, "phase": "invalid"},
        )

        self.assertEqual(missing_match.status_code, 400)
        self.assertEqual(invalid_phase.status_code, 400)

    def test_match_list_includes_match_event_count_and_score(self):
        response = self.client.get("/api/ball-by-ball/matches/")

        self.assertEqual(response.status_code, 200)
        match = response.json()["matches"][0]
        self.assertEqual(match["id"], self.match.source_id)
        self.assertEqual(match["event_count"], 1)
        self.assertEqual(match["home_score"], 1)
        self.assertEqual(match["home_team_id"], self.match.home_team_id)
        self.assertEqual(match["away_team_id"], self.match.away_team_id)

    def test_event_feed_contains_coordinates_and_complete_source_payload(self):
        response = self.client.get(
            f"/api/ball-by-ball/matches/{self.match.source_id}/events/"
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["match"]["home_team_id"], self.match.home_team_id)
        event = payload["events"][0]
        self.assertEqual(event["location"], [30, 40])
        self.assertEqual(event["end_location"], [45, 50])
        self.assertEqual(event["player_id"], 11)
        self.assertEqual(event["raw_data"]["pass"]["length"], 16.4)

    def test_event_feed_rejects_unknown_match(self):
        response = self.client.get("/api/ball-by-ball/matches/9999/events/")

        self.assertEqual(response.status_code, 404)

    @patch("dashboard.views.fetch_json")
    def test_360_endpoint_fetches_and_caches_freeze_frames(self, fetch_mock):
        frames = [
            {
                "event_uuid": "00000000-0000-0000-0000-000000000001",
                "visible_area": [0, 0, 120, 0, 120, 80],
                "freeze_frame": [{"teammate": True, "actor": True, "location": [30, 40]}],
            }
        ]
        fetch_mock.return_value = frames

        response = self.client.get(f"/api/ball-by-ball/matches/{self.match.source_id}/360/")
        cached_response = self.client.get(
            f"/api/ball-by-ball/matches/{self.match.source_id}/360/"
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["available"])
        self.assertEqual(response.json()["frames"], frames)
        self.assertEqual(cached_response.json()["frames"], frames)
        fetch_mock.assert_called_once_with(
            f"three-sixty/{self.match.source_id}.json",
            allow_missing=True,
        )
        self.assertTrue(Match360Data.objects.filter(match=self.match).exists())

    @patch("dashboard.views.fetch_json", return_value=None)
    def test_360_endpoint_caches_unavailable_match(self, fetch_mock):
        response = self.client.get(f"/api/ball-by-ball/matches/{self.match.source_id}/360/")

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["available"])
        self.assertEqual(response.json()["frames"], [])
        self.assertFalse(Match360Data.objects.get(match=self.match).available)

    @patch("dashboard.views.fetch_json", side_effect=RuntimeError("source offline"))
    def test_360_endpoint_surfaces_source_errors(self, fetch_mock):
        response = self.client.get(f"/api/ball-by-ball/matches/{self.match.source_id}/360/")

        self.assertEqual(response.status_code, 502)
        self.assertIn("could not be loaded", response.json()["detail"])


class AdminAccessTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin",
            email="admin@example.com",
            password="test-password",
        )
        self.admin.access_profile.role = UserAccessProfile.Role.ADMIN
        self.admin.access_profile.save(update_fields=["role", "updated_at"])
        self.analyst = User.objects.create_user(
            username="analyst",
            email="analyst@example.com",
            password="test-password",
        )

    def test_new_users_receive_analyst_role(self):
        user = User.objects.create_user(
            username="new-user",
            email="new@example.com",
            password="test-password",
        )

        self.assertEqual(user.access_profile.role, UserAccessProfile.Role.ANALYST)

    def test_analyst_cannot_access_admin_pages_or_apis(self):
        self.client.force_login(self.analyst)
        for path in (
            "/workspace-admin/users/",
            "/workspace-admin/data-pipeline/",
            "/api/admin/users/",
            "/api/admin/data-pipeline/",
            "/data/sync/",
            "/postgres-check/",
        ):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 403)

    def test_analyst_can_view_overview_ball_by_ball_and_tables(self):
        self.client.force_login(self.analyst)
        for path in ("/", "/ball-by-ball/", "/tables/matches/"):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)

    def test_admin_can_list_users_and_assign_roles(self):
        self.client.force_login(self.admin)

        users_response = self.client.get("/api/admin/users/")
        self.assertEqual(users_response.status_code, 200)
        self.assertEqual(len(users_response.json()["users"]), 2)

        response = self.client.post(
            f"/api/admin/users/{self.analyst.pk}/",
            data=json.dumps({"role": "admin"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.analyst.access_profile.refresh_from_db()
        self.assertEqual(self.analyst.access_profile.role, UserAccessProfile.Role.ADMIN)

    def test_last_active_admin_cannot_be_demoted_or_disabled(self):
        self.client.force_login(self.admin)
        for payload in (
            {"role": "analyst"},
            {"is_active": False},
        ):
            with self.subTest(payload=payload):
                response = self.client.post(
                    f"/api/admin/users/{self.admin.pk}/",
                    data=json.dumps(payload),
                    content_type="application/json",
                )
                self.assertEqual(response.status_code, 400)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)
        self.assertEqual(self.admin.access_profile.role, UserAccessProfile.Role.ADMIN)

    def test_admin_can_update_pipeline_settings(self):
        self.client.force_login(self.admin)
        response = self.client.post(
            "/api/admin/data-pipeline/update/",
            data=json.dumps(
                {
                    "sync_enabled": False,
                    "max_workers": 4,
                    "request_timeout_seconds": 45,
                    "request_retries": 5,
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        settings = PipelineSettings.objects.get()
        self.assertFalse(settings.sync_enabled)
        self.assertEqual(settings.max_workers, 4)
        self.assertEqual(settings.request_timeout_seconds, 45)
        self.assertEqual(settings.request_retries, 5)

    def test_disabling_sync_blocks_sync_start(self):
        PipelineSettings.objects.filter(pk=1).update(sync_enabled=False)
        self.client.force_login(self.admin)

        response = self.client.post("/api/data/sync/start/")

        self.assertEqual(response.status_code, 403)
        self.assertIn("disabled", response.json()["error"])
        self.assertFalse(SyncRun.objects.exists())

    def test_pipeline_settings_validate_ranges(self):
        self.client.force_login(self.admin)
        response = self.client.post(
            "/api/admin/data-pipeline/update/",
            data=json.dumps({"max_workers": 99}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(PipelineSettings.objects.get().max_workers, 8)

    def test_promote_to_admin_management_command(self):
        call_command("promote_to_admin", self.analyst.email)
        self.analyst.access_profile.refresh_from_db()

        self.assertEqual(self.analyst.access_profile.role, UserAccessProfile.Role.ADMIN)
