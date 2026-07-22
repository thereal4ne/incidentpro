from celery import shared_task
from incidents.models import Incident
from incidents.services.sla_service import (
    evaluate_incident_sla,
    evaluate_all_open_incidents
)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def check_single_incident_sla(self, incident_id):
    """
    Checks SLA for a single incident.
    Used when scheduling SLA at incident creation time.
    """
    try:
        incident = Incident.objects.get(id=incident_id)
        evaluate_incident_sla(incident)
        return f"SLA checked for Incident {incident_id}"
    except Incident.DoesNotExist:
        return f"Incident {incident_id} not found"
    except Exception as exc:
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def check_all_incidents_sla(self):
    """
    Periodic task triggered by Celery Beat.
    Scans all open incidents and evaluates SLA.
    """
    try:
        evaluate_all_open_incidents()
        return "All open incidents evaluated"
    except Exception as exc:
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def notify_escalation_to_admins(self, incident_id, escalated_by_username, reason):
    """
    Sends email + in-app notification to all admins
    when an employee manually escalates an incident.
    """
    try:
        from django.contrib.auth.models import User
        from django.core.mail import send_mail
        from django.conf import settings
        from incidents.models import Incident, Notification
        from incidents.services.ws_broadcast import broadcast_notification_update

        incident = Incident.objects.get(id=incident_id)
        admins = User.objects.filter(is_superuser=True)

        recipient_emails = [a.email for a in admins if a.email]

        if recipient_emails:
            send_mail(
                subject=f"[IncidentPro] 🚨 Incident #{incident_id} Escalated — Action Required",
                message=f"""
Hello Admin,

An incident has been manually escalated by an employee and requires your attention.

  Incident ID  : #{incident.id}
  Title        : {incident.title}
  Priority     : {incident.priority}
  Escalated By : {escalated_by_username}
  Reason       : {reason if reason else "No reason provided"}

Please log in to IncidentPro and reassign or take action on this incident.

— IncidentPro Automated Alerts
                """.strip(),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=recipient_emails,
                fail_silently=True,
            )

        for admin in admins:
            Notification.objects.create(
                recipient=admin,
                incident=incident,
                notif_type='escalated',
                title=f"Incident #{incident.id} Escalated",
                message=(
                    f"{escalated_by_username} escalated incident '{incident.title}'. "
                    f"Reason: {reason if reason else 'Not provided'}"
                ),
            )
            broadcast_notification_update(admin.id)

    except Incident.DoesNotExist:
        return f"Incident {incident_id} not found"
    except Exception as exc:
        raise self.retry(exc=exc)
