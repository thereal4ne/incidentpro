"""
Extended tests to improve coverage from ~65% to 80%+.

Covers:
  - Escalation API
  - Reassignment API
  - Notification APIs (list, mark read, mark all read, unread count)
  - Postmortem API (GET, POST, PATCH)
  - Incident detail API
  - Activity log API
  - Comments API
  - List users API
  - List / download attachments
  - SLA auto-set & check_and_escalate model logic
  - Change password API (accounts)
  - Create employee API (accounts)
  - List employees API (accounts)
  - Toggle employee status API (accounts)
"""

from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth.models import User, Group
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from incidents.models import (
    Incident, Notification, Postmortem, Comment, Activity, Attachment,
)


# ============================================================
# HELPERS
# ============================================================

def jwt_auth(client, user):
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")


def make_admin_and_employee():
    """Create an admin (via Group) and a plain employee."""
    admin_group, _ = Group.objects.get_or_create(name="ADMIN")
    admin = User.objects.create_user(username="adm", password="adminpass1")
    admin.groups.add(admin_group)
    employee = User.objects.create_user(username="emp", password="emppass12")
    return admin, employee


def create_incident(admin, employee, **overrides):
    """Directly create an Incident in the DB with sensible defaults."""
    defaults = dict(
        title="Test Incident",
        description="Something went wrong",
        priority="HIGH",
        status="OPEN",
        reported_by=employee,
        assigned_to=employee,
    )
    defaults.update(overrides)
    return Incident.objects.create(**defaults)


# ============================================================
# ESCALATION TESTS
# ============================================================

