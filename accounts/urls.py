from django.urls import path
from .views import MyTokenObtainPairView, current_user

urlpatterns = [
    path('login/', MyTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('me/', current_user, name='current_user'),
]
