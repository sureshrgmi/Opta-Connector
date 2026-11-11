import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Check,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  CircleAlert,
  Command,
  CloudDownload,
  Database,
  LayoutDashboard,
  LogOut,
  Menu,
  MoreHorizontal,
  Rows3,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

type HealthResult = {
  status: "ok" | "error";
  message: string;
  checked_at: string;
};

type HealthState =
  | { kind: "checking" }
  | { kind: "ok"; result: HealthResult }
  | { kind: "error"; message: string; checkedAt?: string };

const HEALTH_ENDPOINT = "/api/postgres-health/";
const TABLE_NAMES = ["competitions", "seasons", "teams", "players", "matches", "lineups", "events"];

type TableData = {
  table: string;
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pages: number;
  page_size: number;
};
type SyncRunInfo = {
  id: number;
  status: string;
  started_at: string;
  completed_at: string | null;
  summary: Record<string, number>;
  error: string;
};
type SyncStatus = {
  active: boolean;
  latest: SyncRunInfo | null;
  source: string;
  competition: string;
  available_seasons: string[];
};

function getIdentity() {
  const element = document.getElementById("root");
  return {
    name: element?.dataset.userName || "Workspace member",
    email: element?.dataset.userEmail || "",
    initial: element?.dataset.userInitial || "W",
  };
}

