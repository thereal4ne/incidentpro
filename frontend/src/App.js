import React, { useState, useEffect, useCallback, useRef } from "react";
import ReportIncident from "./pages/ReportIncident";
import { Routes, Route, useNavigate, Navigate } from "react-router-dom";
import Login from "./Login";
import AttachmentSection from "./components/AttachmentSection";
import IncidentDetail from "./pages/IncidentDetail";
import useWebSocket from "./hooks/useWebSocket";
import "./App.css";
import "./Dashboard.css";
import AdminHome from "./pages/AdminHome";
import ManageUsers from "./pages/ManageUsers";
import EmployeeHome from "./pages/EmployeeHome";
import API from "./config";
import { authFetch } from "./utils/auth";
import Sidebar from "./components/Sidebar";

// ── Skeleton Components ──────────────────────────────────────────
function IncidentCardSkeleton() {
  return (
    <div className="incident-card-skeleton">
      <div className="ics-main">
        <div className="ics-left">
          <div className="ics-top-row">
            <div className="skeleton ics-badge" />
            <div className="skeleton ics-title" />
          </div>
          <div className="ics-meta-row">
            <div className="skeleton ics-meta-chip" />
            <div className="skeleton ics-meta-chip" />
            <div className="skeleton ics-meta-chip ics-meta-chip--wide" />
          </div>
        </div>
        <div className="skeleton ics-dropdown" />
      </div>
      <div className="ics-actions">
        <div className="skeleton ics-action-btn" />
        <div className="skeleton ics-action-btn" />
        <div className="skeleton ics-action-btn" />
        <div className="skeleton ics-action-btn" />
      </div>
    </div>
  );
}

function SummaryCardSkeleton() {
  return (
    <div className="summary-card-skeleton">
      <div className="skeleton scs-icon" />
      <div className="scs-right">
        <div className="skeleton scs-count" />
        <div className="skeleton scs-label" />
      </div>
    </div>
  );
}

