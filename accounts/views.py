# accounts/views.py
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework import permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth.models import User
from django.core.mail import send_mail
from django.conf import settings
import secrets
import string
from .models import UserProfile


# -------------------------------
# Custom JWT Token Serializer
# -------------------------------
class MyTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        user = self.user
        try:
            role = user.userprofile.role
        except UserProfile.DoesNotExist:
            role = "EMPLOYEE"
        data["username"] = user.username
        data["role"] = role
        return data


# -------------------------------
# Custom JWT Token View
# -------------------------------
class MyTokenObtainPairView(TokenObtainPairView):
    serializer_class = MyTokenObtainPairSerializer


# -------------------------------
# Current user info
# -------------------------------
@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def current_user(request):
    try:
        profile = request.user.userprofile
        role = profile.role
    except UserProfile.DoesNotExist:
        role = "EMPLOYEE"
    return Response({
        "username": request.user.username,
        "email": request.user.email,
        "role": role
    })


# -------------------------------
# Generate a random temp password
# -------------------------------
def generate_temp_password(length=10):
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


# -------------------------------
# CREATE EMPLOYEE (Admin only)
# -------------------------------
@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def create_employee(request):
    is_admin = (
        request.user.groups.filter(name="ADMIN").exists()
        or request.user.is_superuser
    )
    if not is_admin:
        return Response(
            {"error": "Only admins can create employee accounts"},
            status=status.HTTP_403_FORBIDDEN
        )

    username = request.data.get("username", "").strip()
    email = request.data.get("email", "").strip()
    first_name = request.data.get("first_name", "").strip()
    last_name = request.data.get("last_name", "").strip()
    role = request.data.get("role", "EMPLOYEE")

    if not username:
        return Response({"error": "Username is required"}, status=status.HTTP_400_BAD_REQUEST)
    if not email:
        return Response({"error": "Email is required"}, status=status.HTTP_400_BAD_REQUEST)
    if User.objects.filter(username=username).exists():
        return Response({"error": "Username already exists"}, status=status.HTTP_400_BAD_REQUEST)
    if User.objects.filter(email=email).exists():
        return Response({"error": "Email already registered"}, status=status.HTTP_400_BAD_REQUEST)

    temp_password = generate_temp_password()

    user = User.objects.create_user(
        username=username,
        email=email,
        password=temp_password,
        first_name=first_name,
        last_name=last_name,
    )

    user.userprofile.role = role
    user.userprofile.save()

    try:
        send_mail(
            subject="Welcome to IncidentPro — Your Account Details",
            message=f"""Hello {first_name or username},

Your IncidentPro account has been created by the admin.

  Username : {username}
  Password : {temp_password}

Please log in at http://localhost:3000

Regards,
IncidentPro Team
""",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=False,
        )
        email_sent = True
    except Exception as e:
        print(f"EMAIL ERROR: {e}")
        email_sent = False

    success_msg = "Credentials emailed." if email_sent else "Email could not be sent — share credentials manually."
    return Response({
        "message": f"Employee account created successfully. {success_msg}",
        "username": username,
        "email": email,
        "role": role,
        "temp_password": temp_password if not email_sent else None,
    }, status=status.HTTP_201_CREATED)
# -------------------------------
# LIST EMPLOYEES (Admin only)
# -------------------------------
@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def list_employees(request):
    is_admin = (
        request.user.groups.filter(name="ADMIN").exists()
        or request.user.is_superuser
    )
    if not is_admin:
        return Response({"error": "Unauthorized"}, status=status.HTTP_403_FORBIDDEN)

    users = User.objects.select_related("userprofile").all().order_by("date_joined")
    data = []
    for u in users:
        try:
            role = u.userprofile.role
        except UserProfile.DoesNotExist:
            role = "EMPLOYEE"
        data.append({
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "role": role,
            "is_active": u.is_active,
            "date_joined": u.date_joined.strftime("%Y-%m-%d"),
        })
    return Response(data)


# -------------------------------
# DEACTIVATE / REACTIVATE EMPLOYEE (Admin only)
# -------------------------------
@api_view(["PATCH"])
@permission_classes([permissions.IsAuthenticated])
def toggle_employee_status(request, user_id):
    is_admin = (
        request.user.groups.filter(name="ADMIN").exists()
        or request.user.is_superuser
    )
    if not is_admin:
        return Response({"error": "Unauthorized"}, status=status.HTTP_403_FORBIDDEN)

    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

    if user == request.user:
        return Response(
            {"error": "You cannot deactivate your own account"},
            status=status.HTTP_400_BAD_REQUEST
        )

    user.is_active = not user.is_active
    user.save()

    return Response({
        "message": f"User {user.username} {'activated' if user.is_active else 'deactivated'} successfully.",
        "is_active": user.is_active,
    })
