export type CreatorMatch = {
  id: number;
  date: string | null;
  season: string;
  home_team: string;
  home_team_id: number;
  home_score: number | null;
  away_team: string;
  away_team_id: number;
  away_score: number | null;
  event_count: number;
};

export type CreatorEvent = {
  id: string;
  index: number;
  period: number;
  minute: number;
  second: number;
  type: string;
  team: string | null;
  team_id: number | null;
  player: string | null;
  player_id: number | null;
  location: [number, number] | null;
  end_location: [number, number] | null;
  raw_data: Record<string, unknown>;
};

export type CreatorMatchData = {
  match: Omit<CreatorMatch, "event_count">;
  events: CreatorEvent[];
};

export type FreezeFramePlayer = {
  teammate?: boolean;
  actor?: boolean;
  keeper?: boolean;
  location?: [number, number];
  player?: { id?: number; name?: string };
};

export type FreezeFrameRecord = {
  event_uuid?: string;
  visible_area?: number[];
  freeze_frame?: FreezeFramePlayer[];
};

export type Creator360Data = {
  available: boolean;
  checked_at: string;
  frames: FreezeFrameRecord[];
};

export type CreatorView = "network" | "shots" | "xg" | "freeze";

export type PassNode = {
  id: number;
  teamId: number;
  name: string;
  x: number;
  y: number;
  touches: number;
};

export type PassLink = {
  from: number;
  to: number;
  teamId: number;
  volume: number;
  progressive: number;
};

export type Shot = {
  event: CreatorEvent;
  xg: number;
  goal: boolean;
  bigChance: boolean;
};

export type XgPoint = {
  event: CreatorEvent;
  minute: number;
  total: number;
  goal: boolean;
  bigChance: boolean;
};

export type MatchAnalytics = {
  nodes: PassNode[];
  links: PassLink[];
  shots: Shot[];
  xgByTeam: Map<number, XgPoint[]>;
  maxXg: number;
  maxMinute: number;
};
