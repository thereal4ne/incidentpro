from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth.models import User
from .models import Attachment
from .models import Incident, Comment
from .models import Activity
from django.http import FileResponse


# -------------------------------
# LIST + CREATE INCIDENTS
# -------------------------------
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def incident_api(request):

    is_admin = (
        request.user.groups.filter(name="ADMIN").exists()
        or request.user.is_superuser
    )

    # ===============================
    # GET — LIST INCIDENTS
    # ===============================
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

        return Response(data)

    # ===============================
    # POST — CREATE INCIDENT
    # ===============================
    elif request.method == "POST":

        data = request.data

        if not data.get("title"):
            return Response(
                {"error": "Title is required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not data.get("description"):
            return Response(
                {"error": "Description is required"},
                status=status.HTTP_400_BAD_REQUEST
            )

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
            title=data.get("title"),
            description=data.get("description"),
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
# UPDATE STATUS (Role-based)
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

    is_admin = (
        request.user.groups.filter(name="ADMIN").exists()
        or request.user.is_superuser
    )

    if not is_admin and incident.assigned_to != request.user:
        return Response(
            {"error": "Permission denied"},
            status=status.HTTP_403_FORBIDDEN
        )

    incident.status = new_status
    incident.save(update_fields=["status", "updated_at"])

    Activity.objects.create(
        incident=incident,
        user=request.user,
        action=f"Changed status to {new_status}"
    )

    return Response({
        "id": incident.id,
        "status": incident.status,
        "assigned_to": incident.assigned_to.username if incident.assigned_to else "Unassigned",
    }, status=status.HTTP_200_OK)


# -------------------------------
# CURRENT USER INFO
# -------------------------------
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def current_user(request):

    role = "ADMIN" if (
        request.user.groups.filter(name="ADMIN").exists()
        or request.user.is_superuser
    ) else "EMPLOYEE"

    return Response({
        "username": request.user.username,
        "role": role,
        "email": request.user.email
    })


# -------------------------------
# LIST USERS (ADMIN ONLY)
# -------------------------------
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_users(request):

    if not (
        request.user.groups.filter(name="ADMIN").exists()
        or request.user.is_superuser
    ):
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

    is_admin = (
        request.user.groups.filter(name="ADMIN").exists()
        or request.user.is_superuser
    )

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
        text = request.data.get("text")

        if not text:
            return Response(
                {"error": "Comment text required"},
                status=status.HTTP_400_BAD_REQUEST
            )

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
def upload_attachment(request, pk):

    incident = get_object_or_404(Incident, pk=pk)

    is_admin = (
        request.user.groups.filter(name="ADMIN").exists()
        or request.user.is_superuser
    )

    if not is_admin and request.user not in [incident.reported_by, incident.assigned_to]:
        return Response({"error": "Permission denied"}, status=403)

    file = request.FILES.get("file")
    if not file:
        return Response({"error": "No file uploaded"}, status=400)

    attachment = Attachment.objects.create(
        incident=incident,
        file=file,
        original_filename=file.name,
        file_size=file.size,
        file_type=file.content_type,
        uploaded_by=request.user
    )

    Activity.objects.create(
        incident=incident,
        user=request.user,
        action=f"Uploaded attachment: {file.name}"
    )

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

    is_admin = (
        request.user.groups.filter(name="ADMIN").exists()
        or request.user.is_superuser
    )

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

    is_admin = (
        request.user.groups.filter(name="ADMIN").exists()
        or request.user.is_superuser
    )

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

    is_admin = (
        request.user.groups.filter(name="ADMIN").exists()
        or request.user.is_superuser
    )

    if not is_admin:
        return Response({"error": "Only admin can delete attachments"}, status=403)

    attachment.is_deleted = True
    attachment.save()

    Activity.objects.create(
        incident=incident,
        user=request.user,
        action=f"Deleted attachment: {attachment.original_filename}"
    )

    return Response({"message": "Attachment deleted successfully"})


# -----------------------------------
# INCIDENT ACTIVITY LOG
# -----------------------------------
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def incident_activities(request, pk):

    incident = get_object_or_404(Incident, pk=pk)

    is_admin = (
        request.user.groups.filter(name="ADMIN").exists()
        or request.user.is_superuser
    )

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
