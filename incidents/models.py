from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


class Incident(models.Model):

    PRIORITY_CHOICES = [
        ('LOW', 'Low'),
        ('MEDIUM', 'Medium'),
        ('HIGH', 'High'),
        ('CRITICAL', 'Critical'),
    ]

    STATUS_CHOICES = [
        ('OPEN', 'Open'),
        ('IN_PROGRESS', 'In Progress'),
        ('RESOLVED', 'Resolved'),
        ('CLOSED', 'Closed'),
        ('ESCALATED', 'Escalated'),
    ]

    title = models.CharField(max_length=255)
    description = models.TextField()

    priority = models.CharField(
        max_length=10,
        choices=PRIORITY_CHOICES,
        default='LOW'
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='OPEN'
    )

    reported_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reported_incidents'
    )

    assigned_to = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_incidents'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # ===============================
    # SLA FIELDS
    # ===============================
    due_at = models.DateTimeField(null=True, blank=True)
    is_overdue = models.BooleanField(default=False)
    is_escalated = models.BooleanField(default=False)
    escalation_reason = models.TextField(null=True, blank=True)
    escalated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='escalated_incidents'
    )
    escalated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=['status'], name='incident_status_idx'),
            models.Index(fields=['priority'], name='incident_priority_idx'),
            models.Index(fields=['assigned_to'], name='incident_assigned_idx'),
            models.Index(fields=['reported_by'], name='incident_reported_idx'),
            models.Index(fields=['is_overdue'], name='incident_overdue_idx'),
            models.Index(fields=['is_escalated'], name='incident_escalated_idx'),
            models.Index(fields=['created_at'], name='incident_created_idx'),
            models.Index(fields=['-created_at'], name='incident_created_desc_idx'),
        ]

    def __str__(self):
        return self.title

    # ===============================
    # SLA LOGIC
    # ===============================
    def sla_deadline(self):
        sla_mapping = {
            "LOW": 72,
            "MEDIUM": 24,
            "HIGH": 8,
            "CRITICAL": 2,
        }
        hours = sla_mapping.get(self.priority, 24)
        return timezone.now() + timedelta(hours=hours)

    # ===============================
    # AUTO-SET SLA ON CREATION
    # ===============================
    def save(self, *args, **kwargs):
        is_new = not self.pk

        if is_new and not self.due_at:
            self.due_at = self.sla_deadline()

        super().save(*args, **kwargs)

        try:
            if is_new:
                from incidents.tasks import check_single_incident_sla
                check_single_incident_sla.delay(self.id)
        except Exception as e:
            logger.warning("Failed to queue SLA task for incident %s: %s", self.id, e)

    # ===============================
    # SLA CHECK & ESCALATION
    # ===============================
    def check_and_escalate(self):
        from django.contrib.auth.models import User
        from django.core.mail import send_mail
        from django.conf import settings
        from django.db import transaction

        if self.status in ["RESOLVED", "CLOSED"]:
            return

        if not self.due_at:
            return

        send_breach_email = False
        recipients = []

        with transaction.atomic():
            # Lock the row in PostgreSQL to prevent concurrent escalation
            locked = Incident.objects.select_for_update().get(pk=self.pk)

            if locked.status in ["RESOLVED", "CLOSED"]:
                return

            if locked.is_overdue and locked.is_escalated:
                return

            now = timezone.now()
            if not locked.due_at or now <= locked.due_at:
                return

            if not locked.is_overdue:
                locked.is_overdue = True
                Activity.objects.create(
                    incident=locked,
                    user=None,
                    action="SLA deadline passed — Incident marked as overdue"
                )

                if locked.assigned_to and locked.assigned_to.email:
                    recipients.append(locked.assigned_to.email)
                if locked.reported_by and locked.reported_by.email:
                    recipients.append(locked.reported_by.email)
                for admin in User.objects.filter(is_superuser=True):
                    if admin.email and admin.email not in recipients:
                        recipients.append(admin.email)

                send_breach_email = bool(recipients)

            if not locked.is_escalated:
                locked.is_escalated = True
                locked.priority = "CRITICAL"

                admin = User.objects.filter(is_superuser=True).first()
                if admin:
                    locked.assigned_to = admin

                Activity.objects.create(
                    incident=locked,
                    user=None,
                    action="SLA breached — Incident escalated to CRITICAL and reassigned to admin"
                )

            locked.save(update_fields=["is_overdue", "is_escalated", "priority", "assigned_to"])

            self.is_overdue = locked.is_overdue
            self.is_escalated = locked.is_escalated
            self.priority = locked.priority
            self.assigned_to = locked.assigned_to

        if send_breach_email and recipients:
            send_mail(
                subject=f"[IncidentPro] SLA Breached — {self.title}",
                message=f"""
Hello,

This is an automated alert from IncidentPro.

The following incident has breached its SLA deadline:

  Title       : {self.title}
  Priority    : {self.priority}
  Status      : {self.status}
  Assigned To : {self.assigned_to.username if self.assigned_to else "Unassigned"}
  Reported By : {self.reported_by.username if self.reported_by else "Unknown"}
  Deadline    : {self.due_at.strftime("%d %b %Y, %I:%M %p")}

Please take immediate action to resolve this incident.

— IncidentPro Automated Alerts
                """.strip(),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=recipients,
                fail_silently=True,
            )


