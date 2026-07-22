import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import './App.css';
import API from "./config";

function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/token/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem("access_token",  data.access);
        localStorage.setItem("refresh_token", data.refresh);
        const userRes = await fetch(`${API}/api/current_user/`, {
          headers: { Authorization: `Bearer ${data.access}` },
        });
        const userData = await userRes.json();
        navigate(userData.role === "ADMIN" ? "/admin" : "/home");
      } else {
        setError(data.detail || "Invalid username or password");
      }
    } catch {
      setError("Server unreachable. Check if Django is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">

        {/* Logo */}
        <div className="login-logo">
          <div className="login-logo-icon">⚡</div>
          <span className="login-logo-text">IncidentPro</span>
        </div>

        <h1 className="login-heading">Welcome back</h1>
        <p className="login-sub">Sign in to your workspace</p>

        {error && <div className="login-error">{error}</div>}

        <form className="login-form" onSubmit={handleLogin}>
          <div className="login-input-group">
            <label>Username</label>
            <input
              className="login-input"
              type="text"
              placeholder="Enter your username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>

          <div className="login-input-group">
            <label>Password</label>
            <input
              className="login-input"
              type="password"
              placeholder="Enter your password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? "Authenticating…" : "Sign in"}
          </button>
        </form>

        <div className="login-footer">
          Contact your administrator to create an account.
        </div>
      </div>
    </div>
  );
}

export default Login;
