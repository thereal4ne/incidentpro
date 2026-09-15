# IncidentPro 🛡️

A production-ready, full-stack **Incident Response & SLA Management Platform** featuring real-time WebSocket communication, background SLA monitoring & escalation queues, dynamic PDF reporting, and role-based access control.

Built with **Django REST Framework** + **Django Channels (WebSockets)** + **React** + **PostgreSQL** + **Celery** + **Redis** + **Docker**.

---

## 🌟 Key Features

- ⚡ **Real-Time WebSocket Updates** — Instant in-app notification alerts and live incident dashboard updates using **Django Channels (ASGI)** and Redis.
- ⏰ **Automated SLA Enforcement** — Deadlines automatically calculated on creation based on priority (Critical: 2h, High: 8h, Medium: 24h, Low: 72h).
- 🤖 **Background Workers & Celery Beat** — Periodic background tasks evaluate open tickets, mark overdue items, auto-escalate priority to Critical, and reassign to admins.
- 🛡️ **Fault-Tolerant Broker Fallbacks** — Resilient view handlers detect Redis/Celery connection outages and dynamically fallback to synchronous execution (`.apply()`) to guarantee API uptime.
- 🔐 **Role-Based Access Control (RBAC)** — Strict separation between Admin and Employee capabilities at both API and UI levels.
- 📄 **Dynamic PDF Report Generation** — Export complete incident lifecycle histories, activity logs, and comments into styled, watermarked PDF documents via **ReportLab**.
- 📝 **Postmortem Analysis & Audit Logs** — Log root cause, impact, resolution, and prevention for resolved incidents alongside detailed, granular activity timelines.
- 🛡️ **XSS Input Sanitization** — All incoming text fields sanitized using `bleach` to prevent cross-site scripting attacks.
- 📊 **Interactive Analytics** — Admin overview dashboard powered by **Recharts** displaying incident trends, status distribution, and SLA breach rates.
- 🧪 **112 Passing Tests & 85% Code Coverage** — Thorough test suite with mocked failure scenarios, verified by GitHub Actions.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React (v19), React Router DOM (v7), Recharts, Axios, CSS3 |
| **Backend API** | Django 5.x, Django REST Framework (DRF) |
| **Real-Time & Async** | Django Channels (ASGI), Celery, Redis |
| **Authentication** | SimpleJWT (JSON Web Tokens) + Token Rotation |
| **Database** | PostgreSQL 16 (Dockerized) |
| **Document Export** | ReportLab |
| **Security & Utilities** | Bleach (XSS Sanitization), Python-Magic (MIME Validation), Django Ratelimit |
| **DevOps & CI/CD** | Docker, Docker Compose, GitHub Actions (Flake8, Bandit, Coverage) |

---

## 📁 Project Structure

```
cicdproject/
├── incidents/                  # Core Incident Management App
│   ├── models.py               # Incident, Comment, Attachment, Activity, Notification, Postmortem
│   ├── views.py                # REST API endpoints & PDF generation
│   ├── tasks.py                # Celery background tasks
│   ├── consumers.py            # Django Channels WebSocket consumers
│   ├── routing.py              # WebSocket URL routing
│   ├── serializers.py          # DRF serializers & input sanitization
│   └── tests/                  # Unit & Integration test suite (112 tests)
├── accounts/                   # User & RBAC Management App
│   ├── models.py               # UserProfile model
│   └── views.py                # User management & authentication views
├── cicdproject/                # Project Configuration
│   ├── settings.py             # Settings (Environment-driven)
│   ├── asgi.py                 # ASGI entrypoint for WebSockets
│   └── celery.py               # Celery app initialization
├── frontend/                   # React SPA Frontend
│   └── src/
│       ├── components/         # NotificationBell, Sidebar, AttachmentSection
│       └── pages/              # AdminHome, EmployeeHome, IncidentDetail, ManageUsers
├── .github/workflows/ci.yml    # GitHub Actions CI/CD Pipeline
├── docker-compose.yml          # Multi-container orchestration
├── Dockerfile                  # Production container build
├── requirements.txt            # Python dependencies
└── manage.py
```

---

## 🚀 Getting Started

### Option A: Running with Docker Compose (Recommended)

