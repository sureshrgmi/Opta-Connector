export type ExploreChart = "shots" | "network" | "heatmap" | "radar" | "scatter" | "xg";

export type ExploreCompetition = { id: number; name: string };
export type ExploreSeason = { id: number; name: string; competition_id: number };
export type ExploreMatchOption = {
  id: number;
  date: string | null;
  season: string;
  season_id: number;
  home_team: string;
  home_team_id: number;
  home_score: number | null;
  away_team: string;
  away_team_id: number;
  away_score: number | null;
};
export type ExploreTeam = { id: number; name: string };
export type ExploreOptionPlayer = { id: number; name: string; team_id: number };
export type ExploreOptions = {
  competitions: ExploreCompetition[];
  seasons: ExploreSeason[];
  matches: ExploreMatchOption[];
  teams: ExploreTeam[];
  players: ExploreOptionPlayer[];
};

export type ExploreEvent = {
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
  phase: string;
  xg: number | null;
  shot_outcome: string | null;
  key_pass: boolean;
  completed: boolean;
  pass_receiver_id: number | null;
  pass_receiver: string | null;
};

export type ExplorePlayerMetrics = {
  player_id: number;
  player: string;
  team_id: number;
  team: string;
  minutes_played: number;
  passes_attempted: number;
  passes_completed: number;
  per90: Record<string, number>;
  pass_completion_pct: number;
};

export type ExploreXgPoint = {
  minute: number;
  cumulative_xg: number;
  goal: boolean;
};

export type ExploreMatch = {
  id: number;
  date: string | null;
  season: string;
  home_team: string;
  home_team_id: number;
  home_score: number | null;
  away_team: string;
  away_team_id: number;
  away_score: number | null;
};

export type ExploreSummary = {
  events: number;
  shots: number;
  xg: number;
  xa: number;
  key_passes: number;
  pressures: number;
  passes_attempted: number;
  passes_completed: number;
  pass_completion_pct: number;
  progressive_actions: number;
  xg_by_team: Record<string, number>;
};

export type ExploreGroup = Record<string, string | number | null>;

export type ExploreData = {
  match: ExploreMatch;
  events: ExploreEvent[];
  players: ExplorePlayerMetrics[];
  summary: ExploreSummary;
  groups: ExploreGroup[];
  xg_race: Record<string, ExploreXgPoint[]>;
};