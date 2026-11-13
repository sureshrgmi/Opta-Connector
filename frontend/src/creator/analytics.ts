import type {
  CreatorEvent,
  FreezeFrameRecord,
  MatchAnalytics,
  PassLink,
  PassNode,
  Shot,
  XgPoint,
} from "./types";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readLocation(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const x = finiteNumber(value[0]);
  const y = finiteNumber(value[1]);
  return x === null || y === null ? null : [x, y];
}

function action(event: CreatorEvent, key: string): JsonRecord | null {
  return asRecord(event.raw_data[key]);
}

function shotFor(event: CreatorEvent): Shot | null {
  if (event.type.toLowerCase() !== "shot" || !event.location) return null;
  const shot = action(event, "shot");
  const outcome = asRecord(shot?.outcome);
  const xg = finiteNumber(shot?.statsbomb_xg) ?? 0;
  return {
    event,
    xg,
    goal: String(outcome?.name || "").toLowerCase() === "goal",
    bigChance: shot?.big_chance === true,
  };
}

export function analyzeMatch(events: CreatorEvent[]): MatchAnalytics {
  const nodeTotals = new Map<number, {
    teamId: number;
    name: string;
    x: number;
    y: number;
    touches: number;
  }>();
  const linkTotals = new Map<string, PassLink>();
  const directionTotals = new Map<string, number>();
  const completedPasses = events.flatMap((event) => {
    const pass = action(event, "pass");
    const end = readLocation(pass?.end_location);
    if (
      event.type.toLowerCase() !== "pass"
      || event.team_id === null
      || event.player_id === null
      || !event.location
      || !end
      || !pass
      || pass.outcome
    ) return [];
    return [{
      event,
      pass,
      end,
      teamId: event.team_id,
      playerId: event.player_id,
      location: event.location,
    }];
  });

  for (const { event, end, teamId, location } of completedPasses) {
    const key = `${teamId}:${event.period}`;
    directionTotals.set(key, (directionTotals.get(key) || 0) + end[0] - location[0]);
  }

  for (const event of events) {
    if (event.team_id === null || event.player_id === null || !event.location) continue;
    const current = nodeTotals.get(event.player_id) || {
      teamId: event.team_id,
      name: event.player || `Player ${event.player_id}`,
      x: 0,
      y: 0,
      touches: 0,
    };
    current.x += event.location[0];
    current.y += event.location[1];
    current.touches += 1;
    nodeTotals.set(event.player_id, current);
  }

  for (const { event, pass, end, teamId, playerId, location } of completedPasses) {
    const receiver = asRecord(pass.receiver);
    const receiverId = finiteNumber(receiver?.id);
    if (receiverId === null || receiverId === playerId) continue;
    const direction = Math.sign(directionTotals.get(`${teamId}:${event.period}`) || 0) || 1;
    const isProgressive = (end[0] - location[0]) * direction >= 10;
    const key = `${teamId}:${playerId}:${receiverId}`;
    const link = linkTotals.get(key) || {
      from: playerId,
      to: receiverId,
      teamId,
      volume: 0,
      progressive: 0,
    };
    link.volume += 1;
    if (isProgressive) link.progressive += 1;
    linkTotals.set(key, link);

    const receiverName = String(receiver?.name || `Player ${receiverId}`);
    const receiverNode = nodeTotals.get(receiverId);
    if (!receiverNode) {
      nodeTotals.set(receiverId, {
        teamId,
        name: receiverName,
        x: end[0],
        y: end[1],
        touches: 1,
      });
    }
  }

  const nodes: PassNode[] = Array.from(nodeTotals, ([id, node]) => ({
    id,
    teamId: node.teamId,
    name: node.name,
    x: node.touches > 1 ? node.x / node.touches : node.x,
    y: node.touches > 1 ? node.y / node.touches : node.y,
    touches: node.touches,
  }));
  const shots = events.map(shotFor).filter((shot): shot is Shot => shot !== null);
  const maxMinute = Math.max(90, ...events.map((event) => event.minute + event.second / 60));
  const xgByTeam = new Map<number, XgPoint[]>();
  let maxXg = 0;
  for (const teamId of new Set(shots.flatMap(({ event }) =>
    event.team_id === null ? [] : [event.team_id],
  ))) {
    let total = 0;
    const points: XgPoint[] = [];
    const teamShots = shots.filter(({ event }) => event.team_id === teamId);
    if (teamShots[0]) {
      points.push({
        event: teamShots[0].event,
        minute: 0,
        total: 0,
        goal: false,
        bigChance: false,
      });
    }
    for (const shot of teamShots) {
      total += shot.xg;
      points.push({
        event: shot.event,
        minute: shot.event.minute + shot.event.second / 60,
        total,
        goal: shot.goal,
        bigChance: shot.bigChance,
      });
    }
    maxXg = Math.max(maxXg, total);
    xgByTeam.set(teamId, points);
  }

  return {
    nodes,
    links: Array.from(linkTotals.values()),
    shots,
    xgByTeam,
    maxXg: Math.max(1, Math.ceil(maxXg)),
    maxMinute,
  };
}

export function freezeFrameForEvent(
  frames: FreezeFrameRecord[],
  eventId: string,
) {
  return frames.find((frame) => frame.event_uuid === eventId) || null;
}
