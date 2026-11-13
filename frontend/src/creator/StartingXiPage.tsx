import { forwardRef, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Download, Image, LoaderCircle, Plus, RotateCcw, Users } from "lucide-react";
import { exportGraphic, type GraphicFormat } from "./exportGraphic";
import { PITCH_VIEWBOX, STATSBOMB_PITCH, StatsBombPitch } from "../shared/StatsBombPitch";
import "./starting-xi.css";

type TeamOption = { id: number; name: string };
type SquadPlayer = {
  id: number | string;
  name: string;
  jersey_number: number | null;
  starting: boolean;
  position?: string | null;
  custom?: boolean;
};
type TeamRoster = {
  players: SquadPlayer[];
  latestMatch: { date: string | null; season: string } | null;
  loading: boolean;
  error: string;
  selected?: string[];
};
type PositionSlot = { label: string; line: number; index: number; lineSize: number };
type PitchPosition = { x: number; y: number };
type StartingXiGraphicTeam = {
  team: TeamOption;
  color: string;
  formation: string;
  players: SquadPlayer[];
  selected: string[];
  positions: Record<number, PitchPosition>;
  onPositionChange: (slotIndex: number, position: PitchPosition) => void;
  onPlayerRemove: (slotIndex: number) => void;
};

const FORMATIONS: Record<string, number[]> = {
  "4-3-3": [4, 3, 3],
  "4-2-3-1": [4, 2, 3, 1],
  "4-4-2": [4, 4, 2],
  "3-5-2": [3, 5, 2],
  "3-4-3": [3, 4, 3],
  "4-1-4-1": [4, 1, 4, 1],
  "5-3-2": [5, 3, 2],
};
const LINE_NAMES = ["GK", "DEF", "MID", "FWD", "FWD"];
const CLUB_COLORS: Record<string, string> = {
  "afc bournemouth": "#d71920",
  arsenal: "#ef0107",
  "aston villa": "#670e36",
  "brighton and hove albion": "#0057b8",
  "brighton & hove albion": "#0057b8",
  burnley: "#6c1d45",
  chelsea: "#034694",
  "crystal palace": "#1b458f",
  everton: "#003399",
  leicester: "#003090",
  "leicester city": "#003090",
  liverpool: "#c8102e",
  "manchester city": "#6cabdd",
  "manchester united": "#da291c",
  newcastle: "#241f20",
  "newcastle united": "#241f20",
  norwich: "#fff200",
  "norwich city": "#fff200",
  "queens park rangers": "#1d5da8",
  "qpr": "#1d5da8",
  southampton: "#d71920",
  stoke: "#e03a3e",
  "stoke city": "#e03a3e",
  sunderland: "#eb172b",
  swansea: "#f5f5f5",
  "swansea city": "#f5f5f5",
  tottenham: "#132257",
  "tottenham hotspur": "#132257",
  watford: "#fbec00",
  "west brom": "#122f67",
  "west bromwich albion": "#122f67",
  "west ham": "#7a263a",
  "west ham united": "#7a263a",
};
const FALLBACK_COLORS = ["#4c8f73", "#6285c7", "#bd7952", "#8d6ab5", "#548e9b"];

