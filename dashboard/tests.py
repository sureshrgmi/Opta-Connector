import json
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.contrib.auth.models import AnonymousUser
from django.db import DatabaseError
from django.test import RequestFactory, SimpleTestCase

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
        for path in ("/tables/matches/", "/data/sync/", "/api/data/sync/"):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 302)


class StatsBombSourceTests(SimpleTestCase):
    @patch("dashboard.statsbomb.urlopen")
    def test_fetch_json_reads_official_source_response(self, urlopen_mock):
        response = MagicMock()
        response.__enter__.return_value = BytesIO(b'[{"match_id": 123}]')
        urlopen_mock.return_value = response

        payload = fetch_json("matches/2/27.json")

        self.assertEqual(payload, [{"match_id": 123}])
        request = urlopen_mock.call_args.args[0]
        self.assertIn("statsbomb/open-data/master/data/matches/2/27.json", request.full_url)

    def test_naive_source_timestamps_are_made_timezone_aware(self):
        parsed = _datetime("2025-12-17T14:38:00.447595")

        self.assertIsNotNone(parsed)
        self.assertIsNotNone(parsed.utcoffset())
