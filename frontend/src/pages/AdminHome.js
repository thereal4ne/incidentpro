import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Area, AreaChart, ReferenceLine, Label, CartesianGrid,
} from "recharts";
import "./AdminHome.css";
import "./EmployeeHome.css";
import API from "../config";
import { authFetch } from "../utils/auth";
import Sidebar from "../components/Sidebar";

const PRIORITY_COLORS = {
  CRITICAL: "#EF4444", HIGH: "#F97316", MEDIUM: "#EAB308", LOW: "#22C55E",
};
const STATUS_COLORS = {
  OPEN: "#818CF8", IN_PROGRESS: "#FCD34D", RESOLVED: "#4ADE80", CLOSED: "#64748B",
};

// ── Skeleton Components ──────────────────────────────────────────
function StatCardSkeleton() {
  return (
    <div className="ah-stat-card-skeleton">
      <div className="skeleton ah-skel-icon" />
      <div className="ah-skel-right">
        <div className="skeleton ah-skel-value" />
        <div className="skeleton ah-skel-label" />
      </div>
    </div>
  );
}

function ChartSkeleton({ height = 200 }) {
  return (
    <div className="ah-chart-skeleton" style={{ height }}>
      <div className="skeleton ah-skel-chart-title" />
      <div className="ah-skel-bars">
        {[60, 85, 45, 70, 90, 55, 75].map((h, i) => (
          <div key={i} className="skeleton ah-skel-bar" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

function ListItemSkeleton() {
  return (
    <div className="ah-list-item-skeleton">
      <div className="skeleton ah-skel-dot" />
      <div className="ah-skel-item-body">
        <div className="skeleton ah-skel-item-title" />
        <div className="skeleton ah-skel-item-meta" />
      </div>
      <div className="skeleton ah-skel-item-tag" />
    </div>
  );
}

function EmpItemSkeleton() {
  return (
    <div className="ah-emp-item-skeleton">
      <div className="skeleton ah-skel-avatar" />
      <div className="ah-skel-emp-body">
        <div className="skeleton ah-skel-emp-name" />
        <div className="skeleton ah-skel-emp-meta" />
      </div>
      <div className="ah-skel-emp-right">
        <div className="skeleton ah-skel-emp-bar" />
      </div>
    </div>
  );
}

// ── Custom Chart Components ──────────────────────────────────────

const TrendTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{
      background: "var(--surface-2)", border: "1px solid var(--border-2)",
      borderRadius: 10, padding: "10px 14px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.4)", fontSize: 12,
    }}>
      <div style={{ color: "var(--text-2)", marginBottom: 8, fontWeight: 600 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.color }} />
          <span style={{ color: "var(--text-2)" }}>{p.name}:</span>
          <span style={{ color: "var(--text-1)", fontWeight: 700, fontFamily: "var(--font-mono)" }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
};

const PriorityTooltip = ({ active, payload, label, total }) => {
  if (!active || !payload || !payload.length) return null;
  const count = payload[0]?.value || 0;
  const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{
      background: "var(--surface-2)", border: "1px solid var(--border-2)",
      borderRadius: 10, padding: "10px 14px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.4)", fontSize: 12, minWidth: 120,
    }}>
      <div style={{ color: "var(--text-2)", marginBottom: 8, fontWeight: 600 }}>{label}</div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <span style={{ color: "var(--text-2)" }}>Count</span>
        <span style={{ color: "var(--text-1)", fontWeight: 700, fontFamily: "var(--font-mono)" }}>{count}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginTop: 4 }}>
        <span style={{ color: "var(--text-2)" }}>Share</span>
        <span style={{ color: "var(--text-1)", fontWeight: 700, fontFamily: "var(--font-mono)" }}>{pct}%</span>
      </div>
    </div>
  );
};

const StatusTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0];
  return (
    <div style={{
      background: "var(--surface-2)", border: "1px solid var(--border-2)",
      borderRadius: 10, padding: "10px 14px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.4)", fontSize: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: item.payload.color }} />
        <span style={{ color: "var(--text-1)", fontWeight: 700 }}>{item.name}</span>
      </div>
      <div style={{ color: "var(--text-2)" }}>
        Count: <span style={{ color: "var(--text-1)", fontWeight: 700, fontFamily: "var(--font-mono)" }}>{item.value}</span>
      </div>
      <div style={{ color: "var(--text-2)", marginTop: 2 }}>
        Share: <span style={{ color: "var(--text-1)", fontWeight: 700, fontFamily: "var(--font-mono)" }}>{item.payload.pct}%</span>
      </div>
    </div>
  );
};

