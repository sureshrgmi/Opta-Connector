from django.db import models
from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator


class Competition(models.Model):
    source_id = models.PositiveIntegerField(primary_key=True)
    name = models.CharField(max_length=120)
    country = models.CharField(max_length=120, blank=True)
    gender = models.CharField(max_length=20, blank=True)
    raw_data = models.JSONField(default=dict)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Season(models.Model):
    source_id = models.PositiveIntegerField(primary_key=True)
    competition = models.ForeignKey(
        Competition, related_name="seasons", on_delete=models.CASCADE
    )
    name = models.CharField(max_length=40)
    match_updated = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-name"]

    def __str__(self):
        return f"{self.competition.name} {self.name}"


class Team(models.Model):
    source_id = models.PositiveIntegerField(primary_key=True)
    name = models.CharField(max_length=120)
    country = models.CharField(max_length=120, blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Player(models.Model):
    source_id = models.PositiveIntegerField(primary_key=True)
    name = models.CharField(max_length=160)
    country = models.CharField(max_length=120, blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Match(models.Model):
    source_id = models.PositiveIntegerField(primary_key=True)
    season = models.ForeignKey(Season, related_name="matches", on_delete=models.CASCADE)
    date = models.DateField(null=True, blank=True)
    kick_off = models.TimeField(null=True, blank=True)
    home_team = models.ForeignKey(
        Team, related_name="home_matches", on_delete=models.PROTECT
    )
    away_team = models.ForeignKey(
        Team, related_name="away_matches", on_delete=models.PROTECT
    )
    home_score = models.PositiveSmallIntegerField(null=True, blank=True)
    away_score = models.PositiveSmallIntegerField(null=True, blank=True)
    match_week = models.PositiveSmallIntegerField(null=True, blank=True)
    stage = models.CharField(max_length=120, blank=True)
    stadium = models.CharField(max_length=160, blank=True)
    referee = models.CharField(max_length=120, blank=True)
    source_updated = models.DateTimeField(null=True, blank=True)
    raw_data = models.JSONField(default=dict)

    class Meta:
        ordering = ["-date", "source_id"]
        indexes = [models.Index(fields=["season", "date"])]

    def __str__(self):
        return f"{self.home_team} v {self.away_team}"


class MatchPlayer(models.Model):
    match = models.ForeignKey(Match, related_name="lineup", on_delete=models.CASCADE)
    team = models.ForeignKey(Team, on_delete=models.PROTECT)
    player = models.ForeignKey(Player, on_delete=models.PROTECT)
    jersey_number = models.PositiveSmallIntegerField(null=True, blank=True)
    starting = models.BooleanField(default=False)
    positions = models.JSONField(default=list)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["match", "team", "player"], name="unique_match_team_player"
            )
        ]
        ordering = ["match_id", "team_id", "jersey_number", "player_id"]


class Event(models.Model):
    source_id = models.UUIDField(primary_key=True)
    match = models.ForeignKey(Match, related_name="events", on_delete=models.CASCADE)
    event_index = models.PositiveIntegerField()
    period = models.PositiveSmallIntegerField()
    minute = models.PositiveSmallIntegerField()
    second = models.PositiveSmallIntegerField(default=0)
    event_type = models.CharField(max_length=80)
    team = models.ForeignKey(Team, null=True, blank=True, on_delete=models.PROTECT)
    player = models.ForeignKey(Player, null=True, blank=True, on_delete=models.PROTECT)
    possession = models.PositiveIntegerField(null=True, blank=True)
    raw_data = models.JSONField(default=dict)

    class Meta:
        ordering = ["match_id", "event_index"]
        indexes = [
            models.Index(fields=["match", "event_index"]),
            models.Index(fields=["event_type"]),
        ]


class Match360Data(models.Model):
    match = models.OneToOneField(
        Match, related_name="statsbomb_360", on_delete=models.CASCADE
    )
    available = models.BooleanField(default=True)
    frames = models.JSONField(default=list)
    checked_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "StatsBomb 360 match data"
        verbose_name_plural = "StatsBomb 360 match data"


class SyncRun(models.Model):
    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        RUNNING = "running", "Running"
        SUCCEEDED = "succeeded", "Succeeded"
        PARTIAL = "partial", "Partially succeeded"
        FAILED = "failed", "Failed"

    source = models.CharField(max_length=80, default="StatsBomb Open Data")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.QUEUED)
    is_active = models.BooleanField(default=True)
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    summary = models.JSONField(default=dict)
    error = models.TextField(blank=True)

    class Meta:
        ordering = ["-started_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["is_active"],
                condition=models.Q(is_active=True),
                name="one_active_statsbomb_sync",
            )
        ]


class UserAccessProfile(models.Model):
    class Role(models.TextChoices):
        ANALYST = "analyst", "Analyst"
        ADMIN = "admin", "Admin"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        related_name="access_profile",
        on_delete=models.CASCADE,
    )
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.ANALYST)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user} ({self.get_role_display()})"


class PipelineSettings(models.Model):
    sync_enabled = models.BooleanField(default=True)
    max_workers = models.PositiveSmallIntegerField(
        default=8, validators=[MinValueValidator(1), MaxValueValidator(16)]
    )
    request_timeout_seconds = models.PositiveSmallIntegerField(
        default=30, validators=[MinValueValidator(5), MaxValueValidator(120)]
    )
    request_retries = models.PositiveSmallIntegerField(
        default=3, validators=[MinValueValidator(1), MaxValueValidator(10)]
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Pipeline settings"
        verbose_name_plural = "Pipeline settings"

    @classmethod
    def current(cls):
        settings, _ = cls.objects.get_or_create(pk=1)
        return settings
