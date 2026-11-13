import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Check,
  Clapperboard,
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
  Pause,
  Play,
  Rows3,
  RefreshCw,
  Settings2,
  SkipBack,
  SkipForward,
  ShieldCheck,
  Sparkles,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import CreatorStudio from "./creator/CreatorStudio";
import StartingXiPage from "./creator/StartingXiPage";
import ExplorePage from "./explore/ExplorePage";
import technicalAreaLogo from "../../static/technical-area-logo.svg";

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

type BallByBallMatch = {
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
type BallEvent = {
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
  possession: number | null;
  location: [number, number] | null;
  end_location: [number, number] | null;
  raw_data: Record<string, unknown>;
};
type BallEventFilter = "all" | "goals" | "red_cards" | "player_touches" | "player_passes";
type BallByBallData = {
  match: Omit<BallByBallMatch, "event_count">;
  events: BallEvent[];
};

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
  const isBallByBallPage = window.location.pathname.startsWith("/ball-by-ball");
  const isCreatorStudioPage = window.location.pathname.startsWith("/creator-studio");
  const isStartingXiPage = window.location.pathname.startsWith("/creator-studio/starting-xi");
  const isExplorePage = window.location.pathname.startsWith("/explore");
  const isAdminUsersPage = window.location.pathname.startsWith("/workspace-admin/users");
  const isAdminPipelinePage = window.location.pathname.startsWith("/workspace-admin/data-pipeline");
  const isAdminPage = isAdminUsersPage || isAdminPipelinePage;
  const isAdmin = document.getElementById("root")?.dataset.isAdmin === "true";
  const tableMatch = window.location.pathname.match(/^\/tables\/([a-z_]+)\/?$/);
  const currentTable = tableMatch?.[1] || null;
  const isDataPage = Boolean(currentTable || isSyncPage);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "true",
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tablesOpen, setTablesOpen] = useState(isDataPage);
  const [configOpen, setConfigOpen] = useState(isHealthPage);
  const [adminOpen, setAdminOpen] = useState(isAdminPage);
  const [creatorStudioOpen, setCreatorStudioOpen] = useState(isCreatorStudioPage);
  const pageTitle = isHealthPage
    ? "Postgres connection"
    : isSyncPage
      ? "Sync data"
      : isBallByBallPage
        ? "Ball By Ball"
        : isCreatorStudioPage
          ? isStartingXiPage
            ? "Starting XI"
            : "Broadcast Studio"
          : isExplorePage
            ? "Explore"
          : isAdminUsersPage
            ? "Manage users"
            : isAdminPipelinePage
              ? "Data pipeline settings"
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
        <a className="brand" href="/" aria-label="TechnicalArea dashboard">
          <img className="brand-mark" src={technicalAreaLogo} alt="" />
          <span className="brand-copy">TechnicalArea</span>
        </a>

        <div className="workspace-switcher">
          <img className="workspace-avatar" src={technicalAreaLogo} alt="" />
          <span className="workspace-info">
            <small>WORKSPACE</small>
            <strong>TechnicalArea</strong>
          </span>
          <ChevronDown size={15} />
        </div>

        <nav className="side-nav" aria-label="Main navigation">
          <p className="nav-heading">OVERVIEW</p>
          <a className={`nav-item ${!isHealthPage && !isDataPage && !isBallByBallPage && !isCreatorStudioPage && !isExplorePage && !isAdminPage ? "selected" : ""}`} href="/" title="Overview">
            <LayoutDashboard size={18} />
            <span className="nav-label">Overview</span>
          </a>
          <a className={`nav-item ${isBallByBallPage ? "selected" : ""}`} href="/ball-by-ball/" title="Ball By Ball">
            <Activity size={18} />
            <span className="nav-label">Ball By Ball</span>
          </a>
          <button
            className={`nav-item nav-group-toggle ${isCreatorStudioPage ? "selected" : ""}`}
            type="button"
            title="Creator Studio"
            aria-expanded={creatorStudioOpen}
            onClick={() => {
              if (collapsed) {
                setCollapsed(false);
                localStorage.setItem("sidebar-collapsed", "false");
                setCreatorStudioOpen(true);
                return;
              }
              setCreatorStudioOpen((open) => !open);
            }}
          >
            <Clapperboard size={18} />
            <span className="nav-label">Creator Studio</span>
            <ChevronRight className={`nav-chevron ${creatorStudioOpen ? "expanded" : ""}`} size={14} />
          </button>
          {creatorStudioOpen && (
            <div className="nav-submenu">
              <a className={`nav-subitem ${isCreatorStudioPage && !isStartingXiPage ? "selected" : ""}`} href="/creator-studio/">
                <span>Broadcast Studio</span>
              </a>
              <a className={`nav-subitem ${isStartingXiPage ? "selected" : ""}`} href="/creator-studio/starting-xi/">
                <span>Starting XI</span>
              </a>
            </div>
          )}
          <a className={`nav-item ${isExplorePage ? "selected" : ""}`} href="/explore/" title="Explore StatsBomb data">
            <SlidersHorizontal size={18} />
            <span className="nav-label">Explore</span>
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
              {isAdmin && (
                <a className={`nav-subitem ${isSyncPage ? "selected" : ""}`} href="/data/sync/">
                  <span>Sync StatsBomb</span>
                </a>
              )}
            </div>
          )}
          {isAdmin && (
            <>
              <p className="nav-heading nav-heading-spaced">ADMINISTRATION</p>
              <button
                className={`nav-item nav-group-toggle ${isAdminPage ? "selected" : ""}`}
                type="button"
                title="Admin"
                aria-expanded={adminOpen}
                onClick={() => {
                  if (collapsed) {
                    setCollapsed(false);
                    localStorage.setItem("sidebar-collapsed", "false");
                    setAdminOpen(true);
                    return;
                  }
                  setAdminOpen((open) => !open);
                }}
              >
                <Users size={18} />
                <span className="nav-label">Admin</span>
                <ChevronRight className={`nav-chevron ${adminOpen ? "expanded" : ""}`} size={14} />
              </button>
              {adminOpen && (
                <div className="nav-submenu">
                  <a className={`nav-subitem ${isAdminUsersPage ? "selected" : ""}`} href="/workspace-admin/users/">
                    <span>Manage users</span>
                  </a>
                  <a className={`nav-subitem ${isAdminPipelinePage ? "selected" : ""}`} href="/workspace-admin/data-pipeline/">
                    <span>Data pipeline</span>
                  </a>
                </div>
              )}
              <p className="nav-heading nav-heading-spaced">PREFERENCES</p>
            </>
          )}
          {isAdmin && (
            <>
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
            </>
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

        <main className={`page-content ${isBallByBallPage ? "ball-page-content" : ""} ${isCreatorStudioPage ? "creator-studio-content" : ""} ${isExplorePage ? "explore-page-content" : ""}`}>
          {isHealthPage ? (
            <HealthPage />
          ) : isSyncPage ? (
            <SyncPage />
          ) : isBallByBallPage ? (
            <BallByBallPage />
          ) : isCreatorStudioPage ? (
            isStartingXiPage ? <StartingXiPage /> : <CreatorStudio />
          ) : isExplorePage ? (
            <ExplorePage />
          ) : isAdminUsersPage ? (
            <AdminUsersPage />
          ) : isAdminPipelinePage ? (
            <AdminPipelinePage />
          ) : currentTable ? (
            <TablePage tableName={currentTable} />
          ) : (
            <DashboardPage identityName={identity.name.split(" ")[0] || "there"} isAdmin={isAdmin} />
          )}
        </main>
        <footer className="footer">
          <span>© 2026 TechnicalArea</span>
          <span className="footer-right"><ShieldCheck size={14} /> Your workspace is secure</span>
        </footer>
      </div>
    </div>
  );
}

