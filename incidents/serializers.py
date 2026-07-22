import bleach
from rest_framework import serializers
from .models import Incident, Activity, Attachment, Postmortem
from .models import Notification


# ── Allowed HTML — none. Strip everything. ──
ALLOWED_TAGS = []
ALLOWED_ATTRS = {}


def sanitise(value):
    """Strip all HTML tags and normalise whitespace."""
    if not isinstance(value, str):
        return value
    return bleach.clean(value, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS, strip=True).strip()


class IncidentCreateSerializer(serializers.Serializer):
    """Used for validating and sanitising incident creation input."""
    title = serializers.CharField(max_length=200)
    description = serializers.CharField(max_length=5000)
    priority = serializers.ChoiceField(
        choices=["LOW", "MEDIUM", "HIGH", "CRITICAL"],
        default="LOW"
    )
    assigned_to = serializers.CharField(max_length=150, required=False, allow_blank=True)

    def validate_title(self, value):
        value = sanitise(value)
        if not value:
            raise serializers.ValidationError("Title cannot be empty.")
        return value

    def validate_description(self, value):
        value = sanitise(value)
        if not value:
            raise serializers.ValidationError("Description cannot be empty.")
        return value

    def validate_assigned_to(self, value):
        if value:
            return sanitise(value)
        return value


class CommentCreateSerializer(serializers.Serializer):
    """Used for validating and sanitising comment input."""
    text = serializers.CharField(max_length=2000)

    def validate_text(self, value):
        value = sanitise(value)
        if not value:
            raise serializers.ValidationError("Comment text cannot be empty.")
        return value


class IncidentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Incident
        fields = '__all__'
        read_only_fields = ["reported_by"]


class ActivitySerializer(serializers.ModelSerializer):
    actor = serializers.StringRelatedField()

    class Meta:
        model = Activity
        fields = "__all__"


class AttachmentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
        fields = ["id", "file", "file_url", "uploaded_by", "uploaded_at"]

    def get_file_url(self, obj):
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.file.url)
        return obj.file.url


class NotificationSerializer(serializers.ModelSerializer):
    incident_id = serializers.IntegerField(source='incident.id', read_only=True, allow_null=True)
    incident_title = serializers.CharField(source='incident.title', read_only=True, allow_null=True)

    class Meta:
        model = Notification
        fields = [
            'id', 'notif_type', 'title', 'message',
            'is_read', 'created_at',
            'incident_id', 'incident_title',
        ]
        read_only_fields = fields

class PostmortemSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()

    class Meta:
        model = Postmortem
        fields = [
            'id', 'incident', 'root_cause', 'impact',
            'resolution', 'prevention', 'author',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'author', 'created_at', 'updated_at']

    def get_author(self, obj):
        return obj.author.username if obj.author else None
