from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from dashboard.models import UserAccessProfile


class Command(BaseCommand):
    help = "Grant an existing account the application Admin role."

    def add_arguments(self, parser):
        parser.add_argument("email")

    def handle(self, *args, **options):
        email = options["email"].strip()
        if not email:
            raise CommandError("An account email is required.")

        User = get_user_model()
        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist as error:
            raise CommandError(
                f"No account exists for {email}. Sign in once before promoting it."
            ) from error

        profile, _ = UserAccessProfile.objects.get_or_create(user=user)
        if profile.role != UserAccessProfile.Role.ADMIN:
            profile.role = UserAccessProfile.Role.ADMIN
            profile.save(update_fields=["role", "updated_at"])
        self.stdout.write(self.style.SUCCESS(f"{user.email} now has the Admin role."))
