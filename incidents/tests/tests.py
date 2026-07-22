from django.urls import reverse
from django.contrib.auth.models import User, Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TransactionTestCase, override_settings
from rest_framework.test import APITestCase
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from channels.testing import WebsocketCommunicator
from channels.db import database_sync_to_async
from cicdproject.asgi import application
from incidents.models import Incident

# Use in-memory channel layer for WebSocket tests (no Redis needed)
TEST_CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    }
}


# ============================================================
# HELPERS
# ============================================================

def jwt_auth(client, user):
    """Authenticate the test client with a JWT token for the given user."""
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")


def get_token(user):
    """Return a raw JWT access token string for a user."""
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token)


# ============================================================
# AUTH TESTS
# ============================================================

class AuthTests(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            password="testpass123"
        )

    def test_login_returns_tokens(self):
        response = self.client.post("/api/token/", {
            "username": "testuser",
            "password": "testpass123"
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_invalid_credentials_rejected(self):
        response = self.client.post("/api/token/", {
            "username": "testuser",
            "password": "wrongpassword"
        })
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unauthenticated_request_rejected(self):
        response = self.client.get(reverse("incident_api"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_token_refresh_works(self):
        login = self.client.post("/api/token/", {
            "username": "testuser",
            "password": "testpass123"
        })
        refresh_token = login.data["refresh"]
        response = self.client.post("/api/token/refresh/", {
            "refresh": refresh_token
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)


# ============================================================
# CURRENT USER TESTS
# ============================================================

class CurrentUserTests(APITestCase):

    def setUp(self):
        self.admin_group = Group.objects.get_or_create(name="ADMIN")[0]

        self.admin = User.objects.create_user(
            username="admin", password="adminpass"
        )
        self.admin.groups.add(self.admin_group)

        self.employee = User.objects.create_user(
            username="employee", password="employeepass"
        )

    def test_employee_role_returned(self):
        jwt_auth(self.client, self.employee)
        response = self.client.get(reverse("current_user"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["role"], "EMPLOYEE")

    def test_admin_role_returned(self):
        jwt_auth(self.client, self.admin)
        response = self.client.get(reverse("current_user"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["role"], "ADMIN")

    def test_superuser_is_admin(self):
        superuser = User.objects.create_superuser(
            username="super", password="superpass"
        )
        jwt_auth(self.client, superuser)
        response = self.client.get(reverse("current_user"))
        self.assertEqual(response.data["role"], "ADMIN")


# ============================================================
# INCIDENT CRUD TESTS
# ============================================================

class IncidentCRUDTests(APITestCase):

    def setUp(self):
        self.admin_group = Group.objects.get_or_create(name="ADMIN")[0]

        self.admin = User.objects.create_user(
            username="admin", password="adminpass"
        )
        self.admin.groups.add(self.admin_group)

        self.employee = User.objects.create_user(
            username="employee", password="employeepass"
        )

        self.other = User.objects.create_user(
            username="other", password="otherpass"
        )

        self.incident = Incident.objects.create(
            title="Test Incident",
            description="Test description",
            priority="LOW",
            status="OPEN",
            reported_by=self.employee,
            assigned_to=self.employee,
        )

    def test_admin_can_create_incident(self):
        jwt_auth(self.client, self.admin)
        response = self.client.post(reverse("incident_api"), {
            "title": "New Incident",
            "description": "Description",
            "priority": "HIGH",
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["title"], "New Incident")

    def test_employee_can_create_incident(self):
        jwt_auth(self.client, self.employee)
        response = self.client.post(reverse("incident_api"), {
            "title": "Employee Incident",
            "description": "Description",
            "priority": "LOW",
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_create_incident_missing_title_rejected(self):
        jwt_auth(self.client, self.employee)
        response = self.client.post(reverse("incident_api"), {
            "description": "Missing title"
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_incident_missing_description_rejected(self):
        jwt_auth(self.client, self.employee)
        response = self.client.post(reverse("incident_api"), {
            "title": "Missing description"
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_employee_cannot_assign_incident(self):
        jwt_auth(self.client, self.employee)
        response = self.client.post(reverse("incident_api"), {
            "title": "Assigned Incident",
            "description": "Desc",
            "priority": "HIGH",
            "assigned_to": self.admin.username,
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_assign_incident(self):
        jwt_auth(self.client, self.admin)
        response = self.client.post(reverse("incident_api"), {
            "title": "Admin Incident",
            "description": "Desc",
            "priority": "HIGH",
            "assigned_to": self.employee.username,
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["assigned_to"], self.employee.username)

    def test_admin_sees_all_incidents(self):
        jwt_auth(self.client, self.admin)
        response = self.client.get(reverse("incident_api"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], Incident.objects.count())

    def test_employee_sees_only_own_incidents(self):
        jwt_auth(self.client, self.employee)
        response = self.client.get(reverse("incident_api"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for incident in response.data["results"]:
            self.assertTrue(
                incident["reported_by"] == "employee"
                or incident["assigned_to"] == "employee"
            )

    def test_unrelated_employee_sees_no_incidents(self):
        jwt_auth(self.client, self.other)
        response = self.client.get(reverse("incident_api"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 0)


# ============================================================
# INPUT SANITISATION TESTS
# ============================================================

class InputSanitisationTests(APITestCase):

    def setUp(self):
        self.admin_group = Group.objects.get_or_create(name="ADMIN")[0]
        self.admin = User.objects.create_user(
            username="admin", password="adminpass"
        )
        self.admin.groups.add(self.admin_group)

    def test_xss_script_tag_stripped_from_title(self):
        jwt_auth(self.client, self.admin)
        response = self.client.post(reverse("incident_api"), {
            "title": "<script>alert('xss')</script>Server Down",
            "description": "Valid description",
            "priority": "HIGH",
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertNotIn("<script>", response.data["title"])
        self.assertIn("Server Down", response.data["title"])

    def test_html_tags_stripped_from_description(self):
        jwt_auth(self.client, self.admin)
        response = self.client.post(reverse("incident_api"), {
            "title": "Valid Title",
            "description": "<b>Bold</b> description with <img src=x onerror=alert(1)>",
            "priority": "LOW",
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertNotIn("<b>", response.data["description"])
        self.assertNotIn("<img", response.data["description"])

    def test_empty_title_after_stripping_rejected(self):
        jwt_auth(self.client, self.admin)
        response = self.client.post(reverse("incident_api"), {
            "title": "<script></script>",
            "description": "Valid description",
            "priority": "LOW",
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_priority_rejected(self):
        jwt_auth(self.client, self.admin)
        response = self.client.post(reverse("incident_api"), {
            "title": "Valid Title",
            "description": "Valid description",
            "priority": "EXTREME",
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


# ============================================================
# BACKEND SEARCH TESTS
# ============================================================

class BackendSearchTests(APITestCase):

    def setUp(self):
        self.admin_group = Group.objects.get_or_create(name="ADMIN")[0]
        self.admin = User.objects.create_user(
            username="admin", password="adminpass"
        )
        self.admin.groups.add(self.admin_group)

        Incident.objects.create(
            title="Database Connection Error",
            description="Cannot connect to DB",
            priority="HIGH",
            status="OPEN",
            reported_by=self.admin,
            assigned_to=self.admin,
        )
        Incident.objects.create(
            title="Frontend Build Failed",
            description="React build error",
            priority="LOW",
            status="OPEN",
            reported_by=self.admin,
            assigned_to=self.admin,
        )
        Incident.objects.create(
            title="Server Memory Leak",
            description="High memory usage",
            priority="CRITICAL",
            status="OPEN",
            reported_by=self.admin,
            assigned_to=self.admin,
        )

    def test_search_returns_matching_incidents(self):
        jwt_auth(self.client, self.admin)
        response = self.client.get(reverse("incident_api") + "?search=Database")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertIn("Database", response.data["results"][0]["title"])

    def test_search_is_case_insensitive(self):
        jwt_auth(self.client, self.admin)
        response = self.client.get(reverse("incident_api") + "?search=frontend")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

    def test_search_no_results(self):
        jwt_auth(self.client, self.admin)
        response = self.client.get(reverse("incident_api") + "?search=nonexistentquery123")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 0)

    def test_empty_search_returns_all(self):
        jwt_auth(self.client, self.admin)
        response = self.client.get(reverse("incident_api") + "?search=")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], Incident.objects.count())


# ============================================================
# INCIDENT STATUS TESTS
# ============================================================

class IncidentStatusTests(APITestCase):

    def setUp(self):
        self.admin_group = Group.objects.get_or_create(name="ADMIN")[0]

        self.admin = User.objects.create_user(
            username="admin", password="adminpass"
        )
        self.admin.groups.add(self.admin_group)

        self.employee = User.objects.create_user(
            username="employee", password="employeepass"
        )

        self.other = User.objects.create_user(
            username="other", password="otherpass"
        )

        self.incident = Incident.objects.create(
            title="Test Incident",
            description="Desc",
            priority="HIGH",
            status="OPEN",
            reported_by=self.employee,
            assigned_to=self.employee,
        )

    def test_assigned_employee_can_update_status(self):
        jwt_auth(self.client, self.employee)
        url = reverse("update_incident_status", args=[self.incident.id])
        response = self.client.patch(url, {"status": "IN_PROGRESS"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.incident.refresh_from_db()
        self.assertEqual(self.incident.status, "IN_PROGRESS")

    def test_unassigned_employee_cannot_update_status(self):
        jwt_auth(self.client, self.other)
        url = reverse("update_incident_status", args=[self.incident.id])
        response = self.client.patch(url, {"status": "RESOLVED"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_update_any_status(self):
        jwt_auth(self.client, self.admin)
        url = reverse("update_incident_status", args=[self.incident.id])
        response = self.client.patch(url, {"status": "CLOSED"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_invalid_status_rejected(self):
        jwt_auth(self.client, self.admin)
        url = reverse("update_incident_status", args=[self.incident.id])
        response = self.client.patch(url, {"status": "INVALID"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


# ============================================================
# ATTACHMENT TESTS
# ============================================================

class AttachmentTests(APITestCase):

    def setUp(self):
        self.admin_group = Group.objects.get_or_create(name="ADMIN")[0]

        self.admin = User.objects.create_user(
            username="admin", password="adminpass"
        )
        self.admin.groups.add(self.admin_group)

        self.employee = User.objects.create_user(
            username="employee", password="employeepass"
        )

        self.other = User.objects.create_user(
            username="other", password="otherpass"
        )

        jwt_auth(self.client, self.admin)

        response = self.client.post(reverse("incident_api"), {
            "title": "Attachment Test Incident",
            "description": "For attachment tests",
            "priority": "HIGH",
            "assigned_to": self.employee.username,
        }, format="json")

        self.incident_id = response.data["id"]

    def test_admin_can_upload_attachment(self):
        jwt_auth(self.client, self.admin)
        file = SimpleUploadedFile("test.txt", b"Test content", content_type="text/plain")
        response = self.client.post(
            f"/api/incidents/{self.incident_id}/attachments/upload/",
            {"file": file}
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["original_filename"], "test.txt")

    def test_assigned_employee_can_upload_attachment(self):
        jwt_auth(self.client, self.employee)
        file = SimpleUploadedFile("emp.txt", b"Employee content", content_type="text/plain")
        response = self.client.post(
            f"/api/incidents/{self.incident_id}/attachments/upload/",
            {"file": file}
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_unassigned_employee_cannot_upload_attachment(self):
        jwt_auth(self.client, self.other)
        file = SimpleUploadedFile("other.txt", b"Unauthorized", content_type="text/plain")
        response = self.client.post(
            f"/api/incidents/{self.incident_id}/attachments/upload/",
            {"file": file}
        )
        self.assertIn(response.status_code, [
            status.HTTP_403_FORBIDDEN,
            status.HTTP_401_UNAUTHORIZED
        ])

    def test_admin_can_delete_attachment(self):
        jwt_auth(self.client, self.admin)
        file = SimpleUploadedFile("delete_me.txt", b"Delete this", content_type="text/plain")
        upload = self.client.post(
            f"/api/incidents/{self.incident_id}/attachments/upload/",
            {"file": file}
        )
        attachment_id = upload.data["id"]
        response = self.client.delete(
            f"/api/incidents/{self.incident_id}/attachments/{attachment_id}/delete/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_employee_cannot_delete_attachment(self):
        jwt_auth(self.client, self.admin)
        file = SimpleUploadedFile("nodelete.txt", b"No delete", content_type="text/plain")
        upload = self.client.post(
            f"/api/incidents/{self.incident_id}/attachments/upload/",
            {"file": file}
        )
        attachment_id = upload.data["id"]
        jwt_auth(self.client, self.employee)
        response = self.client.delete(
            f"/api/incidents/{self.incident_id}/attachments/{attachment_id}/delete/"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_disallowed_file_type_rejected(self):
        jwt_auth(self.client, self.admin)
        file = SimpleUploadedFile("malware.exe", b"MZ malicious", content_type="application/x-msdownload")
        response = self.client.post(
            f"/api/incidents/{self.incident_id}/attachments/upload/",
            {"file": file}
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_oversized_file_rejected(self):
        jwt_auth(self.client, self.admin)
        big_file = SimpleUploadedFile(
            "big.txt",
            b"x" * (11 * 1024 * 1024),  # 11MB
            content_type="text/plain"
        )
        response = self.client.post(
            f"/api/incidents/{self.incident_id}/attachments/upload/",
            {"file": big_file}
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


# ============================================================
# WEBSOCKET CONSUMER TESTS
# ============================================================

@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
class WebSocketIncidentConsumerTest(TransactionTestCase):

    def setUp(self):
        self.admin_group = Group.objects.get_or_create(name="ADMIN")[0]
        self.user = User.objects.create_user(
            username="wsuser", password="wspass"
        )
        self.user.groups.add(self.admin_group)

    async def test_connect_with_valid_token(self):
        token = await database_sync_to_async(get_token)(self.user)
        communicator = WebsocketCommunicator(
            application,
            f"/ws/incidents/?token={token}"
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        # Should receive initial incident_update on connect
        message = await communicator.receive_json_from()
        self.assertEqual(message["type"], "incident_update")
        self.assertIn("incidents", message)

        await communicator.disconnect()

    async def test_connect_without_token_rejected(self):
        communicator = WebsocketCommunicator(
            application,
            "/ws/incidents/"
        )
        connected, code = await communicator.connect()
        self.assertFalse(connected)
        self.assertEqual(code, 4001)

    async def test_connect_with_invalid_token_rejected(self):
        communicator = WebsocketCommunicator(
            application,
            "/ws/incidents/?token=totallyinvalidtoken"
        )
        connected, code = await communicator.connect()
        self.assertFalse(connected)
        self.assertEqual(code, 4001)

    async def test_refresh_message_returns_incidents(self):
        token = await database_sync_to_async(get_token)(self.user)
        communicator = WebsocketCommunicator(
            application,
            f"/ws/incidents/?token={token}"
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        # Consume the initial message
        await communicator.receive_json_from()

        # Send refresh
        await communicator.send_json_to({"type": "refresh"})
        response = await communicator.receive_json_from()
        self.assertEqual(response["type"], "incident_update")
        self.assertIn("incidents", response)

        await communicator.disconnect()


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
class WebSocketNotificationConsumerTest(TransactionTestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username="notifuser", password="notifpass"
        )

    async def test_connect_with_valid_token(self):
        token = await database_sync_to_async(get_token)(self.user)
        communicator = WebsocketCommunicator(
            application,
            f"/ws/notifications/?token={token}"
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        # Should receive initial notification_update on connect
        message = await communicator.receive_json_from()
        self.assertEqual(message["type"], "notification_update")
        self.assertIn("notifications", message)
        self.assertIn("unread_count", message)

        await communicator.disconnect()

    async def test_connect_without_token_rejected(self):
        communicator = WebsocketCommunicator(
            application,
            "/ws/notifications/"
        )
        connected, code = await communicator.connect()
        self.assertFalse(connected)
        self.assertEqual(code, 4001)


# ============================================================
# FULL LIFECYCLE INTEGRATION TEST
# ============================================================

class IncidentLifecycleTest(APITestCase):

    def setUp(self):
        self.admin_group = Group.objects.get_or_create(name="ADMIN")[0]

        self.admin = User.objects.create_user(
            username="admin", password="adminpass"
        )
        self.admin.groups.add(self.admin_group)

        self.employee = User.objects.create_user(
            username="employee", password="employeepass"
        )

    def test_full_incident_lifecycle(self):
        jwt_auth(self.client, self.admin)
        create = self.client.post(reverse("incident_api"), {
            "title": "Server Down",
            "description": "Production server not responding",
            "priority": "HIGH",
            "assigned_to": "employee",
        }, format="json")
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        incident_id = create.data["id"]

        jwt_auth(self.client, self.employee)
        url = reverse("update_incident_status", args=[incident_id])
        r1 = self.client.patch(url, {"status": "IN_PROGRESS"}, format="json")
        self.assertEqual(r1.status_code, status.HTTP_200_OK)

        r2 = self.client.patch(url, {"status": "RESOLVED"}, format="json")
        self.assertEqual(r2.status_code, status.HTTP_200_OK)

        jwt_auth(self.client, self.admin)
        r3 = self.client.patch(url, {"status": "CLOSED"}, format="json")
        self.assertEqual(r3.status_code, status.HTTP_200_OK)

        incident = Incident.objects.get(id=incident_id)
        self.assertEqual(incident.status, "CLOSED")
