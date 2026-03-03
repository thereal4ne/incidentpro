import React, { useState, useEffect, useCallback } from "react";
import ReportIncident from "./pages/ReportIncident";
import { Routes, Route, useNavigate, Navigate } from "react-router-dom";
import Login from "./Login";
import AttachmentSection from "./components/AttachmentSection";
import "./App.css";

const API = "http://127.0.0.1:8000";

function Dashboard() {
  const navigate = useNavigate();
  const getToken = () => localStorage.getItem("access_token");

  // Add this state at the top with your other states
const [pausePolling, setPausePolling] = useState(false);
const pausePollingRef = React.useRef(false);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchClicked, setSearchClicked] = useState("");

  const [userRole, setUserRole] = useState("EMPLOYEE");
  const [username, setUsername] = useState("");

  const [allUsers, setAllUsers] = useState([]);
  // eslint-disable-next-line no-unused-vars
  const [assignedTo, setAssignedTo] = useState("");

  // ===== COMMENTS STATE =====
  const [comments, setComments] = useState({});
  const [newComment, setNewComment] = useState({});
  const [visibleComments, setVisibleComments] = useState({});

  // ===== ATTACHMENTS TOGGLE STATE =====
  const [visibleAttachments, setVisibleAttachments] = useState({});

  // ===== ACTIVITY LOG STATE =====
  const [activities, setActivities] = useState({});
  const [visibleActivities, setVisibleActivities] = useState({});

  // ================= USER INFO =================
  const fetchUserInfo = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    const res = await fetch(`${API}/api/current_user/`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      localStorage.removeItem("access_token");
      navigate("/login");
      return;
    }

    const data = await res.json();
    setUserRole(data.role);
    setUsername(data.username);

    if (data.role === "ADMIN") {
      const usersRes = await fetch(`${API}/api/users/`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setAllUsers(usersData);
        if (usersData.length > 0) setAssignedTo(usersData[0].username);
      }
    }
  }, [navigate]);

  // ================= INCIDENTS =================
  const fetchIncidents = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    const res = await fetch(`${API}/api/incidents/`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const data = await res.json();
      setIncidents(data);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) navigate("/login");
    else {
      fetchUserInfo();
      fetchIncidents();

      const interval = setInterval(() => {
        if (!pausePollingRef.current) {
          fetchIncidents();
          Object.keys(visibleActivities).forEach((id) => {
            if (visibleActivities[id]) fetchActivities(id);
          });
          Object.keys(visibleComments).forEach((id) => {
            if (visibleComments[id]) fetchComments(id);
          });
        }
      }, 2000);

      return () => clearInterval(interval);
    }
  }, [fetchUserInfo, fetchIncidents, navigate]);

  // ================= UPDATE STATUS =================