// Fixed: null-guard on viewBox, used via <Label content={...} position="center" />
const DonutCenterLabel = ({ viewBox, total }) => {
  if (!viewBox) return null;
  const { cx, cy } = viewBox;
  return (
    <g>
      <text x={cx} y={cy - 8} textAnchor="middle" fill="var(--text-1)"
        style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
        {total}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill="var(--text-2)"
        style={{ fontSize: 11, fontWeight: 500 }}>
        total
      </text>
    </g>
  );
};

function StatusLegend({ data }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", marginTop: 12, justifyContent: "center" }}>
      {data.map((item) => (
        <div key={item.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
          <span style={{ color: "var(--text-2)" }}>{item.name}</span>
          <span style={{ color: "var(--text-1)", fontWeight: 700, fontFamily: "var(--font-mono)" }}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function AdminHome() {
  const navigate = useNavigate();

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [pwForm, setPwForm]   = useState({ current: "", newPw: "", confirm: "" });
  const [pwMsg,  setPwMsg]    = useState(null);
  const [pwLoading, setPwLoading] = useState(false);
  const [activePieIndex, setActivePieIndex] = useState(null);

  const [username,  setUsername]  = useState("");
  const [incidents, setIncidents] = useState([]);
  const [users,     setUsers]     = useState([]);
  const [loading,   setLoading]   = useState(true);

  const fetchData = useCallback(async () => {
    const token = localStorage.getItem("access_token");
    if (!token) return navigate("/login");
    const [userRes, incRes, usersRes] = await Promise.all([
      authFetch(`${API}/api/current_user/`),
      authFetch(`${API}/api/incidents/?page=1&page_size=1000`),
      authFetch(`${API}/api/users/`),
    ]);
    if (!userRes.ok) { localStorage.removeItem("access_token"); return navigate("/login"); }
    const userData = await userRes.json();
    if (userData.role !== "ADMIN") return navigate("/");
    setUsername(userData.username);
    if (incRes.ok)   { const d = await incRes.json(); setIncidents(d.results || []); }
    if (usersRes.ok) setUsers(await usersRes.json());
    setLoading(false);
  }, [navigate]);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 30000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const handleChangePassword = async () => {
    if (!pwForm.current || !pwForm.newPw || !pwForm.confirm) {
      setPwMsg({ type: "error", text: "All fields are required." }); return;
    }
    if (pwForm.newPw !== pwForm.confirm) {
      setPwMsg({ type: "error", text: "New passwords do not match." }); return;
    }
    if (pwForm.newPw.length < 8) {
      setPwMsg({ type: "error", text: "Password must be at least 8 characters." }); return;
    }
    setPwLoading(true); setPwMsg(null);
    const res = await authFetch(`${API}/api/accounts/change-password/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password: pwForm.current, new_password: pwForm.newPw }),
    });
    const data = await res.json();
    if (res.ok) {
      setPwMsg({ type: "success", text: "Password changed successfully!" });
      setPwForm({ current: "", newPw: "", confirm: "" });
      setTimeout(() => { setShowChangePassword(false); setPwMsg(null); }, 2000);
    } else {
      setPwMsg({ type: "error", text: data.error || "Failed to change password." });
    }
    setPwLoading(false);
  };

  const total      = incidents.length;
  const open       = incidents.filter((i) => i.status === "OPEN").length;
  const inProgress = incidents.filter((i) => i.status === "IN_PROGRESS").length;
  const resolved   = incidents.filter((i) => i.status === "RESOLVED").length;
  const closed     = incidents.filter((i) => i.status === "CLOSED").length;
  const overdue    = incidents.filter((i) => i.is_overdue && !["RESOLVED","CLOSED"].includes(i.status)).length;
  const escalated  = incidents.filter((i) => i.is_escalated).length;
  const resRate    = total > 0 ? Math.round(((resolved + closed) / total) * 100) : 0;

  const priorityData = ["CRITICAL","HIGH","MEDIUM","LOW"].map((p) => ({
    name: p, count: incidents.filter((i) => i.priority === p).length, color: PRIORITY_COLORS[p],
  }));

  const avgCount = priorityData.length > 0
    ? Math.round(priorityData.reduce((sum, d) => sum + d.count, 0) / priorityData.length)
    : 0;

  const statusData = ["OPEN","IN_PROGRESS","RESOLVED","CLOSED"]
    .map((s) => ({
      name: s.replace("_"," "),
      value: incidents.filter((i) => i.status === s).length,
      color: STATUS_COLORS[s],
      pct: total > 0 ? Math.round((incidents.filter((i) => i.status === s).length / total) * 100) : 0,
    }))
    .filter((s) => s.value > 0);

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return { date: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), fullDate: d.toDateString(), created: 0, resolved: 0 };
  });
  incidents.forEach((inc) => {
    const cd = new Date(inc.created_at).toDateString();
    const ud = new Date(inc.updated_at).toDateString();
    last7Days.forEach((day) => {
      if (day.fullDate === cd) day.created++;
      if (day.fullDate === ud && ["RESOLVED","CLOSED"].includes(inc.status)) day.resolved++;
    });
  });

  const employeeStats = users
    .map((u) => {
      const assigned    = incidents.filter((i) => i.assigned_to === u.username);
      const resolvedCnt = assigned.filter((i) => ["RESOLVED","CLOSED"].includes(i.status)).length;
      const overdueCnt  = assigned.filter((i) => i.is_overdue && !["RESOLVED","CLOSED"].includes(i.status)).length;
      return {
        username: u.username, total: assigned.length, resolved: resolvedCnt,
        overdue: overdueCnt, open: assigned.filter((i) => ["OPEN","IN_PROGRESS"].includes(i.status)).length,
        rate: assigned.length > 0 ? Math.round((resolvedCnt / assigned.length) * 100) : 0,
      };
    })
    .filter((e) => e.total > 0)
    .sort((a, b) => b.total - a.total);

  const overdueIncidents = incidents
    .filter((i) => i.is_overdue && !["RESOLVED","CLOSED"].includes(i.status))
    .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))
    .slice(0, 6);

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="app-shell">
      <Sidebar username={username} role="ADMIN" overdueCount={overdue} onChangePassword={() => setShowChangePassword(true)} />

      <main className="app-main ah-page">

        {showChangePassword && (
          <div className="eh-modal-overlay" onClick={() => setShowChangePassword(false)}>
            <div className="eh-modal" onClick={(e) => e.stopPropagation()}>
              <div className="eh-modal-header">
                <h3>🔑 Change Password</h3>
                <button className="eh-modal-close" onClick={() => { setShowChangePassword(false); setPwMsg(null); setPwForm({ current: "", newPw: "", confirm: "" }); }}>✕</button>
              </div>
              <div className="eh-modal-body">
                {pwMsg && <div className={`eh-pw-msg eh-pw-msg--${pwMsg.type}`}>{pwMsg.text}</div>}
                {[
                  { key: "current", label: "Current Password",     ph: "Enter current password" },
                  { key: "newPw",   label: "New Password",         ph: "Min 8 characters" },
                  { key: "confirm", label: "Confirm New Password", ph: "Repeat new password" },
                ].map((f) => (
                  <div key={f.key} className="eh-field">
                    <label>{f.label}</label>
                    <input type="password" value={pwForm[f.key]} placeholder={f.ph}
                      onChange={(e) => setPwForm({ ...pwForm, [f.key]: e.target.value })} />
                  </div>
                ))}
                <button className="eh-btn-primary" onClick={handleChangePassword} disabled={pwLoading}>
                  {pwLoading ? "Changing…" : "Change Password"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="ah-content">

          <div className="ah-header">
            <div>
              {loading ? (
                <>
                  <div className="skeleton ah-skel-greeting" style={{ width: 220, height: 28, marginBottom: 8 }} />
                  <div className="skeleton" style={{ width: 320, height: 16, borderRadius: 6 }} />
                </>
              ) : (
                <>
                  <h1 className="ah-title">{greeting}, {username} 👋</h1>
                  <p className="ah-subtitle">Here's what's happening across your incident pipeline today.</p>
                </>
              )}
            </div>
            <div className="ah-header-actions">
              <button className="ah-btn-primary"   onClick={() => navigate("/report")}>+ New Incident</button>
              <button className="ah-btn-secondary" onClick={() => navigate("/")}>View All Incidents</button>
            </div>
          </div>

          <div className="ah-stats-grid">
            {loading ? (
              [1,2,3,4,5,6].map((n) => <StatCardSkeleton key={n} />)
            ) : (
              [
                { icon: "📋", value: total,            label: "Total",          color: "blue"   },
                { icon: "🔓", value: open + inProgress, label: "Active",         color: "orange" },
                { icon: "⚠️", value: overdue,           label: "SLA Breached",   color: "red"    },
                { icon: "🚨", value: escalated,         label: "Escalated",      color: "purple" },
                { icon: "✅", value: resolved + closed, label: "Resolved",       color: "green"  },
                { icon: "📈", value: `${resRate}%`,    label: "Resolution Rate", color: "teal"   },
              ].map((s) => (
                <div key={s.label} className={`ah-stat-card ah-stat-card--${s.color}`}>
                  <div className="ah-stat-icon">{s.icon}</div>
                  <div>
                    <div className="ah-stat-value">{s.value}</div>
                    <div className="ah-stat-label">{s.label}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="ah-charts-row">
            {loading ? (
              <>
                <div className="ah-chart-card"><ChartSkeleton height={240} /></div>
                <div className="ah-chart-card"><ChartSkeleton height={240} /></div>
                <div className="ah-chart-card"><ChartSkeleton height={240} /></div>
              </>
            ) : (
              <>
                {/* Chart 1: Incident Trends */}
                <div className="ah-chart-card">
                  <div className="ah-chart-header">
                    <h3>Incident Trends — Last 7 Days</h3>
                    <div className="ah-chart-legend">
                      <span className="ah-legend-dot" style={{ background: "#818CF8" }} />
                      <span className="ah-legend-label">Created</span>
                      <span className="ah-legend-dot" style={{ background: "#4ADE80" }} />
                      <span className="ah-legend-label">Resolved</span>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={last7Days} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <defs>
                        <linearGradient id="gradCreated" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#818CF8" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#818CF8" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradResolved" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#4ADE80" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#4ADE80" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#4A5568" }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#4A5568" }} axisLine={false} tickLine={false} />
                      <Tooltip content={<TrendTooltip />} />
                      <Area type="monotoneX" dataKey="created" name="Created" stroke="#818CF8" strokeWidth={2.5}
                        fill="url(#gradCreated)" dot={{ r: 3, fill: "#818CF8", strokeWidth: 0 }}
                        activeDot={{ r: 5, fill: "#818CF8", stroke: "#fff", strokeWidth: 2 }} />
                      <Area type="monotoneX" dataKey="resolved" name="Resolved" stroke="#4ADE80" strokeWidth={2.5}
                        fill="url(#gradResolved)" dot={{ r: 3, fill: "#4ADE80", strokeWidth: 0 }}
                        activeDot={{ r: 5, fill: "#4ADE80", stroke: "#fff", strokeWidth: 2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Chart 2: Status Distribution Donut */}
                <div className="ah-chart-card">
                  <div className="ah-chart-header">
                    <h3>Status Distribution</h3>
                  </div>
                  {statusData.length === 0 ? (
                    <div className="ah-empty" style={{ padding: "40px 20px" }}>
                      <span>📊</span><p>No data yet</p>
                    </div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={170}>
                        <PieChart>
                          <Pie
                            data={statusData}
                            cx="50%" cy="50%"
                            innerRadius={52} outerRadius={76}
                            paddingAngle={3} dataKey="value"
                            onMouseEnter={(_, index) => setActivePieIndex(index)}
                            onMouseLeave={() => setActivePieIndex(null)}
                          >
                            {statusData.map((entry, i) => (
                              <Cell
                                key={i}
                                fill={entry.color}
                                opacity={activePieIndex === null || activePieIndex === i ? 1 : 0.45}
                                style={{ cursor: "pointer", outline: "none", transition: "opacity 200ms ease" }}
                              />
                            ))}
                            <Label
                              content={<DonutCenterLabel total={total} />}
                              position="center"
                            />
                          </Pie>
                          <Tooltip content={<StatusTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <StatusLegend data={statusData} />
                    </>
                  )}
                </div>

                {/* Chart 3: By Priority */}
                <div className="ah-chart-card">
                  <div className="ah-chart-header">
                    <h3>By Priority</h3>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={priorityData} barSize={32} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <defs>
                        {priorityData.map((p) => (
                          <linearGradient key={p.name} id={`grad-${p.name}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"   stopColor={p.color} stopOpacity={1} />
                            <stop offset="100%" stopColor={p.color} stopOpacity={0.55} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#4A5568" }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#4A5568" }} axisLine={false} tickLine={false} />
                      {avgCount > 0 && (
                        <ReferenceLine y={avgCount} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4"
                          label={{ value: "avg", position: "right", fontSize: 10, fill: "#4A5568" }} />
                      )}
                      <Tooltip content={<PriorityTooltip total={total} />} />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Incidents">
                        {priorityData.map((e, i) => (
                          <Cell key={i} fill={`url(#grad-${e.name})`} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>

          <div className="ah-bottom-row">
            <div className="ah-panel">
              <div className="ah-panel-header">
                <h3>🚨 Needs Immediate Attention</h3>
                {!loading && <span className="ah-panel-badge ah-panel-badge--red">{overdueIncidents.length} overdue</span>}
              </div>
              {loading ? (
                <div className="ah-skeleton-list">{[1,2,3,4].map((n) => <ListItemSkeleton key={n} />)}</div>
              ) : overdueIncidents.length === 0 ? (
                <div className="ah-empty"><span>✅</span><p>No overdue incidents — great work!</p></div>
              ) : (
                <div className="ah-overdue-list">
                  {overdueIncidents.map((inc) => (
                    <div key={inc.id} className="ah-overdue-item" onClick={() => navigate(`/incidents/${inc.id}`)}>
                      <div className="ah-overdue-left">
                        <span className={`ah-priority-dot ah-priority-dot--${inc.priority.toLowerCase()}`} />
                        <div>
                          <div className="ah-overdue-title">{inc.title}</div>
                          <div className="ah-overdue-meta">
                            👤 {inc.assigned_to || "Unassigned"} · ⏰ Due {new Date(inc.due_at).toLocaleString("en-IN", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" })}
                          </div>
                        </div>
                      </div>
                      <div className="ah-overdue-right">
                        <span className={`ah-priority-tag ah-priority-tag--${inc.priority.toLowerCase()}`}>{inc.priority}</span>
                        {inc.is_escalated && <span className="ah-escalated-tag">ESCALATED</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="ah-panel">
              <div className="ah-panel-header">
                <h3>👥 Employee Performance</h3>
                {!loading && <span className="ah-panel-badge">{employeeStats.length} active</span>}
              </div>
              {loading ? (
                <div className="ah-skeleton-list">{[1,2,3,4].map((n) => <EmpItemSkeleton key={n} />)}</div>
              ) : employeeStats.length === 0 ? (
                <div className="ah-empty"><span>👤</span><p>No employee data yet.</p></div>
              ) : (
                <div className="ah-emp-list">
                  {employeeStats.map((emp) => (
                    <div key={emp.username} className="ah-emp-item">
                      <div className="ah-emp-left">
                        <div className="ah-emp-avatar">{emp.username[0].toUpperCase()}</div>
                        <div>
                          <div className="ah-emp-name">{emp.username}</div>
                          <div className="ah-emp-meta">{emp.total} assigned · {emp.open} active</div>
                        </div>
                      </div>
                      <div className="ah-emp-right">
                        <div className="ah-emp-stats">
                          <span className="ah-emp-resolved">✅ {emp.resolved}</span>
                          {emp.overdue > 0 && <span className="ah-emp-overdue">⚠️ {emp.overdue}</span>}
                        </div>
                        <div className="ah-progress-wrap">
                          <div className="ah-progress-bar">
                            <div className="ah-progress-fill" style={{ width: `${emp.rate}%` }} />
                          </div>
                          <span className="ah-progress-label">{emp.rate}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
