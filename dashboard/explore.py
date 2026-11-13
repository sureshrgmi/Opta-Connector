from collections import defaultdict

from .models import Event, MatchPlayer


METRIC_KEYS = (
    "xg", "xa", "key_passes", "pressures", "progressive_passes",
    "progressive_carries", "tackles", "interceptions",
)


def _record(value):
    return value if isinstance(value, dict) else {}


def _name(value):
    return value.get("name") if isinstance(value, dict) else None


def _coordinate(value):
    if isinstance(value, list) and len(value) >= 2 and all(
        isinstance(point, (int, float)) and not isinstance(point, bool)
        for point in value[:2]
    ):
        return value[:2]
    return None


def _end_location(raw):
    for action_name in ("pass", "shot", "carry", "dribble"):
        action = _record(raw.get(action_name))
        value = _coordinate(action.get("end_location"))
        if value:
            return value
    return None


def _phase(raw):
    pattern = (_name(raw.get("play_pattern")) or "").lower()
    if raw.get("counterpress"):
        return "counterpress"
    if any(token in pattern for token in ("corner", "free kick", "penalty", "throw-in")):
        return "set_piece"
    return "open_play"


def _clock_minutes(value):
    if isinstance(value, (int, float)):
        return float(value)
    if not isinstance(value, str):
        return None
    try:
        parts = [float(part) for part in value.split(":")]
    except ValueError:
        return None
    if len(parts) == 2:
        return parts[0] + parts[1] / 60
    if len(parts) == 3:
        return parts[0] * 60 + parts[1] + parts[2] / 60
    return None


def _minutes_played(positions, fallback, minute_start=0, minute_end=130):
    intervals = []
    for raw_position in positions if isinstance(positions, list) else []:
        position = _record(raw_position)
        start = _clock_minutes(position.get("from"))
        end = _clock_minutes(position.get("to"))
        if start is None or end is None or end < start:
            continue
        start = max(start, minute_start)
        end = min(end, minute_end)
        if end > start:
            intervals.append((start, end))
    if not intervals:
        return max(1.0, min(float(fallback), minute_end - minute_start))
    intervals.sort()
    total = 0.0
    start, end = intervals[0]
    for next_start, next_end in intervals[1:]:
        if next_start <= end:
            end = max(end, next_end)
        else:
            total += end - start
            start, end = next_start, next_end
    return max(1.0, min(total + end - start, minute_end - minute_start))


