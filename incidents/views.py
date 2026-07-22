from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, KeepTogether
)
from django.core.exceptions import ObjectDoesNotExist
from django.core.paginator import Paginator
from django.contrib.auth import get_user_model
from .services.ws_broadcast import (
    broadcast_incident_update,
    broadcast_notification_update,
    broadcast_notification_update_for_users,
)
from .services.notification_service import (
    notify_incident_created,
    notify_incident_assigned,
    notify_status_changed,
    notify_comment_added,
)
from .serializers import (
    NotificationSerializer,
    IncidentCreateSerializer,
    CommentCreateSerializer,
    PostmortemSerializer,
)
from incidents.tasks import notify_escalation_to_admins
from django_ratelimit.decorators import ratelimit
from django.http import FileResponse
from .models import Attachment, Incident, Comment, Activity, Notification, Postmortem
from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import api_view, permission_classes
from django.shortcuts import get_object_or_404
from django.http import HttpResponse
from django.utils import timezone
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
import os
import magic
import logging
from functools import partial

logger = logging.getLogger(__name__)

UserModel = get_user_model()

# ── File upload validation constants ──
ALLOWED_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/gif",
    "text/plain",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/msword",
    "application/vnd.ms-excel",
}

ALLOWED_EXTENSIONS = {
    ".pdf", ".png", ".jpg", ".jpeg", ".gif",
    ".txt", ".csv", ".docx", ".xlsx", ".doc", ".xls"
}

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


# ── Helper ────────────────────────────────────────────────────────────────────
def is_admin_user(user):
    if user.is_superuser:
        return True
    try:
        if user.userprofile.role == "ADMIN":
            return True
    except (ObjectDoesNotExist, AttributeError):
        pass
    # Also support Django Group-based admin assignment
    return user.groups.filter(name="ADMIN").exists()


# -------------------------------
# LIST + CREATE INCIDENTS
# -------------------------------
@ratelimit(key='ip', rate='20/m', method='POST', block=True)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def incident_api(request):

    is_admin = is_admin_user(request.user)

    if request.method == "GET":

        if is_admin:
            incidents = Incident.objects.select_related(
                "reported_by", "assigned_to"
            ).order_by("-created_at")
        else:
            own = Incident.objects.select_related(
                "reported_by", "assigned_to"
            ).filter(reported_by=request.user)

            assigned = Incident.objects.select_related(
                "reported_by", "assigned_to"
            ).filter(assigned_to=request.user)

            incidents = (own | assigned).distinct().order_by("-created_at")

        search = request.GET.get("search", "").strip()
        if search:
            incidents = incidents.filter(title__icontains=search)

        page_size = int(request.GET.get("page_size", 20))
        page_number = int(request.GET.get("page", 1))
        paginator = Paginator(incidents, page_size)
        page = paginator.get_page(page_number)

        data = []
        for i in page.object_list:
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

        return Response({
            "count": paginator.count,
            "total_pages": paginator.num_pages,
            "current_page": page_number,
            "has_next": page.has_next(),
            "has_previous": page.has_previous(),
            "results": data,
        })

    elif request.method == "POST":

        serializer = IncidentCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        assigned_username = data.get("assigned_to")
        target_user = request.user

        if assigned_username:
            if not is_admin:
                return Response(
                    {"error": "Only admin can assign incidents"},
                    status=status.HTTP_403_FORBIDDEN
                )
            try:
                target_user = User.objects.get(username=assigned_username)
            except User.DoesNotExist:
                return Response(
                    {"error": f"User {assigned_username} not found"},
                    status=status.HTTP_400_BAD_REQUEST
                )

        incident = Incident.objects.create(
            title=data["title"],
            description=data["description"],
            priority=data.get("priority", "LOW"),
            status="OPEN",
            reported_by=request.user,
            assigned_to=target_user,
        )

        Activity.objects.create(
            incident=incident,
            user=request.user,
            action="Reported the incident"
        )

        if assigned_username:
            Activity.objects.create(
                incident=incident,
                user=request.user,
                action=f"Assigned to {target_user.username}"
            )

        notify_incident_created(incident)
        if incident.assigned_to and incident.assigned_to != request.user:
            notify_incident_assigned(incident, incident.assigned_to)

        broadcast_incident_update()
        admin_ids = set(UserModel.objects.filter(is_staff=True).values_list('id', flat=True))
        if incident.assigned_to and incident.assigned_to != request.user:
            admin_ids.add(incident.assigned_to.id)
        broadcast_notification_update_for_users(admin_ids)

        return Response({
            "id": incident.id,
            "title": incident.title,
            "description": incident.description,
            "priority": incident.priority,
            "status": incident.status,
            "reported_by": incident.reported_by.username,
            "assigned_to": incident.assigned_to.username,
            "created_at": incident.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            "updated_at": incident.updated_at.strftime("%Y-%m-%d %H:%M:%S"),
            "due_at": incident.due_at.isoformat() if incident.due_at else None,
            "is_overdue": incident.is_overdue,
            "is_escalated": incident.is_escalated,
        }, status=status.HTTP_201_CREATED)


