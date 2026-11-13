import { forwardRef, useMemo } from "react";
import type {
  CreatorEvent,
  CreatorMatchData,
  CreatorView,
  FreezeFrameRecord,
  MatchAnalytics,
} from "./types";

type Props = {
  data: CreatorMatchData;
  view: CreatorView;
  title: string;
  transparent: boolean;
  analytics: MatchAnalytics;
  selectedTeamId: number | null;
  freezeFrame: FreezeFrameRecord | null;
  freezeEvent: CreatorEvent | null;
};

const FIELD = { x: 280, y: 158, scale: 1360 / 120 };
const COLORS = { home: "var(--neutral-300)", away: "var(--neutral-300)", neutral: "var(--neutral-200)" };

function readName(value: unknown) {
  return typeof value === "string" ? value : "";
}

function FieldBase() {
  return (
    <>
      <rect x="0" y="0" width="120" height="80" rx="0.8" fill="var(--color-primary)" />
      {Array.from({ length: 6 }, (_, index) => (
        <rect
          key={index}
          x={index * 20}
          y="0"
          width="10"
          height="80"
          fill={index % 2 === 0 ? "color-mix(in srgb, var(--neutral-0) 3.92%, transparent)" : "color-mix(in srgb, var(--neutral-900) 3.14%, transparent)"}
        />
      ))}
      <g fill="none" stroke="var(--neutral-200)" strokeOpacity=".73" strokeWidth=".32">
        <rect x="1.5" y="1.5" width="117" height="77" />
        <line x1="60" y1="1.5" x2="60" y2="78.5" />
        <circle cx="60" cy="40" r="9.15" />
        <circle cx="60" cy="40" r=".5" fill="var(--neutral-200)" />
        <rect x="1.5" y="18" width="16.5" height="44" />
        <rect x="1.5" y="30" width="5.5" height="20" />
        <rect x="102" y="18" width="16.5" height="44" />
        <rect x="113" y="30" width="5.5" height="20" />
        <path d="M1.5 34 A6 6 0 0 1 1.5 46" />
        <path d="M118.5 34 A6 6 0 0 0 118.5 46" />
      </g>
    </>
  );
}