function normalizeName(name: string) {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function teamColor(team: TeamOption) {
  return CLUB_COLORS[normalizeName(team.name)]
    || FALLBACK_COLORS[Math.abs(team.id) % FALLBACK_COLORS.length];
}

function playerKey(player: SquadPlayer) {
  return String(player.id);
}

function formationSlots(formation: string): PositionSlot[] {
  const rows = FORMATIONS[formation] || FORMATIONS["4-3-3"];
  const slots: PositionSlot[] = [{ label: "Goalkeeper", line: 0, index: 0, lineSize: 1 }];
  rows.forEach((count, rowIndex) => {
    for (let index = 0; index < count; index += 1) {
      slots.push({
        label: `${LINE_NAMES[rowIndex + 1]} ${index + 1}`,
        line: rowIndex + 1,
        index,
        lineSize: count,
      });
    }
  });
  return slots;
}

function positionLine(position: string | null | undefined, formation: string) {
  const rows = FORMATIONS[formation] || FORMATIONS["4-3-3"];
  const name = normalizeName(position || "");
  const midfieldLines = rows
    .map((_, index) => LINE_NAMES[index + 1] === "MID" ? index + 1 : -1)
    .filter((line) => line >= 0);
  if (name.includes("goalkeeper")) return 0;
  if (/(back|defen[cs]e|sweeper)/.test(name)) return 1;
  if (name.includes("defensive midfield")) return midfieldLines[0] || 1;
  if (name.includes("attacking midfield")) {
    return midfieldLines[midfieldLines.length - 1] || rows.length;
  }
  if (name.includes("midfield") && midfieldLines.length) {
    return midfieldLines[Math.floor((midfieldLines.length - 1) / 2)];
  }
  if (/(wing|forward|striker)/.test(name)) return rows.length;
  return null;
}

function slotForPlayer(
  player: SquadPlayer,
  formation: string,
  slots: PositionSlot[],
  selected: string[],
) {
  const preferredLine = positionLine(player.position, formation);
  const matchingLine = preferredLine === null
    ? []
    : slots.flatMap((slot, index) => slot.line === preferredLine ? [index] : []);
  const emptyLineSlot = matchingLine.find((index) => !selected[index]);
  if (emptyLineSlot !== undefined) return emptyLineSlot;
  const emptySlot = selected.findIndex((key) => !key);
  if (emptySlot >= 0) return emptySlot;
  return matchingLine[0] ?? 10;
}

function startingSelection(players: SquadPlayer[], existing: string[] = []) {
  if (existing.some(Boolean)) return Array.from({ length: 11 }, (_, index) => existing[index] || "");
  const selected = Array.from({ length: 11 }, () => "");
  const slots = formationSlots("4-3-3");
  const orderedPlayers = [
    ...players.filter((player) => player.starting),
    ...players.filter((player) => !player.starting),
  ];
  for (const player of orderedPlayers) {
    const slotIndex = slotForPlayer(player, "4-3-3", slots, selected);
    if (selected[slotIndex]) continue;
    selected[slotIndex] = playerKey(player);
  }
  return selected;
}

async function responseJson<T>(response: Response, message: string): Promise<T> {
  const payload = await response.json() as T & { detail?: string };
  if (!response.ok) throw new Error(payload.detail || message);
  return payload;
}

const StartingXiGraphic = forwardRef<SVGSVGElement, { teams: StartingXiGraphicTeam[]; teamCount: number }>(
  function StartingXiGraphic({ teams, teamCount }, ref) {
  const { width, height } = PITCH_VIEWBOX;
  const field = STATSBOMB_PITCH;
  const activeTeams = teams.slice(0, teamCount);
  const [dragging, setDragging] = useState<{ teamId: number; slotIndex: number } | null>(null);

  function movePlayer(event: PointerEvent<SVGSVGElement>) {
    if (!dragging) return;
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return;
    const point = event.currentTarget.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const position = point.matrixTransform(matrix.inverse());
    const bounded = {
      x: Math.max(field.x + 22, Math.min(field.x + field.width - 22, position.x)),
      y: Math.max(field.y + 22, Math.min(field.y + field.height - 22, position.y)),
    };
    const team = activeTeams.find((item) => item.team.id === dragging.teamId);
    if (team) team.onPositionChange(dragging.slotIndex, bounded);
  }

  return (
    <svg
      ref={ref}
      className="starting-xi-artboard"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Starting XI graphic for ${activeTeams.map(({ team }) => team.name).join(" and ")}`}
      onPointerMove={movePlayer}
      onPointerUp={() => setDragging(null)}
      onPointerCancel={() => setDragging(null)}
    >
      <rect width={width} height={height} fill="#ffffff" />
        {activeTeams.length === 2 ? (
          <>
            <rect x={field.x} y="42" width={field.width / 2 - 20} height="1" fill={activeTeams[0].color} opacity=".9" />
            <rect x={width / 2 + 20} y="42" width={field.width / 2 - 20} height="1" fill={activeTeams[1].color} opacity=".9" />
            <text x={field.x + 2} y="34" fill={activeTeams[0].color} fontSize="12" fontWeight="700" textAnchor="start">
              {activeTeams[0].team.name.toUpperCase()} · {activeTeams[0].formation}
            </text>
            <text x={field.x + field.width - 2} y="34" fill={activeTeams[1].color} fontSize="12" fontWeight="700" textAnchor="end">
              {activeTeams[1].team.name.toUpperCase()} · {activeTeams[1].formation}
            </text>
        </>
        ) : activeTeams[0] ? (
          <text x={field.x + 2} y="34" fill={activeTeams[0].color} fontSize="12" fontWeight="700" textAnchor="start">
            {activeTeams[0].team.name.toUpperCase()} · {activeTeams[0].formation}
          </text>
      ) : null}
      <StatsBombPitch />
      {activeTeams.flatMap((entry, teamIndex) => {
        const slots = formationSlots(entry.formation);
        const lineCount = FORMATIONS[entry.formation].length + 1;
        const lineSlots = new Map<number, PositionSlot[]>();
        slots.forEach((slot) => lineSlots.set(slot.line, [...(lineSlots.get(slot.line) || []), slot]));
        return slots.map((slot, slotIndex) => {
          const xRatio = slot.line / Math.max(1, lineCount - 1);
          const x = activeTeams.length === 1
            ? field.x + 30 + xRatio * (field.width / 2 - 60)
            : teamIndex === 0
              ? field.x + 30 + xRatio * (field.width / 2 - 60)
              : field.x + field.width - 30 - xRatio * (field.width / 2 - 60);
          const row = lineSlots.get(slot.line) || [];
          const defaultY = field.y + field.height / 2
            + (slot.index - (row.length - 1) / 2) * Math.min(38, field.height / Math.max(4, row.length + 2));
          const position = entry.positions[slotIndex] || { x, y: defaultY };
          const selectedKey = entry.selected[slotIndex] || "";
          const player = entry.players.find((item) => playerKey(item) === selectedKey);
          const markerColor = player ? entry.color : "#708078";
          const displayName = player && player.name.length > 16
            ? `${player.name.slice(0, 15).trimEnd()}…`
            : player?.name || slot.label;
          return (
            <g
              key={`${entry.team.id}-${slot.label}`}
              className="xi-graphic-player"
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                setDragging({ teamId: entry.team.id, slotIndex });
              }}
              onDoubleClick={() => entry.onPlayerRemove(slotIndex)}
            >
              <title>{player?.name || slot.label}</title>
              <circle cx={position.x} cy={position.y} r="17" fill={markerColor} stroke="#f4f7f4" strokeOpacity=".92" strokeWidth="2" />
              <text x={position.x} y={position.y + 4} fill="#ffffff" fontSize="11" fontWeight="800" textAnchor="middle">
                {player?.jersey_number ?? (player ? "—" : "+")}
              </text>
              <text x={position.x} y={position.y + 31} fill={player ? "#eff5f0" : "#b4c0b8"} fontSize="8" fontWeight="650" textAnchor="middle">
                {displayName}
              </text>
            </g>
          );
        });
      })}
    </svg>
  );
});

export default function StartingXiPage() {
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [teamIds, setTeamIds] = useState<string[]>(["", ""]);
  const [teamSearch, setTeamSearch] = useState<string[]>(["", ""]);
  const [teamSearchOpen, setTeamSearchOpen] = useState<number | null>(null);
  const [teamCount, setTeamCount] = useState(1);
  const [formations, setFormations] = useState<Record<string, string>>({});
  const [colors, setColors] = useState<Record<string, string>>({});
  const [rosters, setRosters] = useState<Record<string, TeamRoster>>({});
  const [playerSearch, setPlayerSearch] = useState<Record<string, string>>({});
  const [playerSearchOpen, setPlayerSearchOpen] = useState<string | null>(null);
  const [positions, setPositions] = useState<Record<string, Record<number, PitchPosition>>>({});
  const [customDrafts, setCustomDrafts] = useState<Record<string, { name: string; number: string }>>({});
  const [customEntryOpen, setCustomEntryOpen] = useState<string | null>(null);
  const [exporting, setExporting] = useState<GraphicFormat | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const graphicRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/creator/starting-xi/teams/", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then((response) => responseJson<{ teams: TeamOption[] }>(response, "Could not load teams."))
      .then((payload) => {
        setTeams(payload.teams);
        setTeamIds([String(payload.teams[0]?.id || ""), String(payload.teams[1]?.id || "")]);
        setTeamSearch([payload.teams[0]?.name || "", payload.teams[1]?.name || ""]);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Could not load teams.");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const activeIds = teamIds.slice(0, teamCount).filter(Boolean);
    if (!activeIds.length) return () => controller.abort();
    activeIds.forEach((id) => {
      setRosters((current) => ({
        ...current,
        [id]: { ...(current[id] || { players: [], latestMatch: null, error: "" }), loading: true },
      }));
      fetch(`/api/creator/starting-xi/teams/${id}/players/`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      })
        .then((response) => responseJson<{
          team: TeamOption;
          players: SquadPlayer[];
          latest_match: TeamRoster["latestMatch"];
        }>(response, "Could not load this team's latest players."))
        .then((payload) => {
          setRosters((current) => {
            const previous = current[id];
            const players = payload.players;
            return {
              ...current,
              [id]: {
                players,
                latestMatch: payload.latest_match,
                loading: false,
                error: "",
                selected: startingSelection(players, previous?.selected),
              },
            };
          });
          setColors((current) => current[id] ? current : { ...current, [id]: teamColor(payload.team) });
          setFormations((current) => current[id] ? current : { ...current, [id]: "4-3-3" });
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "AbortError") return;
          setRosters((current) => ({
            ...current,
            [id]: {
              ...(current[id] || { players: [], latestMatch: null }),
              loading: false,
              error: cause instanceof Error ? cause.message : "Could not load this team's latest players.",
            },
          }));
        });
    });
    return () => controller.abort();
  }, [teamIds, teamCount]);

  const activeTeams = useMemo(() => teamIds.slice(0, teamCount).flatMap((id) => {
    const team = teams.find((item) => String(item.id) === id);
    if (!id || !team) return [];
    const roster = rosters[id];
    return [{
      team,
      color: colors[id] || teamColor(team),
      formation: formations[id] || "4-3-3",
      players: roster?.players || [],
      selected: roster?.selected || startingSelection(roster?.players || []),
      positions: positions[id] || {},
      onPositionChange: (slotIndex: number, position: PitchPosition) => {
        setPositions((current) => ({
          ...current,
          [id]: { ...(current[id] || {}), [slotIndex]: position },
        }));
      },
      onPlayerRemove: (slotIndex: number) => {
        setSelectedPlayer(id, slotIndex, "");
        setError("");
      },
    }];
  }), [teamIds, teamCount, teams, rosters, colors, formations, positions]);

  function changeTeam(index: number, id: string) {
    setTeamIds((current) => current.map((value, itemIndex) => itemIndex === index ? id : value));
    const selectedTeam = teams.find((team) => String(team.id) === id);
    setTeamSearch((current) => current.map((value, itemIndex) => itemIndex === index ? selectedTeam?.name || "" : value));
    setTeamSearchOpen(null);
    setError("");
    setStatus("");
  }

  function resetTeamPositions(teamId: string) {
    setPositions((current) => ({ ...current, [teamId]: {} }));
  }

  function setSelectedPlayer(teamId: string, slotIndex: number, playerId: string) {
    setRosters((current) => {
      const roster = current[teamId];
      if (!roster) return current;
      const selected = [...(roster.selected || startingSelection(roster.players))];
      selected[slotIndex] = playerId;
      return { ...current, [teamId]: { ...roster, selected } };
    });
  }

  function assignPlayer(teamId: string, playerId: string) {
    const roster = rosters[teamId];
    if (!roster) return;
    const selected = roster.selected || startingSelection(roster.players);
    if (selected.includes(playerId)) {
      setPlayerSearch((current) => ({ ...current, [teamId]: "" }));
      setPlayerSearchOpen(null);
      setCustomEntryOpen(null);
      return;
    }
    const player = roster.players.find((item) => playerKey(item) === playerId);
    if (!player) {
      setError("That player is no longer available in this squad.");
      return;
    }
    const formation = formations[teamId] || "4-3-3";
    const slotIndex = slotForPlayer(player, formation, formationSlots(formation), selected);
    const replacedPlayer = roster.players.find((item) => playerKey(item) === selected[slotIndex]);
    setSelectedPlayer(teamId, slotIndex, playerId);
    setPlayerSearch((current) => ({ ...current, [teamId]: "" }));
    setPlayerSearchOpen(null);
    setCustomEntryOpen(null);
    setError("");
    setStatus(replacedPlayer
      ? `${player.name} replaced ${replacedPlayer.name} in the ${formationSlots(formation)[slotIndex].label.toLowerCase()} position.`
      : `${player.name} added to the lineup.`);
  }

  function addCustomPlayer(teamId: string) {
    const draft = customDrafts[teamId] || { name: "", number: "" };
    const name = draft.name.trim();
    const number = Number(draft.number);
    if (!name || !Number.isInteger(number) || number < 1 || number > 99) return;
    const roster = rosters[teamId];
    if (!roster) return;
    const selected = roster.selected || startingSelection(roster.players);
    const formation = formations[teamId] || "4-3-3";
    const slotIndex = slotForPlayer(
      { id: "", name, jersey_number: number, starting: false },
      formation,
      formationSlots(formation),
      selected,
    );
    const replacedPlayer = roster.players.find((player) => playerKey(player) === selected[slotIndex]);
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setRosters((current) => {
      const roster = current[teamId];
      if (!roster) return current;
      const currentSelection = [...(roster.selected || startingSelection(roster.players))];
      currentSelection[slotIndex] = id;
      return {
        ...current,
        [teamId]: {
          ...roster,
          players: [...roster.players, { id, name, jersey_number: number, starting: false, custom: true }],
          selected: currentSelection,
        },
      };
    });
    setCustomDrafts((current) => ({ ...current, [teamId]: { name: "", number: "" } }));
    setPlayerSearch((current) => ({ ...current, [teamId]: "" }));
    setPlayerSearchOpen(null);
    setCustomEntryOpen(null);
    setStatus(replacedPlayer
      ? `${name} replaced ${replacedPlayer.name} in this session.`
      : `${name} added to this team sheet for this session.`);
    setError("");
  }

  async function exportImage(format: GraphicFormat) {
    if (!graphicRef.current) return;
    setExporting(format);
    setError("");
    setStatus("");
    try {
      await exportGraphic(
        graphicRef.current,
        format,
        `starting-xi-${activeTeams.map(({ team }) => team.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")).join("-v-")}`,
      );
      setStatus(`${format.toUpperCase()} graphic exported.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The graphic could not be exported.");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="starting-xi-page">
      <header className="starting-xi-heading">
        <div>
          <p className="starting-xi-eyebrow"><Users size={13} /> CREATOR STUDIO · TEAM SHEET BUILDER</p>
          <h1>Starting XI</h1>
          <p>Search to add players, drag them into place, and double-click a player to clear a position.</p>
        </div>
        <div className="starting-xi-export">
          <button type="button" onClick={() => void exportImage("jpg")} disabled={exporting !== null || activeTeams.length === 0}>
            {exporting === "jpg" ? <LoaderCircle size={14} className="xi-spin" /> : <Image size={14} />}
            JPG
          </button>
          <button type="button" onClick={() => void exportImage("png")} disabled={exporting !== null || activeTeams.length === 0}>
            {exporting === "png" ? <LoaderCircle size={14} className="xi-spin" /> : <Image size={14} />}
            PNG
          </button>
          <button type="button" onClick={() => void exportImage("svg")} disabled={exporting !== null || activeTeams.length === 0}>
            {exporting === "svg" ? <LoaderCircle size={14} className="xi-spin" /> : <Download size={14} />}
            SVG
          </button>
        </div>
      </header>

      {error && <div className="starting-xi-alert" role="alert">{error}</div>}
      {status && <div className="starting-xi-status" role="status">{status}</div>}

      <details className="starting-xi-settings-panel" open>
        <summary>
          <strong>Lineup setup</strong>
          <span>
            {teamCount} {teamCount === 1 ? "team" : "teams"} ·{" "}
            {teamIds.slice(0, teamCount).map((id) => teams.find((team) => String(team.id) === id)?.name).filter(Boolean).join(" · ") || "Select teams"}
          </span>
        </summary>
        <div className="starting-xi-settings-content">
          <div className="starting-xi-mode" role="group" aria-label="Number of teams">
            <span>LINEUP MODE</span>
            {[1, 2].map((count) => (
              <button
                key={count}
                className={teamCount === count ? "selected" : ""}
                type="button"
                onClick={() => setTeamCount(count)}
                aria-pressed={teamCount === count}
              >
                {count} {count === 1 ? "team" : "teams"}
              </button>
            ))}
            <span className="starting-xi-mode-note">Choose one team or create a head-to-head sheet.</span>
          </div>

          <div className={`starting-xi-team-settings ${teamCount === 1 ? "single-team" : ""}`}>
        {Array.from({ length: teamCount }, (_, index) => {
          const teamId = teamIds[index] || "";
          const team = teams.find((item) => String(item.id) === teamId);
          const roster = rosters[teamId];
          const selected = roster?.selected || startingSelection(roster?.players || []);
          const availablePlayers = [...(roster?.players || [])]
            .sort((a, b) => (a.jersey_number ?? 100) - (b.jersey_number ?? 100) || a.name.localeCompare(b.name));
          const playerQuery = normalizeName((playerSearch[teamId] || "").trim().replace(/^#/, ""));
          const matchingPlayers = availablePlayers.filter((player) =>
            normalizeName(player.name).includes(playerQuery)
            || String(player.jersey_number ?? "").includes(playerQuery),
          ).slice(0, 30);
          return (
            <section className="starting-xi-team-card" key={`team-${index}`}>
              <header>
                <span className="starting-xi-team-index">0{index + 1}</span>
                <div><strong>{team?.name || `Team ${index + 1}`}</strong><small>{index === 0 ? "LEFT SIDE" : "RIGHT SIDE"}</small></div>
                {team && <input aria-label={`${team.name} club color`} type="color" value={colors[teamId] || teamColor(team)} onChange={(event) => setColors((current) => ({ ...current, [teamId]: event.target.value }))} />}
              </header>
              <div className="starting-xi-field starting-xi-team-search">
                <span>TEAM</span>
                <input
                  type="search"
                  role="combobox"
                  aria-label={`Search team ${index + 1}`}
                  aria-expanded={teamSearchOpen === index}
                  aria-controls={`starting-xi-team-options-${index}`}
                  placeholder="Search teams…"
                  value={teamSearch[index] || ""}
                  disabled={!teams.length}
                  onFocus={() => setTeamSearchOpen(index)}
                  onChange={(event) => {
                    setTeamSearch((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.value : value));
                    setTeamSearchOpen(index);
                    if (teamId) {
                      setTeamIds((current) => current.map((value, itemIndex) => itemIndex === index ? "" : value));
                      setPositions((current) => ({ ...current, [teamId]: {} }));
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setTeamSearchOpen(null);
                    if (event.key === "Enter") {
                      const result = teams.find((item) => item.name.toLowerCase().includes((teamSearch[index] || "").toLowerCase()));
                      if (result) {
                        event.preventDefault();
                        changeTeam(index, String(result.id));
                      }
                    }
                  }}
                />
                {teamSearchOpen === index && (
                  <div className="starting-xi-team-options" id={`starting-xi-team-options-${index}`} role="listbox" aria-label="Teams">
                    {teams.filter((option) =>
                      option.name.toLowerCase().includes((teamSearch[index] || "").toLowerCase())
                      && !teamIds.some((selected, otherIndex) => otherIndex !== index && selected === String(option.id)),
                    ).slice(0, 30).map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        role="option"
                        aria-selected={teamId === String(option.id)}
                        onPointerDown={(event) => event.preventDefault()}
                        onClick={() => changeTeam(index, String(option.id))}
                      >
                        {option.name}
                      </button>
                    ))}
                    {!teams.some((option) => option.name.toLowerCase().includes((teamSearch[index] || "").toLowerCase())) && (
                      <span>No teams found</span>
                    )}
                  </div>
                )}
              </div>
              <label className="starting-xi-field">
                <span>FORMATION</span>
                <select value={formations[teamId] || "4-3-3"} onChange={(event) => {
                  setFormations((current) => ({ ...current, [teamId]: event.target.value }));
                  resetTeamPositions(teamId);
                }} disabled={!teamId}>
                  {Object.keys(FORMATIONS).map((formation) => <option key={formation}>{formation}</option>)}
                </select>
              </label>
              <div className="starting-xi-player-picker">
                <label className="starting-xi-field">
                  <span>SELECT PLAYER</span>
                  <input
                    type="search"
                    role="combobox"
                    aria-label={`Search ${team?.name || `team ${index + 1}`} players`}
                    aria-expanded={playerSearchOpen === teamId}
                    aria-controls={`starting-xi-player-options-${index}`}
                    placeholder="Search latest players by name or number…"
                    value={playerSearch[teamId] || ""}
                    disabled={!teamId || Boolean(roster?.loading)}
                    onFocus={() => setPlayerSearchOpen(teamId)}
                    onChange={(event) => {
                      setPlayerSearch((current) => ({ ...current, [teamId]: event.target.value }));
                      setPlayerSearchOpen(teamId);
                      setCustomEntryOpen(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setPlayerSearchOpen(null);
                      if (event.key === "Enter" && matchingPlayers[0]) {
                        event.preventDefault();
                        assignPlayer(teamId, playerKey(matchingPlayers[0]));
                      }
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="starting-xi-reset-map"
                  onClick={() => resetTeamPositions(teamId)}
                  disabled={!teamId}
                >
                  <RotateCcw size={12} /> Reset map
                </button>
                {playerSearchOpen === teamId && (
                  <div className="starting-xi-player-options" id={`starting-xi-player-options-${index}`} role="listbox" aria-label="Available players">
                    <button
                      type="button"
                      className="starting-xi-add-option"
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => setCustomEntryOpen((current) => current === teamId ? null : teamId)}
                    >
                      <Plus size={13} /> Add a player
                    </button>
                    {customEntryOpen === teamId && (
                      <form className="starting-xi-custom-form" onSubmit={(event) => {
                        event.preventDefault();
                        addCustomPlayer(teamId);
                      }}>
                        <label>
                          <span>PLAYER NAME</span>
                          <input
                            aria-label={`Custom player name for team ${index + 1}`}
                            placeholder="Player name"
                            value={customDrafts[teamId]?.name || ""}
                            onChange={(event) => setCustomDrafts((current) => ({
                              ...current,
                              [teamId]: { ...(current[teamId] || { name: "", number: "" }), name: event.target.value },
                            }))}
                            required
                          />
                        </label>
                        <label>
                          <span>SHIRT #</span>
                          <input
                            aria-label={`Custom jersey number for team ${index + 1}`}
                            type="number"
                            min="1"
                            max="99"
                            placeholder="00"
                            value={customDrafts[teamId]?.number || ""}
                            onChange={(event) => setCustomDrafts((current) => ({
                              ...current,
                              [teamId]: { ...(current[teamId] || { name: "", number: "" }), number: event.target.value },
                            }))}
                            required
                          />
                        </label>
                        <button type="submit"><Plus size={13} /> Add</button>
                      </form>
                    )}
                    {matchingPlayers.map((player) => (
                      <button
                        key={playerKey(player)}
                        type="button"
                        role="option"
                        aria-selected={selected.includes(playerKey(player))}
                        onPointerDown={(event) => event.preventDefault()}
                        onClick={() => assignPlayer(teamId, playerKey(player))}
                      >
                        <span className="starting-xi-player-number">{player.jersey_number == null ? "—" : `#${player.jersey_number}`}</span>
                        {player.name}{selected.includes(playerKey(player)) ? " · On pitch" : ""}
                      </button>
                    ))}
                    {!matchingPlayers.length && (
                      <span className="starting-xi-player-empty">{playerQuery ? "No matching available players." : "All roster players are on the pitch."}</span>
                    )}
                  </div>
                )}
              </div>
              <p className="starting-xi-roster-meta">
                {roster?.loading ? "Loading latest squad…" : roster?.latestMatch
                  ? `Squad from ${roster.latestMatch.date || roster.latestMatch.season} · ${roster.players.length} players`
                  : teamId ? "No synced lineup is available for this team yet." : "Select a team to load its latest squad."}
              </p>
            </section>
          );
        })}
          </div>
        </div>
      </details>

      {teams.length === 0 && !error ? (
        <div className="starting-xi-empty"><LoaderCircle size={18} className="xi-spin" /> Loading teams with synced lineups…</div>
      ) : (
        <>
          <section className="starting-xi-preview">
            <div className="starting-xi-artboard-wrap">
              <StartingXiGraphic
                ref={graphicRef}
                teams={activeTeams}
                teamCount={teamCount}
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
