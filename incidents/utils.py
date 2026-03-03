from .models import IncidentActivity


def log_activity(incident, actor, action):
    IncidentActivity.objects.create(
        incident=incident,
        actor=actor,
        action=action
    )