function App() {
  const identity = getIdentity();
  const isHealthPage = window.location.pathname.startsWith("/postgres-check");
  const isSyncPage = window.location.pathname.startsWith("/data/sync");
  const tableMatch = window.location.pathname.match(/^\/tables\/([a-z_]+)\/?$/);
  const currentTable = tableMatch?.[1] || null;
  const isDataPage = Boolean(currentTable || isSyncPage);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "true",
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tablesOpen, setTablesOpen] = useState(isDataPage);
  const [configOpen, setConfigOpen] = useState(isHealthPage);
  const pageTitle = isHealthPage
    ? "Postgres connection"
    : isSyncPage
      ? "Sync data"
      : currentTable
        ? `${currentTable.replace("_", " ")} table`
        : "Overview";

  const toggleSidebar = () => {
    if (window.matchMedia("(max-width: 760px)").matches) {
      setMobileOpen((open) => !open);
      return;
    }
    setCollapsed((value) => {
      localStorage.setItem("sidebar-collapsed", String(!value));
      return !value;
    });
  };

  return (
    <div
      className={`app-shell ${collapsed ? "sidebar-collapsed" : ""} ${mobileOpen ? "sidebar-open" : ""}`}
    >
      {mobileOpen && (
        <button
          aria-label="Close navigation"
          className="mobile-backdrop"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Opta Connector dashboard">
          <span className="brand-mark">O</span>
          <span className="brand-copy">
            opta<span>connector</span>
          </span>
        </a>

        <div className="workspace-switcher">
          <span className="workspace-avatar">O</span>
          <span className="workspace-info">
            <small>WORKSPACE</small>
            <strong>Opta Studio</strong>
          </span>
          <ChevronDown size={15} />
        </div>

        <nav className="side-nav" aria-label="Main navigation">
          <p className="nav-heading">WORKSPACE</p>
          <a className={`nav-item ${!isHealthPage && !isDataPage ? "selected" : ""}`} href="/" title="Overview">
            <LayoutDashboard size={18} />
            <span className="nav-label">Overview</span>
          </a>
          <p className="nav-heading nav-heading-spaced">DATA</p>
          <button
            className={`nav-item nav-group-toggle ${isDataPage ? "selected" : ""}`}
            type="button"
            title="Tables"
            aria-expanded={tablesOpen}
            onClick={() => {
              if (collapsed) {
                setCollapsed(false);
                localStorage.setItem("sidebar-collapsed", "false");
                setTablesOpen(true);
                return;
              }
              setTablesOpen((open) => !open);
            }}
          >
            <Rows3 size={18} />
            <span className="nav-label">Tables</span>
            <ChevronRight className={`nav-chevron ${tablesOpen ? "expanded" : ""}`} size={14} />
          </button>
          {tablesOpen && (
            <div className="nav-submenu">
              {TABLE_NAMES.map((table) => (
                <a
                  className={`nav-subitem ${currentTable === table ? "selected" : ""}`}
                  href={`/tables/${table}/`}
                  key={table}
                >
                  <span>{table.replace("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}</span>
                </a>
              ))}
              <a className={`nav-subitem ${isSyncPage ? "selected" : ""}`} href="/data/sync/">
                <span>Sync StatsBomb</span>
              </a>
            </div>
          )}
          <p className="nav-heading nav-heading-spaced">PREFERENCES</p>
          <button
            className={`nav-item nav-group-toggle ${isHealthPage ? "selected" : ""}`}
            type="button"
            title="Config"
            aria-expanded={configOpen}
            onClick={() => {
              if (collapsed) {
                setCollapsed(false);
                localStorage.setItem("sidebar-collapsed", "false");
                setConfigOpen(true);
                return;
              }
              setConfigOpen((open) => !open);
            }}
          >
            <Settings2 size={18} />
            <span className="nav-label">Config</span>
            <ChevronRight className={`nav-chevron ${configOpen ? "expanded" : ""}`} size={14} />
          </button>
          {configOpen && (
            <div className="nav-submenu">
              <a
                className={`nav-subitem ${isHealthPage ? "selected" : ""}`}
                href="/postgres-check/"
                title="Postgres Connection Check"
              >
                <span>Postgres Connection Check</span>
                {isHealthPage && <span className="nav-pulse" />}
              </a>
            </div>
          )}
          <button className="nav-item nav-disabled" type="button" title="Coming soon" disabled>
            <Activity size={18} />
            <span className="nav-label">Activity</span>
            <span className="coming-soon nav-label">SOON</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <button
            className="collapse-button"
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={toggleSidebar}
          >
            <ChevronLeft size={17} />
            <span className="nav-label">{collapsed ? "Expand sidebar" : "Collapse sidebar"}</span>
          </button>
          <div className="profile-card">
            <span className="profile-avatar">{identity.initial}</span>
            <span className="profile-copy">
              <strong>{identity.name}</strong>
              <small>{identity.email}</small>
            </span>
            <button
              className="logout-button"
              type="button"
              onClick={() => document.querySelector<HTMLFormElement>("#logout-form")?.requestSubmit()}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="topbar-start">
            <button
              className="icon-button mobile-menu"
              onClick={toggleSidebar}
              aria-label="Toggle navigation"
              type="button"
            >
              <Menu size={19} />
            </button>
            <div className="breadcrumbs">
              <span>Workspace</span>
              <span className="breadcrumb-separator">/</span>
              <strong>{pageTitle}</strong>
            </div>
            <kbd className="shortcut"><Command size={12} /> K</kbd>
          </div>
          <div className="topbar-actions">
            <span className="live-indicator"><i /> Workspace active</span>
            <button className="topbar-avatar" aria-label="Signed-in user" title={identity.name}>
              {identity.initial}
            </button>
          </div>
        </header>

        <main className="page-content">
          {isHealthPage ? (
            <HealthPage />
          ) : isSyncPage ? (
            <SyncPage />
          ) : currentTable ? (
            <TablePage tableName={currentTable} />
          ) : (
            <DashboardPage identityName={identity.name.split(" ")[0] || "there"} />
          )}
        </main>
        <footer className="footer">
          <span>© 2026 Opta Connector</span>
          <span className="footer-right"><ShieldCheck size={14} /> Your workspace is secure</span>
        </footer>
      </div>
    </div>
  );
}

function DashboardPage({ identityName }: { identityName: string }) {
  const [health, setHealth] = useState<HealthState>({ kind: "checking" });
  const refreshHealth = useCallback(async (signal?: AbortSignal) => {
    setHealth({ kind: "checking" });
    try {
      const response = await fetch(HEALTH_ENDPOINT, {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
        signal,
      });
      const result = (await response.json()) as HealthResult;
      if (!response.ok || result.status !== "ok") {
        setHealth({ kind: "error", message: result.message, checkedAt: result.checked_at });
      } else {
        setHealth({ kind: "ok", result });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setHealth({ kind: "error", message: "The database could not be reached." });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refreshHealth(controller.signal);
    return () => controller.abort();
  }, [refreshHealth]);

  const isConnected = health.kind === "ok";
  const checkedAt = health.kind === "ok"
    ? health.result.checked_at
    : health.kind === "error" ? health.checkedAt : undefined;

  return (
    <>
      <section className="welcome-panel">
        <div className="welcome-grid" />
        <div className="welcome-content">
          <span className="welcome-kicker"><Sparkles size={13} /> YOUR WORKSPACE, AT A GLANCE</span>
          <h1>Good to see you, {identityName}<span>.</span></h1>
          <p>Your workspace is ready. Here’s the latest on your systems.</p>
          <a className="welcome-action" href="/postgres-check/">
            Explore system health <ArrowRight size={15} />
          </a>
        </div>
        <div className="welcome-visual" aria-hidden="true">
          <div className="visual-ring ring-outer" />
          <div className="visual-ring ring-inner" />
          <div className="visual-core"><span>O</span><i /></div>
          <div className="visual-node node-top" />
          <div className="visual-node node-bottom" />
        </div>
        <span className="welcome-index">01 — OVERVIEW</span>
      </section>

      <div className="section-title-row">
        <div>
          <p className="eyebrow">YOUR ENVIRONMENT</p>
          <h2>System overview</h2>
        </div>
        <span className="updated-label"><span /> LIVE STATUS</span>
      </div>

      <section className="stats-grid">
        <article className="stat-card">
          <div className="stat-top">
            <span className="stat-icon blue"><Database size={17} /></span>
            <span className={`status-pill ${isConnected ? "success" : health.kind === "checking" ? "pending" : "failure"}`}>
              <i /> {isConnected ? "Connected" : health.kind === "checking" ? "Checking" : "Offline"}
            </span>
          </div>
          <p className="stat-label">POSTGRES DATABASE</p>
          <h3>{isConnected ? "Healthy" : health.kind === "checking" ? "Checking…" : "Unreachable"}</h3>
          <p className="stat-foot">
            {checkedAt ? `Checked ${formatTime(checkedAt)}` : "Waiting for first check"}
          </p>
          <a className="card-link" href="/postgres-check/">View connection <ArrowUpRight size={14} /></a>
        </article>
        <article className="stat-card">
          <div className="stat-top">
            <span className="stat-icon violet"><ShieldCheck size={17} /></span>
            <span className="status-pill success"><i /> Active</span>
          </div>
          <p className="stat-label">ACCOUNT SECURITY</p>
          <h3>Google OAuth</h3>
          <p className="stat-foot">Your sign-in is protected</p>
          <span className="card-link card-link-static">Verified identity <Check size={14} /></span>
        </article>
        <article className="stat-card stat-card-muted">
          <div className="stat-top">
            <span className="stat-icon amber"><Activity size={17} /></span>
            <span className="status-pill neutral">COMING SOON</span>
          </div>
          <p className="stat-label">ACTIVITY MONITOR</p>
          <h3>More insights</h3>
          <p className="stat-foot">Additional monitoring is on the way</p>
          <span className="card-link card-link-static muted-link">Explore roadmap <ArrowUpRight size={14} /></span>
        </article>
      </section>

      <section className="lower-grid">
        <div className="panel recent-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">AT A GLANCE</p><h2>Connection status</h2></div>
            <button
              className="icon-button refresh-button"
              type="button"
              onClick={() => void refreshHealth()}
              aria-label="Refresh database status"
              title="Refresh status"
            ><RefreshCw size={15} /></button>
          </div>
          <div className="connection-row">
            <span className={`connection-indicator ${health.kind}`} />
            <span className="connection-copy">
              <strong>PostgreSQL</strong>
              <small>{health.kind === "ok" ? "Database is responding normally" : health.kind === "checking" ? "Checking your database connection" : health.message}</small>
            </span>
            <span className={`connection-result ${isConnected ? "text-success" : health.kind === "checking" ? "" : "text-error"}`}>
              {isConnected ? "Operational" : health.kind === "checking" ? "Checking" : "Unavailable"}
            </span>
          </div>
          <a className="panel-link" href="/postgres-check/">Open connection check <ArrowRight size={14} /></a>
        </div>
        <div className="panel quick-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">QUICK ACTIONS</p><h2>Jump back in</h2></div>
            <MoreHorizontal size={18} className="quiet-icon" />
          </div>
          <a className="quick-action" href="/postgres-check/">
            <span className="quick-action-icon"><Database size={17} /></span>
            <span><strong>Test database connection</strong><small>Run a real-time health check</small></span>
            <ArrowUpRight size={15} className="quick-arrow" />
          </a>
          <button className="quick-action" type="button" onClick={() => document.querySelector<HTMLButtonElement>(".logout-button")?.click()}>
            <span className="quick-action-icon quiet"><Settings2 size={17} /></span>
            <span><strong>Manage your session</strong><small>Sign out of your workspace</small></span>
            <ArrowDownRight size={15} className="quick-arrow" />
          </button>
        </div>
      </section>
    </>
  );
}

function HealthPage() {
  const [health, setHealth] = useState<HealthState>({ kind: "checking" });

  const checkDatabase = useCallback(async (signal?: AbortSignal) => {
    setHealth({ kind: "checking" });
    try {
      const response = await fetch(HEALTH_ENDPOINT, {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
        signal,
      });
      const result = (await response.json()) as HealthResult;
      if (!response.ok || result.status !== "ok") {
        setHealth({ kind: "error", message: result.message, checkedAt: result.checked_at });
      } else {
        setHealth({ kind: "ok", result });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setHealth({ kind: "error", message: "Could not reach the health-check endpoint." });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void checkDatabase(controller.signal);
    const interval = window.setInterval(() => void checkDatabase(), 30000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [checkDatabase]);

  const connected = health.kind === "ok";
  const message = health.kind === "ok"
    ? health.result.message
    : health.kind === "error" ? health.message : "Contacting your PostgreSQL database…";
  const checkedAt = health.kind === "ok"
    ? health.result.checked_at
    : health.kind === "error" ? health.checkedAt : undefined;

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">MONITORING / DATABASE</p>
          <h1>Postgres connection</h1>
          <p className="page-subtitle">A live connection check from your application to PostgreSQL.</p>
        </div>
        <button
          className="outline-button"
          onClick={() => void checkDatabase()}
          disabled={health.kind === "checking"}
          type="button"
        >
          <RefreshCw size={15} className={health.kind === "checking" ? "spin" : ""} />
          Run check
        </button>
      </div>

      <section className={`health-hero ${connected ? "health-good" : health.kind === "error" ? "health-bad" : ""}`}>
        <div className="health-hero-top">
          <span className="health-hero-icon"><Database size={20} /></span>
          <span className="health-hero-label">PRIMARY DATABASE</span>
          <span className="health-auto"><i /> AUTO-CHECK EVERY 30 SEC</span>
        </div>
        <div className="health-main">
          <div className={`health-beacon ${health.kind}`}><span /></div>
          <div>
            <p className="health-state-label">{health.kind === "checking" ? "CONNECTION STATUS" : connected ? "CONNECTION ESTABLISHED" : "CONNECTION INTERRUPTED"}</p>
            <h2>{health.kind === "checking" ? "Checking database…" : connected ? "Everything is connected." : "We couldn't connect."}</h2>
            <p className="health-message">{message}</p>
          </div>
        </div>
        <div className="health-hero-footer">
          <span className="health-check-meta"><span>Last checked</span><strong>{checkedAt ? formatDateTime(checkedAt) : "In progress…"}</strong></span>
          <span className="health-check-meta"><span>Method</span><strong><code>SELECT 1</code> · Read-only</strong></span>
          <span className="health-check-meta"><span>Service</span><strong><i className={`tiny-dot ${connected ? "good" : health.kind === "error" ? "bad" : ""}`} /> PostgreSQL</strong></span>
        </div>
      </section>

      <div className="health-details-grid">
        <article className="detail-card">
          <span className="detail-icon"><ShieldCheck size={17} /></span>
          <div><strong>Safe by design</strong><p>The check runs a read-only query and never changes your data.</p></div>
        </article>
        <article className="detail-card">
          <span className="detail-icon"><RefreshCw size={17} /></span>
          <div><strong>Always up to date</strong><p>Status refreshes automatically every 30 seconds.</p></div>
        </article>
      </div>
    </>
  );
}

function TablePage({ tableName }: { tableName: string }) {
  const [data, setData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/data/tables/${tableName}/?page=${page}`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || "Could not load this table.");
        return result as TableData;
      })
      .then(setData)
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Could not load this table.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [page, tableName]);

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">STATSBOMB OPEN DATA / TABLES</p>
          <h1>{tableName.replace("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}</h1>
          <p className="page-subtitle">Premier League · StatsBomb Open Data · Source IDs are retained.</p>
        </div>
        <a className="outline-button" href="/data/sync/"><CloudDownload size={15} /> Sync data</a>
      </div>
      <section className="data-table-panel">
        <div className="data-table-toolbar">
          <div className="data-table-title">
            <span className="data-table-icon"><Rows3 size={16} /></span>
            <strong>{tableName.replace("_", " ")}</strong>
            <span className="record-count">{data ? `${data.total.toLocaleString()} records` : "Loading records"}</span>
          </div>
          {data && <span className="page-count">Page {data.page} of {Math.max(data.pages, 1)}</span>}
        </div>
        {error ? (
          <div className="table-state table-error"><CircleAlert size={18} /><span>{error}</span></div>
        ) : loading ? (
          <div className="table-state"><RefreshCw size={17} className="spin" /> Loading data…</div>
        ) : data?.total === 0 ? (
          <div className="table-empty">
            <Database size={25} />
            <strong>No data in this table yet</strong>
            <span>Run a StatsBomb sync to import the available Premier League seasons.</span>
            <a className="outline-button" href="/data/sync/"><CloudDownload size={15} /> Sync StatsBomb data</a>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="records-table">
              <thead>
                <tr>{data?.columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
              </thead>
              <tbody>
                {data?.rows.map((row, rowIndex) => (
                  <tr key={`${String(row.source_id ?? row.match_id ?? rowIndex)}-${rowIndex}`}>
                    {data.columns.map((column) => (
                      <td key={column.key}>{formatCell(row[column.key])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > 0 && (
          <div className="table-pagination">
            <span>{((data.page - 1) * data.page_size + 1).toLocaleString()}–{Math.min(data.page * data.page_size, data.total).toLocaleString()} of {data.total.toLocaleString()}</span>
            <div>
              <button type="button" className="outline-button" disabled={data.page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
              <button type="button" className="outline-button" disabled={data.page >= data.pages} onClick={() => setPage((value) => value + 1)}>Next</button>
            </div>
          </div>
        )}
      </section>
      <p className="data-attribution">
        Data provided by <a href="https://github.com/statsbomb/open-data" target="_blank" rel="noreferrer">StatsBomb Open Data</a>. Cite StatsBomb when publishing analysis based on this data.
      </p>
    </>
  );
}

function formatCell(value: unknown) {
  if (value === null || value === undefined || value === "") return <span className="empty-cell">—</span>;
  if (typeof value === "boolean") return value ? <CheckCircle2 size={15} className="bool-yes" /> : "No";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string" && /^\d{4}-\d\d-\d\dT/.test(value)) {
    return formatDateTime(value);
  }
  if (typeof value === "string" && /^\d{4}-\d\d-\d\d$/.test(value)) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
  }
  return String(value);
}

function SyncPage() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");

  const refreshStatus = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/data/sync/", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "Could not retrieve sync status.");
    setStatus(result as SyncStatus);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const load = () => {
      void refreshStatus(controller.signal)
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "AbortError") return;
          setError(cause instanceof Error ? cause.message : "Could not retrieve sync status.");
        })
        .finally(() => setLoading(false));
    };
    load();
    const interval = window.setInterval(load, 3000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [refreshStatus]);

  const startSync = async () => {
    const csrfToken = document.querySelector<HTMLInputElement>(
      "#logout-form input[name=csrfmiddlewaretoken]",
    )?.value;
    if (!csrfToken) {
      setError("Could not read the security token. Refresh the page and try again.");
      return;
    }
    setSyncing(true);
    setError("");
    try {
      const response = await fetch("/api/data/sync/start/", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json", "X-CSRFToken": csrfToken },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Could not start the data sync.");
      await refreshStatus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the data sync.");
    } finally {
      setSyncing(false);
    }
  };

  const run = status?.latest;
  const summaryLabels: Record<string, string> = {
    matches_updated: "Matches imported or updated",
    matches_unchanged: "Matches already up to date",
    matches_failed: "Matches that failed",
    seasons: "Seasons available",
    teams: "Teams stored",
    players: "Players stored",
    matches: "Matches stored",
    events: "Events stored",
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">DATA PIPELINE / SOURCE</p>
          <h1>Sync StatsBomb data</h1>
          <p className="page-subtitle">Manually fetch and upsert the free Premier League data into PostgreSQL.</p>
        </div>
        <button className="primary-sync-button" type="button" onClick={() => void startSync()} disabled={Boolean(status?.active) || syncing || loading}>
          <CloudDownload size={16} /> {status?.active ? "Sync running…" : syncing ? "Starting…" : "Sync now"}
        </button>
      </div>

      <section className="source-card">
        <div className="source-card-top">
          <span className="source-icon"><Activity size={18} /></span>
          <span className="source-status">{status?.active ? <><i className="sync-running-dot" /> Sync in progress</> : <><i className="sync-idle-dot" /> Manual sync</>}</span>
        </div>
        <p className="eyebrow">CONNECTED PUBLIC SOURCE</p>
        <h2>StatsBomb Open Data</h2>
        <p className="source-description">Official open JSON data from StatsBomb, loaded from its public GitHub repository. Updates existing records and imports new matches/events when the upstream files change.</p>
        <div className="source-seasons">
          <span>Premier League seasons available</span>
          {status?.available_seasons.map((season) => <strong key={season}>{season}</strong>)}
        </div>
        <div className="source-card-footer">
          <a href="https://github.com/statsbomb/open-data" target="_blank" rel="noreferrer">View source repository <ArrowUpRight size={14} /></a>
          <span>Free community data · Attribution required</span>
        </div>
      </section>

      {error && <div className="sync-error" role="alert"><CircleAlert size={16} /> {error}</div>}
      {loading ? (
        <div className="table-state"><RefreshCw size={17} className="spin" /> Loading pipeline status…</div>
      ) : run ? (
        <section className="sync-run-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">LATEST RUN · #{run.id}</p><h2>{status?.active ? "Sync in progress" : statusLabel(run.status)}</h2></div>
            {run.status === "succeeded" ? <CheckCircle2 className="run-success-icon" size={20} /> : run.status === "failed" || run.status === "partial" ? <CircleAlert className="run-error-icon" size={20} /> : <RefreshCw className="spin run-pending-icon" size={18} />}
          </div>
          <p className="sync-run-date">Started {formatDateTime(run.started_at)}{run.completed_at ? ` · Finished ${formatDateTime(run.completed_at)}` : ""}</p>
          {status?.active && <div className="sync-progress"><span /></div>}
          {Object.keys(run.summary).length > 0 && (
            <div className="sync-summary-grid">
              {Object.entries(run.summary).filter(([key]) => summaryLabels[key]).map(([key, value]) => (
                <div className="sync-summary-item" key={key}><strong>{value.toLocaleString()}</strong><span>{summaryLabels[key]}</span></div>
              ))}
            </div>
          )}
          {run.error && <pre className="sync-error-details">{run.error}</pre>}
        </section>
      ) : (
        <section className="sync-empty-panel">
          <CloudDownload size={22} />
          <strong>No sync has been run yet</strong>
          <span>Run the pipeline to create the tables and import both available Premier League seasons.</span>
        </section>
      )}

      <div className="sync-tables-note">
        <Database size={16} />
        <span><strong>Tables created:</strong> competitions, seasons, teams, players, matches, lineups, events.</span>
        <a href="/tables/matches/">Browse tables <ArrowRight size={14} /></a>
      </div>
      <p className="data-attribution">StatsBomb Open Data is intended for research and genuine interest in football analytics. When publishing analysis, credit StatsBomb and use its logo from the <a href="https://statsbomb.com/media-pack/" target="_blank" rel="noreferrer">StatsBomb media pack</a>.</p>
    </>
  );
}

function statusLabel(status: string) {
  if (status === "succeeded") return "Sync completed";
  if (status === "partial") return "Sync completed with errors";
  if (status === "failed") return "Sync failed";
  if (status === "queued") return "Sync queued";
  return status;
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "just now"
    : new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Unavailable"
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(date);
}

export default App;
