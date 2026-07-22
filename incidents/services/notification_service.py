# incidents/services/notification_service.py
# ─────────────────────────────────────────────────────────────────────────────
# Central helper to create Notification rows.
# Import and call from views.py and tasks.py wherever an event occurs.
# ─────────────────────────────────────────────────────────────────────────────

from django.contrib.auth import get_user_model
from incidents.models import Notification

User = get_user_model()


def _make(recipient, incident, notif_type, title, message):
    """Low-level factory. Returns the saved Notification instance."""
    return Notification.objects.create(
        recipient=recipient,
        incident=incident,
        notif_type=notif_type,
        title=title,
        message=message,
    )


# ── Public helpers ────────────────────────────────────────────────────────────

def notify_incident_assigned(incident, assigned_user):
    """Tell an employee they were assigned a new incident."""
    _make(
        recipient=assigned_user,
        incident=incident,
        notif_type='incident_assigned',
        title=f'You were assigned: {incident.title}',
        message=(
            f'Incident #{incident.id} "{incident.title}" '
            f'(Priority: {incident.get_priority_display()}) has been assigned to you.'
        ),
    )


def notify_incident_created(incident):
    """Notify all admins when any new incident is reported."""
    admins = User.objects.filter(is_staff=True)
    for admin in admins:
        _make(
            recipient=admin,
            incident=incident,
            notif_type='incident_created',
            title=f'New incident reported: {incident.title}',
            message=(
                f'Incident #{incident.id} "{incident.title}" was reported by '
                f'{incident.reported_by.get_full_name() or incident.reported_by.username}. '
                f'Priority: {incident.get_priority_display()}.'
            ),
        )


def notify_status_changed(incident, changed_by, old_status, new_status):
    """
    Notify the assigned user (if not the changer) and all admins
    (if not already the changer) about a status change.
    """
    recipients = set()

    if incident.assigned_to and incident.assigned_to != changed_by:
        recipients.add(incident.assigned_to)

    for admin in User.objects.filter(is_staff=True):
        if admin != changed_by:
            recipients.add(admin)

    title = f'Status updated on: {incident.title}'
    message = (
        f'Incident #{incident.id} "{incident.title}" status changed from '
        f'"{old_status}" → "{new_status}" by '
        f'{changed_by.get_full_name() or changed_by.username}.'
    )
    for user in recipients:
        _make(user, incident, 'status_changed', title, message)


def notify_sla_breach(incident):
    """Notify assigned user + all admins of an SLA breach."""
    recipients = set(User.objects.filter(is_staff=True))
    if incident.assigned_to:
        recipients.add(incident.assigned_to)

    title = f'SLA BREACHED: {incident.title}'
    message = (
        f'Incident #{incident.id} "{incident.title}" has breached its SLA deadline. '
        f'Priority has been escalated to Critical and reassigned to admin.'
    )
    for user in recipients:
        _make(user, incident, 'sla_breach', title, message)


def notify_sla_warning(incident, minutes_remaining):
    """Warn the assigned user when the SLA deadline is approaching."""
    if not incident.assigned_to:
        return
    _make(
        recipient=incident.assigned_to,
        incident=incident,
        notif_type='sla_warning',
        title=f'SLA Warning: {incident.title}',
        message=(
            f'Incident #{incident.id} "{incident.title}" SLA deadline is in '
            f'approximately {minutes_remaining} minutes. Please resolve it soon.'
        ),
    )


def notify_comment_added(incident, comment_author):
    """
    Notify the incident's assigned user and reporter (excluding the commenter).
    """
    recipients = set()
    if incident.assigned_to and incident.assigned_to != comment_author:
        recipients.add(incident.assigned_to)
    if incident.reported_by and incident.reported_by != comment_author:
        recipients.add(incident.reported_by)

    title = f'New comment on: {incident.title}'
    message = (
        f'{comment_author.get_full_name() or comment_author.username} '
        f'commented on Incident #{incident.id} "{incident.title}".'
    )
    for user in recipients:
        _make(user, incident, 'comment_added', title, message)


def notify_escalated(incident):
    """Notify all admins and the assigned user of an escalation."""
    recipients = set(User.objects.filter(is_staff=True))
    if incident.assigned_to:
        recipients.add(incident.assigned_to)

    title = f'Incident Escalated: {incident.title}'
    message = (
        f'Incident #{incident.id} "{incident.title}" has been automatically '
        f'escalated to Critical priority due to SLA breach.'
    )
    for user in recipients:
        _make(user, incident, 'escalated', title, message)
