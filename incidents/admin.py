from django.contrib import admin
from .models import (
    Incident, Comment, Attachment, Activity,
    Notification, Postmortem
)


@admin.register(Incident)
class IncidentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "title",
        "priority",
        "status",
        "reported_by",
        "assigned_to",
        "created_at",
        "due_at",
        "is_overdue",
        "is_escalated",
    )
    list_filter = ("priority", "status", "created_at")
    search_fields = ("title", "description")


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ("id", "incident", "author", "created_at")
    search_fields = ("text",)


@admin.register(Attachment)
class AttachmentAdmin(admin.ModelAdmin):
    list_display = ("id", "incident", "uploaded_by", "uploaded_at")


@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
    list_display = ("id", "incident", "user", "action", "created_at")
    search_fields = ("action",)
    list_filter = ("created_at",)


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ['recipient', 'notif_type', 'title', 'is_read', 'created_at']
    list_filter = ['notif_type', 'is_read']
    search_fields = ['title', 'message', 'recipient__username']


@admin.register(Postmortem)
class PostmortemAdmin(admin.ModelAdmin):
    list_display = ('incident', 'author', 'created_at')
