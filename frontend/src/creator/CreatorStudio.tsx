import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  CircleAlert,
  Download,
  Image,
  LoaderCircle,
  Network,
  Radio,
  Sparkles,
} from "lucide-react";
import { analyzeMatch, freezeFrameForEvent } from "./analytics";
import { exportGraphic, type GraphicFormat } from "./exportGraphic";
import PitchVisual from "./PitchVisual";
import type {
  Creator360Data,
  CreatorEvent,
  CreatorMatch,
  CreatorMatchData,
  CreatorView,
} from "./types";
import "./creator-studio.css";

const VIEWS: { id: CreatorView; label: string; icon: typeof Network }[] = [
  { id: "network", label: "Pass network", icon: Network },
  { id: "shots", label: "Shot map", icon: Camera },
  { id: "xg", label: "xG race", icon: Radio },
  { id: "freeze", label: "360 freeze frame", icon: Image },
];

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const result = await response.json() as T & { detail?: string };
  if (!response.ok) throw new Error(result.detail || fallback);
  return result;
}

function eventClock(event: CreatorEvent) {
  return `${String(Math.floor(event.minute)).padStart(2, "0")}:${String(event.second).padStart(2, "0")}`;
}

function safeFileName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w -]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase() || "match-graphic";
}

export default function CreatorStudio() {
  const [matches, setMatches] = useState<CreatorMatch[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [data, setData] = useState<CreatorMatchData | null>(null);
  const [creator360, setCreator360] = useState<Creator360Data | null>(null);
  const [view, setView] = useState<CreatorView>("network");
  const [title, setTitle] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("both");
  const [freezeEventId, setFreezeEventId] = useState("");
  const [transparent, setTransparent] = useState(false);
  const [creatorMode, setCreatorMode] = useState(false);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [matchLoading, setMatchLoading] = useState(false);
  const [freezeLoading, setFreezeLoading] = useState(false);
  const [exporting, setExporting] = useState<GraphicFormat | null>(null);
  const [error, setError] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const graphicRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ball-by-ball/matches/", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then((response) => readJson<{ matches: CreatorMatch[] }>(response, "Could not load matches."))
      .then((result) => {
        setMatches(result.matches);
        setSelectedMatchId(result.matches[0] ? String(result.matches[0].id) : "");
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Could not load matches.");
      })
      .finally(() => setMatchesLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedMatchId) {
      setData(null);
      setMatchLoading(false);
      return;
    }
    const controller = new AbortController();
    setData(null);
    setCreator360(null);
    setFreezeEventId("");
    setError("");
    setMatchLoading(true);
    fetch(`/api/ball-by-ball/matches/${selectedMatchId}/events/`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then((response) => readJson<CreatorMatchData>(response, "Could not load match events."))
      .then((result) => {
        setData(result);
        setTitle(`${result.match.home_team} vs ${result.match.away_team}`);
        setSelectedTeam("both");
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Could not load match events.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setMatchLoading(false);
      });
    return () => controller.abort();
  }, [loadAttempt, selectedMatchId]);

  useEffect(() => {
    if (view !== "freeze" || !data || creator360) return;
    const controller = new AbortController();
    setFreezeLoading(true);
    fetch(`/api/ball-by-ball/matches/${selectedMatchId}/360/`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then((response) => readJson<Creator360Data>(response, "Could not load StatsBomb 360 data."))
      .then((result) => {
        setCreator360(result);
        const firstFrameEvent = result.frames[0]?.event_uuid || "";
        setFreezeEventId(firstFrameEvent);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Could not load StatsBomb 360 data.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setFreezeLoading(false);
      });
    return () => controller.abort();
  }, [creator360, data, loadAttempt, selectedMatchId, view]);

  useEffect(() => {
    document.body.classList.toggle("creator-export-mode", creatorMode);
    return () => document.body.classList.remove("creator-export-mode");
  }, [creatorMode]);

  const analytics = useMemo(
    () => analyzeMatch(data?.events || []),
    [data?.events],
  );
  const selectedTeamId = selectedTeam === "both"
    ? null
    : Number(selectedTeam);
  const availableFreezeEvents = useMemo(() => {
    if (!creator360?.available || !data) return [];
    const eventIds = new Set(creator360.frames.map((frame) => frame.event_uuid));
    return data.events.filter((event) => eventIds.has(event.id));
  }, [creator360, data]);
  const freezeEvent = availableFreezeEvents.find((event) => event.id === freezeEventId)
    || availableFreezeEvents[0]
    || null;
  const freezeFrame = freezeEvent && creator360
    ? freezeFrameForEvent(creator360.frames, freezeEvent.id)
    : null;

  const exportFile = async (format: GraphicFormat) => {
    if (!graphicRef.current) {
      setExportMessage("The graphic is not ready to export.");
      return;
    }
    setExporting(format);
    setExportMessage("");
    try {
      await exportGraphic(
        graphicRef.current,
        format,
        safeFileName(`${title}-${view}`),
      );
      setExportMessage(format === "png" ? "4K PNG exported." : "SVG exported.");
    } catch (cause) {
      setExportMessage(cause instanceof Error ? cause.message : "The graphic could not be exported.");
    } finally {
      setExporting(null);
    }
  };

  const currentMatch = matches.find((match) => String(match.id) === selectedMatchId);
  const homeXgPoints = analytics.xgByTeam.get(data?.match.home_team_id || -1) || [];
  const awayXgPoints = analytics.xgByTeam.get(data?.match.away_team_id || -1) || [];
  const homeXg = homeXgPoints[homeXgPoints.length - 1]?.total || 0;
  const awayXg = awayXgPoints[awayXgPoints.length - 1]?.total || 0;

  return (
    <section className={`creator-studio ${creatorMode ? "creator-mode-active" : ""}`}>
      <header className="creator-studio-heading">
        <div>
          <p className="creator-eyebrow"><Sparkles size={13} /> CREATOR WORKSPACE / MATCH GRAPHICS</p>
          <h1>Broadcast studio</h1>
          <p>Compose match visuals for 16:9 video, then export at 4K or as vector artwork.</p>
        </div>
        <button
          className={`creator-mode-toggle ${creatorMode ? "active" : ""}`}
          type="button"
          aria-pressed={creatorMode}
          onClick={() => setCreatorMode((active) => !active)}
        >
          <Camera size={15} />
          {creatorMode ? "Exit Creator Mode" : "Creator Export Mode"}
        </button>
      </header>

      <div className="creator-studio-grid">
        <aside className="creator-control-panel">
          <div className="creator-control-section">
            <label>
              <span>MATCH</span>
              <select
                value={selectedMatchId}
                onChange={(event) => {
                  setSelectedMatchId(event.target.value);
                  setCreator360(null);
                  setError("");
                }}
                disabled={matchesLoading || !matches.length}
              >
                <option value="">
                  {matchesLoading ? "Loading matches…" : "No imported matches"}
                </option>
                {matches.map((match) => (
                  <option key={match.id} value={match.id}>
                    {match.date || "Date unavailable"} · {match.home_team} {match.home_score ?? "–"}–{match.away_score ?? "–"} {match.away_team} · {match.season}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>GRAPHIC TITLE</span>
              <input
                value={title}
                maxLength={100}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Add a broadcast title"
              />
            </label>
          </div>

          <div className="creator-control-section">
            <span className="creator-section-label">VISUALIZATION</span>
            <div className="creator-view-tabs" role="tablist" aria-label="Graphic type">
              {VIEWS.map(({ id, label, icon: Icon }) => (
                <button
                  type="button"
                  key={id}
                  role="tab"
                  aria-selected={view === id}
                  className={view === id ? "selected" : ""}
                  onClick={() => {
                    setView(id);
                    setError("");
                  }}
                >
                  <Icon size={15} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {view === "network" && data && (
            <div className="creator-control-section">
              <label>
                <span>TEAM FILTER</span>
                <select value={selectedTeam} onChange={(event) => setSelectedTeam(event.target.value)}>
                  <option value="both">Both teams</option>
                  <option value={data.match.home_team_id}>{data.match.home_team}</option>
                  <option value={data.match.away_team_id}>{data.match.away_team}</option>
                </select>
              </label>
              <p className="creator-method-note">
                Links show completed passes to a recorded receiver. Dashed highlights use a 10m forward-progression proxy.
              </p>
            </div>
          )}

          {view === "freeze" && (
            <div className="creator-control-section">
              <label>
                <span>KEY EVENT</span>
                <select
                  value={freezeEvent?.id || ""}
                  onChange={(event) => setFreezeEventId(event.target.value)}
                  disabled={!availableFreezeEvents.length}
                >
                  {availableFreezeEvents.length ? availableFreezeEvents.map((event) => (
                    <option key={event.id} value={event.id}>
                      {eventClock(event)} · {event.player || event.team || event.type}
                    </option>
                  )) : <option value="">No 360 frames available</option>}
                </select>
              </label>
              <p className="creator-method-note">
                Freeze frames load on demand from the public StatsBomb Open Data source and are cached locally.
              </p>
            </div>
          )}

          <div className="creator-control-section">
            <span className="creator-section-label">CANVAS</span>
            <label>
              <span>BACKGROUND</span>
              <select value={transparent ? "transparent" : "dark"} onChange={(event) => setTransparent(event.target.value === "transparent")}>
                <option value="dark">Broadcast dark</option>
                <option value="transparent">Transparent</option>
              </select>
            </label>
            <div className="creator-export-buttons">
              <button type="button" onClick={() => void exportFile("png")} disabled={!data || exporting !== null}>
                {exporting === "png" ? <LoaderCircle size={15} className="spin" /> : <Download size={15} />}
                Export 4K PNG
              </button>
              <button type="button" onClick={() => void exportFile("svg")} disabled={!data || exporting !== null}>
                {exporting === "svg" ? <LoaderCircle size={15} className="spin" /> : <Download size={15} />}
                Export SVG
              </button>
            </div>
            <p className="creator-export-status" aria-live="polite">{exportMessage}</p>
          </div>
          <p className="creator-disclaimer">Source: StatsBomb Open Data. Derived measures are illustrative proxies, not official Opta metrics.</p>
        </aside>

        <div className="creator-preview-column">
          <div className="creator-preview-meta">
            <span>{currentMatch ? `${currentMatch.season} · ${currentMatch.event_count.toLocaleString()} events` : "Match preview"}</span>
            <span><i /> 16:9 MASTER</span>
          </div>
          {error ? (
            <div className="creator-state creator-error">
              <CircleAlert size={18} />
              <span>{error}</span>
              <button type="button" onClick={() => {
                if (view === "freeze") setCreator360(null);
                setLoadAttempt((attempt) => attempt + 1);
                setError("");
              }}>Retry</button>
            </div>
          ) : matchLoading || matchesLoading || (view === "freeze" && freezeLoading) ? (
            <div className="creator-state">
              <LoaderCircle size={20} className="spin" />
              <span>{freezeLoading ? "Loading StatsBomb 360 frames…" : "Preparing match graphic…"}</span>
            </div>
          ) : !data ? (
            <div className="creator-state">
              <CircleAlert size={20} />
              <span>Select an imported match to begin.</span>
            </div>
          ) : view === "freeze" && creator360 && !creator360.available ? (
            <div className="creator-state creator-state-empty">
              <Image size={24} />
              <strong>360 data is not available for this match</strong>
              <span>StatsBomb Open Data publishes freeze-frame files for selected matches only.</span>
            </div>
          ) : (
            <div className="creator-artboard-wrap">
              <PitchVisual
                ref={graphicRef}
                data={data}
                view={view}
                title={title}
                transparent={transparent}
                analytics={analytics}
                selectedTeamId={selectedTeamId}
                freezeFrame={freezeFrame}
                freezeEvent={freezeEvent}
              />
            </div>
          )}
          {data && (
            <div className="creator-stat-strip">
              <span><strong>{analytics.nodes.length}</strong> players tracked</span>
              <span><strong>{analytics.links.reduce((total, link) => total + link.volume, 0)}</strong> completed passes</span>
              <span><strong>{analytics.shots.length}</strong> shots</span>
              <span><strong>{homeXg.toFixed(2)} – {awayXg.toFixed(2)}</strong> xG</span>
            </div>
          )}
        </div>
      </div>

      {creatorMode && (
        <div className="creator-export-toolbar">
          <button type="button" onClick={() => setCreatorMode(false)}>
            <ArrowLeft size={16} /> Exit export mode
          </button>
          <span>{title || "Match graphic"} · {view === "xg" ? "xG race" : view === "shots" ? "shot map" : view === "freeze" ? "360 frame" : "pass network"}</span>
          <button type="button" onClick={() => void exportFile("png")} disabled={!data || exporting !== null}>
            <Download size={15} /> PNG
          </button>
          <button type="button" onClick={() => void exportFile("svg")} disabled={!data || exporting !== null}>
            <Download size={15} /> SVG
          </button>
        </div>
      )}
    </section>
  );
}
