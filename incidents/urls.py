from django.urls import path
from . import views
from .views import (
    current_user,
    list_users,
    incident_api,
    incident_detail,
    incident_export_pdf,
    update_incident_status,
    escalate_incident,
    reassign_incident,
    incident_comments,
    incident_activities,
    notification_list,
    notification_mark_read,
    notification_mark_all_read,
    notification_unread_count,
    incident_postmortem,

)

urlpatterns = [
    # Current logged-in user info
    path("current_user/", current_user, name="current_user"),

    # List all users (admin only)
    path("users/", list_users, name="list_users"),

    # List + create incidents
    path("incidents/", incident_api, name="incident_api"),

    # Single incident detail
    path("incidents/<int:pk>/", incident_detail, name="incident_detail"),

    path("incidents/<int:pk>/export-pdf/", incident_export_pdf, name="incident_export_pdf"),

    # Update incident status
    path(
        "incidents/<int:pk>/status/",
        update_incident_status,
        name="update_incident_status",
    ),

    # Escalate incident
    path("incidents/<int:pk>/escalate/", escalate_incident, name="escalate_incident"),

    # Reassign incident
    path("incidents/<int:pk>/reassign/", reassign_incident, name="reassign_incident"),

    # Comments
    path(
        "incidents/<int:pk>/comments/",
        incident_comments,
        name="incident_comments",
    ),

    # Attachments
    path(
        "incidents/<int:pk>/attachments/upload/",
        views.upload_attachment,
        name="upload_attachment",
    ),
    path(
        "incidents/<int:pk>/attachments/",
        views.list_attachments,
        name="list_attachments",
    ),
    path("incidents/<int:pk>/attachments/<int:attachment_id>/download/", views.download_attachment),
    path("incidents/<int:pk>/attachments/<int:attachment_id>/delete/", views.delete_attachment),

    # Activity Log
    path(
        "incidents/<int:pk>/activities/",
        incident_activities,
        name="incident_activities",
    ),

    # Notifications
    path('notifications/', notification_list, name='notification-list'),
    path('notifications/unread-count/', notification_unread_count, name='notification-unread-count'),
    path('notifications/mark-all-read/', notification_mark_all_read, name='notification-mark-all-read'),
    path('notifications/<int:pk>/read/', notification_mark_read, name='notification-mark-read'),

    # Postmortem
    path("incidents/<int:pk>/postmortem/", incident_postmortem, name="incident_postmortem"),
]