function XgRace({ analytics, data }: { analytics: MatchAnalytics; data: CreatorMatchData }) {
  const left = 170;
  const top = 255;
  const width = 1580;
  const height = 650;
  const teams = [
    { id: data.match.home_team_id, name: data.match.home_team, color: COLORS.home },
    { id: data.match.away_team_id, name: data.match.away_team, color: COLORS.away },
  ];
  const xForMinute = (minute: number) => left + (minute / analytics.maxMinute) * width;
  const yForXg = (xg: number) => top + height - (xg / analytics.maxXg) * height;
  return (
    <g>
      {Array.from({ length: analytics.maxXg + 1 }, (_, index) => {
        const y = yForXg(index);
        return (
          <g key={index}>
            <line x1={left} y1={y} x2={left + width} y2={y} stroke="var(--neutral-0)" strokeOpacity=".09" />
            <text x={left - 22} y={y + 6} fill="var(--neutral-300)" fontSize="var(--font-3xl)" textAnchor="end">
              {index.toFixed(1)}
            </text>
          </g>
        );
      })}
      {Array.from(
        { length: Math.floor(analytics.maxMinute / 15) + 1 },
        (_, index) => index * 15,
      ).map((minute) => (
        <g key={minute}>
          <line
            x1={xForMinute(minute)}
            y1={top}
            x2={xForMinute(minute)}
            y2={top + height}
            stroke="var(--neutral-0)"
            strokeOpacity=".05"
          />
          <text x={xForMinute(minute)} y={top + height + 42} fill="var(--neutral-300)" fontSize="var(--font-3xl)" textAnchor="middle">
            {minute}&apos;
          </text>
        </g>
      ))}
      {teams.map((team) => {
        const points = analytics.xgByTeam.get(team.id) || [];
        const linePoints = points.map((point) =>
          `${xForMinute(point.minute)},${yForXg(point.total)}`,
        ).join(" ");
        return (
          <g key={team.id}>
            <polyline
              points={linePoints}
              fill="none"
              stroke={team.color}
              strokeWidth="7"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {points.slice(1).map((point, index) => {
              const x = xForMinute(point.minute);
              const y = yForXg(point.total);
              return (
                <g key={`${point.event.id}-${index}`}>
                  {point.bigChance && <circle cx={x} cy={y} r="15" fill="none" stroke="var(--neutral-0)" strokeWidth="4" />}
                  {point.goal ? (
                    <path
                      d={`M ${x} ${y - 14} L ${x + 14} ${y} L ${x} ${y + 14} L ${x - 14} ${y} Z`}
                      fill={team.color}
                      stroke="var(--neutral-900)"
                      strokeWidth="3"
                    />
                  ) : (
                    <circle cx={x} cy={y} r={point.bigChance ? 10 : 6} fill={team.color} />
                  )}
                  {point.goal && (
                    <text x={x} y={y - 23} fill="var(--neutral-0)" fontSize="var(--font-3xl)" textAnchor="middle">
                      {point.event.minute}&apos;
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
      <g transform="translate(170 985)">
        {teams.map((team, index) => (
          <g key={team.id} transform={`translate(${index * 420} 0)`}>
            <circle cx="10" cy="-7" r="8" fill={team.color} />
            <text x="30" y="0" fill="var(--neutral-100)" fontSize="var(--font-3xl)">{team.name}</text>
          </g>
        ))}
        <path d="M 880 -7 L 892 -19 L 904 -7 L 892 5 Z" fill="var(--neutral-300)" />
        <text x="916" y="0" fill="var(--neutral-300)" fontSize="var(--font-3xl)">Goal</text>
        <circle cx="1040" cy="-7" r="10" fill="none" stroke="var(--neutral-0)" strokeWidth="3" />
        <text x="1060" y="0" fill="var(--neutral-300)" fontSize="var(--font-3xl)">Big chance</text>
      </g>
      <text x="170" y="220" fill="var(--neutral-300)" fontSize="var(--font-3xl)">CUMULATIVE EXPECTED GOALS</text>
    </g>
  );
}

const PitchVisual = forwardRef<SVGSVGElement, Props>(function PitchVisual({
  data,
  view,
  title,
  transparent,
  analytics,
  selectedTeamId,
  freezeFrame,
  freezeEvent,
}, ref) {
  const homeId = data.match.home_team_id;
  const awayId = data.match.away_team_id;
  const teamColor = (teamId: number | null) =>
    teamId === homeId ? COLORS.home : teamId === awayId ? COLORS.away : COLORS.neutral;
  const nodeById = useMemo(
    () => new Map(analytics.nodes.map((node) => [node.id, node])),
    [analytics.nodes],
  );
  const visiblePlayers = freezeFrame?.freeze_frame || [];
  const actor = visiblePlayers.find((player) => player.actor);
  const visiblePolygon = (freezeFrame?.visible_area || [])
    .map((coordinate) => Number(coordinate))
    .filter(Number.isFinite);
  const polygonPoints = visiblePolygon.length >= 6 && visiblePolygon.length % 2 === 0
    ? Array.from({ length: visiblePolygon.length / 2 }, (_, index) =>
      `${visiblePolygon[index * 2]},${visiblePolygon[index * 2 + 1]}`,
    ).join(" ")
    : "";
  const matchTitle = title.trim() || `${data.match.home_team} vs ${data.match.away_team}`;
  const score = `${data.match.home_score ?? "–"} – ${data.match.away_score ?? "–"}`;

  return (
    <svg
      className="creator-artboard"
      xmlns="http://www.w3.org/2000/svg"
      width="1920"
      height="1080"
      viewBox="0 0 1920 1080"
      ref={ref}
      role="img"
      aria-label={`${matchTitle} ${view} visualization`}
    >
      {!transparent && <rect width="1920" height="1080" fill="var(--neutral-900)" />}
      <rect x="68" y="34" width="1784" height="112" rx="18" fill="var(--neutral-900)" fillOpacity=".95" stroke="var(--neutral-0)" strokeOpacity=".1" />
      <text x="100" y="76" fill="var(--neutral-300)" fontSize="var(--font-3xl)" fontWeight="700" letterSpacing="4">
        TECHNICALAREA  /  {view === "xg" ? "xG RACE" : view === "shots" ? "SHOT MAP" : view === "freeze" ? "STATSBOMB 360" : "PASS NETWORK"}
      </text>
      <text x="100" y="120" fill="var(--neutral-50)" fontSize="var(--font-3xl)" fontWeight="700">
        {matchTitle}
      </text>
      <text x="1810" y="78" fill="var(--neutral-100)" fontSize="var(--font-3xl)" fontWeight="700" textAnchor="end">
        {data.match.home_team} {score} {data.match.away_team}
      </text>
      <text x="1810" y="116" fill="var(--neutral-300)" fontSize="var(--font-3xl)" textAnchor="end">
        {data.match.season}{data.match.date ? `  ·  ${data.match.date}` : ""}
      </text>

      {view === "xg" ? (
        <XgRace analytics={analytics} data={data} />
      ) : (
        <g transform={`translate(${FIELD.x} ${FIELD.y}) scale(${FIELD.scale})`}>
          <FieldBase />
          {view === "network" && (
            <g transform="translate(0 80) scale(1 -1)">
              {analytics.links
                .filter((link) => selectedTeamId === null || link.teamId === selectedTeamId)
                .map((link) => {
                  const from = nodeById.get(link.from);
                  const to = nodeById.get(link.to);
                  if (!from || !to || from.teamId !== link.teamId || to.teamId !== link.teamId) return null;
                  return (
                    <g key={`${link.teamId}-${link.from}-${link.to}`}>
                      <line
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke={teamColor(link.teamId)}
                        strokeOpacity={link.progressive ? ".82" : ".3"}
                        strokeWidth={Math.min(0.9, 0.18 + link.volume * 0.11)}
                      />
                      {link.progressive > 0 && (
                        <line
                          x1={from.x}
                          y1={from.y}
                          x2={to.x}
                          y2={to.y}
                          stroke="var(--neutral-50)"
                          strokeOpacity=".55"
                          strokeWidth=".12"
                          strokeDasharray=".5 .4"
                        />
                      )}
                    </g>
                  );
                })}
              {analytics.nodes
                .filter((node) => selectedTeamId === null || node.teamId === selectedTeamId)
                .map((node) => (
                  <g key={node.id} transform={`translate(${node.x} ${node.y})`}>
                    <circle r={Math.min(2.6, 1.35 + node.touches * 0.025)} fill={teamColor(node.teamId)} stroke="var(--neutral-900)" strokeWidth=".3" />
                    <text
                      y="-3.3"
                      fill="var(--neutral-50)"
                      fontSize="var(--font-3xl)"
                      textAnchor="middle"
                      paintOrder="stroke"
                      stroke="var(--neutral-900)"
                      strokeWidth=".55"
                    >
                      {node.name}
                    </text>
                  </g>
                ))}
            </g>
          )}
          {view === "shots" && (
            <g transform="translate(0 80) scale(1 -1)">
              {analytics.shots.map(({ event, xg, goal, bigChance }) => (
                <g key={event.id}>
                  {event.end_location && (
                    <line
                      x1={event.location![0]}
                      y1={event.location![1]}
                      x2={event.end_location[0]}
                      y2={event.end_location[1]}
                      stroke={teamColor(event.team_id)}
                      strokeOpacity=".28"
                      strokeWidth=".18"
                    />
                  )}
                  <circle
                    cx={event.location![0]}
                    cy={event.location![1]}
                    r={Math.min(2.4, 0.55 + xg * 2.2)}
                    fill={goal ? "var(--neutral-200)" : teamColor(event.team_id)}
                    fillOpacity=".92"
                    stroke={goal ? "var(--neutral-0)" : "var(--neutral-900)"}
                    strokeWidth={goal ? ".38" : ".2"}
                  />
                  {bigChance && (
                    <circle
                      cx={event.location![0]}
                      cy={event.location![1]}
                      r={Math.min(3.2, 0.9 + xg * 2.2)}
                      fill="none"
                      stroke="var(--neutral-0)"
                      strokeWidth=".18"
                      strokeDasharray=".45 .3"
                    />
                  )}
                </g>
              ))}
            </g>
          )}
          {view === "freeze" && freezeFrame && (
            <g transform="translate(0 80) scale(1 -1)">
              {polygonPoints && (
                <polygon
                  points={polygonPoints}
                  fill="var(--neutral-300)"
                  fillOpacity=".12"
                  stroke="var(--neutral-200)"
                  strokeOpacity=".8"
                  strokeWidth=".2"
                />
              )}
              {actor?.location && visiblePlayers
                .filter((player) => player.teammate && player.location && player !== actor)
                .map((player, index) => (
                  <line
                    key={`lane-${player.player?.id ?? index}`}
                    x1={actor.location![0]}
                    y1={actor.location![1]}
                    x2={player.location![0]}
                    y2={player.location![1]}
                    stroke="var(--neutral-200)"
                    strokeOpacity=".34"
                    strokeWidth=".15"
                    strokeDasharray=".5 .35"
                  />
                ))}
              {visiblePlayers.filter((player) => player.location).map((player, index) => {
                const teammate = player.teammate === true;
                const color = teammate ? COLORS.home : COLORS.away;
                const [x, y] = player.location!;
                return (
                  <g key={`${player.player?.id ?? "player"}-${index}`} transform={`translate(${x} ${y})`}>
                    <circle r={player.actor ? 1.8 : 1.25} fill={player.keeper ? "var(--neutral-200)" : color} stroke={player.actor ? "var(--neutral-0)" : "var(--neutral-900)"} strokeWidth=".32" />
                    {player.actor && <circle r="2.15" fill="none" stroke="var(--neutral-0)" strokeWidth=".16" />}
                    {player.actor && <circle r=".45" fill="var(--neutral-0)" stroke="var(--neutral-900)" strokeWidth=".12" />}
                  </g>
                );
              })}
              {freezeEvent?.location && (
                <circle
                  cx={freezeEvent.location[0]}
                  cy={freezeEvent.location[1]}
                  r="2.6"
                  fill="none"
                  stroke="var(--neutral-0)"
                  strokeWidth=".22"
                  strokeDasharray=".6 .35"
                />
              )}
            </g>
          )}
        </g>
      )}

      {view === "shots" && (
        <g transform="translate(100 1010)">
          <circle cx="10" cy="-8" r="8" fill={COLORS.home} />
          <text x="28" y="0" fill="var(--neutral-100)" fontSize="var(--font-3xl)">{data.match.home_team}</text>
          <circle cx="360" cy="-8" r="8" fill={COLORS.away} />
          <text x="378" y="0" fill="var(--neutral-100)" fontSize="var(--font-3xl)">{data.match.away_team}</text>
          <circle cx="720" cy="-8" r="10" fill="var(--neutral-200)" />
          <text x="741" y="0" fill="var(--neutral-300)" fontSize="var(--font-3xl)">Goal</text>
          <circle cx="840" cy="-8" r="11" fill="none" stroke="var(--neutral-0)" strokeWidth="3" strokeDasharray="5 4" />
          <text x="862" y="0" fill="var(--neutral-300)" fontSize="var(--font-3xl)">Big chance</text>
          <text x="1700" y="0" fill="var(--neutral-300)" fontSize="var(--font-3xl)" textAnchor="end">Circle size = xG</text>
        </g>
      )}
      {view === "network" && (
        <g transform="translate(100 1010)">
          <circle cx="10" cy="-8" r="8" fill={COLORS.home} />
          <text x="28" y="0" fill="var(--neutral-100)" fontSize="var(--font-3xl)">{data.match.home_team}</text>
          <circle cx="360" cy="-8" r="8" fill={COLORS.away} />
          <text x="378" y="0" fill="var(--neutral-100)" fontSize="var(--font-3xl)">{data.match.away_team}</text>
          <line x1="720" y1="-8" x2="780" y2="-8" stroke="var(--neutral-100)" strokeOpacity=".4" strokeWidth="5" />
          <text x="795" y="0" fill="var(--neutral-300)" fontSize="var(--font-3xl)">Pass volume</text>
          <line x1="1030" y1="-8" x2="1090" y2="-8" stroke="var(--neutral-100)" strokeWidth="5" strokeDasharray="7 5" />
          <text x="1105" y="0" fill="var(--neutral-300)" fontSize="var(--font-3xl)">Progressive pass proxy</text>
        </g>
      )}
      {view === "freeze" && (
        <g transform="translate(100 1010)">
          <circle cx="10" cy="-8" r="8" fill={COLORS.home} />
          <text x="28" y="0" fill="var(--neutral-100)" fontSize="var(--font-3xl)">{data.match.home_team} / teammates</text>
          <circle cx="420" cy="-8" r="8" fill={COLORS.away} />
          <text x="438" y="0" fill="var(--neutral-100)" fontSize="var(--font-3xl)">{data.match.away_team} / opponents</text>
          <text x="1700" y="0" fill="var(--neutral-300)" fontSize="var(--font-3xl)" textAnchor="end">
            {freezeFrame ? `${visiblePlayers.length} players · ${readName(freezeEvent?.type)}` : "No freeze frame for this event"}
          </text>
        </g>
      )}
      <text x="1820" y="1050" fill="var(--neutral-500)" fontSize="var(--font-3xl)" textAnchor="end" letterSpacing="2">
        OPTA CONNECTOR  ·  STATSBOMB OPEN DATA
      </text>
      {!freezeFrame && view === "freeze" && (
        <text x="960" y="600" fill="var(--neutral-100)" fontSize="var(--font-3xl)" textAnchor="middle">
          Select an event with an available StatsBomb 360 frame
        </text>
      )}
    </svg>
  );
});

export default PitchVisual;
