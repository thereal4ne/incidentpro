import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./IncidentDetail.css";
import API from "../config";
import Sidebar from "../components/Sidebar";
import { authFetch } from "../utils/auth";

export default function IncidentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [incident, setIncident]               = useState(null);
  const [comments, setComments]               = useState([]);
  const [activities, setActivities]           = useState([]);
  const [attachments, setAttachments]         = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [newComment, setNewComment]           = useState("");
  const [posting, setPosting]                 = useState(false);
  const [userRole, setUserRole]               = useState("EMPLOYEE");
  const [username, setUsername]               = useState("");
  const [activeTab, setActiveTab]             = useState("comments");
  const [uploadFile, setUploadFile]           = useState(null);
  const [uploading, setUploading]             = useState(false);
  const [statusUpdating, setStatusUpdating]   = useState(false);
  const [escalating, setEscalating]           = useState(false);
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [escalateReason, setEscalateReason]   = useState("");
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignTo, setReassignTo]           = useState("");
  const [allUsers, setAllUsers]               = useState([]);
  const [reassigning, setReassigning]         = useState(false);
  const [postmortem, setPostmortem]           = useState(null);
  const [pmForm, setPmForm]                   = useState({ root_cause: "", impact: "", resolution: "", prevention: "" });
  const [pmEditing, setPmEditing]             = useState(false);
  const [pmSaving, setPmSaving]               = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const fetchAll = useCallback(async () => {
    const token = localStorage.getItem("access_token");
    if (!token) return navigate("/login");
    try {
      const [userRes, incRes, commRes, actRes, attRes, postmortemRes] = await Promise.all([
        authFetch(`${API}/api/current_user/`),
        authFetch(`${API}/api/incidents/${id}/`),
        authFetch(`${API}/api/incidents/${id}/comments/`),
        authFetch(`${API}/api/incidents/${id}/activities/`),
        authFetch(`${API}/api/incidents/${id}/attachments/`),
        authFetch(`${API}/api/incidents/${id}/postmortem/`),
      ]);
      if (!userRes.ok) { localStorage.removeItem("access_token"); return navigate("/login"); }
      const userData = await userRes.json();
      setUserRole(userData.role);
      setUsername(userData.username);
      if (userData.role === "ADMIN") {
        const usersRes = await authFetch(`${API}/api/users/`);
        if (usersRes.ok) setAllUsers(await usersRes.json());
      }
      if (incRes.ok) {
        const found = await incRes.json();
        if (!found || !found.id) return navigate("/");
        setIncident(found);
      } else {
        return navigate("/");
      }
      if (commRes.ok) setComments(await commRes.json());
      if (actRes.ok)  setActivities(await actRes.json());
      if (attRes.ok)  setAttachments(await attRes.json());
      if (postmortemRes.ok) {
        const pmData = await postmortemRes.json();
        setPostmortem(pmData);
        if (pmData) {
          setPmForm({
            root_cause: pmData.root_cause || "",
            impact: pmData.impact || "",
            resolution: pmData.resolution || "",
            prevention: pmData.prevention || "",
          });
        }
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [id, navigate]);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 10000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  const postComment = async () => {
    if (!newComment.trim()) return;
    setPosting(true);
    const res = await authFetch(`${API}/api/incidents/${id}/comments/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: newComment }),
    });
    if (res.ok) { setNewComment(""); fetchAll(); }
    setPosting(false);
  };

  const updateStatus = async (newStatus) => {
    setStatusUpdating(true);
    const res = await authFetch(`${API}/api/incidents/${id}/status/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Status update failed.");
    }
    await fetchAll();
    setStatusUpdating(false);
  };

  const exportPdf = async () => {
  setExportingPdf(true);
  try {
    const res = await authFetch(`${API}/api/incidents/${id}/export-pdf/`);
    if (!res.ok) { alert("PDF export failed."); return; }
    const blob = await res.blob();
    const url  = window.URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `incident_${id}_report.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (e) {
    alert("PDF export failed.");
  } finally {
    setExportingPdf(false);
  }
};

  const uploadAttachment = async () => {
    if (!uploadFile) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", uploadFile);
    await authFetch(`${API}/api/incidents/${id}/attachments/upload/`, { method: "POST", body: fd });
    setUploadFile(null);
    await fetchAll();
    setUploading(false);
  };

  const deleteAttachment = async (aId) => {
    await authFetch(`${API}/api/incidents/${id}/attachments/${aId}/delete/`, { method: "DELETE" });
    fetchAll();
  };

  const downloadAttachment = async (aId, filename) => {
  try {
    const res = await authFetch(`${API}/api/incidents/${id}/attachments/${aId}/download/`);
    if (!res.ok) { alert("Download failed."); return; }
    const blob = await res.blob();
    const url  = window.URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = filename || `attachment_${aId}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (e) {
    alert("Download failed.");
  }
};

  const escalateIncident = async () => {
    if (!escalateReason.trim()) return;
    setEscalating(true);
    const res = await authFetch(`${API}/api/incidents/${id}/escalate/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: escalateReason }),
    });
    if (res.ok) {
      setShowEscalateModal(false);
      setEscalateReason("");
      await fetchAll();
    } else {
      const err = await res.json();
      alert(err.error || "Escalation failed.");
    }
    setEscalating(false);
  };

  const reassignIncident = async () => {
    if (!reassignTo) return;
    setReassigning(true);
    const res = await authFetch(`${API}/api/incidents/${id}/reassign/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assigned_to: reassignTo }),
    });
    if (res.ok) {
      setShowReassignModal(false);
      setReassignTo("");
      await fetchAll();
    } else {
      const err = await res.json();
      alert(err.error || "Reassignment failed.");
    }
    setReassigning(false);
  };

  const savePostmortem = async () => {
    setPmSaving(true);
    const method = postmortem ? "PATCH" : "POST";
    const res = await authFetch(`${API}/api/incidents/${id}/postmortem/`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pmForm),
    });
    if (res.ok) {
      setPmEditing(false);
      await fetchAll();
    } else {
      const err = await res.json();
      alert(err.error || "Failed to save postmortem.");
    }
    setPmSaving(false);
  };

  const isAdmin = userRole === "ADMIN";
  const canChangeStatus = isAdmin || (
    incident &&
    incident.assigned_to === username &&
    incident.status !== "ESCALATED"
  );
  const overdueCount = incident?.is_overdue ? 1 : 0;

  const PRIORITY_META = {
    CRITICAL: { cls: "badge-critical", dot: "p-dot--critical" },
    HIGH:     { cls: "badge-high",     dot: "p-dot--high" },
    MEDIUM:   { cls: "badge-medium",   dot: "p-dot--medium" },
    LOW:      { cls: "badge-low",      dot: "p-dot--low" },
  };

  const STATUS_META = {
    OPEN:        { cls: "badge-open",      label: "Open" },
    IN_PROGRESS: { cls: "badge-progress",  label: "In Progress" },
    RESOLVED:    { cls: "badge-resolved",  label: "Resolved" },
    CLOSED:      { cls: "badge-closed",    label: "Closed" },
    ESCALATED:   { cls: "badge-escalated", label: "Escalated" },
  };

  function timeAgo(d) {
    const s = Math.floor((Date.now() - new Date(d)) / 1000);
    if (s < 60)    return `${s}s ago`;
    if (s < 3600)  return `${Math.floor(s/60)}m ago`;
    if (s < 86400) return `${Math.floor(s/3600)}h ago`;
    return `${Math.floor(s/86400)}d ago`;
  }

  function fmt(str) {
    return new Date(str).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  function fmtBytes(b) {
    if (!b) return "";
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
    return `${(b/1048576).toFixed(1)} MB`;
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="loading-spinner" />
      <span>Loading incident...</span>
    </div>
  );

  if (!incident) return null;

  const pm = PRIORITY_META[incident.priority] || PRIORITY_META.LOW;
  const sm = STATUS_META[incident.status]     || STATUS_META.OPEN;

  return (
    <div className="app-shell">
      <Sidebar username={username} role={userRole} overdueCount={overdueCount} />

      <main className="app-main id-page">
        <div className="id-content">

          {/* Breadcrumb + Back button */}
          <div className="id-topbar">
            <button className="id-back-btn" onClick={() => navigate(-1)}>← Back</button>
            <div className="id-breadcrumb">
              <span className="id-bc-link" onClick={() => navigate(isAdmin ? "/admin" : "/home")}>Dashboard</span>
              <span className="id-bc-sep">›</span>
              <span className="id-bc-link" onClick={() => navigate("/")}>Incidents</span>
              <span className="id-bc-sep">›</span>
              <span className="id-bc-current">#{incident.id}</span>
            </div>
          </div>

          {/* Hero */}
          <div
            className="id-hero"
            style={{
              borderLeftColor:
                incident.priority === "CRITICAL" ? "var(--p-critical)" :
                incident.priority === "HIGH"     ? "var(--p-high)"     :
                incident.priority === "MEDIUM"   ? "var(--p-medium)"   :
                "var(--p-low)"
            }}
          >
            <div className="id-hero-top">
              <div className="id-hero-left">
                <div className="id-badges">
                  <span className={`badge ${pm.cls}`}>
                    <span className={`p-dot ${pm.dot}`} />
                    {incident.priority}
                  </span>
                  <span className={`badge ${sm.cls}`}>{sm.label}</span>
                  {incident.is_overdue && (
                    <span className="badge badge-critical">OVERDUE</span>
                  )}
                  {incident.is_escalated && (
                    <span className="badge badge-escalated">ESCALATED</span>
                  )}
                </div>
                <h1 className="id-title">{incident.title}</h1>
                <div className="id-meta">
                  <span>📅 {fmt(incident.created_at)}</span>
                  <span className="id-meta-sep">·</span>
                  <span>Reported by <strong>{incident.reported_by}</strong></span>
                  <span className="id-meta-sep">·</span>
                  <span>Assigned to <strong>{incident.assigned_to}</strong></span>
                </div>
              </div>

                              <div className="id-hero-right">
                  {/* 1. STATUS CONTROL SECTION */}
                  {canChangeStatus && (
                    <div className="id-status-control">
                      <span className="id-status-label">Update Status</span>
                      <select
                        className="id-status-select"
                        value={incident.status}
                        disabled={statusUpdating || incident.status === "ESCALATED"}
                        onChange={(e) => updateStatus(e.target.value)}
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
                  )}

                  {/* 2. EXPORT PDF BUTTON (Add this right here) */}
                  <button
                    className="id-btn-export-pdf"
                    onClick={exportPdf}
                    disabled={exportingPdf}
                  >
                    {exportingPdf ? "⏳ Generating..." : "⬇ Export PDF"}
                  </button>

                  {/* 3. ESCALATE BUTTON SECTION */}
                  {!isAdmin
                    && incident.assigned_to === username
                    && !["RESOLVED", "CLOSED", "ESCALATED"].includes(incident.status)
                    && (
                      <button
                        className="id-btn-escalate"
                        onClick={() => setShowEscalateModal(true)}
                      >
                        🚨 Escalate
                      </button>
                    )
                  }
                </div>
            </div>

            {/* SLA */}
            <div className={`id-sla-row${incident.is_overdue ? " id-sla-row--overdue" : ""}`}>
              <span>⏰</span>
              <span className="id-sla-label">SLA Deadline:</span>
              <span className="id-sla-value">
                {incident.due_at ? fmt(incident.due_at) : "No deadline set"}
              </span>
              {incident.is_overdue && (
                <span className="id-sla-overdue-badge">OVERDUE</span>
              )}
            </div>
          </div>

          {/* Two-column */}
          <div className="id-grid">
            <div className="id-main">

              {/* Description */}
              <div className="id-card">
                <div className="id-card-header">Description</div>
                <div className="id-card-body">
                  <p className="id-description">{incident.description}</p>
                </div>
              </div>

              {/* Tabs */}
              <div className="id-card id-card--tabs">
                <div className="id-tabs">
                  {[
                    { key: "comments",    label: "Comments",    count: comments.length },
                    { key: "attachments", label: "Attachments", count: attachments.length },
                    { key: "activity",    label: "Activity",    count: activities.length },
                    { key: "postmortem",  label: "Postmortem",  count: postmortem ? 1 : 0 },
                  ].map((t) => (
                    <button
                      key={t.key}
                      className={`id-tab${activeTab === t.key ? " id-tab--active" : ""}`}
                      onClick={() => setActiveTab(t.key)}
                    >
                      {t.label}
                      <span className="id-tab-count">{t.count}</span>
                    </button>
                  ))}
                </div>

                {/* Comments Tab */}
                {activeTab === "comments" && (
                  <div className="id-tab-content">
                    <div className="id-comment-list">
                      {comments.length === 0 ? (
                        <div className="id-empty">
                          <span>💬</span>
                          <h3>No comments yet</h3>
                          <p>Be the first to add a comment on this incident.</p>
                        </div>
                      ) : (
                        comments.map((c) => (
                          <div key={c.id} className="id-comment">
                            <div className={`id-comment-avatar${c.author === username ? " id-comment-avatar--me" : ""}`}>
                              {c.author?.[0]?.toUpperCase()}
                            </div>
                            <div className="id-comment-body">
                              <div className="id-comment-header">
                                <span className="id-comment-author">{c.author}</span>
                                <span className="id-comment-time">{timeAgo(c.created_at)}</span>
                              </div>
                              <p className="id-comment-text">{c.text}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="id-comment-input-wrap">
                      <div className="id-comment-avatar id-comment-avatar--me">
                        {username?.[0]?.toUpperCase()}
                      </div>
                      <div className="id-comment-input-area">
                        <textarea
                          className="id-textarea"
                          placeholder="Add a comment..."
                          value={newComment}
                          rows={3}
                          onChange={(e) => setNewComment(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) postComment(); }}
                        />
                        <div className="id-comment-actions">
                          <span className="id-hint">Ctrl+Enter to submit</span>
                          <button
                            className="id-btn-primary"
                            onClick={postComment}
                            disabled={posting || !newComment.trim()}
                          >
                            {posting ? "Posting..." : "Post Comment"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Attachments Tab */}
                {activeTab === "attachments" && (
                  <div className="id-tab-content">
                    {attachments.length === 0 ? (
                      <div className="id-empty">
                        <span>📎</span>
                        <h3>No attachments</h3>
                        <p>Upload files, logs, or screenshots related to this incident.</p>
                      </div>
                    ) : (
                         <div className="id-att-list">
                        {attachments.map((a) => (
                          <div key={a.id} className="id-att-item">
                            <div className="id-att-icon">📄</div>
                            <div className="id-att-info">
                              <span className="id-att-name">{a.original_filename}</span>
                              <span className="id-att-meta">
                                {fmtBytes(a.file_size)} · {a.uploaded_by} · {timeAgo(a.uploaded_at)}
                              </span>
                            </div>
                            <div className="id-att-actions">
                              <button
                                className="id-att-btn download"
                                onClick={() => downloadAttachment(a.id, a.original_filename)}
                                title="Download"
                              >
                                ⬇️
                              </button>
                              <button
                                className="id-att-btn delete"
                                onClick={() => deleteAttachment(a.id)}
                                title="Delete"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="id-upload-row">
                      <label className="id-upload-label">
                        <input
                          type="file"
                          style={{ display: "none" }}
                          onChange={(e) => setUploadFile(e.target.files[0])}
                        />
                        <span className="id-btn-secondary">
                          📎 {uploadFile ? uploadFile.name : "Choose File"}
                        </span>
                      </label>
                      {uploadFile && (
                        <button
                          className="id-btn-primary"
                          onClick={uploadAttachment}
                          disabled={uploading}
                        >
                          {uploading ? "Uploading..." : "Upload"}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Activity Tab */}
                {activeTab === "activity" && (
                  <div className="id-tab-content">
                    {activities.length === 0 ? (
                      <div className="id-empty">
                        <span>📋</span>
                        <h3>No activity yet</h3>
                        <p>Actions taken on this incident will appear here.</p>
                      </div>
                    ) : (
                      <div className="id-activity-list">
                        {activities.map((a, idx) => (
                          <div key={a.id} className="id-activity-item">
                            <div className="id-activity-line">
                              {idx < activities.length - 1 && (
                                <div className="id-activity-connector" />
                              )}
                            </div>
                            <div className="id-activity-dot" />
                            <div className="id-activity-body">
                              <span className="id-activity-user">{a.user || "System"}</span>
                              <span className="id-activity-action">{a.action}</span>
                              <span className="id-activity-time">{timeAgo(a.created_at)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Postmortem Tab */}
                {activeTab === "postmortem" && (
                  <div className="id-tab-content">
                    {!["RESOLVED", "CLOSED"].includes(incident.status) ? (
                      <div className="id-empty">
                        <span>🔒</span>
                        <h3>Incident not resolved yet</h3>
                        <p>Postmortems can only be written after the incident is resolved or closed.</p>
                      </div>
                    ) : (
                      <>
                        {!postmortem && !pmEditing && isAdmin && (
                          <div className="id-empty">
                            <span>📝</span>
                            <h3>No postmortem written</h3>
                            <p>Document the root cause, impact, and prevention steps for future reference.</p>
                            <button
                              className="id-btn-primary"
                              style={{ marginTop: "16px" }}
                              onClick={() => setPmEditing(true)}
                            >
                              + Write Postmortem
                            </button>
                          </div>
                        )}

                        {!postmortem && !pmEditing && !isAdmin && (
                          <div className="id-empty">
                            <span>📋</span>
                            <h3>No postmortem yet</h3>
                            <p>The admin has not written a postmortem for this incident yet.</p>
                          </div>
                        )}

                        {postmortem && !pmEditing && (
                          <div className="id-postmortem-view">
                            {[
                              { label: "Root Cause",       value: postmortem.root_cause },
                              { label: "Impact",           value: postmortem.impact },
                              { label: "Resolution",       value: postmortem.resolution },
                              { label: "Prevention Steps", value: postmortem.prevention },
                            ].map((s) => (
                              <div key={s.label} className="id-pm-section">
                                <div className="id-pm-label">{s.label}</div>
                                <div className="id-pm-value">{s.value}</div>
                              </div>
                            ))}
                            <div className="id-pm-meta">
                              Written by <strong>{postmortem.author}</strong> · {fmt(postmortem.created_at)}
                              {postmortem.updated_at !== postmortem.created_at && (
                                <span> · Updated {fmt(postmortem.updated_at)}</span>
                              )}
                            </div>
                            {isAdmin && (
                              <button
                                className="id-btn-secondary"
                                style={{ marginTop: "12px" }}
                                onClick={() => setPmEditing(true)}
                              >
                                ✏️ Edit Postmortem
                              </button>
                            )}
                          </div>
                        )}

                        {pmEditing && (
                          <div className="id-postmortem-form">
                            {[
                              { key: "root_cause",  label: "Root Cause",       placeholder: "What caused this incident?" },
                              { key: "impact",      label: "Impact",           placeholder: "Who was affected and how?" },
                              { key: "resolution",  label: "Resolution",       placeholder: "How was it fixed?" },
                              { key: "prevention",  label: "Prevention Steps", placeholder: "What will prevent this in future?" },
                            ].map((f) => (
                              <div key={f.key} className="id-pm-field">
                                <label className="id-pm-label">{f.label}</label>
                                <textarea
                                  className="id-textarea"
                                  rows={3}
                                  placeholder={f.placeholder}
                                  value={pmForm[f.key]}
                                  onChange={(e) => setPmForm({ ...pmForm, [f.key]: e.target.value })}
                                />
                              </div>
                            ))}
                            <div className="id-comment-actions">
                              <button className="id-btn-secondary" onClick={() => setPmEditing(false)}>
                                Cancel
                              </button>
                              <button
                                className="id-btn-primary"
                                onClick={savePostmortem}
                                disabled={pmSaving || !pmForm.root_cause.trim()}
                              >
                                {pmSaving ? "Saving..." : postmortem ? "Update Postmortem" : "Save Postmortem"}
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right sidebar */}
            <aside className="id-sidebar">
              <div className="id-card">
                <div className="id-card-header">Incident Details</div>
                <div className="id-card-body">
                  {[
                    { label: "ID",          value: `#${incident.id}` },
                    { label: "Reported By", value: incident.reported_by },
                    { label: "Assigned To", value: incident.assigned_to },
                    { label: "Created",     value: fmt(incident.created_at) },
                    { label: "Updated",     value: fmt(incident.updated_at) },
                    { label: "SLA",         value: incident.due_at ? fmt(incident.due_at) : "—", red: incident.is_overdue },
                  ].map((row) => (
                    <div key={row.label} className="id-detail-row">
                      <span className="id-detail-label">{row.label}</span>
                      <span className={`id-detail-value${row.red ? " id-detail-value--red" : ""}`}>
                        {row.value}
                      </span>
                    </div>
                  ))}
                  <div className="id-detail-row">
                    <span className="id-detail-label">Priority</span>
                    <span className={`badge ${pm.cls}`}>{incident.priority}</span>
                  </div>
                  <div className="id-detail-row">
                    <span className="id-detail-label">Status</span>
                    <span className={`badge ${sm.cls}`}>{sm.label}</span>
                  </div>
                </div>
              </div>

              {/* Escalation Details Card */}
              {incident.is_escalated && (
                <div className="id-card">
                  <div className="id-card-header" style={{ color: "#FB923C" }}>
                    🚨 Escalation Details
                  </div>
                  <div className="id-card-body">
                    <div className="id-detail-row">
                      <span className="id-detail-label">Escalated By</span>
                      <span className="id-detail-value">{incident.escalated_by || "—"}</span>
                    </div>
                    <div className="id-detail-row">
                      <span className="id-detail-label">Escalated At</span>
                      <span className="id-detail-value">
                        {incident.escalated_at ? fmt(incident.escalated_at) : "—"}
                      </span>
                    </div>
                    <div className="id-detail-row" style={{ flexDirection: "column", gap: "6px" }}>
                      <span className="id-detail-label">Reason</span>
                      <span className="id-detail-value" style={{
                        background: "rgba(249,115,22,0.08)",
                        border: "1px solid rgba(249,115,22,0.2)",
                        borderRadius: "6px",
                        padding: "8px 10px",
                        color: "#fdba74",
                        fontSize: "13px",
                        lineHeight: "1.5",
                        whiteSpace: "pre-wrap",
                      }}>
                        {incident.escalation_reason || "No reason provided"}
                      </span>
                    </div>
                    {isAdmin && (
                      <button
                        className="id-btn-escalate"
                        style={{
                          width: "100%",
                          marginTop: "10px",
                          background: "rgba(59,130,246,0.12)",
                          color: "#60a5fa",
                          borderColor: "rgba(59,130,246,0.3)",
                        }}
                        onClick={() => setShowReassignModal(true)}
                      >
                        🔁 Reassign Incident
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="id-card">
                <div className="id-card-header">Quick Stats</div>
                <div className="id-card-body">
                  {[
                    { icon: "💬", label: "Comments",        val: comments.length },
                    { icon: "📎", label: "Attachments",     val: attachments.length },
                    { icon: "📋", label: "Activity Events", val: activities.length },
                  ].map((s) => (
                    <div key={s.label} className="id-stat-row">
                      <span className="id-stat-icon">{s.icon}</span>
                      <span className="id-stat-label">{s.label}</span>
                      <span className="id-stat-val">{s.val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </div>

        {/* Escalate Modal */}
        {showEscalateModal && (
          <div className="id-modal-overlay" onClick={() => setShowEscalateModal(false)}>
            <div className="id-modal" onClick={(e) => e.stopPropagation()}>
              <div className="id-modal-header">
                <span>🚨 Escalate Incident</span>
                <button className="id-modal-close" onClick={() => setShowEscalateModal(false)}>✕</button>
              </div>
              <div className="id-modal-body">
                <p className="id-modal-desc">
                  Escalating will notify all admins immediately. Please describe why you cannot handle this incident.
                </p>
                <textarea
                  className="id-textarea"
                  placeholder="Reason for escalation (e.g. I don't have database access, this requires senior expertise...)"
                  rows={4}
                  value={escalateReason}
                  onChange={(e) => setEscalateReason(e.target.value)}
                />
              </div>
              <div className="id-modal-footer">
                <button className="id-btn-secondary" onClick={() => setShowEscalateModal(false)}>Cancel</button>
                <button
                  className="id-btn-escalate"
                  onClick={escalateIncident}
                  disabled={escalating || !escalateReason.trim()}
                >
                  {escalating ? "Escalating..." : "Confirm Escalate"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reassign Modal */}
        {showReassignModal && (
          <div className="id-modal-overlay" onClick={() => setShowReassignModal(false)}>
            <div className="id-modal" onClick={(e) => e.stopPropagation()}>
              <div className="id-modal-header" style={{ color: "#60a5fa" }}>
                <span>🔁 Reassign Incident</span>
                <button className="id-modal-close" onClick={() => setShowReassignModal(false)}>✕</button>
              </div>
              <div className="id-modal-body">
                <p className="id-modal-desc">
                  Select an employee to reassign this incident to. The incident will be de-escalated and set back to In Progress.
                </p>
                <select
                  className="id-status-select"
                  style={{ width: "100%" }}
                  value={reassignTo}
                  onChange={(e) => setReassignTo(e.target.value)}
                >
                  <option value="">— Select employee —</option>
                  {allUsers.map((u) => (
                    <option key={u.username} value={u.username}>{u.username}</option>
                  ))}
                </select>
              </div>
              <div className="id-modal-footer">
                <button className="id-btn-secondary" onClick={() => setShowReassignModal(false)}>Cancel</button>
                <button
                  className="id-btn-primary"
                  onClick={reassignIncident}
                  disabled={reassigning || !reassignTo}
                >
                  {reassigning ? "Reassigning..." : "Confirm Reassign"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
