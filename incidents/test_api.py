from django.urls import reverse
from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from django.contrib.auth.models import User, Group
from incidents.models import Incident
from rest_framework_simplejwt.tokens import RefreshToken


class IncidentAPITests(APITestCase):

    def setUp(self):
        # Create groups
        self.admin_group = Group.objects.create(name="ADMIN")
        self.employee_group = Group.objects.create(name="EMPLOYEE")

        # Create users
        self.admin = User.objects.create_user(username="admin", password="adminpass")
        self.admin.groups.add(self.admin_group)

        self.employee = User.objects.create_user(username="employee", password="employeepass")
        self.employee.groups.add(self.employee_group)

        # API client
        self.client = APIClient()

        # 🔥 Monkey-patch login() to use JWT instead of session auth
        def jwt_login(username=None, password=None):
            user = User.objects.get(username=username)
            refresh = RefreshToken.for_user(user)
            self.client.credentials(
                HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}"
            )
            return True

        self.client.login = jwt_login

        # Create an incident reported by employee
        self.incident = Incident.objects.create(
            title="Test Incident",
            description="Test description",
            priority="LOW",
            status="OPEN",
            reported_by=self.employee,
            assigned_to=self.employee
        )

    # ---------------------------
    # Current User Tests
    # ---------------------------
    def test_current_user_employee(self):
        self.client.login(username="employee", password="employeepass")
        response = self.client.get(reverse('current_user'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['role'], 'EMPLOYEE')

    def test_current_user_admin(self):
        self.client.login(username="admin", password="adminpass")
        response = self.client.get(reverse('current_user'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['role'], 'ADMIN')

    # ---------------------------
    # Incident Assignment Tests
    # ---------------------------
    def test_employee_cannot_assign_incident(self):
        self.client.login(username="employee", password="employeepass")
        response = self.client.post(reverse('incident_api'), {
            "title": "New Incident",
            "description": "Desc",
            "priority": "HIGH",
            "assigned_to": self.admin.username
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_assign_incident(self):
        self.client.login(username="admin", password="adminpass")
        response = self.client.post(reverse('incident_api'), {
            "title": "Admin Incident",
            "description": "Admin Desc",
            "priority": "HIGH",
            "assigned_to": self.employee.username
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['assigned_to'], self.employee.username)

    # ---------------------------
    # Incident Status Update Tests
    # ---------------------------
    def test_employee_can_update_own_incident_status(self):
        self.client.login(username="employee", password="employeepass")
        url = reverse('update_incident_status', args=[self.incident.id])
        response = self.client.patch(url, {"status": "IN_PROGRESS"}, format='json')
        self.assertEqual(response.status_code, 200)
        self.incident.refresh_from_db()
        self.assertEqual(self.incident.status, "IN_PROGRESS")

    def test_employee_cannot_update_other_incident_status(self):
        incident2 = Incident.objects.create(
            title="Admin Incident",
            description="Desc",
            priority="LOW",
            status="OPEN",
            reported_by=self.admin,
            assigned_to=self.admin
        )
        self.client.login(username="employee", password="employeepass")
        url = reverse('update_incident_status', args=[incident2.id])
        response = self.client.patch(url, {"status": "RESOLVED"}, format='json')
        self.assertEqual(response.status_code, 403)

    def test_invalid_status_update(self):
        self.client.login(username="admin", password="adminpass")
        url = reverse('update_incident_status', args=[self.incident.id])
        response = self.client.patch(url, {"status": "INVALID_STATUS"}, format='json')
        self.assertEqual(response.status_code, 400)

    # ---------------------------
    # Incident List / Filtering Tests
    # ---------------------------
    def test_admin_sees_all_incidents(self):
        self.client.login(username="admin", password="adminpass")
        response = self.client.get(reverse('incident_api'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), Incident.objects.count())

    def test_employee_sees_only_their_incidents(self):
        self.client.login(username="employee", password="employeepass")
        response = self.client.get(reverse('incident_api'))
        self.assertEqual(response.status_code, 200)
        for incident in response.data:
            self.assertTrue(
                incident['reported_by'] == "employee" or incident['assigned_to'] == "employee"
            )

    # ---------------------------
    # Validation Tests
    # ---------------------------
    def test_create_incident_missing_title(self):
        self.client.login(username="employee", password="employeepass")
        response = self.client.post(reverse('incident_api'), {
            "description": "Missing title"
        }, format='json')
        self.assertEqual(response.status_code, 400)