function DashboardPage({ identityName, isAdmin }: { identityName: string; isAdmin: boolean }) {
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
          {isAdmin ? (
            <a className="welcome-action" href="/postgres-check/">
              Explore system health <ArrowRight size={15} />
            </a>
          ) : (
            <a className="welcome-action" href="/ball-by-ball/">
              Open match analysis <ArrowRight size={15} />
            </a>
          )}
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
          {isAdmin && <a className="card-link" href="/postgres-check/">View connection <ArrowUpRight size={14} /></a>}
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
          {isAdmin && <a className="panel-link" href="/postgres-check/">Open connection check <ArrowRight size={14} /></a>}
        </div>
        <div className="panel quick-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">QUICK ACTIONS</p><h2>Jump back in</h2></div>
            <MoreHorizontal size={18} className="quiet-icon" />
          </div>
          {isAdmin ? (
          <a className="quick-action" href="/postgres-check/">
            <span className="quick-action-icon"><Database size={17} /></span>
            <span><strong>Test database connection</strong><small>Run a real-time health check</small></span>
            <ArrowUpRight size={15} className="quick-arrow" />
          </a>
          ) : (
          <a className="quick-action" href="/ball-by-ball/">
            <span className="quick-action-icon"><Activity size={17} /></span>
            <span><strong>Analyze a match</strong><small>Explore match events on the pitch</small></span>
            <ArrowUpRight size={15} className="quick-arrow" />
          </a>
          )}
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

type AdminUser = {
  id: number;
  name: string;
  email: string;
  role: "analyst" | "admin";
  is_active: boolean;
  is_superuser: boolean;
  date_joined: string;
  last_login: string | null;
};

type AdminPipelineSettings = {
  source: string;
  competition: string;
  sync_enabled: boolean;
  max_workers: number;
  request_timeout_seconds: number;
  request_retries: number;
  updated_at: string;
};

function csrfToken() {
  return document.querySelector<HTMLInputElement>(
    "#logout-form input[name=csrfmiddlewaretoken]",
  )?.value || "";
}

async function postAdminJson<T>(url: string, payload: Record<string, unknown>): Promise<T> {
  const token = csrfToken();
  if (!token) throw new Error("Security token missing. Refresh the page and try again.");
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRFToken": token,
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json() as T & { error?: string | Record<string, string[]> };
  if (!response.ok) {
    const message = typeof result.error === "string"
      ? result.error
      : result.error ? Object.values(result.error).flat().join(" ")
        : "The request could not be completed.";
    throw new Error(message);
  }
  return result;
}

function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadUsers = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/users/", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      const result = await response.json() as { users?: AdminUser[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not load users.");
      setUsers(result.users || []);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Could not load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadUsers(controller.signal);
    return () => controller.abort();
  }, [loadUsers]);

  const updateUser = async (user: AdminUser, update: { role?: AdminUser["role"]; is_active?: boolean }) => {
    setBusyUserId(user.id);
    setError("");
    setNotice("");
    try {
      await postAdminJson(`/api/admin/users/${user.id}/`, update);
      setNotice(`Updated access for ${user.email || user.name}.`);
      await loadUsers();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update user access.");
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMINISTRATION / ACCESS CONTROL</p>
          <h1>Manage users</h1>
          <p className="page-subtitle">Assign Analyst or Admin access and manage account availability.</p>
        </div>
        <span className="record-count">{users.length} accounts</span>
      </div>
      {error && <div className="admin-alert admin-alert-error"><CircleAlert size={16} />{error}</div>}
      {notice && <div className="admin-alert admin-alert-success"><CheckCircle2 size={16} />{notice}</div>}
      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div><Users size={17} /><strong>Application users</strong></div>
          <span>Google sign-in accounts</span>
        </div>
        {loading ? (
          <div className="table-state"><RefreshCw size={17} className="spin" /> Loading users…</div>
        ) : users.length ? (
          <div className="admin-table-scroll">
            <table className="admin-users-table">
              <thead>
                <tr><th>User</th><th>Role</th><th>Status</th><th>Last sign-in</th><th>Joined</th></tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.name || "Unnamed user"}</strong>
                      <small>{user.email || "No email address"}</small>
                      {user.is_superuser && <em>Django superuser</em>}
                    </td>
                    <td>
                      <select
                        className="admin-role-select"
                        aria-label={`Role for ${user.email || user.name}`}
                        value={user.role}
                        disabled={user.is_superuser || busyUserId === user.id}
                        onChange={(event) => void updateUser(user, { role: event.target.value as AdminUser["role"] })}
                      >
                        <option value="analyst">Analyst</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td>
                      <button
                        className={`user-status-button ${user.is_active ? "user-active" : "user-inactive"}`}
                        type="button"
                        disabled={user.is_superuser || busyUserId === user.id}
                        onClick={() => void updateUser(user, { is_active: !user.is_active })}
                      >
                        <i />{user.is_active ? "Active" : "Disabled"}
                      </button>
                    </td>
                    <td>{user.last_login ? formatDateTime(user.last_login) : "Never"}</td>
                    <td>{formatDateTime(user.date_joined)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-empty"><Users size={22} /><strong>No users found</strong></div>
        )}
        <p className="admin-panel-note">At least one active Admin must remain. Django superuser accounts are protected from changes here.</p>
      </section>
    </>
  );
}

