from django.urls import reverse
from django.contrib.auth.models import User, Group
from rest_framework.test import APITestCase
from rest_framework import status
from .models import Incident


class IncidentWorkflowTests(APITestCase):

    def setUp(self):
        # Create groups
        self.admin_group = Group.objects.create(name="ADMIN")
        self.employee_group = Group.objects.create(name="EMPLOYEE")

        # Create users
        self.admin = User.objects.create_user(
            username="admin",
            password="adminpass"
        )
        self.admin.groups.add(self.admin_group)

        self.employee = User.objects.create_user(
            username="employee",
            password="employeepass"
        )
        self.employee.groups.add(self.employee_group)

    def test_full_incident_lifecycle(self):

        # ---------- ADMIN CREATES INCIDENT ----------
        self.client.force_authenticate(user=self.admin)

        create_response = self.client.post(
            reverse("incident_api"),
            {
                "title": "Server Down",
                "description": "Production server not responding",
                "priority": "HIGH",
                "assigned_to": "employee",
            },
            format="json",
        )

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)

        incident_id = create_response.data["id"]

        # ---------- EMPLOYEE WORKS ON INCIDENT ----------
        self.client.force_authenticate(user=self.employee)

        update_url = reverse("update_incident_status", args=[incident_id])

        in_progress = self.client.patch(
            update_url,
            {"status": "IN_PROGRESS"},
            format="json",
        )

        self.assertEqual(in_progress.status_code, status.HTTP_200_OK)

        resolved = self.client.patch(
            update_url,
            {"status": "RESOLVED"},
            format="json",
        )

        self.assertEqual(resolved.status_code, status.HTTP_200_OK)

        # ---------- ADMIN CLOSES INCIDENT ----------
        self.client.force_authenticate(user=self.admin)

        closed = self.client.patch(
            update_url,
            {"status": "CLOSED"},
            format="json",
        )

        self.assertEqual(closed.status_code, status.HTTP_200_OK)

        # ---------- VERIFY FINAL STATE ----------
        incident = Incident.objects.get(id=incident_id)
        self.assertEqual(incident.status, "CLOSED")
