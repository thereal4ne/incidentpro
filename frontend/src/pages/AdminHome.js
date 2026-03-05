import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend, PieChart, Pie, Cell,
} from "recharts";
import "./AdminHome.css";
import "./EmployeeHome.css";
import API from "../config";

const PRIORITY_COLORS = {
  CRITICAL: "#ef4444", HIGH: "#f97316", MEDIUM: "#eab308", LOW: "#22c55e",
};
const STATUS_COLORS = {
  OPEN: "#3b82f6", IN_PROGRESS: "#f59e0b", RESOLVED: "#10b981", CLOSED: "#6b7280",
};

export default function AdminHome() {
  const navigate = useNavigate();
  const getToken = () => localStorage.getItem("access_token");

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", newPw: "", confirm: "" });
  const [pwMsg, setPwMsg] = useState(null);
  const [pwLoading, setPwLoading] = useState(false);

  const [username, setUsername] = useState("");
  const [incidents, setIncidents] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const token = getToken();
    if (!token) return navigate("/login");

    const [userRes, incRes, usersRes] = await Promise.all([
      fetch(`${API}/api/current_user/`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API}/api/incidents/`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API}/api/users/`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);

    if (!userRes.ok) {
      localStorage.removeItem("access_token");
      return navigate("/login");
    }

    const userData = await userRes.json();
    if (userData.role !== "ADMIN") return navigate("/");
    setUsername(userData.username);
    if (incRes.ok) setIncidents(await incRes.json());
    if (usersRes.ok) setUsers(await usersRes.json());
    setLoading(false);
  }, [navigate]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleChangePassword = async () => {
    if (!pwForm.current || !pwForm.newPw || !pwForm.confirm) {
      setPwMsg({ type: "error", text: "All fields are required." });
      return;
    }
    if (pwForm.newPw !== pwForm.confirm) {
      setPwMsg({ type: "error", text: "New passwords do not match." });
      return;
    }
    if (pwForm.newPw.length < 8) {
      setPwMsg({ type: "error", text: "Password must be at least 8 characters." });
      return;
    }
    setPwLoading(true);
    setPwMsg(null);
    const token = getToken();
    const res = await fetch(`${API}/api/accounts/change-password/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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

  // Derived stats
  const total = incidents.length;
  const open = incidents.filter((i) => i.status === "OPEN").length;
  const inProgress = incidents.filter((i) => i.status === "IN_PROGRESS").length;
  const resolved = incidents.filter((i) => i.status === "RESOLVED").length;
  const closed = incidents.filter((i) => i.status === "CLOSED").length;
  const overdue = incidents.filter(
    (i) => i.is_overdue && !["RESOLVED", "CLOSED"].includes(i.status)
  ).length;
  const escalated = incidents.filter((i) => i.is_escalated).length;
  const resolutionRate = total > 0 ? Math.round(((resolved + closed) / total) * 100) : 0;

  const priorityData = ["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((p) => ({
    name: p,
    count: incidents.filter((i) => i.priority === p).length,
    color: PRIORITY_COLORS[p],
  }));

  const statusData = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]
    .map((s) => ({
      name: s.replace("_", " "),
      value: incidents.filter((i) => i.status === s).length,
      color: STATUS_COLORS[s],
    }))
    .filter((s) => s.value > 0);

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return {
      date: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      fullDate: d.toDateString(),
      created: 0,
      resolved: 0,
    };
  });

  incidents.forEach((inc) => {
    const createdDate = new Date(inc.created_at).toDateString();
    const updatedDate = new Date(inc.updated_at).toDateString();
    last7Days.forEach((day) => {
      if (day.fullDate === createdDate) day.created += 1;
      if (day.fullDate === updatedDate && ["RESOLVED", "CLOSED"].includes(inc.status)) {
        day.resolved += 1;
      }
    });
  });

  const employeeStats = users
    .map((u) => {
      const assigned = incidents.filter((i) => i.assigned_to === u.username);
      const resolvedCount = assigned.filter((i) => ["RESOLVED", "CLOSED"].includes(i.status)).length;
      const overdueCount = assigned.filter(
        (i) => i.is_overdue && !["RESOLVED", "CLOSED"].includes(i.status)
      ).length;
      return {
        username: u.username,
        total: assigned.length,
        resolved: resolvedCount,
        overdue: overdueCount,
        open: assigned.filter((i) => ["OPEN", "IN_PROGRESS"].includes(i.status)).length,
        rate: assigned.length > 0 ? Math.round((resolvedCount / assigned.length) * 100) : 0,
      };
    })
    .filter((e) => e.total > 0)
    .sort((a, b) => b.total - a.total);

  const overdueIncidents = incidents
    .filter((i) => i.is_overdue && !["RESOLVED", "CLOSED"].includes(i.status))
    .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))
    .slice(0, 6);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  if (loading) {
    return (
      <div className="ah-loading">
        <div className="ah-spinner" />
        <p>Loading Admin Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="ah-page">

      {/* CHANGE PASSWORD MODAL */}
      {showChangePassword && (
        <div className="eh-modal-overlay" onClick={() => setShowChangePassword(false)}>
          <div className="eh-modal" onClick={(e) => e.stopPropagation()}>
            <div className="eh-modal-header">
              <h3>🔑 Change Password</h3>
              <button
                className="eh-modal-close"
                onClick={() => {
                  setShowChangePassword(false);
                  setPwMsg(null);
                  setPwForm({ current: "", newPw: "", confirm: "" });
                }}
              >✕</button>
            </div>
            <div className="eh-modal-body">
              {pwMsg && (
                <div className={`eh-pw-msg eh-pw-msg--${pwMsg.type}`}>{pwMsg.text}</div>
              )}
              <div className="eh-field">
                <label>Current Password</label>
                <input
                  type="password"
                  value={pwForm.current}
                  onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })}
                  placeholder="Enter current password"
                />
              </div>
              <div className="eh-field">
                <label>New Password</label>
                <input
                  type="password"
                  value={pwForm.newPw}
                  onChange={(e) => setPwForm({ ...pwForm, newPw: e.target.value })}
                  placeholder="Min 8 characters"
                />
              </div>
              <div className="eh-field">
                <label>Confirm New Password</label>
                <input
                  type="password"
                  value={pwForm.confirm}
                  onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                  placeholder="Repeat new password"
                />
              </div>
              <button className="eh-btn-primary" onClick={handleChangePassword} disabled={pwLoading}>
                {pwLoading ? "Changing..." : "Change Password"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NAV */}
      <nav className="ah-nav">
        <div className="ah-nav-left">
          <div className="ah-logo">⚡ IncidentPro</div>
          <div className="ah-nav-links">
            <button className="ah-nav-link ah-nav-link--active">Overview</button>
            <button className="ah-nav-link" onClick={() => navigate("/")}>Incidents</button>
            <button className="ah-nav-link" onClick={() => navigate("/manage-users")}>👥 Users</button>
            <button className="ah-nav-link" onClick={() => navigate("/report")}>+ New</button>
          </div>
        </div>
        <div className="ah-nav-right">
          <div
            className="ah-user-chip"
            style={{ cursor: "pointer" }}
            onClick={() => setShowChangePassword(true)}
          >
            <div className="ah-avatar">{username?.[0]?.toUpperCase()}</div>
            <div className="ah-user-meta">
              <span className="ah-username">{username}</span>
              <span className="ah-role">ADMIN · 🔑 Change Password</span>
            </div>
          </div>
          <button
            className="ah-logout"
            onClick={() => { localStorage.clear(); navigate("/login"); }}
          >
            Sign out
          </button>
        </div>
      </nav>

      <div className="ah-content">

        {/* HEADER */}
        <div className="ah-header">
          <div>
            <h1 className="ah-title">{greeting}, {username} 👋</h1>
            <p className="ah-subtitle">
              Here's what's happening across your incident pipeline today.
            </p>
          </div>
          <div className="ah-header-actions">
            <button className="ah-btn-primary" onClick={() => navigate("/report")}>
              + New Incident
            </button>
            <button className="ah-btn-secondary" onClick={() => navigate("/")}>
              View All Incidents
            </button>
          </div>
        </div>

        {/* STAT CARDS */}
        <div className="ah-stats-grid">
          {[
            { icon: "📋", value: total, label: "Total Incidents", color: "blue" },
            { icon: "🔓", value: open + inProgress, label: "Active", color: "orange" },
            { icon: "⚠️", value: overdue, label: "SLA Breached", color: "red" },
            { icon: "🚨", value: escalated, label: "Escalated", color: "purple" },
            { icon: "✅", value: resolved + closed, label: "Resolved", color: "green" },
            { icon: "📈", value: `${resolutionRate}%`, label: "Resolution Rate", color: "teal" },
          ].map((stat) => (
            <div key={stat.label} className={`ah-stat-card ah-stat-card--${stat.color}`}>
              <div className="ah-stat-icon">{stat.icon}</div>
              <div className="ah-stat-body">
                <div className="ah-stat-value">{stat.value}</div>
                <div className="ah-stat-label">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* CHARTS */}
        <div className="ah-charts-row">
          <div className="ah-chart-card ah-chart-card--wide">
            <div className="ah-chart-header"><h3>Incident Trends — Last 7 Days</h3></div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={last7Days}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="created" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} name="Created" />
                <Line type="monotone" dataKey="resolved" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} name="Resolved" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="ah-chart-card">
            <div className="ah-chart-header"><h3>Status Distribution</h3></div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%" cy="50%"
                  innerRadius={55} outerRadius={85}
                  paddingAngle={3} dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="ah-chart-card">
            <div className="ah-chart-header"><h3>By Priority</h3></div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={priorityData} barSize={32}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Incidents">
                  {priorityData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* BOTTOM ROW */}
        <div className="ah-bottom-row">
          <div className="ah-panel">
            <div className="ah-panel-header">
              <h3>🚨 Needs Immediate Attention</h3>
              <span className="ah-panel-badge ah-panel-badge--red">
                {overdueIncidents.length} overdue
              </span>
            </div>
            {overdueIncidents.length === 0 ? (
              <div className="ah-empty">
                <span>✅</span>
                <p>No overdue incidents — great work!</p>
              </div>
            ) : (
              <div className="ah-overdue-list">
                {overdueIncidents.map((inc) => (
                  <div key={inc.id} className="ah-overdue-item">
                    <div className="ah-overdue-left">
                      <span className={`ah-priority-dot ah-priority-dot--${inc.priority.toLowerCase()}`} />
                      <div>
                        <div className="ah-overdue-title">{inc.title}</div>
                        <div className="ah-overdue-meta">
                          👤 {inc.assigned_to || "Unassigned"} · ⏰ Due{" "}
                          {new Date(inc.due_at).toLocaleString("en-IN", {
                            day: "2-digit", month: "short",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="ah-overdue-right">
                      <span className={`ah-priority-tag ah-priority-tag--${inc.priority.toLowerCase()}`}>
                        {inc.priority}
                      </span>
                      {inc.is_escalated && (
                        <span className="ah-escalated-tag">ESCALATED</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ah-panel">
            <div className="ah-panel-header">
              <h3>👥 Employee Performance</h3>
              <span className="ah-panel-badge">{employeeStats.length} active</span>
            </div>
            {employeeStats.length === 0 ? (
              <div className="ah-empty">
                <span>👤</span>
                <p>No employee data available yet.</p>
              </div>
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
                        {emp.overdue > 0 && (
                          <span className="ah-emp-overdue">⚠️ {emp.overdue}</span>
                        )}
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
    </div>
  );
}