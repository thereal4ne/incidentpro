from .models import Activity


def log_activity(incident, actor, action):
    Activity.objects.create(
        incident=incident,
        actor=actor,
        action=action
    )
