# accounts/api_urls.py
from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from . import views

urlpatterns = [
    path('login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('employees/', views.list_employees, name='list_employees'),
    path('employees/create/', views.create_employee, name='create_employee'),
    path('employees/<int:user_id>/toggle/', views.toggle_employee_status, name='toggle_employee_status'),
]
