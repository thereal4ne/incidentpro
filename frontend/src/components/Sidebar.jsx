import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./Sidebar.css";
import NotificationBell from "./NotificationBell";

export default function Sidebar({ username, role, wsConnected, overdueCount = 0, onChangePassword }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const isAdmin   = role === "ADMIN";
  const path      = location.pathname;

  const logout = () => { localStorage.clear(); navigate("/login"); };

  const navAdmin = [
    { icon: "▦",  label: "Overview",     to: "/admin" },
    { icon: "≡",  label: "Incidents",    to: "/" },
    { icon: "＋",  label: "New Incident", to: "/report" },
    { icon: "👥", label: "Users",        to: "/manage-users" },
  ];

  const navEmployee = [
    { icon: "▦",  label: "Dashboard",    to: "/home" },
    { icon: "≡",  label: "My Incidents", to: "/" },
    { icon: "＋",  label: "New Incident", to: "/report" },
  ];

  const navItems = isAdmin ? navAdmin : navEmployee;

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo" style={{ cursor: "pointer" }} onClick={() => navigate(isAdmin ? "/admin" : "/home")}>
        <div className="sidebar-logo-icon">⚡</div>
        <span className="sidebar-logo-text">IncidentPro</span>
        <span className={`ws-dot${wsConnected === false ? " ws-dot--off" : ""}`} title={wsConnected === false ? "Offline" : "Live"} />
      </div>

      {/* Main nav */}
      <div className="sidebar-section">
        <div className="sidebar-section-label">Navigation</div>
        {navItems.map((item) => (
          <button
            key={item.to}
            className={`sidebar-item${path === item.to ? " sidebar-item--active" : ""}`}
            onClick={() => navigate(item.to)}
          >
            <span className="sidebar-item-icon">{item.icon}</span>
            <span className="sidebar-item-label">{item.label}</span>
            {item.label === "Incidents" && overdueCount > 0 && (
              <span className="sidebar-item-badge">{overdueCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Notifications */}
      <div className="sidebar-section" style={{ paddingTop: 0 }}>
        <div className="sidebar-section-label">Alerts</div>
        <div style={{ padding: "0 2px" }}>
          <NotificationBell sidebar />
        </div>
      </div>

      <div className="sidebar-spacer" />

      {/* User */}
      <div className="sidebar-user">
        {onChangePassword && (
          <button className="sidebar-item" onClick={onChangePassword} style={{ marginBottom: 2 }}>
            <span className="sidebar-item-icon">🔑</span>
            <span className="sidebar-item-label">Change Password</span>
          </button>
        )}
        <div className="sidebar-user-chip" onClick={() => {}}>
          <div className="sidebar-avatar">{username?.[0]?.toUpperCase()}</div>
          <div className="sidebar-user-info">
            <span className="sidebar-user-name">{username}</span>
            <span className="sidebar-user-role">{role}</span>
          </div>
        </div>
        <button className="sidebar-logout" onClick={logout}>
          <span>↪</span> Sign out
        </button>
      </div>
    </aside>
  );
}