from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile


class IncidentIntegrationTest(APITestCase):

    def setUp(self):
        # Create users
        self.admin = User.objects.create_user(
            username="admin",
            password="adminpass",
            is_staff=True
        )

        self.employee = User.objects.create_user(
            username="emp",
            password="emppass"
        )

        self.other_employee = User.objects.create_user(
            username="other",
            password="otherpass"
        )

        # Get admin JWT token
        response = self.client.post("/api/token/", {
            "username": "admin",
            "password": "adminpass"
        })
        self.admin_token = response.data["access"]

        # Authenticate as admin
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {self.admin_token}"
        )

        # Create incident
        incident_response = self.client.post("/api/incidents/", {
            "title": "Server Down",
            "description": "Production issue",
            "priority": "HIGH"
        })

        self.assertEqual(
            incident_response.status_code,
            status.HTTP_201_CREATED
        )

        self.incident_id = incident_response.data["id"]

    # ============================================================
    # INCIDENT ASSIGNMENT TEST
    # ============================================================

    def test_admin_can_assign_incident(self):
        response = self.client.patch(
            f"/api/incidents/{self.incident_id}/assign/",
            {"assigned_to": self.employee.username}
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    # ============================================================
    # ADMIN UPLOAD + DELETE ATTACHMENT
    # ============================================================

    def test_admin_can_upload_and_delete_attachment(self):
        file = SimpleUploadedFile(
            "test.txt",
            b"Test file content",
            content_type="text/plain"
        )

        # Upload
        upload_response = self.client.post(
            f"/api/incidents/{self.incident_id}/attachments/upload/",
            {"file": file}
        )

        self.assertEqual(
            upload_response.status_code,
            status.HTTP_201_CREATED
        )

        attachment_id = upload_response.data["id"]

        # Delete
        delete_response = self.client.delete(
            f"/api/incidents/{self.incident_id}/attachments/{attachment_id}/delete/"
        )

        self.assertEqual(
            delete_response.status_code,
            status.HTTP_204_NO_CONTENT
        )

    # ============================================================
    # ASSIGNED EMPLOYEE CAN UPLOAD
    # ============================================================

    def test_assigned_employee_can_upload(self):
        # Assign incident to employee first
        self.client.patch(
            f"/api/incidents/{self.incident_id}/assign/",
            {"assigned_to": self.employee.username}
        )

        # Login as employee
        response = self.client.post("/api/token/", {
            "username": "emp",
            "password": "emppass"
        })

        employee_token = response.data["access"]

        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {employee_token}"
        )

        file = SimpleUploadedFile(
            "employee.txt",
            b"Employee upload",
            content_type="text/plain"
        )

        upload_response = self.client.post(
            f"/api/incidents/{self.incident_id}/attachments/upload/",
            {"file": file}
        )

        self.assertEqual(
            upload_response.status_code,
            status.HTTP_201_CREATED
        )

    # ============================================================
    # UNASSIGNED EMPLOYEE CANNOT UPLOAD
    # ============================================================

    def test_unassigned_employee_cannot_upload(self):
        # Login as other employee
        response = self.client.post("/api/token/", {
            "username": "other",
            "password": "otherpass"
        })

        other_token = response.data["access"]

        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {other_token}"
        )

        file = SimpleUploadedFile(
            "unauthorized.txt",
            b"Should fail",
            content_type="text/plain"
        )

        upload_response = self.client.post(
            f"/api/incidents/{self.incident_id}/attachments/upload/",
            {"file": file}
        )

        self.assertIn(
            upload_response.status_code,
            [status.HTTP_403_FORBIDDEN, status.HTTP_401_UNAUTHORIZED]
        )