# -------------------------------
# RETRIEVE SINGLE INCIDENT
# -------------------------------
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def incident_detail(request, pk):
    incident = get_object_or_404(Incident, pk=pk)
    is_admin = is_admin_user(request.user)

    if not is_admin and request.user not in [incident.reported_by, incident.assigned_to]:
        return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)

    return Response({
        "id": incident.id,
        "title": incident.title,
        "description": incident.description,
        "priority": incident.priority,
        "status": incident.status,
        "reported_by": incident.reported_by.username if incident.reported_by else "System",
        "assigned_to": incident.assigned_to.username if incident.assigned_to else "Unassigned",
        "created_at": incident.created_at.strftime("%Y-%m-%d %H:%M:%S"),
        "updated_at": incident.updated_at.strftime("%Y-%m-%d %H:%M:%S"),
        "due_at": incident.due_at.isoformat() if incident.due_at else None,
        "is_overdue": incident.is_overdue,
        "is_escalated": incident.is_escalated,
        "escalated_by": incident.escalated_by.username if incident.escalated_by else None,
        "escalated_at": incident.escalated_at.isoformat() if incident.escalated_at else None,
        "escalation_reason": incident.escalation_reason,
    })


# -------------------------------
# UPDATE STATUS
# -------------------------------
@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_incident_status(request, pk):

    incident = get_object_or_404(Incident, pk=pk)
    new_status = request.data.get("status")

    if new_status not in ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]:
        return Response(
            {"error": "Invalid status"},
            status=status.HTTP_400_BAD_REQUEST
        )

    is_admin = is_admin_user(request.user)

    if incident.status == "ESCALATED" and not is_admin:
        return Response(
            {"error": "Escalated incidents can only be updated by an admin."},
            status=status.HTTP_403_FORBIDDEN
        )

    if not is_admin and incident.assigned_to != request.user:
        return Response(
            {"error": "Permission denied"},
            status=status.HTTP_403_FORBIDDEN
        )

    old_status = incident.status
    incident.status = new_status
    incident.save(update_fields=["status", "updated_at"])

    Activity.objects.create(
        incident=incident,
        user=request.user,
        action=f"Changed status from {old_status} to {new_status}"
    )

    notify_status_changed(incident, request.user, old_status, new_status)

    broadcast_incident_update()
    notified_ids = set(UserModel.objects.filter(is_staff=True).values_list('id', flat=True))
    if incident.assigned_to and incident.assigned_to != request.user:
        notified_ids.add(incident.assigned_to.id)
    broadcast_notification_update_for_users(notified_ids)

    return Response({
        "id": incident.id,
        "status": incident.status,
        "assigned_to": incident.assigned_to.username if incident.assigned_to else "Unassigned",
    }, status=status.HTTP_200_OK)


# -----------------------------------
# ESCALATE INCIDENT
# -----------------------------------
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def escalate_incident(request, pk):
    from django.utils import timezone

    incident = get_object_or_404(Incident, pk=pk)

    if incident.assigned_to != request.user:
        return Response(
            {"error": "Only the assigned employee can escalate this incident."},
            status=status.HTTP_403_FORBIDDEN
        )

    if is_admin_user(request.user):
        return Response(
            {"error": "Admins cannot escalate incidents."},
            status=status.HTTP_403_FORBIDDEN
        )

    if incident.status in ["RESOLVED", "CLOSED", "ESCALATED"]:
        return Response(
            {"error": f"Cannot escalate an incident with status '{incident.status}'."},
            status=status.HTTP_400_BAD_REQUEST
        )

    reason = request.data.get("reason", "").strip()

    incident.status = "ESCALATED"
    incident.is_escalated = True
    incident.escalation_reason = reason if reason else None
    incident.escalated_by = request.user
    incident.escalated_at = timezone.now()
    incident.save(update_fields=[
        "status", "is_escalated", "escalation_reason",
        "escalated_by", "escalated_at", "updated_at"
    ])

    Activity.objects.create(
        incident=incident,
        user=request.user,
        action=f"Escalated the incident. Reason: {reason if reason else 'No reason provided'}"
    )

    try:
        notify_escalation_to_admins.delay(incident.id, request.user.username, reason)
    except Exception as e:
        logger.warning(
            f"Failed to queue celery task for escalation notification: {e}. "
            "Falling back to synchronous execution."
        )
        try:
            notify_escalation_to_admins.apply(args=[incident.id, request.user.username, reason])
        except Exception as sync_err:
            logger.error(f"Synchronous fallback notification failed: {sync_err}")

    broadcast_incident_update()
    admin_ids = set(UserModel.objects.filter(is_superuser=True).values_list('id', flat=True))
    broadcast_notification_update_for_users(admin_ids)

    return Response({
        "message": "Incident escalated successfully. Admins have been notified.",
        "id": incident.id,
        "status": incident.status,
        "is_escalated": incident.is_escalated,
        "escalated_by": request.user.username,
        "escalated_at": incident.escalated_at.isoformat(),
        "escalation_reason": incident.escalation_reason,
    }, status=status.HTTP_200_OK)


