from sqlalchemy import (
    Column, Integer, String, Text, Boolean,
    ForeignKey, TIMESTAMP, UniqueConstraint, func
)
from sqlalchemy.dialects.postgresql import ARRAY
from pgvector.sqlalchemy import Vector
from .base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255))
    is_active = Column(Boolean, default=True)
    status = Column(String(20), default="Active")
    is_superadmin = Column(Boolean, default=False)
    can_create_projects = Column(Boolean, default=False)
    created_at = Column(TIMESTAMP, server_default=func.now())


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    key = Column(String(20), unique=True, nullable=False)
    lead_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String(20), default="Active")
    require_requirement_link = Column(Boolean, default=True)
    auto_resolve_days = Column(Integer, nullable=True)
    ai_impact_suggestions = Column(Boolean, default=True)
    default_severity = Column(String(20), default="Medium")
    created_at = Column(TIMESTAMP, server_default=func.now())


class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True)
    key = Column(String(20), unique=True, nullable=False)
    name = Column(String(50), nullable=False)


class RolePermission(Base):
    __tablename__ = "role_permissions"
    __table_args__ = (
        UniqueConstraint("role_id", "area", name="uq_role_permissions_role_area"),
    )

    id = Column(Integer, primary_key=True)
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=False)
    area = Column(String(30), nullable=False)
    level = Column(String(10), nullable=False)


class ProjectMember(Base):
    __tablename__ = "project_members"
    __table_args__ = (
        UniqueConstraint("project_id", "user_id", name="uq_project_members_project_user"),
    )

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())


class Release(Base):
    __tablename__ = "releases"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    version_name = Column(String(50), nullable=False)
    note = Column(Text)
    created_at = Column(TIMESTAMP, server_default=func.now())


class Module(Base):
    __tablename__ = "modules"
    __table_args__ = (
        UniqueConstraint("project_id", "name", name="uq_modules_project_name"),
    )

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    name = Column(String(100), nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())


class Requirement(Base):
    __tablename__ = "requirements"
    __table_args__ = (
        UniqueConstraint("req_id", "version", name="uq_req_id_version"),
    )

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    req_id = Column(String(20), nullable=False)
    version = Column(Integer, nullable=False)
    title = Column(Text, nullable=False)
    description = Column(Text, nullable=False)
    module_id = Column(Integer, ForeignKey("modules.id"), nullable=True)
    status = Column(String(20), default="Draft")
    is_current = Column(Boolean, default=False)
    change_note = Column(Text)
    changed_by = Column(String(100))
    previous_version_id = Column(
        Integer, ForeignKey("requirements.id"), nullable=True
    )
    created_at = Column(TIMESTAMP, server_default=func.now())


class TestCase(Base):
    __tablename__ = "test_cases"

    id = Column(Integer, primary_key=True)
    code = Column(String(20), unique=True, nullable=False)
    title = Column(Text, nullable=False)
    preconditions = Column(Text)
    steps = Column(Text)
    expected_result = Column(Text, nullable=False)
    priority = Column(String(10))
    status = Column(String(20), default="Draft")
    requirement_id = Column(
        Integer, ForeignKey("requirements.id"), nullable=True
    )
    embedding = Column(Vector(768), nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())


class Defect(Base):
    __tablename__ = "defects"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    code = Column(String(20), unique=True, nullable=False)
    title = Column(Text, nullable=False)
    description = Column(Text)
    severity = Column(String(20))
    status = Column(String(20), default="Open")
    testcase_id = Column(Integer, ForeignKey("test_cases.id"), nullable=True)
    requirement_id = Column(Integer, ForeignKey("requirements.id"), nullable=True)
    found_in_version = Column(String(50))
    fixed_in_version = Column(String(50))
    created_at = Column(TIMESTAMP, server_default=func.now())


class TestRun(Base):
    __tablename__ = "test_runs"

    id = Column(Integer, primary_key=True)
    release_id = Column(Integer, ForeignKey("releases.id"), nullable=False)
    executed_at = Column(TIMESTAMP, server_default=func.now())
    executed_by = Column(String(100))
    note = Column(Text)


class TestRunResult(Base):
    __tablename__ = "test_run_results"
    __table_args__ = (
        UniqueConstraint("run_id", "testcase_id", name="uq_run_testcase"),
    )

    id = Column(Integer, primary_key=True)
    run_id = Column(Integer, ForeignKey("test_runs.id"), nullable=False)
    testcase_id = Column(Integer, ForeignKey("test_cases.id"), nullable=False)
    result = Column(String(20))
    note = Column(Text)