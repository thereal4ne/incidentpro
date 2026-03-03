import os
from celery import Celery
from celery.schedules import crontab

# Set default Django settings module
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'cicdproject.settings')

app = Celery('cicdproject')

# Load settings from Django settings file
app.config_from_object('django.conf:settings', namespace='CELERY')

# Auto-discover tasks from all installed apps
app.autodiscover_tasks()

app.conf.beat_schedule = {
    'check-sla-every-minute': {
        'task': 'incidents.tasks.check_all_incidents_sla',
        'schedule': 60.0,  # every 60 seconds
    },
}
