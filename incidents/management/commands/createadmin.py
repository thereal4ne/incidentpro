from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
import os


class Command(BaseCommand):
    def handle(self, *args, **kwargs):
        # Create admin
        username = os.environ.get('ADMIN_USERNAME', 'albinjacob')
        email = os.environ.get('ADMIN_EMAIL', 'albinjacob157@gmail.com')
        password = os.environ.get('ADMIN_PASSWORD', 'iamalbin123@')

        if not User.objects.filter(username=username).exists():
            user = User.objects.create_superuser(username, email, password)
            user.userprofile.role = 'ADMIN'
            user.userprofile.save()
            self.stdout.write(f'Admin {username} created!')
        else:
            self.stdout.write(f'Admin {username} already exists.')

        # Create employee1
        emp_username = os.environ.get('EMP_USERNAME', 'employee1')
        emp_email = os.environ.get('EMP_EMAIL', 'jacobalbin39@gmail.com')
        emp_password = os.environ.get('EMP_PASSWORD', 'employee12345')

        if not User.objects.filter(username=emp_username).exists():
            emp = User.objects.create_user(emp_username, emp_email, emp_password)
            emp.userprofile.role = 'EMPLOYEE'
            emp.userprofile.save()
            self.stdout.write(f'Employee {emp_username} created!')
        else:
            self.stdout.write(f'Employee {emp_username} already exists.')