def analyze_match(match, minute_start=0, minute_end=130, phase="all", team_id=None, player_id=None, group_by="player"):
    queryset = (
        Event.objects.filter(match=match)
        .select_related("team", "player")
        .order_by("event_index")
    )
    if team_id:
        queryset = queryset.filter(team_id=team_id)
    if player_id:
        queryset = queryset.filter(player_id=player_id)

    summary = {
        "events": 0, "shots": 0, "xg": 0.0, "xa": 0.0, "key_passes": 0,
        "pressures": 0, "passes_attempted": 0, "passes_completed": 0,
        "pass_completion_pct": 0.0, "progressive_actions": 0,
    }
    stats = defaultdict(lambda: {key: 0.0 for key in (*METRIC_KEYS, "passes_attempted", "passes_completed")})
    rows = []
    directions = {
        (match.home_team_id, 1): 1, (match.home_team_id, 2): -1,
        (match.away_team_id, 1): -1, (match.away_team_id, 2): 1,
    }
    cumulative = defaultdict(float)
    pass_players = {}
    shot_assists = []
    xg_race = defaultdict(list)

    for event in queryset:
        raw = _record(event.raw_data)
        event_phase = _phase(raw)
        if event.minute < minute_start or event.minute > minute_end:
            continue
        if phase != "all" and event_phase != phase:
            continue

        kind = event.event_type.lower()
        shot = _record(raw.get("shot"))
        pass_data = _record(raw.get("pass"))
        start = _coordinate(raw.get("location"))
        end = _end_location(raw)
        try:
            xg = max(0.0, float(shot.get("statsbomb_xg", 0) or 0))
        except (TypeError, ValueError):
            xg = 0.0
        key_pass = bool(pass_data.get("shot_assist") or pass_data.get("goal_assist"))
        bucket = stats[event.player_id] if event.player_id else None
        summary["events"] += 1

        if kind == "shot":
            summary["shots"] += 1
            summary["xg"] += xg
            key_pass_id = shot.get("key_pass_id")
            if key_pass_id:
                shot_assists.append((str(key_pass_id), xg))
            if event.team_id:
                cumulative[event.team_id] += xg
                xg_race[event.team_id].append({
                    "minute": event.minute,
                    "cumulative_xg": round(cumulative[event.team_id], 3),
                    "goal": _name(shot.get("outcome")) == "Goal",
                })
            if bucket is not None:
                bucket["xg"] += xg
        if kind == "pass":
            pass_players[str(event.source_id)] = event.player_id
            complete = pass_data.get("outcome") is None
            summary["passes_attempted"] += 1
            summary["passes_completed"] += int(complete)
            if bucket is not None:
                bucket["passes_attempted"] += 1
                bucket["passes_completed"] += int(complete)
                bucket["key_passes"] += int(key_pass)
            summary["key_passes"] += int(key_pass)
            if start and end and event.team_id:
                direction = directions.get((event.team_id, event.period), 1)
                if (end[0] - start[0]) * direction >= 10:
                    summary["progressive_actions"] += 1
                    if bucket is not None:
                        bucket["progressive_passes"] += 1
        elif kind == "pressure":
            summary["pressures"] += 1
            if bucket is not None:
                bucket["pressures"] += 1
        elif kind == "tackle" and bucket is not None:
            bucket["tackles"] += 1
        elif kind == "interception" and bucket is not None:
            bucket["interceptions"] += 1
        elif kind == "carry" and start and end and event.team_id:
            direction = directions.get((event.team_id, event.period), 1)
            if (end[0] - start[0]) * direction >= 10:
                summary["progressive_actions"] += 1
                if bucket is not None:
                    bucket["progressive_carries"] += 1

        rows.append({
            "id": str(event.source_id), "index": event.event_index,
            "period": event.period, "minute": event.minute, "second": event.second,
            "type": event.event_type, "team": event.team.name if event.team else None,
            "team_id": event.team_id, "player": event.player.name if event.player else None,
            "player_id": event.player_id, "location": start, "end_location": end,
            "phase": event_phase, "xg": xg if kind == "shot" else None,
            "shot_outcome": _name(shot.get("outcome")) if kind == "shot" else None,
            "key_pass": key_pass,
            "completed": kind == "pass" and pass_data.get("outcome") is None,
            "pass_receiver_id": _record(pass_data.get("recipient")).get("id"),
            "pass_receiver": _record(pass_data.get("recipient")).get("name"),
        })

    for pass_id, assisted_xg in shot_assists:
        assister_id = pass_players.get(pass_id)
        if assister_id:
            stats[assister_id]["xa"] += assisted_xg
            summary["xa"] += assisted_xg

    summary["xg"] = round(summary["xg"], 3)
    summary["pass_completion_pct"] = round(
        summary["passes_completed"] * 100 / summary["passes_attempted"], 1
    ) if summary["passes_attempted"] else 0

    player_rows = []
    lineups = MatchPlayer.objects.filter(match=match).select_related("player", "team")
    if team_id:
        lineups = lineups.filter(team_id=team_id)
    if player_id:
        lineups = lineups.filter(player_id=player_id)
    for lineup in lineups:
        bucket = stats[lineup.player_id]
        minutes = _minutes_played(lineup.positions, 90, minute_start, minute_end)
        denominator = max(1.0, min(minutes, minute_end - minute_start))
        player_rows.append({
            "player_id": lineup.player_id,
            "player": lineup.player.name,
            "team_id": lineup.team_id,
            "team": lineup.team.name,
            "minutes_played": round(minutes, 1),
            "passes_attempted": int(bucket["passes_attempted"]),
            "passes_completed": int(bucket["passes_completed"]),
            "per90": {key: round(bucket[key] * 90 / denominator, 3) for key in METRIC_KEYS},
            "pass_completion_pct": round(
                bucket["passes_completed"] * 100 / bucket["passes_attempted"], 1
            ) if bucket["passes_attempted"] else 0,
        })

    team_xg = defaultdict(float)
    for event_row in rows:
        if event_row["xg"] is not None and event_row["team_id"] is not None:
            team_xg[event_row["team_id"]] += event_row["xg"]
    summary["xg_by_team"] = {str(key): round(value, 3) for key, value in team_xg.items()}

    groups = []
    if group_by == "player":
        for item in player_rows:
            bucket = stats[item["player_id"]]
            groups.append({
                "player_id": item["player_id"], "team_id": item["team_id"],
                "player": item["player"], "name": item["player"],
                **{key: round(bucket[key], 3) for key in METRIC_KEYS},
                "pass_completion_pct": item["pass_completion_pct"],
            })
    elif group_by == "team":
        by_team = defaultdict(lambda: {key: 0.0 for key in METRIC_KEYS})
        for item in player_rows:
            for key in METRIC_KEYS:
                by_team[item["team_id"]][key] += stats[item["player_id"]][key]
        for team in (match.home_team, match.away_team):
            if team_id and team.source_id != team_id:
                continue
            metric = by_team[team.source_id]
            attempts = sum(stats[item["player_id"]]["passes_attempted"] for item in player_rows if item["team_id"] == team.source_id)
            completed = sum(stats[item["player_id"]]["passes_completed"] for item in player_rows if item["team_id"] == team.source_id)
            groups.append({
                "team_id": team.source_id, "name": team.name,
                **{key: round(metric[key], 3) for key in METRIC_KEYS},
                "pass_completion_pct": round(completed * 100 / attempts, 1) if attempts else 0,
            })
    else:
        groups.append({
            "name": f"{match.home_team.name} v {match.away_team.name}",
            **{key: round(summary[key] if key in summary else 0, 3) for key in METRIC_KEYS},
            "pass_completion_pct": summary["pass_completion_pct"],
        })

    return {
        "match": {
            "id": match.source_id, "date": match.date.isoformat() if match.date else None,
            "season": match.season.name, "home_team": match.home_team.name,
            "home_team_id": match.home_team_id, "home_score": match.home_score,
            "away_team": match.away_team.name, "away_team_id": match.away_team_id,
            "away_score": match.away_score,
        },
        "events": rows,
        "players": sorted(player_rows, key=lambda row: (row["team"], row["player"].lower())),
        "summary": summary,
        "groups": groups,
        "xg_race": {str(team_id): points for team_id, points in xg_race.items()},
    }