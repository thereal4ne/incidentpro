from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta


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
        is_new = not self.pk  # ← check before saving

        if is_new and not self.due_at:
            self.due_at = self.sla_deadline()

        super().save(*args, **kwargs)

        try:
            if is_new:  # ← only fire Celery for brand new incidents
                from incidents.tasks import check_single_incident_sla
                check_single_incident_sla.delay(self.id)
        except Exception:
            pass

    # ===============================
    # SLA CHECK & ESCALATION
    # ===============================
    def check_and_escalate(self):
        from django.contrib.auth.models import User
        from django.core.mail import send_mail
        from django.conf import settings

        if self.status in ["RESOLVED", "CLOSED"]:
            return

        if not self.due_at:
            return

        # ── Skip if already both overdue and escalated ──
        if self.is_overdue and self.is_escalated:
            return

        now = timezone.now()

        # ── Mark overdue ──
        if now > self.due_at and not self.is_overdue:
            self.is_overdue = True
            self.save(update_fields=["is_overdue"])

            Activity.objects.create(
                incident=self,
                user=None,
                action="SLA deadline passed — Incident marked as overdue"
            )

            # Collect recipients
            recipients = []
            if self.assigned_to and self.assigned_to.email:
                recipients.append(self.assigned_to.email)
            if self.reported_by and self.reported_by.email:
                recipients.append(self.reported_by.email)
            for admin in User.objects.filter(is_superuser=True):
                if admin.email and admin.email not in recipients:
                    recipients.append(admin.email)

            if recipients:
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

        # ── Escalate ──
        if now > self.due_at and not self.is_escalated:
            self.is_escalated = True
            self.priority = "CRITICAL"

            admin = User.objects.filter(is_superuser=True).first()
            if admin:
                self.assigned_to = admin

            self.save(update_fields=["is_escalated", "priority", "assigned_to"])

            Activity.objects.create(
                incident=self,
                user=None,
                action="SLA breached — Incident escalated to CRITICAL and reassigned to admin"
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
