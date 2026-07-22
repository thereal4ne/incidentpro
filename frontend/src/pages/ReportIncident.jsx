import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "./ReportIncident.css";
import API from "../config";
import { authFetch } from "../utils/auth";
import Sidebar from "../components/Sidebar";

export default function ReportIncident() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [userRole, setUserRole] = useState("EMPLOYEE");
  const [allUsers, setAllUsers] = useState([]);

  const [title,      setTitle]      = useState("");
  const [description,setDescription]= useState("");
  const [priority,   setPriority]   = useState("LOW");
  const [assignedTo, setAssignedTo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState("");
  const [success,    setSuccess]    = useState(false);

  const fetchInit = useCallback(async () => {
    const token = localStorage.getItem("access_token");
    if (!token) return navigate("/login");

    const userRes = await authFetch(`${API}/api/current_user/`);
    if (!userRes.ok) { localStorage.removeItem("access_token"); return navigate("/login"); }

    const userData = await userRes.json();
    setUsername(userData.username);
    setUserRole(userData.role);

    if (userData.role === "ADMIN") {
      const usersRes = await authFetch(`${API}/api/users/`);
      if (usersRes.ok) {
        const users = await usersRes.json();
        setAllUsers(users);
        if (users.length > 0) setAssignedTo(users[0].username);
      }
    } else {
      setAssignedTo(userData.username);
    }
  }, [navigate]);

  useEffect(() => { fetchInit(); }, [fetchInit]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required."); return; }
    if (!description.trim()) { setError("Description is required."); return; }
    setError("");
    setSubmitting(true);

    const res = await authFetch(`${API}/api/incidents/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
  userRole === "ADMIN"
    ? { title, description, priority, assigned_to: assignedTo }
    : { title, description, priority }
),
    });

    if (res.ok) {
      setSuccess(true);
      setTimeout(() => navigate("/"), 1200);
    } else {
      const data = await res.json();
      setError(data.error || data.detail || "Failed to create incident.");
    }
    setSubmitting(false);
  };

  const PRIORITIES = [
    { value: "CRITICAL", label: "Critical", color: "#EF4444" },
    { value: "HIGH",     label: "High",     color: "#F97316" },
    { value: "MEDIUM",   label: "Medium",   color: "#EAB308" },
    { value: "LOW",      label: "Low",      color: "#22C55E" },
  ];

  return (
    <div className="app-shell">
      <Sidebar username={username} role={userRole} />

      <main className="app-main ri-page">
        <div className="ri-content">

          {/* Page header */}
          <div className="ri-header">
            <div>
              <h1 className="ri-title">Report an Incident</h1>
              <p className="ri-subtitle">Fill in the details below to create a new incident.</p>
            </div>
            <button className="ri-back-btn" onClick={() => navigate(-1)}>
              ← Back
            </button>
          </div>

          {/* Centered form card */}
          <div className="ri-form-wrap">
            <div className="ri-card">

              {success ? (
                <div className="ri-success">
                  <div className="ri-success-icon">✅</div>
                  <h2>Incident Created</h2>
                  <p>Redirecting to dashboard…</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="ri-form">

                  {error && <div className="ri-error">{error}</div>}

                  <div className="ri-field">
                    <label className="ri-label">Incident Title *</label>
                    <input
                      className="ri-input"
                      type="text"
                      placeholder="Brief description of the issue"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      autoFocus
                    />
                  </div>

                  <div className="ri-field">
                    <label className="ri-label">Description *</label>
                    <textarea
                      className="ri-textarea"
                      placeholder="Describe the issue in detail — what happened, when, and what the impact is…"
                      value={description}
                      rows={5}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>

                  <div className="ri-row">
                    <div className="ri-field">
                      <label className="ri-label">Priority</label>
                      <div className="ri-priority-group">
                        {PRIORITIES.map((p) => (
                          <button
                            key={p.value}
                            type="button"
                            className={`ri-priority-btn${priority === p.value ? " ri-priority-btn--active" : ""}`}
                            style={priority === p.value ? { borderColor: p.color, color: p.color, background: `${p.color}14` } : {}}
                            onClick={() => setPriority(p.value)}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {userRole === "ADMIN" && allUsers.length > 0 && (
                    <div className="ri-field">
                      <label className="ri-label">Assign To</label>
                      <select
                        className="ri-select"
                        value={assignedTo}
                        onChange={(e) => setAssignedTo(e.target.value)}
                      >
                        {allUsers.map((u) => (
                          <option key={u.username} value={u.username}>{u.username}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="ri-submit-btn"
                    disabled={submitting}
                  >
                    {submitting ? "Creating…" : "Submit Incident"}
                  </button>

                </form>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
