import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "./EmployeeHome.css";
import API from "../config";


export default function EmployeeHome() {
  const navigate = useNavigate();
  const getToken = () => localStorage.getItem("access_token");

  const [username, setUsername] = useState("");
  const [incidents, setIncidents] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showChangePassword, setShowChangePassword] = useState(false);

  // Change password state
  const [pwForm, setPwForm] = useState({ current: "", newPw: "", confirm: "" });
  const [pwMsg, setPwMsg] = useState(null);
  const [pwLoading, setPwLoading] = useState(false);

  const fetchData = useCallback(async () => {
    const token = getToken();
    if (!token) return navigate("/login");

    const [userRes, incRes] = await Promise.all([
      fetch(`${API}/api/current_user/`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API}/api/incidents/`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);

    if (!userRes.ok) {
      localStorage.removeItem("access_token");
      return navigate("/login");
    }

    const userData = await userRes.json();
    if (userData.role === "ADMIN") return navigate("/admin");
    setUsername(userData.username);

    if (incRes.ok) {
      const incData = await incRes.json();
      setIncidents(incData);

      // Fetch recent activities for first 3 incidents
      const actList = [];
      for (const inc of incData.slice(0, 3)) {
        const aRes = await fetch(`${API}/api/incidents/${inc.id}/activities/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (aRes.ok) {
          const aData = await aRes.json();
          aData.slice(0, 2).forEach((a) => actList.push({ ...a, incidentTitle: inc.title }));
        }
      }
      setActivities(actList);
    }

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
  const myOpen = incidents.filter((i) => i.status === "OPEN").length;
  const myInProgress = incidents.filter((i) => i.status === "IN_PROGRESS").length;
  const myResolved = incidents.filter((i) => ["RESOLVED", "CLOSED"].includes(i.status)).length;
  const myOverdue = incidents.filter((i) => i.is_overdue && !["RESOLVED", "CLOSED"].includes(i.status));
  const upcomingSLA = incidents
    .filter((i) => !i.is_overdue && i.due_at && !["RESOLVED", "CLOSED"].includes(i.status))
    .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))
    .slice(0, 4);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  if (loading) {
    return (
      <div className="eh-loading">
        <div className="eh-spinner" />
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  return (
    <div className="eh-page">

      {/* CHANGE PASSWORD MODAL */}
      {showChangePassword && (
        <div className="eh-modal-overlay" onClick={() => setShowChangePassword(false)}>
          <div className="eh-modal" onClick={(e) => e.stopPropagation()}>
            <div className="eh-modal-header">
              <h3>🔑 Change Password</h3>
              <button className="eh-modal-close" onClick={() => { setShowChangePassword(false); setPwMsg(null); setPwForm({ current: "", newPw: "", confirm: "" }); }}>✕</button>
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
      <nav className="dashboard-nav">
        <div className="nav-left">
          <div className="nav-logo">
            <span className="nav-logo-icon">⚡</span>
            IncidentPro
          </div>
        </div>
        <div className="nav-user">
          <button className="report-btn" onClick={() => navigate("/report")}>
            + New Incident
          </button>
          <button className="report-btn" onClick={() => navigate("/")}>
            📋 My Incidents
          </button>
          <div className="user-chip" style={{ cursor: "pointer" }} onClick={() => setShowChangePassword(true)}>
            <div className="user-avatar">{username?.[0]?.toUpperCase()}</div>
            <div className="user-meta">
              <span className="user-name">{username}</span>
              <span className="user-role">EMPLOYEE · 🔑 Change Password</span>
            </div>
          </div>
          <button className="logout-btn" onClick={() => { localStorage.clear(); navigate("/login"); }}>
            Sign out
          </button>
        </div>
      </nav>

      <div className="eh-content">

        {/* HEADER */}
        <div className="eh-header">
          <div>
            <h1 className="eh-title">{greeting}, {username} 👋</h1>
            <p className="eh-subtitle">Here's a summary of your assigned incidents.</p>
          </div>
          <button className="eh-btn-primary" onClick={() => navigate("/report")}>
            + Report Incident
          </button>
        </div>

        {/* STAT CARDS */}
        <div className="eh-stats-grid">
          {[
            { icon: "🔴", value: myOpen, label: "Open", color: "red" },
            { icon: "🟡", value: myInProgress, label: "In Progress", color: "orange" },
            { icon: "🟢", value: myResolved, label: "Resolved", color: "green" },
            { icon: "⚠️", value: myOverdue.length, label: "Overdue", color: "critical" },
          ].map((stat) => (
            <div key={stat.label} className={`eh-stat-card eh-stat-card--${stat.color}`}>
              <div className="eh-stat-icon">{stat.icon}</div>
              <div className="eh-stat-body">
                <div className="eh-stat-value">{stat.value}</div>
                <div className="eh-stat-label">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="eh-bottom-row">

          {/* Overdue */}
          <div className="eh-panel">
            <div className="eh-panel-header">
              <h3>⚠️ My Overdue Incidents</h3>
              <span className="eh-badge eh-badge--red">{myOverdue.length}</span>
            </div>
            {myOverdue.length === 0 ? (
              <div className="eh-empty"><span>✅</span><p>No overdue incidents!</p></div>
            ) : (
              <div className="eh-list">
                {myOverdue.map((inc) => (
                  <div key={inc.id} className="eh-item">
                    <span className={`eh-dot eh-dot--${inc.priority.toLowerCase()}`} />
                    <div className="eh-item-body">
                      <div className="eh-item-title">{inc.title}</div>
                      <div className="eh-item-meta">
                        ⏰ Due {new Date(inc.due_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <span className={`eh-priority-tag eh-priority-tag--${inc.priority.toLowerCase()}`}>{inc.priority}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming SLA deadlines */}
          <div className="eh-panel">
            <div className="eh-panel-header">
              <h3>⏰ Upcoming SLA Deadlines</h3>
              <span className="eh-badge">{upcomingSLA.length}</span>
            </div>
            {upcomingSLA.length === 0 ? (
              <div className="eh-empty"><span>🎉</span><p>No upcoming deadlines!</p></div>
            ) : (
              <div className="eh-list">
                {upcomingSLA.map((inc) => {
                  const hoursLeft = Math.round((new Date(inc.due_at) - new Date()) / 3600000);
                  return (
                    <div key={inc.id} className="eh-item">
                      <span className={`eh-dot eh-dot--${inc.priority.toLowerCase()}`} />
                      <div className="eh-item-body">
                        <div className="eh-item-title">{inc.title}</div>
                        <div className="eh-item-meta">
                          ⏰ {hoursLeft > 0 ? `${hoursLeft}h remaining` : "Due soon"}
                        </div>
                      </div>
                      <span className={`eh-priority-tag eh-priority-tag--${inc.priority.toLowerCase()}`}>{inc.priority}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent activity */}
          <div className="eh-panel">
            <div className="eh-panel-header">
              <h3>📋 Recent Activity</h3>
            </div>
            {activities.length === 0 ? (
              <div className="eh-empty"><span>📭</span><p>No recent activity.</p></div>
            ) : (
              <div className="eh-list">
                {activities.map((a) => (
                  <div key={a.id} className="eh-activity-item">
                    <div className="eh-activity-dot" />
                    <div>
                      <div className="eh-activity-action">{a.action}</div>
                      <div className="eh-activity-meta">
                        {a.incidentTitle} · {a.user || "System"} · {new Date(a.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
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