function Dashboard() {
  const navigate = useNavigate();

  const [incidents,    setIncidents]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [currentPage,  setCurrentPage]  = useState(1);
  const [hasNext,      setHasNext]      = useState(false);
  const [totalCount,   setTotalCount]   = useState(0);

  const [statusFilter,  setStatusFilter]  = useState("All");
  const [searchQuery,   setSearchQuery]   = useState("");
  const [searchClicked, setSearchClicked] = useState("");

  const [userRole,  setUserRole]  = useState("EMPLOYEE");
  const [username,  setUsername]  = useState("");
  const [allUsers,  setAllUsers]  = useState([]);
  // eslint-disable-next-line no-unused-vars
  const [assignedTo, setAssignedTo] = useState("");

  const [comments,          setComments]          = useState({});
  const [newComment,        setNewComment]        = useState({});
  const [visibleComments,   setVisibleComments]   = useState({});
  const [visibleAttachments,setVisibleAttachments]= useState({});
  const [activities,        setActivities]        = useState({});
  const [visibleActivities, setVisibleActivities] = useState({});

  const sentinelRef = useRef(null);

  const { lastMessage, readyState } = useWebSocket("ws/incidents/");

  useEffect(() => {
    if (lastMessage?.type === "incident_update") {
      const wsIncidents = lastMessage.incidents || [];
      setIncidents((prev) => {
        const page1Ids = new Set(wsIncidents.map((i) => i.id));
        return [...wsIncidents, ...prev.filter((i) => !page1Ids.has(i.id))];
      });
      setLoading(false);
    }
  }, [lastMessage]);

  useEffect(() => {
    if (lastMessage?.type === "incident_update") {
      Object.keys(visibleActivities).forEach((id) => { if (visibleActivities[id]) fetchActivities(id); });
      Object.keys(visibleComments).forEach((id)   => { if (visibleComments[id])   fetchComments(id); });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessage]);

  const fetchUserInfo = useCallback(async () => {
    const res = await authFetch(`${API}/api/current_user/`);
    if (!res.ok) { localStorage.removeItem("access_token"); navigate("/login"); return; }
    const data = await res.json();
    setUserRole(data.role);
    setUsername(data.username);
    if (data.role === "ADMIN") {
      const uRes = await authFetch(`${API}/api/users/`);
      if (uRes.ok) { const ud = await uRes.json(); setAllUsers(ud); if (ud.length) setAssignedTo(ud[0].username); }
    }
  }, [navigate]);

  const fetchIncidents = useCallback(async () => {
    const res = await authFetch(`${API}/api/incidents/?page=1&page_size=20`);
    if (res.ok) {
      const data = await res.json();
      setIncidents(data.results || []);
      setHasNext(data.has_next || false);
      setCurrentPage(1);
      setTotalCount(data.count || 0);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) { navigate("/login"); return; }
    fetchUserInfo();
    fetchIncidents();
  }, [fetchUserInfo, fetchIncidents, navigate]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasNext) return;
    setLoadingMore(true);
    const nextPage = currentPage + 1;
    const res = await authFetch(`${API}/api/incidents/?page=${nextPage}&page_size=20`);
    if (res.ok) {
      const data = await res.json();
      setIncidents((prev) => {
        const ids = new Set(prev.map((i) => i.id));
        return [...prev, ...data.results.filter((i) => !ids.has(i.id))];
      });
      setHasNext(data.has_next);
      setCurrentPage(nextPage);
    }
    setLoadingMore(false);
  }, [loadingMore, hasNext, currentPage]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting && hasNext && !loadingMore) loadMore(); },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNext, loadingMore, loadMore]);

  const updateStatus = async (id, newStatus, assignedUser, currentStatus) => {
    if (userRole === "EMPLOYEE" && assignedUser !== username) return;
    if (userRole === "EMPLOYEE" && currentStatus === "ESCALATED") {
      alert("Escalated incidents can only be updated by an admin.");
      return;
    }
    setIncidents((prev) => prev.map((i) => i.id === id ? { ...i, status: newStatus } : i));
    const res = await authFetch(`${API}/api/incidents/${id}/status/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) {
      setIncidents((prev) => prev.map((i) => i.id === id ? { ...i, status: currentStatus } : i));
    }
  };

  const fetchComments = async (incidentId) => {
    const res = await authFetch(`${API}/api/incidents/${incidentId}/comments/`);
    if (res.ok) {
      const data = await res.json();
      setComments((prev) => ({ ...prev, [incidentId]: data }));
    }
  };

  const toggleComments = async (incidentId) => {
    const was = visibleComments[incidentId];
    setVisibleComments((prev) => ({ ...prev, [incidentId]: !was }));
    if (!was) fetchComments(incidentId);
  };

  const addComment = async (incidentId) => {
    const text = newComment[incidentId];
    if (!text?.trim()) return;
    const res = await authFetch(`${API}/api/incidents/${incidentId}/comments/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.ok) { setNewComment((prev) => ({ ...prev, [incidentId]: "" })); fetchComments(incidentId); }
  };

  const fetchActivities = async (incidentId) => {
    const res = await authFetch(`${API}/api/incidents/${incidentId}/activities/`);
    if (res.ok) {
      const data = await res.json();
      setActivities((prev) => ({ ...prev, [incidentId]: data }));
    }
  };

  const toggleActivities = async (incidentId) => {
    const was = visibleActivities[incidentId];
    setVisibleActivities((prev) => ({ ...prev, [incidentId]: !was }));
    if (!was) fetchActivities(incidentId);
  };

  const toggleAttachments = (incidentId) => {
    setVisibleAttachments((prev) => ({ ...prev, [incidentId]: !prev[incidentId] }));
  };

  const priorityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  const sorted = [...incidents].sort((a, b) => {
    if (priorityOrder[b.priority] !== priorityOrder[a.priority])
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    return new Date(b.created_at) - new Date(a.created_at);
  });

  const filtered = sorted.filter((i) => {
    const statusMatch = statusFilter === "All" || i.status === statusFilter;
    const searchMatch = i.title.toLowerCase().includes(searchClicked.toLowerCase());
    return statusMatch && searchMatch;
  });

  const overdueCount = incidents.filter((i) => i.is_overdue && !["RESOLVED","CLOSED"].includes(i.status)).length;
  const wsConnected  = readyState === "OPEN";

  const STATUS_CHIPS = [
    { key: "All",         label: "All" },
    { key: "OPEN",        label: "Open" },
    { key: "IN_PROGRESS", label: "In Progress" },
    { key: "RESOLVED",    label: "Resolved" },
    { key: "CLOSED",      label: "Closed" },
  ];

  return (
    <div className="app-shell">
      <Sidebar
        username={username}
        role={userRole}
        wsConnected={wsConnected}
        overdueCount={overdueCount}
      />

      <main className="app-main dashboard-page">
        <div className="dashboard-content">

          {/* Header */}
          <div className="page-header">
            <div>
              <h1 className="page-title">Incident Dashboard</h1>
              <p className="page-subtitle">Monitor, manage and resolve incidents in real time</p>
            </div>
          </div>

          {/* KPI summary — skeleton or real */}
          <div className="summary-grid">
            {loading ? (
              [1,2,3,4].map((n) => <SummaryCardSkeleton key={n} />)
            ) : (
              ["OPEN","IN_PROGRESS","RESOLVED","CLOSED"].map((status) => (
                <div
                  key={status}
                  className={`summary-card status-${status.toLowerCase().replace("_","-")}${statusFilter === status ? " summary-card--active" : ""}`}
                  onClick={() => setStatusFilter(statusFilter === status ? "All" : status)}
                >
                  <div className="summary-icon">
                    {status === "OPEN" && "🔴"}
                    {status === "IN_PROGRESS" && "🟡"}
                    {status === "RESOLVED" && "🟢"}
                    {status === "CLOSED" && "⚫"}
                  </div>
                  <div>
                    <div className="count">{incidents.filter((i) => i.status === status).length}</div>
                    <h3>{status.replace("_"," ")}</h3>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Toolbar */}
          <div className="list-section">
            <div className="list-header">
              <h2>
                Incidents
                {!loading && <span className="incident-count">{totalCount}</span>}
              </h2>
              {!loading && (
                <div className="filter-bar">
                  <div style={{ display: "flex", gap: 5 }}>
                    {STATUS_CHIPS.map((c) => (
                      <button
                        key={c.key}
                        className={`chip${statusFilter === c.key ? " chip--active" : ""}`}
                        onClick={() => setStatusFilter(c.key)}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <div className="search-wrap">
                    <span className="search-icon">🔍</span>
                    <input
                      type="search"
                      placeholder="Search incidents…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && setSearchClicked(searchQuery)}
                    />
                  </div>
                  <button className="search-btn" onClick={() => setSearchClicked(searchQuery)}>Search</button>
                </div>
              )}
            </div>

            {/* Skeleton list or real list */}
            {loading ? (
              <div className="incident-grid">
                {[1,2,3,4,5,6].map((n) => (
                  <IncidentCardSkeleton key={n} />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">
                  {statusFilter === "All" && searchClicked ? "🔍" :
                   statusFilter === "OPEN"        ? "✅" :
                   statusFilter === "IN_PROGRESS" ? "☕" :
                   statusFilter === "RESOLVED"    ? "🎉" :
                   statusFilter === "CLOSED"      ? "📦" : "📭"}
                </span>
                <h3>
                  {statusFilter === "All" && searchClicked
                    ? `No results for "${searchClicked}"`
                    : statusFilter === "All"        ? "No incidents yet"
                    : statusFilter === "OPEN"       ? "No open incidents"
                    : statusFilter === "IN_PROGRESS"? "Nothing in progress"
                    : statusFilter === "RESOLVED"   ? "No resolved incidents"
                    : "No closed incidents"}
                </h3>
                <p>
                  {statusFilter === "All" && searchClicked
                    ? "Try a different search term or clear the filter."
                    : statusFilter === "All"
                    ? "All clear — no incidents have been reported yet."
                    : "Try a different filter or check back later."}
                </p>
              </div>
            ) : (
              <div className="incident-grid">
                {filtered.map((incident, idx) => (
                  <div
                    key={incident.id}
                    className={`incident-card priority-${incident.priority.toLowerCase()}`}
                    style={{ animationDelay: `${idx * 25}ms` }}
                  >
                    <div className="card-inner">
                      <div className="card-row-main" onClick={() => navigate(`/incidents/${incident.id}`)}>
                        <div className="card-row-left">
                          <div className="card-header">
                            <span className={`priority-badge priority-badge--${incident.priority.toLowerCase()}`}>
                              {incident.priority}
                            </span>
                            <h4 className="card-title">{incident.title}</h4>
                          </div>
                          <div className="card-meta">
                            <span>#{incident.id}</span>
                            <span className="assigned-label">
                              <span className="assigned-icon">👤</span>
                              {incident.assigned_to || "Unassigned"}
                            </span>
                            <div className={`sla-row${incident.is_overdue ? " sla-row--overdue" : ""}`}>
                              <span className="sla-icon">⏰</span>
                              <span className="sla-label">Due:</span>
                              <span className="sla-value">
                                {incident.due_at
                                  ? new Date(incident.due_at).toLocaleString("en-IN", {
                                      day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit",
                                    })
                                  : "No deadline"}
                              </span>
                              {incident.is_overdue   && <span className="overdue-badge">OVERDUE</span>}
                              {incident.is_escalated && <span className="escalated-badge">ESCALATED</span>}
                            </div>
                          </div>
                        </div>
                        <div className="card-row-right" onClick={(e) => e.stopPropagation()}>
                          <select
                            className="status-dropdown"
                            value={incident.status}
                            onChange={(e) => updateStatus(incident.id, e.target.value, incident.assigned_to, incident.status)}
                          >
                            <option value="OPEN">Open</option>
                            <option value="IN_PROGRESS">In Progress</option>
                            <option value="RESOLVED">Resolved</option>
                            <option value="CLOSED">Closed</option>
                            {incident.status === "ESCALATED" && (
                              <option value="ESCALATED">Escalated</option>
                            )}
                          </select>
                        </div>
                      </div>

                      <div className="action-row">
                        <button className="action-btn" onClick={(e) => { e.stopPropagation(); navigate(`/incidents/${incident.id}`); }}>🔍 Details</button>
                        <button className="action-btn" onClick={() => toggleComments(incident.id)}>
                          💬 {visibleComments[incident.id] ? "Hide" : "Comments"}
                        </button>
                        <button className="action-btn" onClick={() => toggleAttachments(incident.id)}>
                          📎 {visibleAttachments[incident.id] ? "Hide" : "Files"}
                        </button>
                        <button className="action-btn" onClick={() => toggleActivities(incident.id)}>
                          📋 {visibleActivities[incident.id] ? "Hide" : "Activity"}
                        </button>
                      </div>

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
                              placeholder="Write a comment…"
                              value={newComment[incident.id] || ""}
                              onChange={(e) => setNewComment((prev) => ({ ...prev, [incident.id]: e.target.value }))}
                              onKeyDown={(e) => e.key === "Enter" && addComment(incident.id)}
                            />
                            <button className="post-btn" onClick={() => addComment(incident.id)}>Post</button>
                          </div>
                        </div>
                      )}

                      {visibleAttachments[incident.id] && (
                        <div className="panel">
                          <div className="panel-header">📎 Attachments</div>
                          <AttachmentSection
                            incidentId={incident.id}
                            token={localStorage.getItem("access_token")}
                            userRole={userRole}
                            assignedTo={incident.assigned_to}
                            currentUser={username}
                          />
                        </div>
                      )}

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

            <div ref={sentinelRef} className="sentinel-row">
              {loadingMore && <span>Loading more…</span>}
              {!hasNext && incidents.length > 0 && (
                <span>All {totalCount} incidents loaded</span>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function PrivateRoute({ children }) {
  return localStorage.getItem("access_token") ? children : <Navigate to="/login" replace />;
}

function App() {
  return (
    <Routes>
      <Route path="/login"         element={<Login />} />
      <Route path="/"              element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/report"        element={<PrivateRoute><ReportIncident /></PrivateRoute>} />
      <Route path="/admin"         element={<PrivateRoute><AdminHome /></PrivateRoute>} />
      <Route path="/manage-users"  element={<PrivateRoute><ManageUsers /></PrivateRoute>} />
      <Route path="/home"          element={<PrivateRoute><EmployeeHome /></PrivateRoute>} />
      <Route path="/incidents/:id" element={<PrivateRoute><IncidentDetail /></PrivateRoute>} />
    </Routes>
  );
}

export default App;