# -------------------------------
# CURRENT USER INFO
# -------------------------------
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def current_user(request):
    if is_admin_user(request.user):
        role = "ADMIN"
    else:
        try:
            role = request.user.userprofile.role
        except (ObjectDoesNotExist, AttributeError):
            role = "EMPLOYEE"
    return Response({
        "username": request.user.username,
        "role": role,
        "email": request.user.email,
    })


# -------------------------------
# LIST USERS (ADMIN ONLY)
# -------------------------------
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_users(request):
    if not is_admin_user(request.user):
        return Response(
            {"error": "Unauthorized"},
            status=status.HTTP_403_FORBIDDEN
        )
    users = User.objects.all().values("id", "username")
    return Response(list(users))


# -----------------------------------
# COMMENTS API
# -----------------------------------
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def incident_comments(request, pk):
    incident = get_object_or_404(Incident, pk=pk)
    is_admin = is_admin_user(request.user)

    if not is_admin and request.user not in [incident.reported_by, incident.assigned_to]:
        return Response(
            {"error": "Permission denied"},
            status=status.HTTP_403_FORBIDDEN
        )

    if request.method == "GET":
        comments = incident.comments.select_related("author").order_by("created_at")
        data = [
            {
                "id": c.id,
                "author": c.author.username,
                "text": c.text,
                "created_at": c.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            }
            for c in comments
        ]
        return Response(data)

    if request.method == "POST":
        serializer = CommentCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        text = serializer.validated_data["text"]

        comment = Comment.objects.create(
            incident=incident,
            author=request.user,
            text=text
        )

        Activity.objects.create(
            incident=incident,
            user=request.user,
            action="Added a comment"
        )

        notify_comment_added(incident, request.user)

        broadcast_incident_update()
        notified_ids = set()
        if incident.assigned_to and incident.assigned_to != request.user:
            notified_ids.add(incident.assigned_to.id)
        if incident.reported_by and incident.reported_by != request.user:
            notified_ids.add(incident.reported_by.id)
        broadcast_notification_update_for_users(notified_ids)

        return Response(
            {
                "id": comment.id,
                "author": comment.author.username,
                "text": comment.text,
                "created_at": comment.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            },
            status=status.HTTP_201_CREATED,
        )


# -----------------------------------
# ATTACHMENT UPLOAD
# -----------------------------------
@api_view(["POST"])
@permission_classes([IsAuthenticated])
@ratelimit(key="user", rate="10/m", block=True)
def upload_attachment(request, pk):

    incident = get_object_or_404(Incident, pk=pk)
    is_admin = is_admin_user(request.user)

    if not is_admin and request.user not in [incident.reported_by, incident.assigned_to]:
        return Response({"error": "Permission denied"}, status=403)

    file = request.FILES.get("file")
    if not file:
        return Response({"error": "No file uploaded"}, status=400)

    file_ext = os.path.splitext(file.name)[1].lower()

    file_bytes = file.read(2048)
    file.seek(0)
    real_mime = magic.from_buffer(file_bytes, mime=True)

    if real_mime not in ALLOWED_TYPES:
        return Response(
            {"error": f"File type '{real_mime}' is not allowed."},
            status=400
        )

    if file_ext not in ALLOWED_EXTENSIONS:
        return Response(
            {"error": f"File extension '{file_ext}' is not allowed."},
            status=400
        )

    if file.size > MAX_FILE_SIZE:
        return Response(
            {"error": "File size exceeds the 10MB limit."},
            status=400
        )

    attachment = Attachment.objects.create(
        incident=incident,
        file=file,
        original_filename=file.name,
        file_size=file.size,
        file_type=real_mime,
        uploaded_by=request.user
    )

    Activity.objects.create(
        incident=incident,
        user=request.user,
        action=f"Uploaded attachment: {file.name}"
    )

    broadcast_incident_update()

    return Response({
        "id": attachment.id,
        "original_filename": attachment.original_filename,
        "file_size": attachment.file_size,
        "file_type": attachment.file_type,
        "uploaded_by": request.user.username,
        "uploaded_at": attachment.uploaded_at.strftime("%Y-%m-%d %H:%M:%S")
    }, status=201)


