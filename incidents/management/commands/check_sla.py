from django.core.management.base import BaseCommand
from incidents.models import Incident


class Command(BaseCommand):
    help = "Check SLA deadlines and escalate incidents"

    def handle(self, *args, **kwargs):
        incidents = Incident.objects.filter(
            status__in=["OPEN", "IN_PROGRESS"],
            due_at__isnull=False
        )

        for incident in incidents:
            incident.check_and_escalate()

        self.stdout.write(self.style.SUCCESS("SLA check completed."))
