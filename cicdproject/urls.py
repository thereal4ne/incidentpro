from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenRefreshView
from accounts.views import MyTokenObtainPairView

from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    # ===== ADMIN =====
    path("admin/", admin.site.urls),

    # ===== JWT AUTH =====
    path("api/token/", MyTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),

    # ===== ACCOUNTS =====
    path("api/accounts/", include("accounts.api_urls")),

    # ===== INCIDENTS =====
    path("api/", include("incidents.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
