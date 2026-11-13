from functools import wraps

from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied

from .models import UserAccessProfile


def is_app_admin(user):
    if not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return UserAccessProfile.objects.filter(
        user=user, role=UserAccessProfile.Role.ADMIN
    ).exists()


def app_admin_required(view):
    @login_required
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        if not is_app_admin(request.user):
            raise PermissionDenied
        return view(request, *args, **kwargs)

    return wrapped
