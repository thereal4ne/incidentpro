// NotificationBell.jsx — sidebar-aware dark theme
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './NotificationBell.css';
import { authFetch } from '../utils/auth'; 
const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000";
const POLL_MS  = 5000;

function BellIcon({ hasBadge }) {
  return (
    <svg
      className={`nb-bell-icon${hasBadge ? ' nb-bell-ring' : ''}`}
      viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

const TYPE_META = {
  incident_assigned: { label: 'Assigned',   color: '#3B82F6' },
  incident_created:  { label: 'New',         color: '#8B5CF6' },
  status_changed:    { label: 'Status',      color: '#F59E0B' },
  sla_breach:        { label: 'SLA Breach',  color: '#EF4444' },
  sla_warning:       { label: 'Warning',     color: '#F97316' },
  comment_added:     { label: 'Comment',     color: '#10B981' },
  escalated:         { label: 'Escalated',   color: '#EC4899' },
  attachment_added:  { label: 'Attachment',  color: '#6366F1' },
};

function TypePill({ type }) {
  const meta = TYPE_META[type] || { label: type, color: '#64748B' };
  return <span className="nb-pill" style={{ background: meta.color }}>{meta.label}</span>;
}

function timeAgo(d) {
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

function authHeaders() {
  const t = localStorage.getItem('access_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function NotificationBell({ sidebar = false }) {
  const navigate = useNavigate();
  const [unreadCount,    setUnreadCount]    = useState(0);
  const [notifications,  setNotifications]  = useState([]);
  const [open,           setOpen]           = useState(false);
  const [loading,        setLoading]        = useState(false);
  const dropdownRef = useRef(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/notifications/unread-count/`, { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setUnreadCount(data.unread_count ?? 0);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const id = setInterval(fetchUnreadCount, POLL_MS);
    return () => clearInterval(id);
  }, [fetchUnreadCount]);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/notifications/`, { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unread_count ?? 0);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  const handleClick = () => {
    const next = !open;
    setOpen(next);
    if (next) fetchNotifications();
  };

  useEffect(() => {
    function onClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const markRead = async (id) => {
    try {
      await fetch(`${API_BASE}/api/notifications/${id}/read/`, { method: 'PATCH', headers: authHeaders() });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch { /* silent */ }
  };

  const markAllRead = async () => {
    try {
      await fetch(`${API_BASE}/api/notifications/mark-all-read/`, { method: 'POST', headers: authHeaders() });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch { /* silent */ }
  };

  return (
    <div className="nb-wrapper" ref={dropdownRef}>
      <button
        className={`nb-button${open ? ' nb-button--active' : ''}`}
        onClick={handleClick}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span className="nb-button-icon">🔔</span>
        <span className="nb-button-label">Notifications</span>
        {unreadCount > 0 && (
          <span className="nb-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="nb-dropdown" role="dialog" aria-label="Notifications">
          <div className="nb-header">
            <span className="nb-header-title">Notifications</span>
            {unreadCount > 0 && (
              <button className="nb-mark-all" onClick={markAllRead}>Mark all read</button>
            )}
          </div>

          <div className="nb-list">
            {loading && (
              <div className="nb-empty"><div className="nb-spinner" /></div>
            )}

            {!loading && notifications.length === 0 && (
              <div className="nb-empty">
                <span className="nb-empty-icon">🔔</span>
                <p>All caught up!</p>
                <p className="nb-empty-sub">No notifications yet.</p>
              </div>
            )}

            {!loading && notifications.map(n => (
              <div
                key={n.id}
                className={`nb-item${n.is_read ? ' nb-item--read' : ''}`}
                onClick={() => !n.is_read && markRead(n.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && !n.is_read && markRead(n.id)}
              >
                {!n.is_read && <span className="nb-unread-dot" aria-hidden="true" />}
                <div className="nb-item-body">
                  <div className="nb-item-top">
                    <TypePill type={n.notif_type} />
                    <span className="nb-time">{timeAgo(n.created_at)}</span>
                  </div>
                  <p className="nb-title">{n.title}</p>
                  <p className="nb-message">{n.message}</p>
                  {n.incident_id && (
                    <button
                      className="nb-link"
                      onClick={e => { e.stopPropagation(); setOpen(false); navigate(`/incidents/${n.incident_id}`); }}
                    >
                      View incident →
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