The easiest way to run the entire stack (PostgreSQL, Redis, Celery, Celery Beat, Django, and React) is with Docker Compose:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/cicdproject.git
   cd cicdproject
   ```

2. **Configure environment variables (`.env`):**
   Create a `.env` file in the root directory:
   ```env
   SECRET_KEY="your-secret-key"
   DEBUG=True
   ALLOWED_HOSTS=127.0.0.1,localhost
   DB_NAME=incidentpro
   DB_USER=incidentpro_user
   DB_PASSWORD=incidentpro_pass
   DB_HOST=localhost
   DB_PORT=5432
   EMAIL_HOST_USER=your-email@gmail.com
   EMAIL_HOST_PASSWORD=your-app-password
   ```

3. **Spin up containers:**
   ```bash
   docker-compose up --build
   ```
   * **Frontend:** `http://localhost:3000`
   * **Backend API:** `http://localhost:8000/api/`
   * **Swagger API Docs:** `http://localhost:8000/api/docs/`

---

### Option B: Local Manual Setup

If you prefer to run services manually:

1. **Start Redis and PostgreSQL containers:**
   ```bash
   docker run -d -p 6379:6379 --name redis redis:7-alpine
   docker run -d -p 5432:5432 -e POSTGRES_DB=incidentpro -e POSTGRES_USER=incidentpro_user -e POSTGRES_PASSWORD=incidentpro_pass --name postgres postgres:16-alpine
   ```

2. **Set up virtual environment & install backend dependencies:**
   ```bash
   python -m venv venv311
   source venv311/bin/activate  # On Windows: .\venv311\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Run database migrations:**
   ```bash
   python manage.py migrate
   python manage.py createsuperuser
   ```

4. **Start Celery worker & Celery Beat scheduler:**
   ```bash
   celery -A cicdproject worker --loglevel=info --pool=solo
   celery -A cicdproject beat --loglevel=info
   ```

5. **Start Django ASGI server:**
   ```bash
   python manage.py runserver
   ```

6. **Start React Frontend:**
   ```bash
   cd frontend
   npm install
   npm start
   ```

---

## ⏱️ SLA Policy Matrix

| Priority | Deadline | Auto-Escalation Target |
|---|---|---|
| 🔴 **Critical** | 2 Hours | Admin Reassignment + Urgent Email Alert |
| 🟠 **High** | 8 Hours | Upgraded to Critical + Overdue Flag |
| 🟡 **Medium** | 24 Hours | Overdue Flag + Stakeholder Alert |
| 🟢 **Low** | 72 Hours | Overdue Flag + Alert |

---

## 🔌 API Endpoints Summary

| Method | Endpoint | Description | Access |
|---|---|---|---|
| POST | `/api/token/` | Obtain JWT Access/Refresh tokens | Public |
| POST | `/api/token/refresh/` | Refresh JWT Access token | Public |
| GET | `/api/current_user/` | Get current logged-in user details | Authenticated |
| GET / POST | `/api/incidents/` | List all incidents or create new ticket | Authenticated |
| GET | `/api/incidents/<id>/` | Detailed incident retrieval | Incident Stakeholders / Admin |
| PATCH | `/api/incidents/<id>/status/` | Update incident status | Assignee / Admin |
| POST | `/api/incidents/<id>/escalate/` | Manually escalate an incident | Assignee |
| PATCH | `/api/incidents/<id>/reassign/` | Reassign incident & de-escalate | Admin Only |
| GET / POST | `/api/incidents/<id>/comments/` | List or post comments | Stakeholders / Admin |
| POST | `/api/incidents/<id>/attachments/upload/` | Upload file (Rate-limited) | Stakeholders / Admin |
| GET | `/api/incidents/<id>/export-pdf/` | Export incident report as PDF | Stakeholders / Admin |
| GET / POST / PATCH | `/api/incidents/<id>/postmortem/` | Create or update postmortem report | Admin Only |
| GET / PATCH | `/api/notifications/` | Manage in-app notifications | Authenticated |
| GET / POST / PATCH | `/api/accounts/employees/` | Admin user & employee management | Admin Only |

---

## 🧪 Testing & CI/CD Pipeline

The project includes **112 passing unit and integration tests** covering WebSocket consumers, JWT authentication, SLA logic, and connection resilience.

```bash
# Run test suite
python manage.py test

# Run coverage report
coverage run manage.py test
coverage report
```

### GitHub Actions Pipeline Steps:
1. **Linting:** Validates code format against PEP 8 using `flake8`.
2. **Security Scanning:** Scans for python vulnerabilities using `bandit`.
3. **Database Integration:** Boots up PostgreSQL 16 & Redis 7 container instances inside GitHub Actions runner.
4. **Coverage Enforcer:** Executes test suite and fails if total code coverage drops below **80%**.

---

## 📜 License

Developed as a full-stack project submission.