function AdminPipelinePage() {
  const [settings, setSettings] = useState<AdminPipelineSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/data-pipeline/", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json() as AdminPipelineSettings & { error?: string };
        if (!response.ok) throw new Error(result.error || "Could not load pipeline settings.");
        setSettings(result);
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Could not load pipeline settings.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const updateSetting = <K extends keyof AdminPipelineSettings>(
    key: K,
    value: AdminPipelineSettings[K],
  ) => setSettings((current) => current ? { ...current, [key]: value } : current);

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await postAdminJson<AdminPipelineSettings>(
        "/api/admin/data-pipeline/update/",
        {
          sync_enabled: settings.sync_enabled,
          max_workers: settings.max_workers,
          request_timeout_seconds: settings.request_timeout_seconds,
          request_retries: settings.request_retries,
        },
      );
      setSettings(result);
      setNotice("Data pipeline settings saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save pipeline settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="table-state"><RefreshCw size={17} className="spin" /> Loading pipeline settings…</div>;
  if (!settings) return <div className="admin-alert admin-alert-error"><CircleAlert size={16} />{error || "Pipeline settings are unavailable."}</div>;

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMINISTRATION / SITE CONFIGURATION</p>
          <h1>Data pipeline</h1>
          <p className="page-subtitle">Configure the StatsBomb Open Data sync and request behavior.</p>
        </div>
        <span className={`pipeline-enabled-pill ${settings.sync_enabled ? "enabled" : "disabled"}`}>
          <i />{settings.sync_enabled ? "Sync enabled" : "Sync disabled"}
        </span>
      </div>
      {error && <div className="admin-alert admin-alert-error"><CircleAlert size={16} />{error}</div>}
      {notice && <div className="admin-alert admin-alert-success"><CheckCircle2 size={16} />{notice}</div>}
      <form className="admin-panel pipeline-settings-panel" onSubmit={(event) => void saveSettings(event)}>
        <div className="admin-panel-heading">
          <div><SlidersHorizontal size={17} /><strong>Pipeline configuration</strong></div>
          <span>Applies to the next sync</span>
        </div>
        <div className="pipeline-source-summary">
          <span className="source-icon"><Database size={17} /></span>
          <div><small>DATA SOURCE</small><strong>{settings.source} · {settings.competition}</strong></div>
          <span className="pipeline-readonly">Configured source</span>
        </div>
        <label className="pipeline-toggle-row">
          <span><strong>Allow manual sync</strong><small>Admins can start a sync from the Sync StatsBomb page.</small></span>
          <input
            type="checkbox"
            checked={settings.sync_enabled}
            onChange={(event) => updateSetting("sync_enabled", event.target.checked)}
          />
        </label>
        <div className="pipeline-number-grid">
          <label>
            <span>Concurrent match imports</span>
            <small>Parallel matches per sync (1–16)</small>
            <input type="number" min={1} max={16} value={settings.max_workers}
              onChange={(event) => updateSetting("max_workers", Number(event.target.value))} />
          </label>
          <label>
            <span>Request timeout</span>
            <small>Seconds before a source request fails (5–120)</small>
            <input type="number" min={5} max={120} value={settings.request_timeout_seconds}
              onChange={(event) => updateSetting("request_timeout_seconds", Number(event.target.value))} />
          </label>
          <label>
            <span>Retry attempts</span>
            <small>Attempts for failed source downloads (1–10)</small>
            <input type="number" min={1} max={10} value={settings.request_retries}
              onChange={(event) => updateSetting("request_retries", Number(event.target.value))} />
          </label>
        </div>
        <div className="pipeline-form-footer">
          <span>{settings.updated_at ? `Last updated ${formatDateTime(settings.updated_at)}` : "Settings not yet saved"}</span>
          <button type="submit" className="primary-sync-button" disabled={saving}>
            {saving ? <RefreshCw size={14} className="spin" /> : <Check size={14} />}
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </form>
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

function BallByBallPage() {
  const [matches, setMatches] = useState<BallByBallMatch[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [loadRequestId, setLoadRequestId] = useState(0);
  const [data, setData] = useState<BallByBallData | null>(null);
  const [selectedEventIndex, setSelectedEventIndex] = useState(0);
  const [eventFilter, setEventFilter] = useState<BallEventFilter>("all");
  const [selectedMilestoneId, setSelectedMilestoneId] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ball-by-ball/matches/", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || "Could not load matches.");
        return result as { matches: BallByBallMatch[] };
      })
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
    if (!selectedMatchId || loadRequestId === 0) {
      setData(null);
      setEventsLoading(false);
      return;
    }
    const controller = new AbortController();
    setEventsLoading(true);
    setPlaying(false);
    setError("");
    const timer = window.setTimeout(() => {
      fetch(`/api/ball-by-ball/matches/${selectedMatchId}/events/`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      })
        .then(async (response) => {
          const result = await response.json();
          if (!response.ok) throw new Error(result.detail || "Could not load match events.");
          return result as BallByBallData;
        })
        .then((result) => {
          setData(result);
          setSelectedEventIndex(0);
          setEventFilter("all");
          setSelectedMilestoneId("");
          setSelectedPlayerId("");
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "AbortError") return;
          setData(null);
          setError(cause instanceof Error ? cause.message : "Could not load match events.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setEventsLoading(false);
        });
    }, 2000);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadRequestId, selectedMatchId]);

  const matchEvents = data?.events || [];
  const milestoneEvents = useMemo(
    () => matchEvents.filter((event) =>
      eventFilter === "goals"
        ? isGoalEvent(event)
        : eventFilter === "red_cards"
          ? isRedCardEvent(event)
          : false,
    ),
    [eventFilter, matchEvents],
  );
  const selectedMilestone = milestoneEvents.find(
    (event) => event.id === selectedMilestoneId,
  ) || milestoneEvents[0];
  const playerOptions = useMemo(() => {
    const players = new Map<number, string>();
    for (const event of matchEvents) {
      if (event.player_id !== null && event.player) {
        players.set(event.player_id, event.player);
      }
    }
    return Array.from(players, ([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [matchEvents]);
  const playbackEvents = useMemo(() => {
    if (eventFilter === "goals" || eventFilter === "red_cards") {
      if (!selectedMilestone) return [];
      const milestoneIndex = matchEvents.findIndex(
        (event) => event.id === selectedMilestone.id,
      );
      return matchEvents.slice(Math.max(0, milestoneIndex - 10), milestoneIndex + 1);
    }
    if (eventFilter === "player_touches" || eventFilter === "player_passes") {
      const playerId = Number(selectedPlayerId);
      if (!selectedPlayerId || !Number.isFinite(playerId)) return [];
      return matchEvents.filter((event) =>
        event.player_id === playerId
        && (eventFilter !== "player_passes" || event.type.toLowerCase() === "pass"),
      );
    }
    return matchEvents;
  }, [eventFilter, matchEvents, selectedMilestone, selectedPlayerId]);

  useEffect(() => {
    if ((eventFilter === "goals" || eventFilter === "red_cards")
      && selectedMilestone
      && selectedMilestoneId !== selectedMilestone.id) {
      setSelectedMilestoneId(selectedMilestone.id);
      setSelectedEventIndex(0);
    }
  }, [eventFilter, selectedMilestone, selectedMilestoneId]);

  useEffect(() => {
    setSelectedEventIndex(0);
    setPlaying(false);
  }, [eventFilter, selectedMilestoneId, selectedPlayerId]);

  useEffect(() => {
    if (!playing || !playbackEvents.length) return;
    if (selectedEventIndex >= playbackEvents.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setInterval(() => {
      setSelectedEventIndex((index) => Math.min(index + 1, playbackEvents.length - 1));
    }, 90 / playbackSpeed);
    return () => window.clearInterval(timer);
  }, [playbackEvents.length, playbackSpeed, playing, selectedEventIndex]);

  const activeEvent = playbackEvents[selectedEventIndex];
  const visibleEvents = playbackEvents.slice(0, selectedEventIndex + 1);
  const activeMatchEventIndex = activeEvent
    ? matchEvents.findIndex((event) => event.id === activeEvent.id)
    : -1;
  const liveScore = getScoreAtEvent(data?.match, matchEvents, activeMatchEventIndex);
  const scorers = getScorers(data?.match, matchEvents, activeMatchEventIndex);
  const progress = playbackEvents.length > 1
    ? (selectedEventIndex / (playbackEvents.length - 1)) * 100
    : 0;
  const selectedPlayerName = playerOptions.find(
    (player) => String(player.id) === selectedPlayerId,
  )?.name;

  const handleEventFilterChange = (filter: BallEventFilter) => {
    setEventFilter(filter);
    setSelectedEventIndex(0);
    setPlaying(false);
    if (filter === "goals" || filter === "red_cards") {
      const firstMilestone = matchEvents.find((event) =>
        filter === "goals" ? isGoalEvent(event) : isRedCardEvent(event),
      );
      setSelectedMilestoneId(firstMilestone?.id || "");
    } else if (filter === "player_touches" || filter === "player_passes") {
      setSelectedPlayerId((current) => current || String(playerOptions[0]?.id || ""));
    }
  };

  return (
    <div className="ball-page-layout">
      <div className="page-heading ball-page-heading">
        <div>
          <p className="eyebrow">MATCH ANALYSIS / EVENT PLAYBACK</p>
          <h1>Ball By Ball</h1>
          <p className="page-subtitle">Replay every recorded action on the pitch, in match order.</p>
        </div>
        <label className="match-picker">
          <span>SELECT MATCH</span>
          <select
            value={selectedMatchId}
            onChange={(event) => {
              setSelectedMatchId(event.target.value);
              setLoadRequestId(0);
              setData(null);
              setError("");
              setPlaying(false);
            }}
            disabled={matchesLoading || matches.length === 0}
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
      </div>

      {error ? (
        <div className="ball-state ball-error">
          <CircleAlert size={18} />
          <span>{error}</span>
          {selectedMatchId && (
            <button
              type="button"
              className="outline-button"
              onClick={() => setLoadRequestId((requestId) => requestId + 1)}
            >Retry loading match</button>
          )}
        </div>
      ) : eventsLoading ? (
        <div className="ball-state"><RefreshCw size={17} className="spin" /> Loading match data…</div>
      ) : matchesLoading ? (
        <div className="ball-state"><RefreshCw size={17} className="spin" /> Loading matches…</div>
      ) : !matches.length ? (
        <div className="ball-state ball-empty">
          <Database size={22} />
          <strong>No match events available</strong>
          <span>Import StatsBomb Open Data first, then return to analyze a match.</span>
          <a className="outline-button" href="/data/sync/"><CloudDownload size={15} /> Sync StatsBomb data</a>
        </div>
      ) : data ? (
        <>
          <section className="ball-scorebar">
            <div className="ball-live-score" aria-live="polite">
              <span className="ball-team ball-team-home">
                <i className="team-indicator" />
                <strong>{data.match.home_team}</strong>
              </span>
              <span className="ball-score">
                <small>LIVE</small>
                <strong>{liveScore.home}</strong><i>–</i><strong>{liveScore.away}</strong>
              </span>
              <span className="ball-team ball-team-away">
                <strong>{data.match.away_team}</strong>
                <i className="team-indicator" />
              </span>
            </div>
            <div className="ball-final-score">
              <span>FINAL</span>
              <strong>{data.match.home_score ?? "–"} – {data.match.away_score ?? "–"}</strong>
            </div>
            <div className="ball-scorers" aria-live="polite">
              <span>SCORERS</span>
              <strong>{scorers.length
                ? scorers.map((scorer) => `${scorer.name} ${formatMatchClock(scorer.event)}${scorer.ownGoal ? " (OG)" : ""}`).join(" · ")
                : "No goals yet"}</strong>
            </div>
            <span className="ball-match-meta">{data.match.season} · {matchEvents.length.toLocaleString()} events</span>
          </section>

          <div className="ball-filter-toolbar">
            <label className="ball-filter-select">
              <span>SHOW</span>
              <select
                value={eventFilter}
                onChange={(event) => handleEventFilterChange(event.target.value as BallEventFilter)}
              >
                <option value="all">All match events</option>
                <option value="goals">Goals · 10-event lead-in</option>
                <option value="red_cards">Red cards · 10-event lead-in</option>
                <option value="player_touches">Player touches · whole match</option>
                <option value="player_passes">Player passes · whole match</option>
              </select>
            </label>
            {(eventFilter === "goals" || eventFilter === "red_cards") && (
              <label className="ball-filter-select ball-filter-detail">
                <span>{eventFilter === "goals" ? "GOAL" : "RED CARD"}</span>
                <select
                  value={selectedMilestone?.id || ""}
                  disabled={!milestoneEvents.length}
                  onChange={(event) => setSelectedMilestoneId(event.target.value)}
                >
                  {milestoneEvents.length ? milestoneEvents.map((milestone, index) => (
                    <option key={milestone.id} value={milestone.id}>
                      {index + 1}. {formatMatchClock(milestone)} · {milestone.player || milestone.team || milestone.type}
                    </option>
                  )) : <option value="">No matching events</option>}
                </select>
              </label>
            )}
            {(eventFilter === "player_touches" || eventFilter === "player_passes") && (
              <label className="ball-filter-select ball-filter-detail">
                <span>PLAYER</span>
                <select
                  value={selectedPlayerId}
                  onChange={(event) => setSelectedPlayerId(event.target.value)}
                  disabled={!playerOptions.length}
                >
                  {playerOptions.length ? playerOptions.map((player) => (
                    <option key={player.id} value={player.id}>{player.name}</option>
                  )) : <option value="">No players available</option>}
                </select>
              </label>
            )}
            <span className="ball-filter-summary">
              {eventFilter === "goals" || eventFilter === "red_cards"
                ? "Showing the 10 events before and including the selected moment"
                : eventFilter === "player_touches"
                  ? `Showing ${selectedPlayerName || "player"} events across the whole match`
                  : eventFilter === "player_passes"
                    ? `Showing ${selectedPlayerName || "player"} passes across the whole match`
                    : "Select a moment or player to focus the replay"}
            </span>
          </div>

          <div className="ball-analysis-grid">
            {activeEvent ? (
            <>
            <section className="ball-pitch-panel">
              <div className="ball-panel-heading">
                <div><span className="ball-live-dot" /><strong>Match playback</strong></div>
                <span>{activeEvent.period ? `PERIOD ${activeEvent.period}` : "MATCH EVENTS"} · {playbackEvents.length.toLocaleString()} SHOWN</span>
              </div>
              <div className="pitch-frame">
                <svg className="football-pitch" viewBox="0 0 120 80" role="img" aria-label="Football pitch with event locations">
                  <defs>
                    <pattern id="pitch-stripes" width="20" height="80" patternUnits="userSpaceOnUse">
                      <rect width="10" height="80" fill="color-mix(in srgb, var(--neutral-0) 3.14%, transparent)" />
                    </pattern>
                  </defs>
                  <rect x="0" y="0" width="120" height="80" rx="1" fill="var(--color-primary)" />
                  <rect x="0" y="0" width="120" height="80" fill="url(#pitch-stripes)" />
                  <g className="pitch-markings">
                    <rect x="1.5" y="1.5" width="117" height="77" />
                    <line x1="60" y1="1.5" x2="60" y2="78.5" />
                    <circle cx="60" cy="40" r="9.15" />
                    <circle cx="60" cy="40" r=".55" className="pitch-spot" />
                    <rect x="1.5" y="18" width="16.5" height="44" />
                    <rect x="1.5" y="30" width="5.5" height="20" />
                    <rect x="102" y="18" width="16.5" height="44" />
                    <rect x="113" y="30" width="5.5" height="20" />
                    <circle cx="12" cy="40" r=".55" className="pitch-spot" />
                    <circle cx="108" cy="40" r=".55" className="pitch-spot" />
                    <path d="M1.5 34 A6 6 0 0 1 1.5 46" />
                    <path d="M118.5 34 A6 6 0 0 0 118.5 46" />
                  </g>
                  <g transform="translate(0 80) scale(1 -1)">
                    {visibleEvents.map((event) => {
                      if (!event.location) return null;
                      const isHome = event.team === data.match.home_team;
                      const color = isHome ? "var(--neutral-300)" : event.team ? "var(--neutral-300)" : "var(--neutral-50)";
                      const isCurrent = event.id === activeEvent.id;
                      return (
                        <g key={event.id} className={isCurrent ? "pitch-event-current" : "pitch-event"}>
                          {event.end_location && (
                            <line
                              x1={event.location[0]} y1={event.location[1]}
                              x2={event.end_location[0]} y2={event.end_location[1]}
                              stroke={color} opacity={isCurrent ? 0.9 : 0.2}
                              strokeWidth={isCurrent ? 0.55 : 0.22}
                            />
                          )}
                          <circle
                            cx={event.location[0]} cy={event.location[1]}
                            r={isCurrent ? 1.7 : 0.48}
                            fill={color}
                            opacity={isCurrent ? 1 : 0.64}
                            stroke={isCurrent ? "var(--neutral-0)" : "none"}
                            strokeWidth={isCurrent ? 0.45 : 0}
                          />
                        </g>
                      );
                    })}
                  </g>
                </svg>
              </div>
              <div className="pitch-legend">
                <span><i className="legend-home" />{data.match.home_team}</span>
                <span><i className="legend-away" />{data.match.away_team}</span>
                <span className="legend-note">Locations shown when provided by source</span>
              </div>
              <div className="playback-controls">
                <button
                  type="button"
                  className="playback-skip"
                  aria-label="Go to first event"
                  onClick={() => { setSelectedEventIndex(0); setPlaying(false); }}
                ><SkipBack size={16} /></button>
                <button
                  type="button"
                  className="playback-toggle"
                  aria-label={playing ? "Pause playback" : "Play match"}
                  onClick={() => {
                  if (selectedEventIndex >= playbackEvents.length - 1) setSelectedEventIndex(0);
                    setPlaying((value) => !value);
                  }}
                >{playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
                <button
                  type="button"
                  className="playback-skip"
                  aria-label="Go to next event"
                  onClick={() => setSelectedEventIndex((index) => Math.min(index + 1, playbackEvents.length - 1))}
                ><SkipForward size={16} /></button>
                <label className="playback-speed">
                  <span>SPEED</span>
                  <select
                    value={playbackSpeed}
                    onChange={(event) => setPlaybackSpeed(Number(event.target.value))}
                    aria-label="Playback speed"
                  >
                    <option value={0.5}>0.5×</option>
                    <option value={1}>1×</option>
                    <option value={1.5}>1.5×</option>
                    <option value={2}>2×</option>
                  </select>
                </label>
                <div className="timeline-control">
                  <div className="timeline-labels">
                    <span>{formatMatchClock(activeEvent)}</span>
                    <span>EVENT {selectedEventIndex + 1} / {playbackEvents.length.toLocaleString()}</span>
                  </div>
                  <input
                    className="event-timeline"
                    type="range"
                    min={0}
                    max={Math.max(playbackEvents.length - 1, 0)}
                    value={selectedEventIndex}
                    style={{ "--timeline-progress": `${progress}%` } as CSSProperties & { "--timeline-progress": string }}
                    aria-label="Match event timeline"
                    onChange={(event) => {
                      setSelectedEventIndex(Number(event.target.value));
                      setPlaying(false);
                    }}
                  />
                </div>
              </div>
            </section>

            <aside className="ball-event-panel">
              <div className="ball-event-heading">
                <span className="event-type-icon"><Activity size={17} /></span>
                <div>
                  <span>CURRENT EVENT</span>
                  <h2>{activeEvent.type}</h2>
                </div>
              </div>
              <div className="ball-event-clock">{formatMatchClock(activeEvent)} <span>·</span> Event {activeEvent.index}</div>
              <dl className="event-detail-list">
                <div><dt>Team</dt><dd>{activeEvent.team || "—"}</dd></div>
                <div><dt>Player</dt><dd>{activeEvent.player || "—"}</dd></div>
                <div><dt>Possession</dt><dd>{activeEvent.possession ?? "—"}</dd></div>
                <div><dt>Location</dt><dd>{activeEvent.location ? `${activeEvent.location[0].toFixed(1)}, ${activeEvent.location[1].toFixed(1)}` : "Not recorded"}</dd></div>
                {activeEvent.end_location && <div><dt>End location</dt><dd>{`${activeEvent.end_location[0].toFixed(1)}, ${activeEvent.end_location[1].toFixed(1)}`}</dd></div>}
              </dl>
              <details className="event-raw-details">
                <summary>Full source event payload</summary>
                <pre>{JSON.stringify(activeEvent.raw_data, null, 2)}</pre>
              </details>
              <div className="event-stream-heading">
                <strong>{eventFilter === "player_passes" ? "Pass stream" : eventFilter === "player_touches" ? "Player events" : "Event stream"}</strong>
                <span>{selectedEventIndex + 1} / {playbackEvents.length.toLocaleString()}</span>
              </div>
              <div className="event-stream">
                {visibleEvents.slice(-6).reverse().map((event) => (
                  <button
                    type="button"
                    key={event.id}
                    className={`event-stream-row ${event.id === activeEvent.id ? "active" : ""} ${isGoalEvent(event) ? "goal-event" : ""}`}
                    onClick={() => { setSelectedEventIndex(playbackEvents.findIndex((item) => item.id === event.id)); setPlaying(false); }}
                  >
                    <span className="event-stream-time">{formatMatchClock(event)}</span>
                    <span className="event-stream-copy"><strong>{isGoalEvent(event) ? `GOAL · ${event.type}` : event.type}</strong><small>{event.player || event.team || "Match event"}</small></span>
                  </button>
                ))}
              </div>
            </aside>
            </>
            ) : (
              <div className="ball-filter-empty">
                <Activity size={21} />
                <strong>No events match this filter</strong>
                <span>
                  {eventFilter === "goals" || eventFilter === "red_cards"
                    ? "This match has no events of that type in the imported data."
                    : "Try another player or switch to all match events."}
                </span>
              </div>
            )}
          </div>
        </>
      ) : selectedMatchId ? (
        <section className="ball-load-prompt">
          <Database size={24} />
          <strong>Match selected</strong>
          <span>Load this match’s events to explore the pitch and playback filters.</span>
          <button
            type="button"
            className="primary-sync-button"
            onClick={() => setLoadRequestId((requestId) => requestId + 1)}
          >
            <Play size={15} fill="currentColor" /> Load match data
          </button>
        </section>
      ) : null}
    </div>
  );
}

function formatMatchClock(event: BallEvent) {
  const minute = Math.max(0, event.minute);
  const second = Math.max(0, event.second);
  return `${minute}:${String(second).padStart(2, "0")}`;
}

function isGoalEvent(event: BallEvent) {
  const typeName = event.type.trim().toLowerCase();
  if (typeName === "own goal for" || typeName === "goal") return true;
  if (typeName === "own goal against" || typeName !== "shot") return false;

  const rawType = event.raw_data.type;
  const sourceTypeName = typeof rawType === "object" && rawType !== null && "name" in rawType
    ? String((rawType as { name?: unknown }).name || "").trim().toLowerCase()
    : "";
  if (sourceTypeName === "own goal for" || sourceTypeName === "goal") return true;
  if (sourceTypeName === "own goal against" || (sourceTypeName && sourceTypeName !== "shot")) return false;

  const shot = event.raw_data.shot;
  if (typeof shot === "object" && shot !== null && "outcome" in shot) {
    return (shot as { outcome?: { name?: string } }).outcome?.name?.trim().toLowerCase() === "goal";
  }
  return false;
}

function getScorers(
  match: BallByBallData["match"] | undefined,
  events: BallEvent[],
  activeIndex: number,
) {
  if (!match || activeIndex < 0) return [];
  const eventsById = new Map(events.map((event) => [event.id, event]));
  return events.slice(0, activeIndex + 1)
    .filter(isGoalEvent)
    .map((event) => {
      const ownGoal = event.type.trim().toLowerCase() === "own goal for";
      const relatedIds = event.raw_data.related_events;
      const relatedGoal = ownGoal && Array.isArray(relatedIds)
        ? relatedIds
          .map((id) => eventsById.get(String(id)))
          .find((related) => related?.type.trim().toLowerCase() === "own goal against")
        : undefined;
      return {
        name: ownGoal
          ? relatedGoal?.player || "Own goal"
          : event.player || "Unknown scorer",
        event,
        ownGoal,
      };
    });
}

function getScoreAtEvent(
  match: BallByBallData["match"] | undefined,
  events: BallEvent[],
  activeIndex: number,
) {
  let home = 0;
  let away = 0;
  if (!match || activeIndex < 0) return { home, away };
  for (const event of events.slice(0, activeIndex + 1)) {
    if (!isGoalEvent(event)) continue;
    if (event.team_id === match.home_team_id || event.team === match.home_team) home += 1;
    else if (event.team_id === match.away_team_id || event.team === match.away_team) away += 1;
  }
  return { home, away };
}

function isRedCardEvent(event: BallEvent) {
  for (const actionName of ["foul_committed", "bad_behaviour"]) {
    const action = event.raw_data[actionName];
    if (typeof action === "object" && action !== null && "card" in action) {
      const card = (action as { card?: { name?: string } }).card?.name?.toLowerCase();
      if (card?.includes("red") || card?.includes("second yellow")) return true;
    }
  }
  return false;
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
