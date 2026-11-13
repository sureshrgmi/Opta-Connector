from django.contrib.auth import get_user_model
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import UserAccessProfile


@receiver(post_save, sender=get_user_model())
def create_access_profile(sender, instance, created, **kwargs):
    if created:
        UserAccessProfile.objects.get_or_create(user=instance)
