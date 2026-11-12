from django.core.exceptions import ObjectDoesNotExist
from .models import Activity


def is_admin_user(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    try:
        if user.userprofile.role == "ADMIN":
            return True
    except (ObjectDoesNotExist, AttributeError):
        pass
    # Also support Django Group-based admin assignment
    return user.groups.filter(name="ADMIN").exists()


def log_activity(incident, actor, action):
    Activity.objects.create(
        incident=incident,
        actor=actor,
        action=action
    )
