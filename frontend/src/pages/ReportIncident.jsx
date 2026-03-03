import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const API = "http://127.0.0.1:8000";

export default function ReportIncident() {
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("LOW");

  // ── Admin-only state ──
  const [userRole, setUserRole] = useState("EMPLOYEE");
  const [allUsers, setAllUsers] = useState([]);
  const [assignedTo, setAssignedTo] = useState("");

  // ── Fetch role + users on mount ──
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) { navigate("/login"); return; }

    // Get current user role
    fetch(`${API}/api/current_user/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setUserRole(data.role);

        // If admin, also fetch all users for the assign dropdown
        if (data.role === "ADMIN") {
          fetch(`${API}/api/users/`, {
            headers: { Authorization: `Bearer ${token}` },
          })
            .then((res) => res.json())
            .then((users) => {
              setAllUsers(users);
              if (users.length > 0) setAssignedTo(users[0].username);
            });
        }
      });
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const token = localStorage.getItem("access_token");

    const body = {
      title,
      description,
      priority,
    };

    // Only include assigned_to if admin has selected a user
    if (userRole === "ADMIN" && assignedTo) {
      body.assigned_to = assignedTo;
    }

    const res = await fetch(`${API}/api/incidents/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      navigate("/");
    } else {
      alert("Failed to submit incident");
    }
  };

  return (
    <div className="dashboard-page">

      {/* NAVBAR */}
      <nav className="dashboard-nav">
        <div className="nav-logo">🛡️ IncidentPro</div>

        <button
          className="logout-btn"
          onClick={() => navigate("/")}
        >
          Back to Dashboard
        </button>
      </nav>

      <div className="dashboard-content">

        <div className="login-card glass-card">
          <h2>{userRole === "ADMIN" ? "Create Incident" : "Report Incident"}</h2>

          <form
            onSubmit={handleSubmit}
            className="stylish-form"
            style={{ display: "flex", flexDirection: "column", gap: "18px" }}
          >
            <input
              type="text"
              placeholder="Incident title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />

            <textarea
              placeholder="Describe the issue in detail..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ height: "120px" }}
              required
            />

            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="LOW">Low Priority</option>
              <option value="MEDIUM">Medium Priority</option>
              <option value="HIGH">High Priority</option>
              <option value="CRITICAL">Critical Priority</option>
            </select>

            {/* ── Admin-only: assign to user ── */}
            {userRole === "ADMIN" && (
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
              >
                {allUsers.map((user) => (
                  <option key={user.id} value={user.username}>
                    {user.username}
                  </option>
                ))}
              </select>
            )}

            <button type="submit" className="action-btn">
              Submit Incident
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}