# ===============================
# COMMENTS
# ===============================
class Comment(models.Model):
    incident = models.ForeignKey(
        Incident,
        on_delete=models.CASCADE,
        related_name="comments"
    )

    author = models.ForeignKey(
        User,
        on_delete=models.CASCADE
    )

    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Comment by {self.author.username} on Incident {self.incident.id}"


# ===============================
# FILE ATTACHMENTS
# ===============================
class Attachment(models.Model):
    incident = models.ForeignKey(
        "Incident",
        related_name="attachments",
        on_delete=models.CASCADE
    )

    file = models.FileField(upload_to="incident_attachments/")
    file_size = models.IntegerField(null=True, blank=True)
    file_type = models.CharField(max_length=100, null=True, blank=True)
    original_filename = models.CharField(max_length=255, null=True, blank=True)

    uploaded_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )

    uploaded_at = models.DateTimeField(auto_now_add=True)
    is_deleted = models.BooleanField(default=False)

    def __str__(self):
        return self.original_filename


# ===============================
# ACTIVITY / AUDIT LOG
# ===============================
class Activity(models.Model):
    incident = models.ForeignKey(
        Incident,
        on_delete=models.CASCADE,
        related_name="activities"
    )

    user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )

    action = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        username = self.user.username if self.user else "System"
        return f"{username} — {self.action}"


# ===============================
# NOTIFICATIONS
# ===============================
class Notification(models.Model):
    NOTIFICATION_TYPES = [
        ('incident_assigned', 'Incident Assigned to You'),
        ('incident_created', 'New Incident Created'),
        ('status_changed', 'Incident Status Changed'),
        ('sla_breach', 'SLA Breached'),
        ('sla_warning', 'SLA Warning'),
        ('comment_added', 'Comment Added'),
        ('escalated', 'Incident Escalated'),
        ('attachment_added', 'Attachment Added'),
    ]

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    incident = models.ForeignKey(
        'Incident',
        on_delete=models.CASCADE,
        related_name='notifications',
        null=True,
        blank=True,
    )
    notif_type = models.CharField(max_length=50, choices=NOTIFICATION_TYPES)
    title = models.CharField(max_length=255)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"[{self.notif_type}] → {self.recipient.username}: {self.title}"


# ===============================
# POSTMORTEM
# ===============================
class Postmortem(models.Model):
    incident = models.OneToOneField(
        Incident,
        on_delete=models.CASCADE,
        related_name='postmortem'
    )
    root_cause = models.TextField()
    impact = models.TextField()
    resolution = models.TextField()
    prevention = models.TextField()
    author = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='postmortems'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Postmortem for Incident #{self.incident.id}"
