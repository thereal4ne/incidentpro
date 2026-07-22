# Generated manually — removes Team, TeamMembership, and the orphaned
# incidents.UserProfile which were created in 0013 but subsequently
# removed from models.py.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('incidents', '0013_teammembership_userprofile_postmortem_team_and_more'),
    ]

    operations = [
        # 1. Drop the unique_together constraint first
        migrations.AlterUniqueTogether(
            name='teammembership',
            unique_together=set(),
        ),
        # 2. Remove the index on incident.team before dropping the field
        migrations.RemoveIndex(
            model_name='incident',
            name='incident_team_idx',
        ),
        # 3. Remove the FK field on Incident that points to Team
        migrations.RemoveField(
            model_name='incident',
            name='team',
        ),
        # 4. Delete TeamMembership (has FK to Team, must go first)
        migrations.DeleteModel(
            name='TeamMembership',
        ),
        # 5. Delete Team
        migrations.DeleteModel(
            name='Team',
        ),
        # 6. Delete the orphaned incidents.UserProfile
        #    (accounts.UserProfile is the one actually used)
        migrations.DeleteModel(
            name='UserProfile',
        ),
    ]
