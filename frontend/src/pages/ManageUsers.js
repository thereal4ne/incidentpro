import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "./ManageUsers.css";
import API from "../config";

export default function ManageUsers() {
  const navigate = useNavigate();
  const getToken = () => localStorage.getItem("access_token");

  const [username, setUsername] = useState("");
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  const [form, setForm] = useState({
    username: "", email: "", first_name: "", last_name: "", role: "EMPLOYEE",
  });

  const fetchData = useCallback(async () => {
    const token = getToken();
    if (!token) return navigate("/login");

    const [userRes, empRes] = await Promise.all([
      fetch(`${API}/api/current_user/`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API}/api/accounts/employees/`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);

    if (!userRes.ok) { localStorage.removeItem("access_token"); return navigate("/login"); }

    const userData = await userRes.json();
    if (userData.role !== "ADMIN") return navigate("/");
    setUsername(userData.username);

    if (empRes.ok) setEmployees(await empRes.json());
    setLoading(false);
  }, [navigate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (!form.username || !form.email) {
      setMessage({ type: "error", text: "Username and email are required." });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    const token = getToken();
    const res = await fetch(`${API}/api/accounts/employees/create/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (res.ok) {
      setMessage({ type: "success", text: data.message, tempPassword: data.temp_password });
      setForm({ username: "", email: "", first_name: "", last_name: "", role: "EMPLOYEE" });
      setShowForm(false);
      fetchData();
    } else {
      setMessage({ type: "error", text: data.error });
    }
    setSubmitting(false);
  };

  const toggleStatus = async (userId, currentStatus) => {
    const token = getToken();
    const res = await fetch(`${API}/api/accounts/employees/${userId}/toggle/`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) fetchData();
  };

  if (loading) return (
    <div className="mu-loading"><div className="mu-spinner" /><p>Loading...</p></div>
  );

  return (
    <div className="mu-page">
      {/* NAV */}
      <nav className="ah-nav">
        <div className="ah-nav-left">
          <div className="ah-logo"><span>⚡</span> IncidentPro</div>
          <div className="ah-nav-links">
            <button className="ah-nav-link" onClick={() => navigate("/admin")}>Overview</button>
            <button className="ah-nav-link" onClick={() => navigate("/")}>Incidents</button>
            <button className="ah-nav-link ah-nav-link--active">Manage Users</button>
            <button className="ah-nav-link" onClick={() => navigate("/report")}>+ New</button>
          </div>
        </div>
        <div className="ah-nav-right">
          <div className="ah-user-chip">
            <div className="ah-avatar">{username?.[0]?.toUpperCase()}</div>
            <div className="ah-user-meta">
              <span className="ah-username">{username}</span>
              <span className="ah-role">ADMIN</span>
            </div>
          </div>
          <button className="ah-logout" onClick={() => { localStorage.clear(); navigate("/login"); }}>
            Sign out
          </button>
        </div>
      </nav>

      <div className="mu-content">
        {/* HEADER */}
        <div className="mu-header">
          <div>
            <h1 className="mu-title">👥 Manage Users</h1>
            <p className="mu-subtitle">Create and manage employee accounts</p>
          </div>
          <button className="mu-btn-primary" onClick={() => { setShowForm(!showForm); setMessage(null); }}>
            {showForm ? "✕ Cancel" : "+ Create Employee"}
          </button>
        </div>

        {/* SUCCESS / ERROR MESSAGE */}
        {message && (
          <div className={`mu-message mu-message--${message.type}`}>
            <p>{message.text}</p>
            {message.tempPassword && (
              <p className="mu-temp-pass">
                Temporary Password: <strong>{message.tempPassword}</strong>
                <span> (email failed — share this manually)</span>
              </p>
            )}
          </div>
        )}

        {/* CREATE FORM */}
        {showForm && (
          <div className="mu-form-card">
            <h3>New Employee Account</h3>
            <div className="mu-form-grid">
              <div className="mu-field">
                <label>Username *</label>
                <input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="e.g. john.doe"
                />
              </div>
              <div className="mu-field">
                <label>Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="e.g. john@company.com"
                />
              </div>
              <div className="mu-field">
                <label>First Name</label>
                <input
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  placeholder="John"
                />
              </div>
              <div className="mu-field">
                <label>Last Name</label>
                <input
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  placeholder="Doe"
                />
              </div>
              <div className="mu-field">
                <label>Role</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="EMPLOYEE">Employee</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
            </div>
            <button className="mu-btn-primary" onClick={handleCreate} disabled={submitting}>
              {submitting ? "Creating..." : "Create Account & Send Email"}
            </button>
          </div>
        )}

        {/* EMPLOYEE TABLE */}
        <div className="mu-table-card">
          <div className="mu-table-header">
            <h3>All Users <span className="mu-count">{employees.length}</span></h3>
          </div>
          <table className="mu-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id} className={!emp.is_active ? "mu-row--inactive" : ""}>
                  <td>
                    <div className="mu-user-cell">
                      <div className="mu-user-avatar">{emp.username[0].toUpperCase()}</div>
                      <div>
                        <div className="mu-user-name">{emp.username}</div>
                        {(emp.first_name || emp.last_name) && (
                          <div className="mu-user-fullname">{emp.first_name} {emp.last_name}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>{emp.email || "—"}</td>
                  <td>
                    <span className={`mu-role-badge mu-role-badge--${emp.role.toLowerCase()}`}>
                      {emp.role}
                    </span>
                  </td>
                  <td>{emp.date_joined}</td>
                  <td>
                    <span className={`mu-status-badge ${emp.is_active ? "mu-status-badge--active" : "mu-status-badge--inactive"}`}>
                      {emp.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <button
                      className={`mu-toggle-btn ${emp.is_active ? "mu-toggle-btn--deactivate" : "mu-toggle-btn--activate"}`}
                      onClick={() => toggleStatus(emp.id, emp.is_active)}
                    >
                      {emp.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}