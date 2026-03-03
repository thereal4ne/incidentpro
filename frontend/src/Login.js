import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import './App.css';

const API = "http://127.0.0.1:8000";

function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(""); 
  const [loading, setLoading] = useState(false);

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
        localStorage.setItem("access_token", data.access);
        localStorage.setItem("refresh_token", data.refresh);
        navigate("/"); 
      } else {
        setError(data.detail || "Invalid username or password");
      }
    } catch (err) {
      setError("Server unreachable. Check if Django is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Background Glows */}
      <div className="glow-1"></div>
      <div className="glow-2"></div>

      <div className="glass-card login-card">
        <div className="login-header">
          <div className="login-icon">🔐</div>
          <h1>LOGIN</h1>
        </div>
        
        {error && <div className="error-badge">{error}</div>}

        <form className="stylish-form" onSubmit={handleLogin}>
          <div className="input-group">
            <input
              type="text"
              placeholder="Username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="input-group">
            <input
              type="password"
              placeholder="Password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="action-btn" disabled={loading}>
            {loading ? "Authenticating..." : "Login"}
          </button>
        </form>

        <div className="login-footer">
          <p>Don't have an account? <span className="link">Sign Up</span></p>
        </div>
      </div>
    </div>
  );
}

export default Login;