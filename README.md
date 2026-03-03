# IncidentPro 🛡️

A full-stack **Incident Management System** with automated SLA enforcement, real-time dashboard updates, role-based access control, and automated email notifications.

Built with **Django REST Framework** + **React.js** + **Celery** + **Redis**.

---

## Features

- 🔐 **Role-Based Access Control** — Admin and Employee roles with permission enforcement at both API and UI level
- ⏰ **Automated SLA Deadlines** — Deadlines auto-assigned on incident creation based on priority (Critical: 2hrs, High: 8hrs, Medium: 24hrs, Low: 72hrs)
- 🤖 **Async SLA Monitoring** — Celery workers monitor open incidents in the background via Celery Beat periodic tasks
- 🚨 **Auto Escalation** — Breached incidents are automatically marked overdue, escalated to Critical priority, and reassigned to admin
- 📧 **Email Notifications** — Automated breach alerts sent to assigned user, reporter, and all admins via Gmail SMTP
- 📊 **Real-Time Dashboard** — Live polling updates incidents, activity logs, and comments every 2 seconds
- 📋 **Audit Trail** — Every action logged — status changes, comments, attachments, SLA breaches, escalations
- 📎 **File Attachments** — Secure upload, download, and soft-delete with permission checks
- 💬 **Comments System** — Stakeholder collaboration on incidents with full activity log integration
- 🔄 **CI/CD Pipeline** — GitHub Actions with linting, security scanning, test coverage, and auto-deploy to Render

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React.js, React Router, CSS3 |
| Backend | Django 5.x, Django REST Framework |
| Authentication | SimpleJWT (JSON Web Tokens) |
| Task Queue | Celery |
| Message Broker | Redis (Docker) |
| Email | Django SMTP + Gmail |
| Database | SQLite |
| CI/CD | GitHub Actions |
| Deployment | Render |

---

## Project Structure
```
cicdproject/
├── incidents/              # Django app
│   ├── models.py           # Incident, Comment, Attachment, Activity
│   ├── views.py            # REST API endpoints
│   ├── tasks.py            # Celery tasks
│   ├── urls.py             # URL routing
│   └── services/
│       └── sla_service.py  # SLA evaluation logic
├── cicdproject/            # Django project config
│   ├── settings.py
│   └── celery.py
├── frontend/               # React.js SPA
│   └── src/
│       ├── App.js
│       ├── App.css
│       ├── Login.js
│       └── pages/
│           └── ReportIncident.js
├── .github/
│   └── workflows/
│       └── ci.yml          # GitHub Actions pipeline
├── manage.py
├── requirements.txt
└── start.bat               # One-click startup (Windows)
```

---

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+
- Docker (for Redis)

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/cicdproject.git
cd cicdproject
```

### 2. Set up the backend
```bash
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
```

### 3. Configure email in `settings.py`
```python
EMAIL_HOST_USER = 'your_gmail@gmail.com'
EMAIL_HOST_PASSWORD = 'your_app_password'
DEFAULT_FROM_EMAIL = 'IncidentPro <your_gmail@gmail.com>'
```

### 4. Start Redis
```bash
docker run -d -p 6379:6379 --name redis redis:7
```

### 5. Start Celery
```bash
celery -A cicdproject worker --loglevel=info --pool=solo
celery -A cicdproject beat --loglevel=info
```

### 6. Start frontend
```bash
cd frontend
npm install
npm start
```

### 7. Start Django
```bash
python manage.py runserver
```

> **Windows shortcut:** Place `start.bat` in the project root and double-click to start all servers at once.

---

## SLA Policy

| Priority | Deadline |
|---|---|
| 🔴 Critical | 2 hours |
| 🟠 High | 8 hours |
| 🟡 Medium | 24 hours |
| 🟢 Low | 72 hours |

When an SLA is breached the system automatically marks the incident overdue, escalates priority to Critical, reassigns to admin, and sends email alerts to all stakeholders.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET/POST | `/api/incidents/` | List or create incidents |
| PATCH | `/api/incidents/<id>/status/` | Update incident status |
| GET/POST | `/api/incidents/<id>/comments/` | List or add comments |
| POST | `/api/incidents/<id>/attachments/` | Upload attachment |
| GET | `/api/incidents/<id>/attachments/` | List attachments |
| GET | `/api/incidents/<id>/attachments/<aid>/download/` | Download attachment |
| DELETE | `/api/incidents/<id>/attachments/<aid>/` | Soft delete attachment |
| GET | `/api/incidents/<id>/activities/` | Get activity log |
| GET | `/api/current_user/` | Get current user info |
| GET | `/api/users/` | List all users (Admin only) |

---

## CI/CD Pipeline
```
Push to main
     ↓
Install dependencies
     ↓
Lint with flake8
     ↓
Security scan with Bandit
     ↓
Run tests with Coverage (min 70%)
     ↓
Deploy to Render (if all checks pass)
```

---

## User Roles

| Feature | Admin | Employee |
|---|---|---|
| View all incidents | ✅ | ❌ |
| View own incidents | ✅ | ✅ |
| Create & assign incidents | ✅ | ❌ |
| Report incidents | ✅ | ✅ |
| Change status | ✅ | ✅ (own only) |
| Delete attachments | ✅ | ❌ |
| Access Django Admin | ✅ | ❌ |

---

## Future Enhancements

- WebSocket support for true real-time updates
- Email notifications on incident assignment
- Mobile app
- Multi-tenant support

---

## License

Developed as a college main project submission.