class EscalationTests(APITestCase):

    def setUp(self):
        self.admin, self.employee = make_admin_and_employee()
        self.incident = create_incident(self.admin, self.employee)

    def test_assigned_employee_can_escalate(self):
        jwt_auth(self.client, self.employee)
        url = reverse("escalate_incident", args=[self.incident.pk])
        resp = self.client.post(url, {"reason": "Need admin help"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.incident.refresh_from_db()
        self.assertTrue(self.incident.is_escalated)
        self.assertEqual(self.incident.status, "ESCALATED")
        self.assertEqual(self.incident.escalation_reason, "Need admin help")

    def test_unassigned_employee_cannot_escalate(self):
        other = User.objects.create_user(username="other", password="otherpass1")
        jwt_auth(self.client, other)
        url = reverse("escalate_incident", args=[self.incident.pk])
        resp = self.client.post(url, {"reason": "Trying"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_cannot_escalate(self):
        # Assign the incident to the admin so the first check passes
        self.incident.assigned_to = self.admin
        self.incident.save(update_fields=["assigned_to"])
        jwt_auth(self.client, self.admin)
        url = reverse("escalate_incident", args=[self.incident.pk])
        resp = self.client.post(url, {"reason": "Admin trying"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_cannot_escalate_resolved_incident(self):
        self.incident.status = "RESOLVED"
        self.incident.save(update_fields=["status"])
        jwt_auth(self.client, self.employee)
        url = reverse("escalate_incident", args=[self.incident.pk])
        resp = self.client.post(url, {"reason": "Too late"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_escalation_without_reason(self):
        jwt_auth(self.client, self.employee)
        url = reverse("escalate_incident", args=[self.incident.pk])
        resp = self.client.post(url, {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.incident.refresh_from_db()
        self.assertIsNone(self.incident.escalation_reason)

    @patch("incidents.views.notify_escalation_to_admins.delay")
    @patch("incidents.views.notify_escalation_to_admins.apply")
    def test_escalation_celery_failure_fallback(self, mock_apply, mock_delay):
        mock_delay.side_effect = Exception("Broker connection refused")

        jwt_auth(self.client, self.employee)
        url = reverse("escalate_incident", args=[self.incident.pk])
        resp = self.client.post(url, {"reason": "Help needed"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        mock_delay.assert_called_once_with(self.incident.id, self.employee.username, "Help needed")
        mock_apply.assert_called_once_with(args=[self.incident.pk, self.employee.username, "Help needed"])



# ============================================================
# REASSIGNMENT TESTS
# ============================================================

class ReassignmentTests(APITestCase):

    def setUp(self):
        self.admin, self.employee = make_admin_and_employee()
        self.employee2 = User.objects.create_user(username="emp2", password="emp2pass1")
        self.incident = create_incident(self.admin, self.employee)

    def test_admin_can_reassign(self):
        jwt_auth(self.client, self.admin)
        url = reverse("reassign_incident", args=[self.incident.pk])
        resp = self.client.patch(url, {"assigned_to": "emp2"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.incident.refresh_from_db()
        self.assertEqual(self.incident.assigned_to, self.employee2)

    def test_employee_cannot_reassign(self):
        jwt_auth(self.client, self.employee)
        url = reverse("reassign_incident", args=[self.incident.pk])
        resp = self.client.patch(url, {"assigned_to": "emp2"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_reassign_missing_assigned_to(self):
        jwt_auth(self.client, self.admin)
        url = reverse("reassign_incident", args=[self.incident.pk])
        resp = self.client.patch(url, {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reassign_nonexistent_user(self):
        jwt_auth(self.client, self.admin)
        url = reverse("reassign_incident", args=[self.incident.pk])
        resp = self.client.patch(url, {"assigned_to": "ghost"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reassign_deescalates_escalated_incident(self):
        self.incident.status = "ESCALATED"
        self.incident.is_escalated = True
        self.incident.save(update_fields=["status", "is_escalated"])
        jwt_auth(self.client, self.admin)
        url = reverse("reassign_incident", args=[self.incident.pk])
        resp = self.client.patch(url, {"assigned_to": "emp2"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.incident.refresh_from_db()
        self.assertEqual(self.incident.status, "IN_PROGRESS")
        self.assertFalse(self.incident.is_escalated)


# ============================================================
# NOTIFICATION TESTS
# ============================================================

class NotificationTests(APITestCase):

    def setUp(self):
        self.admin, self.employee = make_admin_and_employee()
        self.incident = create_incident(self.admin, self.employee)

        # Create some notifications for the employee
        for i in range(3):
            Notification.objects.create(
                recipient=self.employee,
                incident=self.incident,
                notif_type="incident_assigned",
                title=f"Notification {i}",
                message=f"Message {i}",
                is_read=False,
            )

    def test_notification_list(self):
        jwt_auth(self.client, self.employee)
        url = reverse("notification-list")
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["notifications"]), 3)
        self.assertEqual(resp.data["unread_count"], 3)

    def test_notification_unread_count(self):
        jwt_auth(self.client, self.employee)
        url = reverse("notification-unread-count")
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["unread_count"], 3)

    def test_notification_mark_read(self):
        notif = Notification.objects.filter(recipient=self.employee).first()
        jwt_auth(self.client, self.employee)
        url = reverse("notification-mark-read", args=[notif.pk])
        resp = self.client.patch(url, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        notif.refresh_from_db()
        self.assertTrue(notif.is_read)

    def test_notification_mark_read_not_found(self):
        jwt_auth(self.client, self.employee)
        url = reverse("notification-mark-read", args=[99999])
        resp = self.client.patch(url, format="json")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_notification_mark_all_read(self):
        jwt_auth(self.client, self.employee)
        url = reverse("notification-mark-all-read")
        resp = self.client.post(url, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["marked_read"], 3)
        self.assertEqual(
            Notification.objects.filter(recipient=self.employee, is_read=False).count(),
            0,
        )

    def test_other_user_cannot_see_notifications(self):
        jwt_auth(self.client, self.admin)
        url = reverse("notification-list")
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # Admin has no notifications created
        self.assertEqual(len(resp.data["notifications"]), 0)


# ============================================================
# POSTMORTEM TESTS
# ============================================================

class PostmortemTests(APITestCase):

    def setUp(self):
        self.admin, self.employee = make_admin_and_employee()
        self.incident = create_incident(
            self.admin, self.employee, status="RESOLVED"
        )

    def test_admin_can_create_postmortem(self):
        jwt_auth(self.client, self.admin)
        url = reverse("incident_postmortem", args=[self.incident.pk])
        data = {
            "root_cause": "Bad deploy",
            "impact": "Downtime 2h",
            "resolution": "Rolled back",
            "prevention": "Add canary deploy",
        }
        resp = self.client.post(url, data, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["root_cause"], "Bad deploy")

    def test_employee_cannot_create_postmortem(self):
        jwt_auth(self.client, self.employee)
        url = reverse("incident_postmortem", args=[self.incident.pk])
        resp = self.client.post(url, {"root_cause": "test"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_cannot_create_postmortem_for_open_incident(self):
        self.incident.status = "OPEN"
        self.incident.save(update_fields=["status"])
        jwt_auth(self.client, self.admin)
        url = reverse("incident_postmortem", args=[self.incident.pk])
        resp = self.client.post(url, {"root_cause": "test"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_create_duplicate_postmortem(self):
        Postmortem.objects.create(
            incident=self.incident,
            root_cause="Original",
            impact="Minor",
            resolution="Fixed",
            prevention="Monitor",
            author=self.admin,
        )
        jwt_auth(self.client, self.admin)
        url = reverse("incident_postmortem", args=[self.incident.pk])
        resp = self.client.post(url, {"root_cause": "Duplicate"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_can_patch_postmortem(self):
        Postmortem.objects.create(
            incident=self.incident,
            root_cause="Original",
            impact="Minor",
            resolution="Fixed",
            prevention="Monitor",
            author=self.admin,
        )
        jwt_auth(self.client, self.admin)
        url = reverse("incident_postmortem", args=[self.incident.pk])
        resp = self.client.patch(url, {"root_cause": "Updated cause"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["root_cause"], "Updated cause")

    def test_patch_nonexistent_postmortem_returns_404(self):
        jwt_auth(self.client, self.admin)
        url = reverse("incident_postmortem", args=[self.incident.pk])
        resp = self.client.patch(url, {"root_cause": "No PM"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_get_postmortem(self):
        Postmortem.objects.create(
            incident=self.incident,
            root_cause="Root",
            impact="Big",
            resolution="Fixed it",
            prevention="Do better",
            author=self.admin,
        )
        jwt_auth(self.client, self.employee)
        url = reverse("incident_postmortem", args=[self.incident.pk])
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["root_cause"], "Root")

    def test_get_postmortem_when_none_exists(self):
        jwt_auth(self.client, self.employee)
        url = reverse("incident_postmortem", args=[self.incident.pk])
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIsNone(resp.data)


# ============================================================
# INCIDENT DETAIL TESTS
# ============================================================

class IncidentDetailTests(APITestCase):

    def setUp(self):
        self.admin, self.employee = make_admin_and_employee()
        self.incident = create_incident(self.admin, self.employee)

    def test_admin_can_view_incident_detail(self):
        jwt_auth(self.client, self.admin)
        url = reverse("incident_detail", args=[self.incident.pk])
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["title"], "Test Incident")

    def test_assigned_employee_can_view_detail(self):
        jwt_auth(self.client, self.employee)
        url = reverse("incident_detail", args=[self.incident.pk])
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_unrelated_employee_cannot_view_detail(self):
        other = User.objects.create_user(username="other2", password="otherpass1")
        jwt_auth(self.client, other)
        url = reverse("incident_detail", args=[self.incident.pk])
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_incident_detail_not_found(self):
        jwt_auth(self.client, self.admin)
        url = reverse("incident_detail", args=[99999])
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


# ============================================================
# ACTIVITY LOG TESTS
# ============================================================

class ActivityLogTests(APITestCase):

    def setUp(self):
        self.admin, self.employee = make_admin_and_employee()
        self.incident = create_incident(self.admin, self.employee)
        Activity.objects.create(
            incident=self.incident, user=self.employee, action="Created incident"
        )
        Activity.objects.create(
            incident=self.incident, user=None, action="System auto-escalated"
        )

    def test_admin_can_view_activities(self):
        jwt_auth(self.client, self.admin)
        url = reverse("incident_activities", args=[self.incident.pk])
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 2)

    def test_system_activity_shows_system_user(self):
        jwt_auth(self.client, self.admin)
        url = reverse("incident_activities", args=[self.incident.pk])
        resp = self.client.get(url)
        system_entry = [a for a in resp.data if a["user"] == "System"]
        self.assertEqual(len(system_entry), 1)

    def test_unrelated_employee_cannot_view_activities(self):
        other = User.objects.create_user(username="other3", password="otherpass1")
        jwt_auth(self.client, other)
        url = reverse("incident_activities", args=[self.incident.pk])
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


# ============================================================
# COMMENTS API TESTS
# ============================================================

class CommentTests(APITestCase):

    def setUp(self):
        self.admin, self.employee = make_admin_and_employee()
        self.incident = create_incident(self.admin, self.employee)

    def test_assigned_employee_can_post_comment(self):
        jwt_auth(self.client, self.employee)
        url = reverse("incident_comments", args=[self.incident.pk])
        resp = self.client.post(url, {"text": "Working on it"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["text"], "Working on it")

    def test_admin_can_post_comment(self):
        jwt_auth(self.client, self.admin)
        url = reverse("incident_comments", args=[self.incident.pk])
        resp = self.client.post(url, {"text": "Admin note"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_can_get_comments(self):
        Comment.objects.create(
            incident=self.incident, author=self.employee, text="First comment"
        )
        jwt_auth(self.client, self.employee)
        url = reverse("incident_comments", args=[self.incident.pk])
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)

    def test_empty_comment_rejected(self):
        jwt_auth(self.client, self.employee)
        url = reverse("incident_comments", args=[self.incident.pk])
        resp = self.client.post(url, {"text": "   "}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unrelated_employee_cannot_comment(self):
        other = User.objects.create_user(username="other4", password="otherpass1")
        jwt_auth(self.client, other)
        url = reverse("incident_comments", args=[self.incident.pk])
        resp = self.client.post(url, {"text": "Not allowed"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


# ============================================================
# LIST USERS TESTS
# ============================================================

class ListUsersTests(APITestCase):

    def setUp(self):
        self.admin, self.employee = make_admin_and_employee()

    def test_admin_can_list_users(self):
        jwt_auth(self.client, self.admin)
        url = reverse("list_users")
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(resp.data), 2)

    def test_employee_cannot_list_users(self):
        jwt_auth(self.client, self.employee)
        url = reverse("list_users")
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


# ============================================================
# LIST ATTACHMENTS TESTS
# ============================================================

class ListAttachmentTests(APITestCase):

    def setUp(self):
        self.admin, self.employee = make_admin_and_employee()
        self.incident = create_incident(self.admin, self.employee)

    def test_admin_can_list_attachments(self):
        jwt_auth(self.client, self.admin)
        url = reverse("list_attachments", args=[self.incident.pk])
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIsInstance(resp.data, list)

    def test_unrelated_employee_cannot_list_attachments(self):
        other = User.objects.create_user(username="other5", password="otherpass1")
        jwt_auth(self.client, other)
        url = reverse("list_attachments", args=[self.incident.pk])
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


# ============================================================
# SLA MODEL LOGIC TESTS
# ============================================================

class SLAModelTests(TestCase):

    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="sla_admin", password="adminpass1", email="a@a.com"
        )
        self.employee = User.objects.create_user(
            username="sla_emp", password="emppass12"
        )

    def test_sla_deadline_auto_set_on_create(self):
        incident = Incident.objects.create(
            title="SLA Test",
            description="Check SLA",
            priority="CRITICAL",
            reported_by=self.employee,
        )
        self.assertIsNotNone(incident.due_at)

    def test_check_and_escalate_marks_overdue(self):
        incident = Incident.objects.create(
            title="Overdue Test",
            description="Should become overdue",
            priority="CRITICAL",
            reported_by=self.employee,
            assigned_to=self.employee,
            due_at=timezone.now() - timedelta(hours=1),  # Already past due
        )
        # It shouldn't be overdue yet — check_and_escalate needs to be called
        self.assertFalse(incident.is_overdue)

        with patch("django.core.mail.send_mail"):
            incident.check_and_escalate()

        incident.refresh_from_db()
        self.assertTrue(incident.is_overdue)
        self.assertTrue(incident.is_escalated)
        self.assertEqual(incident.priority, "CRITICAL")

    def test_check_and_escalate_skips_resolved(self):
        incident = Incident.objects.create(
            title="Resolved Test",
            description="Should not escalate",
            priority="HIGH",
            status="RESOLVED",
            reported_by=self.employee,
            due_at=timezone.now() - timedelta(hours=1),
        )
        incident.check_and_escalate()
        incident.refresh_from_db()
        self.assertFalse(incident.is_overdue)

    def test_check_and_escalate_skips_already_escalated(self):
        incident = Incident.objects.create(
            title="Already Escalated",
            description="Should not escalate twice",
            priority="HIGH",
            reported_by=self.employee,
            due_at=timezone.now() - timedelta(hours=1),
            is_overdue=True,
            is_escalated=True,
        )
        old_priority = incident.priority
        incident.check_and_escalate()
        incident.refresh_from_db()
        self.assertEqual(incident.priority, old_priority)

    def test_check_and_escalate_no_due_at(self):
        incident = Incident.objects.create(
            title="No Deadline",
            description="No due_at set",
            priority="LOW",
            reported_by=self.employee,
        )
        # Force due_at to None
        Incident.objects.filter(pk=incident.pk).update(due_at=None)
        incident.refresh_from_db()
        incident.check_and_escalate()
        incident.refresh_from_db()
        self.assertFalse(incident.is_overdue)

    def test_sla_deadline_varies_by_priority(self):
        for priority in ["LOW", "MEDIUM", "HIGH", "CRITICAL"]:
            incident = Incident(priority=priority)
            deadline = incident.sla_deadline()
            self.assertIsNotNone(deadline)
            self.assertGreater(deadline, timezone.now())


# ============================================================
# ACCOUNTS: CHANGE PASSWORD TESTS
# ============================================================

class ChangePasswordTests(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(username="pwuser", password="oldpass123")

    def test_change_password_success(self):
        jwt_auth(self.client, self.user)
        url = reverse("change_password")
        resp = self.client.post(url, {
            "current_password": "oldpass123",
            "new_password": "newpass1234",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("newpass1234"))

    def test_change_password_wrong_current(self):
        jwt_auth(self.client, self.user)
        url = reverse("change_password")
        resp = self.client.post(url, {
            "current_password": "wrongpass",
            "new_password": "newpass1234",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_change_password_too_short(self):
        jwt_auth(self.client, self.user)
        url = reverse("change_password")
        resp = self.client.post(url, {
            "current_password": "oldpass123",
            "new_password": "short",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_change_password_missing_fields(self):
        jwt_auth(self.client, self.user)
        url = reverse("change_password")
        resp = self.client.post(url, {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


# ============================================================
# ACCOUNTS: EMPLOYEE MANAGEMENT TESTS
# ============================================================

class EmployeeManagementTests(APITestCase):

    def setUp(self):
        self.admin, self.employee = make_admin_and_employee()

    @patch("accounts.views.send_mail", side_effect=Exception("SMTP down"))
    def test_create_employee(self, mock_mail):
        jwt_auth(self.client, self.admin)
        url = reverse("create_employee")
        resp = self.client.post(url, {
            "username": "newguy",
            "email": "new@example.com",
            "first_name": "New",
            "last_name": "Guy",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(username="newguy").exists())
        # Since email fails, temp_password should be returned
        self.assertIsNotNone(resp.data.get("temp_password"))

    def test_employee_cannot_create_employee(self):
        jwt_auth(self.client, self.employee)
        url = reverse("create_employee")
        resp = self.client.post(url, {
            "username": "sneaky",
            "email": "sneak@example.com",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_employee_duplicate_username(self):
        jwt_auth(self.client, self.admin)
        url = reverse("create_employee")
        resp = self.client.post(url, {
            "username": "emp",  # already exists
            "email": "unique@example.com",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_employee_duplicate_email(self):
        self.employee.email = "taken@example.com"
        self.employee.save()
        jwt_auth(self.client, self.admin)
        url = reverse("create_employee")
        resp = self.client.post(url, {
            "username": "unique_user",
            "email": "taken@example.com",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_employee_missing_username(self):
        jwt_auth(self.client, self.admin)
        url = reverse("create_employee")
        resp = self.client.post(url, {"email": "a@b.com"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_employee_missing_email(self):
        jwt_auth(self.client, self.admin)
        url = reverse("create_employee")
        resp = self.client.post(url, {"username": "noemail"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_list_employees(self):
        jwt_auth(self.client, self.admin)
        url = reverse("list_employees")
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(resp.data), 2)

    def test_employee_cannot_list_employees(self):
        jwt_auth(self.client, self.employee)
        url = reverse("list_employees")
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_toggle_employee_status(self):
        jwt_auth(self.client, self.admin)
        url = reverse("toggle_employee_status", args=[self.employee.pk])
        resp = self.client.patch(url, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.employee.refresh_from_db()
        self.assertFalse(self.employee.is_active)

        # Toggle back
        resp = self.client.patch(url, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.employee.refresh_from_db()
        self.assertTrue(self.employee.is_active)

    def test_cannot_deactivate_self(self):
        jwt_auth(self.client, self.admin)
        url = reverse("toggle_employee_status", args=[self.admin.pk])
        resp = self.client.patch(url, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_toggle_nonexistent_user(self):
        jwt_auth(self.client, self.admin)
        url = reverse("toggle_employee_status", args=[99999])
        resp = self.client.patch(url, format="json")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_employee_cannot_toggle(self):
        jwt_auth(self.client, self.employee)
        url = reverse("toggle_employee_status", args=[self.admin.pk])
        resp = self.client.patch(url, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


# ============================================================
# MODEL __str__ REPRESENTATION TESTS
# ============================================================

class ModelStrTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username="struser", password="pass1234")
        self.incident = Incident.objects.create(
            title="StrTest", description="Test", reported_by=self.user
        )

    def test_incident_str(self):
        self.assertEqual(str(self.incident), "StrTest")

    def test_comment_str(self):
        c = Comment.objects.create(
            incident=self.incident, author=self.user, text="Hi"
        )
        self.assertIn("struser", str(c))

    def test_activity_str_with_user(self):
        a = Activity.objects.create(
            incident=self.incident, user=self.user, action="Did something"
        )
        self.assertIn("struser", str(a))

    def test_activity_str_system(self):
        a = Activity.objects.create(
            incident=self.incident, user=None, action="Auto action"
        )
        self.assertIn("System", str(a))

    def test_notification_str(self):
        n = Notification.objects.create(
            recipient=self.user,
            incident=self.incident,
            notif_type="incident_assigned",
            title="Assigned",
            message="You got one",
        )
        self.assertIn("struser", str(n))

    def test_postmortem_str(self):
        pm = Postmortem.objects.create(
            incident=self.incident,
            root_cause="Cause",
            impact="Impact",
            resolution="Res",
            prevention="Prev",
            author=self.user,
        )
        self.assertIn(str(self.incident.id), str(pm))

    def test_attachment_str(self):
        a = Attachment.objects.create(
            incident=self.incident,
            original_filename="report.pdf",
            uploaded_by=self.user,
        )
        self.assertEqual(str(a), "report.pdf")
