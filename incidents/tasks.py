from celery import shared_task
from incidents.models import Incident
from incidents.services.sla_service import (
    evaluate_incident_sla,
    evaluate_all_open_incidents
)


@shared_task
def check_single_incident_sla(incident_id):
    """
    Checks SLA for a single incident.
    Used when scheduling SLA at incident creation time.
    """

    try:
        incident = Incident.objects.get(id=incident_id)
    except Incident.DoesNotExist:
        return "Incident not found"

    evaluate_incident_sla(incident)

    return f"SLA checked for Incident {incident_id}"


@shared_task
def check_all_incidents_sla():
    """
    Periodic task triggered by Celery Beat.
    Scans all open incidents and evaluates SLA.
    """

    evaluate_all_open_incidents()

    return "All open incidents evaluated"
