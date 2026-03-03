from django.urls import path
from . import views
from .views import (
    current_user,
    list_users,
    incident_api,
    update_incident_status,
    incident_comments,
    incident_activities,
)

urlpatterns = [
    # Current logged-in user info
    path("current_user/", current_user, name="current_user"),

    # List all users (admin only)
    path("users/", list_users, name="list_users"),

    # List + create incidents
    path("incidents/", incident_api, name="incident_api"),

    # Update incident status
    path(
        "incidents/<int:pk>/status/",
        update_incident_status,
        name="update_incident_status",
    ),

    # Comments
    path(
        "incidents/<int:pk>/comments/",
        incident_comments,
        name="incident_comments",
    ),


    path(
        "incidents/<int:pk>/attachments/upload/",
        views.upload_attachment,
        name="upload_attachment",
    ),
    # Attachments
    path(
        "incidents/<int:pk>/attachments/",
        views.list_attachments,
        name="list_attachments",
    ),
    path("incidents/<int:pk>/attachments/<int:attachment_id>/download/", views.download_attachment),
    path("incidents/<int:pk>/attachments/<int:attachment_id>/delete/", views.delete_attachment),

    # ✅ Activity Log (FIXED)
    path(
        "incidents/<int:pk>/activities/",
        incident_activities,
        name="incident_activities",
    ),
]