# -----------------------------------
# LIST ATTACHMENTS
# -----------------------------------
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_attachments(request, pk):

    incident = get_object_or_404(Incident, pk=pk)
    is_admin = is_admin_user(request.user)

    if not is_admin and request.user not in [incident.reported_by, incident.assigned_to]:
        return Response({"error": "Permission denied"}, status=403)

    attachments = incident.attachments.filter(is_deleted=False)

    data = [
        {
            "id": a.id,
            "original_filename": a.original_filename,
            "file_size": a.file_size,
            "file_type": a.file_type,
            "uploaded_by": a.uploaded_by.username if a.uploaded_by else "Unknown",
            "uploaded_at": a.uploaded_at.strftime("%Y-%m-%d %H:%M:%S"),
        }
        for a in attachments
    ]

    return Response(data)


# -----------------------------------
# SECURE DOWNLOAD ATTACHMENT
# -----------------------------------
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def download_attachment(request, pk, attachment_id):

    incident = get_object_or_404(Incident, pk=pk)
    attachment = get_object_or_404(
        Attachment,
        pk=attachment_id,
        incident=incident,
        is_deleted=False
    )

    is_admin = is_admin_user(request.user)

    if not is_admin and request.user not in [incident.reported_by, incident.assigned_to]:
        return Response({"error": "Permission denied"}, status=403)

    return FileResponse(
        attachment.file.open(),
        as_attachment=True,
        filename=attachment.original_filename
    )


# -----------------------------------
# SOFT DELETE ATTACHMENT (ADMIN ONLY)
# -----------------------------------
@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def delete_attachment(request, pk, attachment_id):

    incident = get_object_or_404(Incident, pk=pk)
    attachment = get_object_or_404(
        Attachment,
        pk=attachment_id,
        incident=incident
    )

    if not is_admin_user(request.user):
        return Response({"error": "Only admin can delete attachments"}, status=403)

    attachment.is_deleted = True
    attachment.save()

    Activity.objects.create(
        incident=incident,
        user=request.user,
        action=f"Deleted attachment: {attachment.original_filename}"
    )

    broadcast_incident_update()

    return Response({"message": "Attachment deleted successfully"})


# -----------------------------------
# INCIDENT ACTIVITY LOG
# -----------------------------------
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def incident_activities(request, pk):

    incident = get_object_or_404(Incident, pk=pk)
    is_admin = is_admin_user(request.user)

    if not is_admin and request.user not in [incident.reported_by, incident.assigned_to]:
        return Response({"error": "Permission denied"}, status=403)

    activities = Activity.objects.filter(
        incident=incident
    ).order_by("-created_at")

    data = [
        {
            "id": a.id,
            "user": a.user.username if a.user else "System",
            "action": a.action,
            "created_at": a.created_at.strftime("%Y-%m-%d %H:%M:%S"),
        }
        for a in activities
    ]

    return Response(data)


