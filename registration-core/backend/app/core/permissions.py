"""Permission registry defining all available permissions and their default role requirements."""
from dataclasses import dataclass
from app.models import Role


@dataclass
class Permission:
    """Represents a permission with its metadata."""
    name: str
    description: str
    category: str  # menu_access, route_access, action
    default_min_role: Role


# Permission registry - defines all available permissions
PERMISSIONS: dict[str, Permission] = {
    # User Management Permissions
    "user_management.view": Permission(
        name="user_management.view",
        description="View user management page",
        category="menu_access",
        default_min_role=Role.Staff,
    ),
    "user_management.create": Permission(
        name="user_management.create",
        description="Create new users",
        category="action",
        default_min_role=Role.Manager,
    ),
    "user_management.edit": Permission(
        name="user_management.edit",
        description="Edit existing users",
        category="action",
        default_min_role=Role.Manager,
    ),
    "user_management.delete": Permission(
        name="user_management.delete",
        description="Delete users",
        category="action",
        default_min_role=Role.Director,
    ),

    # Coordinator Management Permissions
    "coordinator_management.view": Permission(
        name="coordinator_management.view",
        description="View coordinator management page",
        category="menu_access",
        default_min_role=Role.Staff,
    ),
    "coordinator_management.create": Permission(
        name="coordinator_management.create",
        description="Create new coordinators",
        category="action",
        default_min_role=Role.Manager,
    ),
    "coordinator_management.edit": Permission(
        name="coordinator_management.edit",
        description="Edit coordinators",
        category="action",
        default_min_role=Role.Manager,
    ),
    "coordinator_management.delete": Permission(
        name="coordinator_management.delete",
        description="Delete coordinators",
        category="action",
        default_min_role=Role.Director,
    ),

    # Exam Management Permissions
    "exam_management.view": Permission(
        name="exam_management.view",
        description="View exam management page",
        category="menu_access",
        default_min_role=Role.Staff,
    ),
    "exam_management.create": Permission(
        name="exam_management.create",
        description="Create new exams",
        category="action",
        default_min_role=Role.PrincipalManager,
    ),
    "exam_management.edit": Permission(
        name="exam_management.edit",
        description="Edit exams",
        category="action",
        default_min_role=Role.PrincipalManager,
    ),
    "exam_management.delete": Permission(
        name="exam_management.delete",
        description="Delete exams",
        category="action",
        default_min_role=Role.Director,
    ),

    # Certificate Request Management Permissions
    "certificate_management.view": Permission(
        name="certificate_management.view",
        description="View certificate request management page",
        category="menu_access",
        default_min_role=Role.Staff,
    ),
    "certificate_management.process": Permission(
        name="certificate_management.process",
        description="Process certificate requests",
        category="action",
        default_min_role=Role.Manager,
    ),
    "certificate_management.approve": Permission(
        name="certificate_management.approve",
        description="Approve certificate requests",
        category="action",
        default_min_role=Role.SeniorManager,
    ),

    # School Management Permissions
    "school_management.view": Permission(
        name="school_management.view",
        description="View school management page",
        category="menu_access",
        default_min_role=Role.Staff,
    ),
    "school_management.create": Permission(
        name="school_management.create",
        description="Create new schools",
        category="action",
        default_min_role=Role.Manager,
    ),
    "school_management.edit": Permission(
        name="school_management.edit",
        description="Edit schools",
        category="action",
        default_min_role=Role.Manager,
    ),
    "school_management.delete": Permission(
        name="school_management.delete",
        description="Delete schools",
        category="action",
        default_min_role=Role.Director,
    ),

    # Programme Management Permissions
    "programme_management.view": Permission(
        name="programme_management.view",
        description="View programme management page",
        category="menu_access",
        default_min_role=Role.Staff,
    ),
    "programme_management.create": Permission(
        name="programme_management.create",
        description="Create new programmes",
        category="action",
        default_min_role=Role.Manager,
    ),
    "programme_management.edit": Permission(
        name="programme_management.edit",
        description="Edit programmes",
        category="action",
        default_min_role=Role.Manager,
    ),
    "programme_management.delete": Permission(
        name="programme_management.delete",
        description="Delete programmes",
        category="action",
        default_min_role=Role.Director,
    ),

    # Subject Management Permissions
    "subject_management.view": Permission(
        name="subject_management.view",
        description="View subject management page",
        category="menu_access",
        default_min_role=Role.Staff,
    ),
    "subject_management.create": Permission(
        name="subject_management.create",
        description="Create new subjects",
        category="action",
        default_min_role=Role.Manager,
    ),
    "subject_management.edit": Permission(
        name="subject_management.edit",
        description="Edit subjects",
        category="action",
        default_min_role=Role.Manager,
    ),
    "subject_management.delete": Permission(
        name="subject_management.delete",
        description="Delete subjects",
        category="action",
        default_min_role=Role.Director,
    ),

    # Results Management Permissions
    "results_management.view": Permission(
        name="results_management.view",
        description="View results management page",
        category="menu_access",
        default_min_role=Role.Staff,
    ),
    "results_management.create": Permission(
        name="results_management.create",
        description="Create/upload results",
        category="action",
        default_min_role=Role.Manager,
    ),
    "results_management.edit": Permission(
        name="results_management.edit",
        description="Edit results",
        category="action",
        default_min_role=Role.Manager,
    ),
    "results_management.publish": Permission(
        name="results_management.publish",
        description="Publish results",
        category="action",
        default_min_role=Role.SeniorManager,
    ),
    "results_management.block": Permission(
        name="results_management.block",
        description="Block results",
        category="action",
        default_min_role=Role.SeniorManager,
    ),

    # Settings Permissions
    "settings.view": Permission(
        name="settings.view",
        description="View settings page",
        category="menu_access",
        default_min_role=Role.Manager,
    ),
    "settings.edit": Permission(
        name="settings.edit",
        description="Edit system settings",
        category="action",
        default_min_role=Role.Director,
    ),

    # Permission Management (meta-permission)
    "permission_management": Permission(
        name="permission_management",
        description="Manage role and user permissions",
        category="action",
        default_min_role=Role.Director,
    ),

    # Dashboard Access
    "dashboard.view": Permission(
        name="dashboard.view",
        description="View admin dashboard",
        category="menu_access",
        default_min_role=Role.Staff,
    ),
}


def get_permission(permission_key: str) -> Permission | None:
    """Get a permission by its key."""
    return PERMISSIONS.get(permission_key)


def get_all_permissions() -> dict[str, Permission]:
    """Get all registered permissions."""
    return PERMISSIONS.copy()


def get_permissions_by_category(category: str) -> dict[str, Permission]:
    """Get all permissions in a specific category."""
    return {k: v for k, v in PERMISSIONS.items() if v.category == category}