const updateStatus = async (id, newStatus, assignedUser) => {
    if (userRole === "EMPLOYEE" && assignedUser !== username) {
      alert("Permission denied");
      return;
    }

    const token = getToken();

    // Pause polling
    pausePollingRef.current = true;

    // Optimistically update UI immediately
    setIncidents((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: newStatus } : i))
    );

    await fetch(`${API}/api/incidents/${id}/status/`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status: newStatus }),
    });

    await fetchIncidents();

    // Resume polling after 2 seconds
    setTimeout(() => {
      pausePollingRef.current = false;
    }, 2000);
  };
  // ================= COMMENTS =================
  const fetchComments = async (incidentId) => {
    const token = getToken();
    const res = await fetch(`${API}/api/incidents/${incidentId}/comments/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setComments((prev) => ({ ...prev, [incidentId]: data }));
    }
  };

  const toggleComments = async (incidentId) => {
    const isVisible = visibleComments[incidentId];
    setVisibleComments((prev) => ({ ...prev, [incidentId]: !isVisible }));
    if (!isVisible) fetchComments(incidentId);
  };

  const addComment = async (incidentId) => {
    const text = newComment[incidentId];
    if (!text?.trim()) return;
    const token = getToken();
    const res = await fetch(`${API}/api/incidents/${incidentId}/comments/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text }),
    });
    if (res.ok) {
      setNewComment((prev) => ({ ...prev, [incidentId]: "" }));
      fetchComments(incidentId);
    }
  };

  // ================= ACTIVITY LOG =================
  const fetchActivities = async (incidentId) => {
    const token = getToken();
    const res = await fetch(`${API}/api/incidents/${incidentId}/activities/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setActivities((prev) => ({ ...prev, [incidentId]: data }));
    }
  };

  const toggleActivities = async (incidentId) => {
    const isVisible = visibleActivities[incidentId];
    setVisibleActivities((prev) => ({ ...prev, [incidentId]: !isVisible }));
    if (!isVisible) fetchActivities(incidentId);
  };

  const toggleAttachments = (incidentId) => {
    setVisibleAttachments((prev) => ({
      ...prev,
      [incidentId]: !prev[incidentId],
    }));
  };

  // ================= FILTER + SORT =================
  const priorityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  const sortedIncidents = [...incidents].sort((a, b) => {
    if (priorityOrder[b.priority] !== priorityOrder[a.priority]) {
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    }
    return new Date(b.created_at) - new Date(a.created_at);
  });

  const filteredIncidents = sortedIncidents.filter((i) => {
    const statusMatch = statusFilter === "All" || i.status === statusFilter;
    const searchMatch = i.title.toLowerCase().includes(searchClicked.toLowerCase());
    return statusMatch && searchMatch;
  });

  if (loading) return (
    <div className="loading-screen">
      <div className="loading-spinner" />
      <p>Loading Dashboard…</p>
    </div>
  );

  return (
    <div className="dashboard-page">

      {/* ── NAV ── */}
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
          <div className="user-chip">
            <div className="user-avatar">{username?.[0]?.toUpperCase()}</div>
            <div className="user-meta">
              <span className="user-name">{username}</span>
              <span className="user-role">{userRole}</span>
            </div>
          </div>
          <button className="logout-btn" onClick={() => { localStorage.clear(); navigate("/login"); }}>
            Sign out
          </button>
        </div>
      </nav>

      <div className="dashboard-content">

        {/* ── PAGE HEADER ── */}
        <div className="page-header">
          <div>
            <h1 className="page-title">Incident Dashboard</h1>
            <p className="page-subtitle">Monitor, manage and resolve incidents in real time</p>
          </div>
        </div>

        {/* ── SUMMARY CARDS ── */}
        <div className="summary-grid">
          {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((status) => (
            <div
              key={status}
              className={`summary-card status-${status.toLowerCase().replace("_", "-")} ${statusFilter === status ? "summary-card--active" : ""}`}
              onClick={() => setStatusFilter(statusFilter === status ? "All" : status)}
            >
              <div className="summary-icon">
                {status === "OPEN" && "🔴"}
                {status === "IN_PROGRESS" && "🟡"}
                {status === "RESOLVED" && "🟢"}
                {status === "CLOSED" && "⚫"}
              </div>
              <div className="summary-info">
                <div className="count">{incidents.filter((i) => i.status === status).length}</div>
                <h3>{status.replace("_", " ")}</h3>
              </div>
            </div>
          ))}
        </div>

        {/* ── INCIDENT LIST ── */}
        <section className="list-section">
          <div className="list-header">
            <h2>
              Recent Incidents
              <span className="incident-count">{filteredIncidents.length}</span>
            </h2>
            <div className="filter-bar">
              <div className="search-wrap">
                <span className="search-icon">🔍</span>
                <input
                  type="search"
                  placeholder="Search incidents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && setSearchClicked(searchQuery)}
                />
              </div>
              <button className="search-btn" onClick={() => setSearchClicked(searchQuery)}>Search</button>
              <select
                className="filter-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="All">All Statuses</option>
                <option value="OPEN">Open</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed</option>
              </select>
            </div>
          </div>

          {filteredIncidents.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">✅</span>
              <p>No incidents match your filters.</p>
            </div>
          ) : (
            <div className="incident-grid">
              {filteredIncidents.map((incident, idx) => (
                <div
                  key={incident.id}
                  className={`incident-card priority-${incident.priority.toLowerCase()}`}
                  style={{ animationDelay: `${idx * 40}ms` }}
                >
                  {/* Priority stripe */}
                  <div className="card-stripe" />

                  <div className="card-inner">
                    {/* Header */}
                    <div className="card-header">
                      <h4 className="card-title">{incident.title}</h4>
                      <span className={`priority-badge priority-badge--${incident.priority.toLowerCase()}`}>
                        {incident.priority}
                      </span>
                    </div>

                    <p className="card-desc">{incident.description}</p>

                    {/* SLA deadline */}
                    <div className={`sla-row ${incident.is_overdue ? "sla-row--overdue" : ""}`}>
                      <span className="sla-icon">⏰</span>
                      <span className="sla-label">Due:</span>
                      <span className="sla-value">
                       {incident.due_at
                            ? new Date(incident.due_at).toLocaleString("en-IN", {
                                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "No Deadline"}
                      </span>
                      {incident.is_overdue && <span className="overdue-badge">OVERDUE</span>}
                      {incident.is_escalated && <span className="escalated-badge">ESCALATED</span>}
                    </div>

                    {/* Footer */}
                    <div className="card-footer">
                      <span className="assigned-label">
                        <span className="assigned-icon">👤</span>
                        {incident.assigned_to || "Unassigned"}
                      </span>
                      <select
                            key={`${incident.id}-${incident.status}`}
                            className="status-dropdown"
                            value={incident.status}
                            onChange={(e) => updateStatus(incident.id, e.target.value, incident.assigned_to)}
                          >
                        <option value="OPEN">Open</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="RESOLVED">Resolved</option>
                        <option value="CLOSED">Closed</option>
                      </select>
                    </div>

                    {/* Action buttons */}
                    <div className="action-row">
                      <button className="action-btn" onClick={() => toggleComments(incident.id)}>
                        💬 {visibleComments[incident.id] ? "Hide" : "Comments"}
                      </button>
                      <button className="action-btn" onClick={() => toggleAttachments(incident.id)}>
                        📎 {visibleAttachments[incident.id] ? "Hide" : "Attachments"}
                      </button>
                      <button className="action-btn" onClick={() => toggleActivities(incident.id)}>
                        📋 {visibleActivities[incident.id] ? "Hide" : "Activity"}
                      </button>
                    </div>

                    {/* COMMENTS SECTION */}
                    {visibleComments[incident.id] && (
                      <div className="panel">
                        <div className="panel-header">💬 Comments</div>
                        <div className="comment-list">
                          {(comments[incident.id] || []).map((c) => (
                            <div key={c.id} className="comment-item">
                              <span className="comment-author">{c.author}</span>
                              <span className="comment-text">{c.text}</span>
                            </div>
                          ))}
                        </div>
                        <div className="comment-input-row">
                          <input
                            className="comment-input"
                            placeholder="Write a comment..."
                            value={newComment[incident.id] || ""}
                            onChange={(e) => setNewComment((prev) => ({ ...prev, [incident.id]: e.target.value }))}
                            onKeyDown={(e) => e.key === "Enter" && addComment(incident.id)}
                          />
                          <button className="post-btn" onClick={() => addComment(incident.id)}>Post</button>
                        </div>
                      </div>
                    )}

                    {/* ATTACHMENTS SECTION */}
                    {visibleAttachments[incident.id] && (
                      <div className="panel">
                        <div className="panel-header">📎 Attachments</div>
                        <AttachmentSection
                          incidentId={incident.id}
                          token={getToken()}
                          userRole={userRole}
                          assignedTo={incident.assigned_to}
                          currentUser={username}
                        />
                      </div>
                    )}

                    {/* ACTIVITY LOG SECTION */}
                    {visibleActivities[incident.id] && (
                      <div className="panel">
                        <div className="panel-header">📋 Activity Log</div>
                        <div className="activity-list">
                          {(activities[incident.id] || []).map((a) => (
                            <div key={a.id} className="activity-item">
                              <span className="activity-user">{a.user || "System"}</span>
                              <span className="activity-action">{a.action}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ================= ROUTES =================
function App() {
  const token = localStorage.getItem("access_token");
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={token ? <Dashboard /> : <Navigate to="/login" replace />} />
      <Route path="/report" element={<ReportIncident />} />
    </Routes>
  );
}

export default App;