# -----------------------------------
# NOTIFICATIONS
# -----------------------------------
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def notification_list(request):
    qs = Notification.objects.filter(recipient=request.user).order_by('-created_at')[:50]
    unread_count = Notification.objects.filter(recipient=request.user, is_read=False).count()
    serializer = NotificationSerializer(qs, many=True)
    return Response({
        'notifications': serializer.data,
        'unread_count': unread_count,
    })


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def notification_mark_read(request, pk):
    try:
        notif = Notification.objects.get(pk=pk, recipient=request.user)
    except Notification.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    notif.is_read = True
    notif.save(update_fields=['is_read'])

    broadcast_notification_update(request.user.id)

    return Response(NotificationSerializer(notif).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def notification_mark_all_read(request):
    updated = Notification.objects.filter(
        recipient=request.user, is_read=False
    ).update(is_read=True)

    broadcast_notification_update(request.user.id)

    return Response({'marked_read': updated})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def notification_unread_count(request):
    count = Notification.objects.filter(recipient=request.user, is_read=False).count()
    return Response({'unread_count': count})


# -----------------------------------
# REASSIGN INCIDENT (Admin only)
# -----------------------------------
@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def reassign_incident(request, pk):
    incident = get_object_or_404(Incident, pk=pk)

    if not is_admin_user(request.user):
        return Response(
            {"error": "Only admins can reassign incidents."},
            status=status.HTTP_403_FORBIDDEN
        )

    new_assignee_username = request.data.get("assigned_to")
    if not new_assignee_username:
        return Response(
            {"error": "assigned_to is required."},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        new_assignee = User.objects.get(username=new_assignee_username)
    except User.DoesNotExist:
        return Response(
            {"error": f"User '{new_assignee_username}' not found."},
            status=status.HTTP_400_BAD_REQUEST
        )

    old_assignee = incident.assigned_to.username if incident.assigned_to else "Unassigned"
    incident.assigned_to = new_assignee

    if incident.status == "ESCALATED":
        incident.status = "IN_PROGRESS"
        incident.is_escalated = False
        incident.save(update_fields=["assigned_to", "status", "is_escalated", "updated_at"])
    else:
        incident.save(update_fields=["assigned_to", "updated_at"])

    Activity.objects.create(
        incident=incident,
        user=request.user,
        action=f"Reassigned from {old_assignee} to {new_assignee.username}"
        + (" and de-escalated" if not incident.is_escalated else "")
    )

    notify_incident_assigned(incident, new_assignee)
    broadcast_incident_update()
    notified_ids = {new_assignee.id}
    broadcast_notification_update_for_users(notified_ids)

    return Response({
        "id": incident.id,
        "assigned_to": incident.assigned_to.username,
        "status": incident.status,
        "is_escalated": incident.is_escalated,
    }, status=status.HTTP_200_OK)


# -----------------------------------
# POSTMORTEM
# -----------------------------------
@api_view(["GET", "POST", "PATCH"])
@permission_classes([IsAuthenticated])
def incident_postmortem(request, pk):
    incident = get_object_or_404(Incident, pk=pk)
    is_admin = is_admin_user(request.user)

    if request.method == "GET":
        try:
            postmortem = incident.postmortem
            return Response(PostmortemSerializer(postmortem).data)
        except Postmortem.DoesNotExist:
            return Response(None)

    if not is_admin:
        return Response(
            {"error": "Only admins can create or edit postmortems."},
            status=status.HTTP_403_FORBIDDEN
        )

    if incident.status not in ["RESOLVED", "CLOSED"]:
        return Response(
            {"error": "Postmortems can only be created for resolved or closed incidents."},
            status=status.HTTP_400_BAD_REQUEST
        )

    if request.method == "POST":
        if hasattr(incident, 'postmortem'):
            return Response(
                {"error": "A postmortem already exists. Use PATCH to update it."},
                status=status.HTTP_400_BAD_REQUEST
            )

        postmortem = Postmortem.objects.create(
            incident=incident,
            root_cause=request.data.get("root_cause", ""),
            impact=request.data.get("impact", ""),
            resolution=request.data.get("resolution", ""),
            prevention=request.data.get("prevention", ""),
            author=request.user,
        )

        Activity.objects.create(
            incident=incident,
            user=request.user,
            action="Created postmortem report"
        )

        broadcast_incident_update()

        return Response(
            PostmortemSerializer(postmortem).data,
            status=status.HTTP_201_CREATED
        )

    if request.method == "PATCH":
        try:
            postmortem = incident.postmortem
        except Postmortem.DoesNotExist:
            return Response(
                {"error": "No postmortem exists yet. Use POST to create one."},
                status=status.HTTP_404_NOT_FOUND
            )

        for field in ["root_cause", "impact", "resolution", "prevention"]:
            if field in request.data:
                setattr(postmortem, field, request.data[field])

        postmortem.save()

        Activity.objects.create(
            incident=incident,
            user=request.user,
            action="Updated postmortem report"
        )

        broadcast_incident_update()

        return Response(PostmortemSerializer(postmortem).data)


# ── CANVAS HELPER FOR FOOTER & WATERMARK ──────────────────────
def add_page_elements(canvas, doc, user_name, incident_id):
    canvas.saveState()

    # 1. DRAW WATERMARK (Diagonal 'CONFIDENTIAL')
    canvas.setFont("Helvetica-Bold", 50)
    canvas.setFillColor(colors.HexColor("#F1F5F9"), alpha=0.1)  # Very faint

    canvas.saveState()
    canvas.translate(105 * mm, 148 * mm)
    canvas.rotate(45)
    canvas.drawCentredString(0, 0, "CONFIDENTIAL")
    canvas.restoreState()

    # 2. DRAW FOOTER
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#94A3B8"))

    # Generation Info
    gen_time = timezone.now().strftime("%d %b %Y, %I:%M %p")
    footer_text = f"IncidentPro #{incident_id}  •  Generated by {user_name}  •  {gen_time}"
    canvas.drawString(15 * mm, 10 * mm, footer_text)

    # Page Numbers
    page_num = canvas.getPageNumber()
    canvas.drawRightString(195 * mm, 10 * mm, f"Page {page_num}")

    # Divider line
    canvas.setStrokeColor(colors.HexColor("#2D3748"))
    canvas.setLineWidth(0.5)
    canvas.line(15 * mm, 13 * mm, 195 * mm, 13 * mm)

    canvas.restoreState()

# -----------------------------------
# EXPORT INCIDENT TO PDF
# -----------------------------------
@api_view(["GET"])
@permission_classes([IsAuthenticated])
@ratelimit(key="user", rate="10/m", block=True)
def incident_export_pdf(request, pk):
    incident = get_object_or_404(Incident, pk=pk)
    is_admin = request.user.is_staff

    if not is_admin and request.user not in [incident.reported_by, incident.assigned_to]:
        return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)

    # 1. Fetch related data
    comments_qs = incident.comments.select_related("author").order_by("created_at")
    comments = list(comments_qs)

    activities_qs = incident.activities.select_related("user").order_by("created_at")
    activities = list(activities_qs)

    try:
        postmortem = incident.postmortem
    except Postmortem.DoesNotExist:
        postmortem = None

    # 2. Colours & Styles (DEFINED FIRST TO AVOID NAMEERROR)
    C_SURFACE = colors.HexColor("#1A1D27")
    C_ACCENT = colors.HexColor("#3B82F6")
    C_TEXT1 = colors.HexColor("#F1F5F9")
    C_TEXT2 = colors.HexColor("#94A3B8")
    C_BORDER = colors.HexColor("#2D3748")
    C_WHITE = colors.white

    PRIORITY_COLOURS = {
        "CRITICAL": colors.HexColor("#EF4444"),
        "HIGH": colors.HexColor("#F97316"),
        "MEDIUM": colors.HexColor("#EAB308"),
        "LOW": colors.HexColor("#22C55E"),
    }
    STATUS_COLOURS = {
        "OPEN": colors.HexColor("#3B82F6"),
        "IN_PROGRESS": colors.HexColor("#8B5CF6"),
        "RESOLVED": colors.HexColor("#22C55E"),
        "CLOSED": colors.HexColor("#64748B"),
        "ESCALATED": colors.HexColor("#F97316"),
    }

    p_colour = PRIORITY_COLOURS.get(incident.priority, C_ACCENT)
    s_colour = STATUS_COLOURS.get(incident.status, C_ACCENT)

    def style(name, **kw):
        return ParagraphStyle(name, **kw)

    # --- ALL STYLE DEFINITIONS ---
    S_BRAND = style("brand", fontSize=22, fontName="Helvetica-Bold", textColor=C_ACCENT, alignment=TA_LEFT)
    S_SECTION_TITLE = style("section_title", fontSize=9, fontName="Helvetica-Bold",
                            textColor=C_TEXT2, spaceBefore=14, spaceAfter=6)
    S_INCIDENT_TITLE = style("incident_title", fontSize=16, fontName="Helvetica-Bold",
                             textColor=C_TEXT1, spaceBefore=4, spaceAfter=6, leading=20)
    S_BODY = style("body", fontSize=9, fontName="Helvetica", textColor=C_TEXT1, leading=14, spaceAfter=4)
    S_BODY_MUTED = style("body_muted", fontSize=8, fontName="Helvetica", textColor=C_TEXT2, leading=12)
    S_LABEL = style("label", fontSize=8, fontName="Helvetica-Bold", textColor=C_TEXT2, spaceAfter=2)
    S_VALUE = style("value", fontSize=9, fontName="Helvetica", textColor=C_TEXT1, leading=13)
    S_FOOTER = style("footer", fontSize=7.5, fontName="Helvetica", textColor=C_TEXT2, alignment=TA_CENTER)
    S_PM_LABEL = style("pm_label", fontSize=8, fontName="Helvetica-Bold",
                       textColor=C_ACCENT, spaceAfter=3, spaceBefore=8)
    S_PM_VALUE = style("pm_value", fontSize=9, fontName="Helvetica", textColor=C_TEXT1, leading=14, spaceAfter=4)
    S_COMMENT_TEXT = style("comment_text", fontSize=9, fontName="Helvetica", textColor=C_TEXT1, leading=13)
    S_ACTIVITY_USER = style("activity_user", fontSize=8, fontName="Helvetica-Bold", textColor=C_ACCENT)
    S_ACTIVITY_ACTION = style("activity_action", fontSize=8, fontName="Helvetica", textColor=C_TEXT1)
    S_ACTIVITY_TIME = style("activity_time", fontSize=7.5, fontName="Helvetica", textColor=C_TEXT2)

    # 3. Helpers
    def fmt(dt):
        if not dt:
            return "—"
        return dt.strftime("%d %b %Y, %I:%M %p")

    def divider():
        return HRFlowable(width="100%", thickness=0.5, color=C_BORDER, spaceAfter=8, spaceBefore=4)

    def section_heading(text):
        return Paragraph(text, S_SECTION_TITLE)

    def badge_table(label, bg_colour):
        cell = Paragraph(
            f'<font color="white"><b> {label} </b></font>',
            style(
                "badge_inner",
                fontSize=7.5,
                fontName="Helvetica-Bold",
                textColor=C_WHITE,
                alignment=TA_CENTER,
            ),
        )
        t = Table([[cell]], colWidths=[60], rowHeights=[14])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), bg_colour),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        return t

    def kv_table(rows):
        data = [
            [Paragraph(lbl, S_LABEL), Paragraph(str(v) if v else "—", S_VALUE)]
            for lbl, v in rows
        ]
        t = Table(data, colWidths=[45 * mm, 145 * mm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), C_SURFACE),
            ("GRID", (0, 0), (-1, -1), 0.4, C_BORDER),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        return t

    # 4. Build Story
    story = []

    # Header Banner
    header_data = [
        [
            Paragraph("IncidentPro", S_BRAND),
            Paragraph(
                f'<font color="#94A3B8">Incident Report  •  #{incident.id}</font>',
                style(
                    "hdr_right",
                    fontSize=10,
                    fontName="Helvetica",
                    textColor=C_TEXT2,
                    alignment=TA_RIGHT,
                ),
            ),
        ]
    ]
    header_table = Table(header_data, colWidths=[95 * mm, 95 * mm])
    header_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), C_SURFACE),
        ("LINEBELOW", (0, 0), (-1, 0), 1.5, p_colour),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 10))

    # Title & Badges
    story.append(Paragraph(incident.title, S_INCIDENT_TITLE))
    badges = [badge_table(incident.priority, p_colour), badge_table(incident.status, s_colour)]
    if incident.is_overdue:
        badges.append(badge_table("OVERDUE", colors.HexColor("#EF4444")))
    if incident.is_escalated:
        badges.append(badge_table("ESCALATED", colors.HexColor("#F97316")))

    badge_width = (190 * mm) / len(badges)
    story.append(Table([badges], colWidths=[badge_width] * len(badges), hAlign='LEFT'))
    story.append(Spacer(1, 12))
    story.append(divider())

    # Incident Details
    story.append(section_heading("INCIDENT DETAILS"))
    story.append(kv_table([
        ("Incident ID", f"#{incident.id}"),
        ("Reported By", incident.reported_by.username if incident.reported_by else "—"),
        ("Assigned To", incident.assigned_to.username if incident.assigned_to else "Unassigned"),
        ("Priority", incident.priority),
        ("Status", incident.status),
        ("Created", fmt(incident.created_at)),
        ("SLA Deadline", fmt(incident.due_at) + (" ⚠ OVERDUE" if incident.is_overdue else "")),
    ]))
    story.append(Spacer(1, 10))

    # Escalation Details
    if incident.is_escalated:
        story.append(section_heading("ESCALATION DETAILS"))
        story.append(kv_table([
            ("Escalated By", incident.escalated_by.username if incident.escalated_by else "—"),
            ("Escalated At", fmt(incident.escalated_at)),
            ("Reason", incident.escalation_reason or "No reason provided"),
        ]))
        story.append(Spacer(1, 10))

    # Description
    story.append(divider())
    story.append(section_heading("DESCRIPTION"))
    desc = Table([[Paragraph(incident.description or "No description provided.", S_BODY)]], colWidths=[190 * mm])
    desc.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), C_SURFACE),
        ("BOX", (0, 0), (-1, -1), 0.4, C_BORDER),
        ("LINERIGHT", (0, 0), (0, -1), 2, p_colour),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(desc)
    story.append(Spacer(1, 10))

    # Activity Log
    story.append(section_heading(f"ACTIVITY LOG ({len(activities)} events)"))
    if activities:
        act_data = [[Paragraph(a.user.username if a.user else "System", S_ACTIVITY_USER),
                     Paragraph(a.action, S_ACTIVITY_ACTION),
                     Paragraph(fmt(a.created_at), S_ACTIVITY_TIME)] for a in activities]
        act_table = Table(act_data, colWidths=[40 * mm, 110 * mm, 40 * mm])
        act_table.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.4, C_BORDER),
            ("BACKGROUND", (0, 0), (-1, -1), C_SURFACE),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(act_table)
    story.append(Spacer(1, 10))

    # Comments Section
    story.append(section_heading(f"COMMENTS ({len(comments)})"))
    if comments:
        for c in comments:
            c_header = Table(
                [
                    [
                        Paragraph(
                            f"<b>{c.author.username}</b>  "
                            f"<font color='#64748B'>{fmt(c.created_at)}</font>",
                            S_BODY_MUTED,
                        )
                    ]
                ],
                colWidths=[190 * mm],
            )
            c_body = Table([[Paragraph(c.text, S_COMMENT_TEXT)]], colWidths=[190 * mm])
            c_body.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), C_SURFACE),
                ("LINERIGHT", (0, 0), (0, -1), 2, C_ACCENT),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]))
            story.append(KeepTogether([c_header, c_body, Spacer(1, 5)]))
    else:
        story.append(Paragraph("No comments on this incident.", S_BODY_MUTED))
    story.append(Spacer(1, 10))

    # Postmortem Section
    story.append(divider())
    story.append(section_heading("POSTMORTEM"))
    if postmortem:
        pm_fields = [
            ("Root Cause", postmortem.root_cause),
            ("Impact", postmortem.impact),
            ("Resolution", postmortem.resolution),
            ("Prevention Steps", postmortem.prevention),
        ]
        pm_story_block = []
        for label, value in pm_fields:
            pm_story_block.append(Paragraph(label, S_PM_LABEL))
            val_table = Table([[Paragraph(value or "—", S_PM_VALUE)]], colWidths=[190 * mm])
            val_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), C_SURFACE),
                ("BOX", (0, 0), (-1, -1), 0.4, C_BORDER),
                ("LINERIGHT", (0, 0), (0, -1), 2, C_ACCENT),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]))
            pm_story_block.append(val_table)
            pm_story_block.append(Spacer(1, 4))

        author_name = postmortem.author.username if postmortem.author else "Unknown"
        pm_story_block.append(Paragraph(f'Written by {author_name}  •  {fmt(postmortem.created_at)}', S_BODY_MUTED))
        story.append(KeepTogether(pm_story_block))
    else:
        story.append(Paragraph("No postmortem has been written for this incident.", S_BODY_MUTED))

    # Footer Metadata Block
    story.append(Spacer(1, 20))
    story.append(divider())
    generated_at = timezone.now().strftime("%d %b %Y, %I:%M %p UTC")
    story.append(Paragraph(
        f"Generated by IncidentPro  •  {generated_at}  •  Exported by {request.user.username}",
        S_FOOTER
    ))

    # Final PDF Build
    response = HttpResponse(content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="incident_{incident.id}_report.pdf"'

    doc = SimpleDocTemplate(
        response,
        pagesize=A4,
        leftMargin=10 * mm, rightMargin=10 * mm,
        topMargin=15 * mm, bottomMargin=22 * mm
    )

    on_page = partial(add_page_elements, user_name=request.user.username, incident_id=incident.id)
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)

    return response

# -----------------------------------
# CHANGE PASSWORD
# -----------------------------------
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def change_password(request):
    current_password = request.data.get("current_password")
    new_password = request.data.get("new_password")

    if not current_password or not new_password:
        return Response(
            {"error": "Both current_password and new_password are required."},
            status=status.HTTP_400_BAD_REQUEST
        )

    if not request.user.check_password(current_password):
        return Response(
            {"error": "Current password is incorrect."},
            status=status.HTTP_400_BAD_REQUEST
        )

    if len(new_password) < 8:
        return Response(
            {"error": "New password must be at least 8 characters."},
            status=status.HTTP_400_BAD_REQUEST
        )

    request.user.set_password(new_password)
    request.user.save()

    return Response({"message": "Password changed successfully."})
