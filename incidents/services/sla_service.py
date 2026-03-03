from django.utils import timezone
from incidents.models import Incident, Activity


def evaluate_incident_sla(incident):

    if incident.status in ["RESOLVED", "CLOSED"]:
        return False

    if not incident.due_at:
        return False

    # ── Skip if already fully processed ──
    if incident.is_overdue and incident.is_escalated:
        return False

    if timezone.now() > incident.due_at:
        incident.check_and_escalate()
        return True

    return False


def evaluate_all_open_incidents():

    open_incidents = Incident.objects.exclude(
        status__in=["RESOLVED", "CLOSED"]
    ).exclude(
        is_overdue=True,
        is_escalated=True
    )

    for incident in open_incidents:
        evaluate_incident_sla(incident)
