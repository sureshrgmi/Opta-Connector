import { useEffect, useMemo, useState } from "react";
import { Activity, CircleAlert, LoaderCircle, SlidersHorizontal } from "lucide-react";
import type {
  ExploreChart,
  ExploreData,
  ExploreEvent,
  ExploreOptions,
  ExplorePlayerMetrics,
} from "./types";
import { PITCH_VIEWBOX, STATSBOMB_PITCH, StatsBombPitch } from "../shared/StatsBombPitch";
import "./explore.css";

const METRICS = [
  { key: "xg", label: "xG" },
  { key: "xa", label: "xA" },
  { key: "key_passes", label: "Key passes" },
  { key: "pressures", label: "Pressures" },
  { key: "progressive_passes", label: "Progressive passes" },
  { key: "progressive_carries", label: "Progressive carries" },
  { key: "tackles", label: "Tackles" },
  { key: "interceptions", label: "Interceptions" },
  { key: "pass_completion_pct", label: "Pass completion %" },
] as const;
const TABLE_METRICS = METRICS.filter((metric) => metric.key !== "pass_completion_pct");

const CHARTS: { id: ExploreChart; label: string }[] = [
  { id: "shots", label: "Shot map" },
  { id: "network", label: "Passing network" },
  { id: "heatmap", label: "Pressure / touch heatmap" },
  { id: "radar", label: "Player percentile profile" },
  { id: "scatter", label: "Player comparison scatter" },
  { id: "xg", label: "Cumulative xG race" },
];

const metricLabel = (key: string) => METRICS.find((metric) => metric.key === key)?.label || key;

async function fetchResult<T>(url: string, signal: AbortSignal, fallback: string): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  const payload = await response.json() as T & { detail?: string };
  if (!response.ok) throw new Error(payload.detail || fallback);
  return payload;
}

function percentile(players: ExplorePlayerMetrics[], playerId: number, metric: string) {
  const values = players
    .map((player) => metric === "pass_completion_pct"
      ? player.pass_completion_pct
      : player.per90[metric] || 0)
    .sort((left, right) => left - right);
  const selected = players.find((player) => player.player_id === playerId);
  if (!selected || !values.length) return 0;
  const value = metric === "pass_completion_pct"
    ? selected.pass_completion_pct
    : selected.per90[metric] || 0;
  const rank = values.filter((item) => item <= value).length;
  return Math.round((rank / values.length) * 100);
}

function pointsForRadar(values: number[], cx: number, cy: number, radius: number) {
  return values.map((value, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / values.length;
    const distance = radius * Math.max(0, Math.min(100, value)) / 100;
    return `${cx + Math.cos(angle) * distance},${cy + Math.sin(angle) * distance}`;
  }).join(" ");
}

function xgValue(event: ExploreEvent) {
  return event.xg ?? 0;
}

