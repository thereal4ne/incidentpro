import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "./ManageUsers.css";
import API from "../config";
import { authFetch } from "../utils/auth";
import Sidebar from "../components/Sidebar";

export default function ManageUsers() {
  const navigate = useNavigate();

  const [username,   setUsername]   = useState("");
  const [employees,  setEmployees]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message,    setMessage]    = useState(null);
  const [userRole, setUserRole] = useState("ADMIN");

  const [form, setForm] = useState({
    username: "", email: "", first_name: "", last_name: "", role: "EMPLOYEE",
  });

  const fetchData = useCallback(async () => {
    const token = localStorage.getItem("access_token");
    if (!token) return navigate("/login");

    const [userRes, empRes] = await Promise.all([
      authFetch(`${API}/api/current_user/`),
      authFetch(`${API}/api/accounts/employees/`),
    ]);

    if (!userRes.ok) { localStorage.removeItem("access_token"); return navigate("/login"); }
    const userData = await userRes.json();
    if (userData.role !== "ADMIN") return navigate("/");
    setUsername(userData.username);
    setUserRole(userData.role);

    if (empRes.ok) setEmployees(await empRes.json());
    setLoading(false);
  }, [navigate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (!form.username || !form.email) {
      setMessage({ type: "error", text: "Username and email are required." }); return;
    }
    setSubmitting(true); setMessage(null);
    const res = await authFetch(`${API}/api/accounts/employees/create/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

  const toggleStatus = async (userId) => {
    const res = await authFetch(`${API}/api/accounts/employees/${userId}/toggle/`, { method: "PATCH" });
    if (res.ok) fetchData();
  };

  if (loading) return (
    <div className="mu-loading"><div className="mu-spinner" /><span>Loading…</span></div>
  );

  return (
    <div className="app-shell">
      <Sidebar username={username} role={userRole} />
      <main className="app-main mu-page">
        <div className="mu-content">

          {/* Header */}
          <div className="mu-header">
            <div>
              <h1 className="mu-title">Manage Users</h1>
              <p className="mu-subtitle">Create and manage employee accounts.</p>
            </div>
            <button className="mu-btn-primary" onClick={() => { setShowForm(!showForm); setMessage(null); }}>
              {showForm ? "✕ Cancel" : "+ Create Employee"}
            </button>
          </div>

          {/* Message */}
          {message && (
            <div className={`mu-message mu-message--${message.type}`}>
              <p>{message.text}</p>
              {message.tempPassword && (
                <p className="mu-temp-pass">
                  Temp password: <strong>{message.tempPassword}</strong>
                  <span style={{ color: "var(--text-3)", marginLeft: 8 }}>(share manually if email failed)</span>
                </p>
              )}
            </div>
          )}

          {/* Create form */}
          {showForm && (
            <div className="mu-form-card">
              <h3>New Employee Account</h3>
              <div className="mu-form-grid">
                {[
                  { key: "username",   label: "Username *",  placeholder: "e.g. john.doe",      type: "text" },
                  { key: "email",      label: "Email *",     placeholder: "john@company.com",   type: "email" },
                  { key: "first_name", label: "First Name",  placeholder: "John",               type: "text" },
                  { key: "last_name",  label: "Last Name",   placeholder: "Doe",                type: "text" },
                ].map((f) => (
                  <div key={f.key} className="mu-field">
                    <label>{f.label}</label>
                    <input
                      type={f.type}
                      value={form[f.key]}
                      placeholder={f.placeholder}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    />
                  </div>
                ))}
                <div className="mu-field">
                  <label>Role</label>
                  <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    <option value="EMPLOYEE">Employee</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
              </div>
              <button className="mu-btn-primary" onClick={handleCreate} disabled={submitting}>
                {submitting ? "Creating…" : "Create Account & Send Email"}
              </button>
            </div>
          )}

          {/* User table */}
          <div className="mu-table-card">
            <div className="mu-table-header">
              <h3>All Users</h3>
              <span className="mu-count">{employees.length}</span>
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
                    <td style={{ color: "var(--text-2)" }}>{emp.email || "—"}</td>
                    <td>
                      <span className={`mu-role-badge mu-role-badge--${emp.role.toLowerCase()}`}>
                        {emp.role}
                      </span>
                    </td>
                    <td style={{ color: "var(--text-2)", fontSize: 12 }}>{emp.date_joined}</td>
                    <td>
                      <span className={`mu-status-badge ${emp.is_active ? "mu-status-badge--active" : "mu-status-badge--inactive"}`}>
                        {emp.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <button
                        className={`mu-toggle-btn ${emp.is_active ? "mu-toggle-btn--deactivate" : "mu-toggle-btn--activate"}`}
                        onClick={() => toggleStatus(emp.id)}
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
      </main>
    </div>
  );
}
