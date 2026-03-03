# accounts/serializers.py
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

class MyTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        user = self.user
        try:
            role = user.userprofile.role
        except Exception:
            role = "EMPLOYEE"
        data["role"] = role
        data["username"] = user.username
        return data
