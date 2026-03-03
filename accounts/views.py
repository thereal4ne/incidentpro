# accounts/views.py
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework import permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from .models import UserProfile


# -------------------------------
# Custom JWT Token Serializer
# -------------------------------
class MyTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Customizes the JWT token response to include username and role.
    """
    def validate(self, attrs):
        data = super().validate(attrs)
        user = self.user

        # Try to get user role from UserProfile, fallback to EMPLOYEE
        try:
            role = user.userprofile.role
        except UserProfile.DoesNotExist:
            role = "EMPLOYEE"

        # Add custom fields to the token payload
        data["username"] = user.username
        data["role"] = role

        return data


# -------------------------------
# Custom JWT Token View
# -------------------------------
class MyTokenObtainPairView(TokenObtainPairView):
    serializer_class = MyTokenObtainPairSerializer


# -------------------------------
# Endpoint to get current logged-in user info
# -------------------------------
@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def current_user(request):
    """
    Returns the current user's username, email, and role.
    """
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
