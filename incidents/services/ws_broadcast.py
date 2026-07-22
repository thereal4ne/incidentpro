# incidents/services/ws_broadcast.py
# ─────────────────────────────────────────────────────────────────────────────
# Call these helpers from views.py and tasks.py after any data change.
# They push updates to all connected WebSocket clients instantly.
# ─────────────────────────────────────────────────────────────────────────────

import logging
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


def broadcast_incident_update():
    """
    Notify ALL connected incident consumers to refresh their incident list.
    Call this after: create, status change, escalation, SLA breach.
    """
    try:
        channel_layer = get_channel_layer()
        if channel_layer:
            async_to_sync(channel_layer.group_send)(
                "incidents",
                {"type": "incident.update"}
            )
    except Exception as e:
        logger.warning(f"Failed to broadcast incident update via WebSocket: {e}")


def broadcast_notification_update(user_id):
    """
    Notify a SPECIFIC user's notification consumer to refresh.
    Call this after: any Notification row is created for that user.
    """
    try:
        channel_layer = get_channel_layer()
        if channel_layer:
            async_to_sync(channel_layer.group_send)(
                f"notifications_{user_id}",
                {"type": "notification.update"}
            )
    except Exception as e:
        logger.warning(f"Failed to broadcast notification update for user {user_id} via WebSocket: {e}")


def broadcast_notification_update_for_users(user_ids):
    """
    Convenience helper — notify multiple users at once.
    Pass a list or set of user IDs.
    """
    for uid in user_ids:
        broadcast_notification_update(uid)