function ExploreGraphic({
  data,
  chart,
  selectedPlayerId,
  comparePlayerId,
  xMetric,
  yMetric,
  heatmapMetric,
}: {
  data: ExploreData;
  chart: ExploreChart;
  selectedPlayerId: number | null;
  comparePlayerId: number | null;
  xMetric: string;
  yMetric: string;
  heatmapMetric: string;
}) {
  const { width, height } = PITCH_VIEWBOX;
  const pitch = STATSBOMB_PITCH;
  const px = (value: number) => pitch.x + (value / 120) * pitch.width;
  const py = (value: number) => pitch.y + ((80 - value) / 80) * pitch.height;
  const selectedPlayer = data.players.find((player) => player.player_id === selectedPlayerId);
  const comparePlayer = data.players.find((player) => player.player_id === comparePlayerId);
  const teamColor = (teamId: number | null) =>
    teamId === data.match.home_team_id ? "#167668" : "#c28b3c";
  const shotColor = (outcome: string | null, teamId: number | null) => {
    const name = outcome?.toLowerCase() || "";
    if (name.includes("goal")) return "#167668";
    if (name.includes("saved")) return "#4e86a5";
    if (name.includes("blocked")) return "#c28b3c";
    if (name.includes("off t") || name.includes("wayward") || name.includes("post")) return "#8595a3";
    return teamColor(teamId);
  };
  if (chart === "xg") {
    const allPoints = Object.entries(data.xg_race);
    const maxXg = Math.max(1, ...allPoints.flatMap(([, points]) =>
      points.map((point) => point.cumulative_xg),
    ));
    const x = (minute: number) => 90 + (minute / 120) * 830;
    const y = (value: number) => 465 - (value / maxXg) * 360;
    return (
      <svg className="explore-chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Cumulative expected goals by match minute">
        <rect width={width} height={height} rx="9" fill="var(--neutral-900)" />
        {[0, 1, 2, 3, 4].map((step) => (
          <g key={step}>
            <line x1="90" y1={y(maxXg * step / 4)} x2="920" y2={y(maxXg * step / 4)} stroke="color-mix(in srgb, var(--color-text) 10%, transparent)" />
            <text x="76" y={y(maxXg * step / 4) + 4} fill="var(--neutral-500)" fontSize="var(--font-3xl)" textAnchor="end">
              {(maxXg * step / 4).toFixed(1)}
            </text>
          </g>
        ))}
        {[0, 15, 30, 45, 60, 75, 90, 105, 120].map((minute) => (
          <text key={minute} x={x(minute)} y="505" fill="var(--neutral-500)" fontSize="var(--font-3xl)" textAnchor="middle">{minute}&apos;</text>
        ))}
        {allPoints.map(([teamId, points]) => {
          const linePath = points.reduce((path, point, index) => {
            if (index === 0) return `M ${x(point.minute)} ${y(point.cumulative_xg)}`;
            const previous = points[index - 1];
            return `${path} L ${x(point.minute)} ${y(previous.cumulative_xg)} L ${x(point.minute)} ${y(point.cumulative_xg)}`;
          }, "");
          return (
            <g key={teamId}>
              <path d={linePath} fill="none" stroke={teamColor(Number(teamId))} strokeWidth="4" strokeLinejoin="round" />
              {points.filter((point) => point.goal).map((point, index) => (
                <path key={`${point.minute}-${index}`} d={`M ${x(point.minute)} ${y(point.cumulative_xg) - 7} l 7 7 -7 7 -7 -7 Z`} fill={teamColor(Number(teamId))} stroke="var(--neutral-0)" strokeWidth="1.5" />
              ))}
            </g>
          );
        })}
        <text x="90" y="34" fill="var(--color-text)" fontSize="var(--font-3xl)" fontWeight="700">CUMULATIVE EXPECTED GOALS</text>
        <text x="90" y="535" fill="var(--neutral-500)" fontSize="var(--font-3xl)">{data.match.home_team}  ·  {data.match.away_team}</text>
      </svg>
    );
  }

  if (chart === "radar") {
    const radarMetrics = ["xg", "xa", "progressive_passes", "progressive_carries", "pressures", "tackles"];
    const selectedValues = radarMetrics.map((metric) =>
      selectedPlayer ? percentile(data.players, selectedPlayer.player_id, metric) : 0,
    );
    const comparedValues = radarMetrics.map((metric) =>
      comparePlayer ? percentile(data.players, comparePlayer.player_id, metric) : 0,
    );
    const cx = width / 2;
    const cy = 275;
    const radius = 175;
    return (
      <svg className="explore-chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Player percentile radar profile">
        <rect width={width} height={height} rx="9" fill="var(--neutral-900)" />
        {[20, 40, 60, 80, 100].map((level) => (
          <polygon key={level} points={pointsForRadar(radarMetrics.map(() => level), cx, cy, radius)} fill="none" stroke="var(--neutral-200)" />
        ))}
        {radarMetrics.map((metric, index) => {
          const angle = -Math.PI / 2 + (index * 2 * Math.PI) / radarMetrics.length;
          const endX = cx + Math.cos(angle) * radius;
          const endY = cy + Math.sin(angle) * radius;
          const labelX = cx + Math.cos(angle) * (radius + 38);
          const labelY = cy + Math.sin(angle) * (radius + 38);
          return (
            <g key={metric}>
              <line x1={cx} y1={cy} x2={endX} y2={endY} stroke="var(--neutral-200)" />
              <text x={labelX} y={labelY + 4} fill="var(--neutral-300)" fontSize="var(--font-3xl)" textAnchor="middle">{metricLabel(metric)}</text>
            </g>
          );
        })}
        {selectedPlayer && (
          <polygon points={pointsForRadar(selectedValues, cx, cy, radius)} fill="color-mix(in srgb, var(--neutral-300) 18.82%, transparent)" stroke="var(--neutral-300)" strokeWidth="3" />
        )}
        {comparePlayer && (
          <polygon points={pointsForRadar(comparedValues, cx, cy, radius)} fill="color-mix(in srgb, var(--neutral-300) 14.51%, transparent)" stroke="var(--neutral-300)" strokeWidth="3" />
        )}
        <text x="90" y="36" fill="var(--color-text)" fontSize="var(--font-3xl)" fontWeight="700">MATCH-PEER PERCENTILES · PER 90</text>
        <text x="90" y="525" fill="var(--neutral-300)" fontSize="var(--font-3xl)">{selectedPlayer?.player || "Select a player"}</text>
        <text x="330" y="525" fill="var(--neutral-300)" fontSize="var(--font-3xl)">{comparePlayer?.player || ""}</text>
      </svg>
    );
  }

  if (chart === "scatter") {
    const xValues = data.players.map((player) => metricValue(player, xMetric));
    const yValues = data.players.map((player) => metricValue(player, yMetric));
    const maxX = Math.max(1, ...xValues) * 1.1;
    const maxY = Math.max(1, ...yValues) * 1.1;
    const sx = (value: number) => 90 + (value / maxX) * 820;
    const sy = (value: number) => 455 - (value / maxY) * 370;
    const meanX = xValues.reduce((sum, value) => sum + value, 0) / Math.max(1, xValues.length);
    const meanY = yValues.reduce((sum, value) => sum + value, 0) / Math.max(1, yValues.length);
    return (
      <svg className="explore-chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Player comparison: ${metricLabel(xMetric)} and ${metricLabel(yMetric)}`}>
        <rect width={width} height={height} rx="9" fill="var(--neutral-900)" />
        <line x1={sx(meanX)} y1="76" x2={sx(meanX)} y2="455" stroke="var(--neutral-200)" strokeDasharray="5 5" />
        <line x1="90" y1={sy(meanY)} x2="910" y2={sy(meanY)} stroke="var(--neutral-200)" strokeDasharray="5 5" />
        {data.players.map((player) => {
          const xValue = metricValue(player, xMetric);
          const yValue = metricValue(player, yMetric);
          const highlighted = player.player_id === selectedPlayerId || player.player_id === comparePlayerId;
          return (
            <g key={player.player_id}>
              <circle cx={sx(xValue)} cy={sy(yValue)} r={highlighted ? 7 : 4} fill={teamColor(player.team_id)} fillOpacity={highlighted ? 1 : .55} stroke={highlighted ? "var(--neutral-0)" : "none"} />
              {highlighted && <text x={sx(xValue) + 9} y={sy(yValue) - 8} fill="var(--color-text)" fontSize="var(--font-3xl)">{player.player}</text>}
            </g>
          );
        })}
        <text x="90" y="36" fill="var(--color-text)" fontSize="var(--font-3xl)" fontWeight="700">PLAYER PERFORMANCE · PER 90</text>
        <text x="500" y="520" fill="var(--neutral-300)" fontSize="var(--font-3xl)" textAnchor="middle">{metricLabel(xMetric)}</text>
        <text x="28" y="270" fill="var(--neutral-300)" fontSize="var(--font-3xl)" textAnchor="middle" transform="rotate(-90 28 270)">{metricLabel(yMetric)}</text>
        <text x="90" y="485" fill="var(--neutral-500)" fontSize="var(--font-3xl)">Dashed lines show match-peer averages</text>
      </svg>
    );
  }

  const chartEvents = chart === "shots"
    ? data.events.filter((event) => event.type.toLowerCase() === "shot" && event.location)
    : chart === "heatmap"
      ? data.events.filter((event) => {
        const type = event.type.toLowerCase();
        return event.location && (
          heatmapMetric === "pressure" ? type === "pressure"
            : heatmapMetric === "receipt" ? type === "ball receipt*"
              : ["pressure", "ball receipt*", "pass", "carry", "shot", "dribble"].includes(type)
        );
      })
      : [];
  const heatCells = useMemo(() => {
    const cells = new Map<string, number>();
    for (const event of chartEvents) {
      if (!event.location) continue;
      const col = Math.min(11, Math.max(0, Math.floor(event.location[0] / 10)));
      const row = Math.min(7, Math.max(0, Math.floor(event.location[1] / 10)));
      const key = `${col}:${row}`;
      cells.set(key, (cells.get(key) || 0) + 1);
    }
    return cells;
  }, [chartEvents]);

  const positions = new Map<number, { teamId: number; name: string; x: number; y: number; n: number }>();
  const links = new Map<string, { from: number; to: number; teamId: number; volume: number }>();
  if (chart === "network") {
    for (const event of data.events) {
      if (!event.location || event.player_id === null || event.team_id === null) continue;
      const player = positions.get(event.player_id) || {
        teamId: event.team_id,
        name: event.player || "",
        x: 0,
        y: 0,
        n: 0,
      };
      player.x += event.location[0];
      player.y += event.location[1];
      player.n += 1;
      positions.set(event.player_id, player);
      if (event.type.toLowerCase() === "pass" && event.completed && event.pass_receiver_id) {
        const key = `${event.player_id}:${event.pass_receiver_id}`;
        const link = links.get(key) || {
          from: event.player_id,
          to: event.pass_receiver_id,
          teamId: event.team_id,
          volume: 0,
        };
        link.volume += 1;
        links.set(key, link);
      }
    }
  }
  const pitchPlayers = Array.from(positions.entries()).map(([id, player]) =>
    ({ id, ...player, x: player.x / player.n, y: player.y / player.n }),
  );
  const playerById = new Map(pitchPlayers.map((player) => [player.id, player]));

  return (
    <svg className="explore-chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={chart === "shots" ? "Match shot map" : chart === "network" ? "Match passing network" : "Match action heatmap"}>
      <rect width={width} height={height} rx="9" fill="var(--neutral-900)" />
      <StatsBombPitch />
      {chart === "shots" && chartEvents.map((event) => (
        <g key={event.id}>
          <circle
            cx={px(event.location![0])}
            cy={py(event.location![1])}
            r={5 + Math.min(10, xgValue(event) * 32)}
            fill={shotColor(event.shot_outcome, event.team_id)}
            fillOpacity=".87"
            stroke={event.shot_outcome?.toLowerCase() === "goal" ? "var(--neutral-0)" : "var(--neutral-900)"}
            strokeWidth="2"
          />
          <title>{`${event.minute}:${String(event.second).padStart(2, "0")} · ${event.player || "Unknown"} · xG ${xgValue(event).toFixed(2)} · ${event.shot_outcome || "Shot"}`}</title>
        </g>
      ))}
      {chart === "heatmap" && Array.from(heatCells, ([key, count]) => {
        const [col, row] = key.split(":").map(Number);
        const intensity = Math.min(.82, .12 + count / Math.max(1, chartEvents.length) * 14);
        return (
          <rect
            key={key}
            x={pitch.x + col * (pitch.width / 12)}
            y={pitch.y + (7 - row) * (pitch.height / 8)}
            width={pitch.width / 12}
            height={pitch.height / 8}
            fill="var(--neutral-300)"
            fillOpacity={intensity}
          >
            <title>{`${count} ${heatmapMetric === "pressure" ? "pressures" : "actions"}`}</title>
          </rect>
        );
      })}
      {chart === "network" && (
        <>
          {Array.from(links.values()).map((link) => {
            const from = playerById.get(link.from);
            const to = playerById.get(link.to);
            if (!from || !to) return null;
            return (
              <line
                key={`${link.from}-${link.to}`}
                x1={px(from.x)}
                y1={py(from.y)}
                x2={px(to.x)}
                y2={py(to.y)}
                stroke={teamColor(link.teamId)}
                strokeOpacity=".45"
                strokeWidth={Math.min(5, 1 + link.volume * .55)}
              >
                <title>{`${from.name} → ${to.name}: ${link.volume} passes`}</title>
              </line>
            );
          })}
          {pitchPlayers.map((player) => (
            <g key={player.id}>
              <circle cx={px(player.x)} cy={py(player.y)} r="9" fill={teamColor(player.teamId)} stroke="var(--neutral-900)" strokeWidth="2" />
              <text x={px(player.x)} y={py(player.y) - 13} fill="var(--neutral-100)" fontSize="var(--font-3xl)" textAnchor="middle" paintOrder="stroke" stroke="var(--neutral-900)" strokeWidth="3">{player.name}</text>
            </g>
          ))}
        </>
      )}
      <text x="72" y="34" fill="var(--color-text)" fontSize="var(--font-3xl)" fontWeight="700">
        {chart === "shots" ? "SHOT MAP · MARKER SIZE = xG" : chart === "network" ? "PASS NETWORK · LINE WIDTH = PASS VOLUME" : `SPATIAL DENSITY · ${heatmapMetric.toUpperCase()}`}
      </text>
      {chart === "shots" ? (
        <g fontSize="var(--font-3xl)">
          {[
            ["Goal", "#167668"],
            ["Saved", "#4e86a5"],
            ["Blocked", "#c28b3c"],
            ["Off target", "#8595a3"],
          ].map(([label, color], index) => (
            <g key={label} transform={`translate(${310 + index * 120} 538)`}>
              <circle r="5" fill={color} />
              <text x="10" y="4" fill="var(--neutral-300)">{label}</text>
            </g>
          ))}
        </g>
      ) : null}
      <text x="72" y="538" fill="var(--neutral-500)" fontSize="var(--font-3xl)">{chart === "shots" ? "StatsBomb 120 × 80" : `${data.match.home_team}  ·  ${data.match.away_team}  ·  StatsBomb 120 × 80`}</text>
    </svg>
  );
}

