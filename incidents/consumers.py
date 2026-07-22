# incidents/consumers.py
import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async


# ── JWT Auth helper ───────────────────────────────────────────────────────────

@database_sync_to_async
def get_user_from_token(token_str):
    """Validate JWT and return the User, or None if invalid."""
    from django.contrib.auth.models import User
    from rest_framework_simplejwt.tokens import AccessToken
    try:
        token = AccessToken(token_str)
        user_id = token['user_id']
        return User.objects.get(id=user_id)
    except Exception:
        return None


@database_sync_to_async
def get_incidents_data(user):
    """Return serialized first page (20) of incidents for the given user."""
    from incidents.models import Incident
    from django.db.models import Q

    is_admin = user.groups.filter(name="ADMIN").exists() or user.is_superuser

    if is_admin:
        incidents = Incident.objects.select_related(
            "reported_by", "assigned_to"
        ).order_by("-created_at")[:20]
    else:
        incidents = Incident.objects.select_related(
            "reported_by", "assigned_to"
        ).filter(
            Q(reported_by=user) | Q(assigned_to=user)
        ).distinct().order_by("-created_at")[:20]

    data = []
    for i in incidents:
        data.append({
            "id": i.id,
            "title": i.title,
            "description": i.description,
            "priority": i.priority,
            "status": i.status,
            "reported_by": i.reported_by.username if i.reported_by else "System",
            "assigned_to": i.assigned_to.username if i.assigned_to else "Unassigned",
            "created_at": i.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            "updated_at": i.updated_at.strftime("%Y-%m-%d %H:%M:%S"),
            "due_at": i.due_at.isoformat() if i.due_at else None,
            "is_overdue": i.is_overdue,
            "is_escalated": i.is_escalated,
        })
    return data


@database_sync_to_async
def get_notifications_data(user):
    """Return serialized notifications + unread count for the given user."""
    from incidents.models import Notification
    from incidents.serializers import NotificationSerializer

    qs = Notification.objects.filter(
        recipient=user
    ).order_by('-created_at')[:50]

    unread_count = Notification.objects.filter(
        recipient=user, is_read=False
    ).count()

    serializer = NotificationSerializer(qs, many=True)
    return {
        "notifications": serializer.data,
        "unread_count": unread_count,
    }


# ── Incident Consumer ─────────────────────────────────────────────────────────

class IncidentConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        query_string = self.scope.get("query_string", b"").decode()
        token_str = None
        for part in query_string.split("&"):
            if part.startswith("token="):
                token_str = part[6:]
                break

        if not token_str:
            await self.close(code=4001)
            return

        self.user = await get_user_from_token(token_str)
        if not self.user:
            await self.close(code=4001)
            return

        self.incidents_group = "incidents"
        await self.channel_layer.group_add(
            self.incidents_group,
            self.channel_name
        )

        await self.accept()

        incidents = await get_incidents_data(self.user)
        await self.send(text_data=json.dumps({
            "type": "incident_update",
            "incidents": incidents,
        }))

    async def disconnect(self, close_code):
        if hasattr(self, 'incidents_group'):
            await self.channel_layer.group_discard(
                self.incidents_group,
                self.channel_name
            )

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            if data.get("type") == "refresh":
                incidents = await get_incidents_data(self.user)
                await self.send(text_data=json.dumps({
                    "type": "incident_update",
                    "incidents": incidents,
                }))
        except Exception:
            pass

    async def incident_update(self, event):
        incidents = await get_incidents_data(self.user)
        await self.send(text_data=json.dumps({
            "type": "incident_update",
            "incidents": incidents,
        }))


# ── Notification Consumer ─────────────────────────────────────────────────────

class NotificationConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        query_string = self.scope.get("query_string", b"").decode()
        token_str = None
        for part in query_string.split("&"):
            if part.startswith("token="):
                token_str = part[6:]
                break

        if not token_str:
            await self.close(code=4001)
            return

        self.user = await get_user_from_token(token_str)
        if not self.user:
            await self.close(code=4001)
            return

        self.notification_group = f"notifications_{self.user.id}"
        await self.channel_layer.group_add(
            self.notification_group,
            self.channel_name
        )

        await self.accept()

        data = await get_notifications_data(self.user)
        await self.send(text_data=json.dumps({
            "type": "notification_update",
            **data,
        }))

    async def disconnect(self, close_code):
        if hasattr(self, 'notification_group'):
            await self.channel_layer.group_discard(
                self.notification_group,
                self.channel_name
            )

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            if data.get("type") == "refresh":
                notif_data = await get_notifications_data(self.user)
                await self.send(text_data=json.dumps({
                    "type": "notification_update",
                    **notif_data,
                }))
        except Exception:
            pass

    async def notification_update(self, event):
        data = await get_notifications_data(self.user)
        await self.send(text_data=json.dumps({
            "type": "notification_update",
            **data,
        }))
