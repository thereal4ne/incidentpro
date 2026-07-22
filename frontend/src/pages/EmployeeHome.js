import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "./EmployeeHome.css";
import API from "../config";
import { authFetch } from "../utils/auth";
import Sidebar from "../components/Sidebar";

export default function EmployeeHome() {
  const navigate = useNavigate();

  const [username, setUsername]   = useState("");
  const [incidents, setIncidents] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const [pwForm, setPwForm] = useState({ current: "", newPw: "", confirm: "" });
  const [pwMsg,  setPwMsg]  = useState(null);
  const [pwLoading, setPwLoading] = useState(false);

  const fetchData = useCallback(async () => {
    const token = localStorage.getItem("access_token");
    if (!token) return navigate("/login");

    const [userRes, incRes] = await Promise.all([
      authFetch(`${API}/api/current_user/`),
      authFetch(`${API}/api/incidents/?page=1&page_size=100`),
    ]);

    if (!userRes.ok) { localStorage.removeItem("access_token"); return navigate("/login"); }

    const userData = await userRes.json();
    if (userData.role === "ADMIN") return navigate("/admin");
    setUsername(userData.username);

    if (incRes.ok) {
      const incData = await incRes.json();
      setIncidents(incData.results || []);

      const actList = [];
      for (const inc of (incData.results || []).slice(0, 3)) {
        const aRes = await authFetch(`${API}/api/incidents/${inc.id}/activities/`);
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

  const myOpen       = incidents.filter((i) => i.status === "OPEN").length;
  const myInProgress = incidents.filter((i) => i.status === "IN_PROGRESS").length;
  const myResolved   = incidents.filter((i) => ["RESOLVED", "CLOSED"].includes(i.status)).length;
  const myOverdue = incidents.filter((i) => 
  i.is_overdue && 
  !["RESOLVED", "CLOSED", "ESCALATED"].includes(i.status) &&
  !i.is_escalated &&
  i.assigned_to === username
);

const upcomingSLA = incidents
  .filter((i) => 
    !i.is_overdue && 
    i.due_at && 
    !["RESOLVED", "CLOSED", "ESCALATED"].includes(i.status) &&
    !i.is_escalated &&
    i.assigned_to === username
  )
  .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))
  .slice(0, 4);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  if (loading) return (
    <div className="eh-loading">
      <div className="eh-spinner" />
      <span>Loading your dashboard…</span>
    </div>
  );

  return (
    <div className="app-shell">
      <Sidebar
        username={username}
        role="EMPLOYEE"
        overdueCount={myOverdue.length}
        onChangePassword={() => setShowChangePassword(true)}
      />

      <main className="app-main eh-page">

        {/* Change password modal */}
        {showChangePassword && (
          <div className="eh-modal-overlay" onClick={() => setShowChangePassword(false)}>
            <div className="eh-modal" onClick={(e) => e.stopPropagation()}>
              <div className="eh-modal-header">
                <h3>🔑 Change Password</h3>
                <button className="eh-modal-close" onClick={() => { setShowChangePassword(false); setPwMsg(null); setPwForm({ current: "", newPw: "", confirm: "" }); }}>✕</button>
              </div>
              <div className="eh-modal-body">
                {pwMsg && <div className={`eh-pw-msg eh-pw-msg--${pwMsg.type}`}>{pwMsg.text}</div>}
                {["current", "newPw", "confirm"].map((key) => (
                  <div key={key} className="eh-field">
                    <label>{key === "current" ? "Current Password" : key === "newPw" ? "New Password" : "Confirm New Password"}</label>
                    <input
                      type="password"
                      value={pwForm[key]}
                      onChange={(e) => setPwForm({ ...pwForm, [key]: e.target.value })}
                      placeholder={key === "newPw" ? "Min 8 characters" : ""}
                    />
                  </div>
                ))}
                <button className="eh-btn-primary" onClick={handleChangePassword} disabled={pwLoading}>
                  {pwLoading ? "Changing…" : "Change Password"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="eh-content">
          <div className="eh-header">
            <div>
              <h1 className="eh-title">{greeting}, {username} 👋</h1>
              <p className="eh-subtitle">Here's a summary of your assigned incidents.</p>
            </div>
            <button className="eh-btn-primary" onClick={() => navigate("/report")}>+ Report Incident</button>
          </div>

          {/* KPI cards */}
          <div className="eh-stats-grid">
            {[
              { icon: "🔴", value: myOpen,           label: "Open",        color: "red" },
              { icon: "🟡", value: myInProgress,     label: "In Progress", color: "orange" },
              { icon: "🟢", value: myResolved,       label: "Resolved",    color: "green" },
              { icon: "⚠️", value: myOverdue.length, label: "Overdue",     color: "critical" },
            ].map((s) => (
              <div key={s.label} className={`eh-stat-card eh-stat-card--${s.color}`}>
                <div className="eh-stat-icon">{s.icon}</div>
                <div>
                  <div className="eh-stat-value">{s.value}</div>
                  <div className="eh-stat-label">{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="eh-bottom-row">

            {/* Overdue */}
            <div className="eh-panel">
              <div className="eh-panel-header">
                <h3>⚠️ My Overdue</h3>
                <span className="eh-badge eh-badge--red">{myOverdue.length}</span>
              </div>
              {myOverdue.length === 0 ? (
                <div className="eh-empty"><span>✅</span><p>No overdue incidents!</p></div>
              ) : (
                <div className="eh-list">
                  {myOverdue.map((inc) => (
                    <div key={inc.id} className="eh-item" onClick={() => navigate(`/incidents/${inc.id}`)}>
                      <span className={`eh-dot eh-dot--${inc.priority.toLowerCase()}`} />
                      <div className="eh-item-body">
                        <div className="eh-item-title">{inc.title}</div>
                        <div className="eh-item-meta">⏰ Due {new Date(inc.due_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                      </div>
                      <span className={`eh-priority-tag eh-priority-tag--${inc.priority.toLowerCase()}`}>{inc.priority}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Upcoming SLA */}
            <div className="eh-panel">
              <div className="eh-panel-header">
                <h3>⏰ Upcoming SLA</h3>
                <span className="eh-badge">{upcomingSLA.length}</span>
              </div>
              {upcomingSLA.length === 0 ? (
                <div className="eh-empty"><span>🎉</span><p>No upcoming deadlines!</p></div>
              ) : (
                <div className="eh-list">
                  {upcomingSLA.map((inc) => {
                    const hoursLeft = Math.round((new Date(inc.due_at) - new Date()) / 3600000);
                    return (
                      <div key={inc.id} className="eh-item" onClick={() => navigate(`/incidents/${inc.id}`)}>
                        <span className={`eh-dot eh-dot--${inc.priority.toLowerCase()}`} />
                        <div className="eh-item-body">
                          <div className="eh-item-title">{inc.title}</div>
                          <div className="eh-item-meta">⏰ {hoursLeft > 0 ? `${hoursLeft}h remaining` : "Due soon"}</div>
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
              <div className="eh-panel-header"><h3>📋 Recent Activity</h3></div>
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
      </main>
    </div>
  );
}