function metricValue(player: ExplorePlayerMetrics, metric: string) {
  return metric === "pass_completion_pct"
    ? player.pass_completion_pct
    : player.per90[metric] || 0;
}

export default function ExplorePage() {
  const [options, setOptions] = useState<ExploreOptions>({
    competitions: [], seasons: [], matches: [], teams: [], players: [],
  });
  const [competitionId, setCompetitionId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [matchId, setMatchId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [phase, setPhase] = useState("all");
  const [minuteStart, setMinuteStart] = useState(0);
  const [minuteEnd, setMinuteEnd] = useState(120);
  const [chart, setChart] = useState<ExploreChart>("shots");
  const [groupBy, setGroupBy] = useState<"player" | "team" | "match">("player");
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([
    "xg",
    "xa",
    "key_passes",
    "pressures",
  ]);
  const [comparePlayerId, setComparePlayerId] = useState("");
  const [xMetric, setXMetric] = useState("progressive_passes");
  const [yMetric, setYMetric] = useState("xa");
  const [heatmapMetric, setHeatmapMetric] = useState("all");
  const [data, setData] = useState<ExploreData | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (competitionId) params.set("competition", competitionId);
    if (seasonId) params.set("season", seasonId);
    if (matchId) params.set("match", matchId);
    if (teamId) params.set("team", teamId);
    setOptionsLoading(true);
    fetchResult<ExploreOptions>(
      `/api/explore/options/?${params}`,
      controller.signal,
      "Could not load StatsBomb filters.",
    )
      .then((result) => {
        setOptions(result);
        setError("");
        if (!competitionId && result.competitions[0]) {
          setCompetitionId(String(result.competitions[0].id));
        }
        if (!seasonId) {
          const season = result.seasons.find((item) => String(item.competition_id) === competitionId)
            || result.seasons[0];
          if (season) setSeasonId(String(season.id));
        }
        const activeSeasonId = seasonId
          || String(result.seasons.find((item) => String(item.competition_id) === competitionId)?.id || "");
        const firstSeasonMatch = result.matches.find(
          (match) => String(match.season_id) === activeSeasonId,
        );
        if (!matchId && firstSeasonMatch) setMatchId(String(firstSeasonMatch.id));
        if (playerId && !result.players.some((player) => String(player.id) === playerId)) {
          setPlayerId("");
        }
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Could not load StatsBomb filters.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setOptionsLoading(false);
      });
    return () => controller.abort();
  }, [competitionId, seasonId, matchId, teamId]);

  useEffect(() => {
    if (!matchId) {
      setData(null);
      setDataLoading(false);
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({
      match: matchId,
      minute_start: String(minuteStart),
      minute_end: String(minuteEnd),
      phase,
      group_by: groupBy,
    });
    if (teamId) params.set("team", teamId);
    if (playerId) params.set("player", playerId);
    setDataLoading(true);
    const timer = window.setTimeout(() => {
      fetchResult<ExploreData>(
        `/api/explore/data/?${params}`,
        controller.signal,
        "Could not analyze this match.",
      )
        .then((result) => {
          setData(result);
          setError("");
          if (result.players.length && !result.players.some((player) => String(player.player_id) === comparePlayerId)) {
            setComparePlayerId(String(result.players.find((player) => String(player.player_id) !== playerId)?.player_id || ""));
          }
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "AbortError") return;
          setData(null);
          setError(cause instanceof Error ? cause.message : "Could not analyze this match.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setDataLoading(false);
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [matchId, teamId, playerId, minuteStart, minuteEnd, phase, groupBy]);

  const availablePlayers = useMemo(
    () => data?.players || [],
    [data?.players],
  );
  const filteredOptions = options.players.filter((player) =>
    !teamId || String(player.team_id) === teamId,
  );

  function changeCompetition(value: string) {
    setCompetitionId(value);
    setSeasonId("");
    setMatchId("");
    setTeamId("");
    setPlayerId("");
    setOptions((current) => ({ ...current, seasons: [], matches: [], teams: [], players: [] }));
  }
  function changeSeason(value: string) {
    setSeasonId(value);
    setMatchId("");
    setTeamId("");
    setPlayerId("");
    setOptions((current) => ({ ...current, matches: [], teams: [], players: [] }));
  }
  function changeMatch(value: string) {
    setMatchId(value);
    setTeamId("");
    setPlayerId("");
    setComparePlayerId("");
    setOptions((current) => ({ ...current, teams: [], players: [] }));
  }
  function downloadCsv() {
    if (!data) return;
    const columns = ["minute", "second", "period", "type", "team", "player", "xg", "shot_outcome", "key_pass", "phase"];
    const quote = (value: unknown) => {
      const text = String(value ?? "");
      const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const rows = [
      columns.join(","),
      ...data.events.map((event) => [
        event.minute,
        event.second,
        event.period,
        event.type,
        event.team,
        event.player,
        event.xg,
        event.shot_outcome,
        event.key_pass,
        event.phase,
      ].map(quote).join(",")),
    ];
    const url = URL.createObjectURL(new Blob([rows.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `statsbomb-match-${matchId}-filtered-events.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="explore-page">
      <header className="explore-heading">
        <div>
          <p className="explore-eyebrow"><SlidersHorizontal size={13} /> SELF-SERVICE MATCH ANALYTICS</p>
          <h1>Explore StatsBomb</h1>
          <p>Filter a match, choose a dimension, and build an interactive view from event data.</p>
        </div>
        {data && (
          <button className="explore-export-button" type="button" onClick={downloadCsv} disabled={dataLoading}>
            Export filtered CSV
          </button>
        )}
      </header>

      <details className="explore-filter-panel" open>
        <summary>
          <strong>Filters</strong>
          <span>Competition, match, team, player and event context</span>
        </summary>
        <div className="explore-query-panel">
        <label><span>COMPETITION</span>
          <select value={competitionId} onChange={(event) => changeCompetition(event.target.value)} disabled={optionsLoading && !options.competitions.length}>
            <option value="">Select competition</option>
            {options.competitions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label><span>SEASON</span>
          <select value={seasonId} onChange={(event) => changeSeason(event.target.value)} disabled={!options.seasons.length}>
            <option value="">Select season</option>
            {options.seasons.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="explore-match-control"><span>MATCH</span>
          <select value={matchId} onChange={(event) => changeMatch(event.target.value)} disabled={!options.matches.length}>
            <option value="">Select match</option>
            {options.matches.map((item) => <option key={item.id} value={item.id}>{item.date || "Date n/a"} · {item.home_team} {item.home_score ?? "–"}–{item.away_score ?? "–"} {item.away_team}</option>)}
          </select>
        </label>
        <label><span>TEAM</span>
          <select value={teamId} onChange={(event) => { setTeamId(event.target.value); setPlayerId(""); }}>
            <option value="">Both teams</option>
            {options.teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label><span>PLAYER</span>
          <select value={playerId} onChange={(event) => setPlayerId(event.target.value)} disabled={!filteredOptions.length}>
            <option value="">All players</option>
            {filteredOptions.map((item) => <option key={`${item.id}-${item.team_id}`} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label><span>MATCH PHASE</span>
          <select value={phase} onChange={(event) => setPhase(event.target.value)}>
            <option value="all">All phases</option>
            <option value="open_play">Open play</option>
            <option value="set_piece">Set piece</option>
            <option value="counterpress">Counter-press</option>
          </select>
        </label>
        <label><span>GROUP BY</span>
          <select value={groupBy} onChange={(event) => setGroupBy(event.target.value as "player" | "team" | "match")}>
            <option value="player">Player</option>
            <option value="team">Team</option>
            <option value="match">Match</option>
          </select>
        </label>
        <div className="explore-minute-filter">
          <span>MINUTE RANGE <strong>{minuteStart}&apos; — {minuteEnd}&apos;</strong></span>
          <div>
            <label aria-label="Start minute">
              <input type="range" min="0" max="130" value={minuteStart} onChange={(event) => setMinuteStart(Math.min(Number(event.target.value), minuteEnd))} />
            </label>
            <label aria-label="End minute">
              <input type="range" min="0" max="130" value={minuteEnd} onChange={(event) => setMinuteEnd(Math.max(Number(event.target.value), minuteStart))} />
            </label>
          </div>
          <div className="explore-measure-picker">
            <span>MEASURES</span>
            <div>
              {TABLE_METRICS.map((metric) => (
                <label key={metric.key}>
                  <input
                    type="checkbox"
                    checked={selectedMetrics.includes(metric.key)}
                    onChange={(event) => {
                      setSelectedMetrics((current) => event.target.checked
                        ? [...current, metric.key]
                        : current.filter((key) => key !== metric.key));
                    }}
                  />
                  {metricLabel(metric.key)}
                </label>
              ))}
            </div>
          </div>
          </div>
          </div>
      </details>

      {error && <div className="explore-error"><CircleAlert size={16} /> {error}</div>}
      <div className="explore-content-grid">
        <section className="explore-visual-panel">
          <div className="explore-visual-toolbar">
            <label><span>VISUALIZATION</span>
              <select value={chart} onChange={(event) => setChart(event.target.value as ExploreChart)}>
                {CHARTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            {chart === "heatmap" && (
              <label><span>LOCATION TYPE</span>
                <select value={heatmapMetric} onChange={(event) => setHeatmapMetric(event.target.value)}>
                  <option value="all">All ball actions</option>
                  <option value="pressure">Pressures</option>
                  <option value="receipt">Ball receipts</option>
                </select>
              </label>
            )}
            {(chart === "radar" || chart === "scatter") && (
              <label><span>PLAYER</span>
                <select value={playerId || String(availablePlayers[0]?.player_id || "")} onChange={(event) => setPlayerId(event.target.value)}>
                  {availablePlayers.map((player) => <option key={player.player_id} value={player.player_id}>{player.player}</option>)}
                </select>
              </label>
            )}
            {chart === "radar" && (
              <label><span>COMPARE WITH</span>
                <select value={comparePlayerId} onChange={(event) => setComparePlayerId(event.target.value)}>
                  <option value="">No comparison</option>
                  {availablePlayers.filter((player) => String(player.player_id) !== playerId).map((player) => (
                    <option key={player.player_id} value={player.player_id}>{player.player}</option>
                  ))}
                </select>
              </label>
            )}
            {chart === "scatter" && (
              <>
                <label><span>X METRIC</span><select value={xMetric} onChange={(event) => setXMetric(event.target.value)}>{METRICS.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}</select></label>
                <label><span>Y METRIC</span><select value={yMetric} onChange={(event) => setYMetric(event.target.value)}>{METRICS.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}</select></label>
              </>
            )}
            <span className="explore-refresh-state">{dataLoading || optionsLoading ? <><LoaderCircle size={13} className="spin" /> Updating</> : <><Activity size={13} /> {data?.summary.events.toLocaleString() || 0} events</>}</span>
          </div>

          {data ? (
            <ExploreGraphic
              data={data}
              chart={chart}
              selectedPlayerId={Number(playerId || availablePlayers[0]?.player_id) || null}
              comparePlayerId={Number(comparePlayerId) || null}
              xMetric={xMetric}
              yMetric={yMetric}
              heatmapMetric={heatmapMetric}
            />
          ) : (
            <div className="explore-chart-empty">
              {dataLoading || optionsLoading ? <LoaderCircle className="spin" size={20} /> : <Activity size={20} />}
              <strong>{dataLoading || optionsLoading ? "Loading match analytics…" : "Select a match to explore"}</strong>
              <span>Choose a competition, season, and match to build the chart.</span>
            </div>
          )}

          {data && (
            <div className="explore-summary-strip">
              <span><small>EXPECTED GOALS</small><strong>{data.summary.xg.toFixed(2)}</strong></span>
              <span><small>SHOTS</small><strong>{data.summary.shots}</strong></span>
              <span><small>KEY PASSES</small><strong>{data.summary.key_passes}</strong></span>
              <span><small>PRESSURES</small><strong>{data.summary.pressures}</strong></span>
              <span><small>PASS COMPLETION</small><strong>{data.summary.pass_completion_pct}%</strong></span>
            </div>
          )}
        </section>

        <aside className="explore-results-panel">
          <div className="explore-results-header"><strong>Explore results</strong><span>GROUPED BY {groupBy.toUpperCase()}</span></div>
          {data ? (
            <div className="explore-results-table-wrap">
              <table className="explore-results-table">
                <thead><tr><th>{groupBy === "player" ? "PLAYER" : groupBy === "team" ? "TEAM" : "MATCH"}</th>{selectedMetrics.map((metric) => <th key={metric}>{`${metricLabel(metric)}${groupBy === "player" && metric !== "pass_completion_pct" ? " /90" : ""}`.toUpperCase()}</th>)}</tr></thead>
                <tbody>
                  {data.groups.map((group, index) => {
                    const row = group as Record<string, unknown>;
                    const player = groupBy === "player"
                      ? data.players.find((item) => item.player_id === Number(row.player_id))
                      : undefined;
                    return (
                      <tr key={String(row.player_id || row.team_id || row.name || index)}>
                        <td>{String(row.player || row.name || "—")}{player && <small>{player.team}</small>}</td>
                        {selectedMetrics.map((metric) => {
                          const raw = row[metric];
                          const value = player && metric !== "pass_completion_pct"
                            ? player.per90[metric] || 0
                            : Number(raw || 0);
                          return <td key={metric}>{metric === "pass_completion_pct" ? `${value.toFixed(1)}%` : value.toFixed(metric === "xg" || metric === "xa" ? 2 : 1)}</td>;
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="explore-results-empty">Results will appear after selecting a match.</div>
          )}
          <p className="explore-footnote">Progressive actions use a 10m forward-distance proxy. Per-90 and peer-percentile values are calculated for the selected match only; StatsBomb open data does not provide official Opta metrics.</p>
        </aside>
      </div>
    </div>
  );
}
