"""CLI script to populate the dev DB with demo data (Sprint 1 task S1-F).

Data is sourced from the Home Lending BRS and QA artifacts in
docs/Home_lending/ (50 requirements across 6 modules, 300 test cases,
18 defects), pre-extracted into backend/seed_data/*.json by
backend/seed_data/_extract.py.

Run from backend/ with the venv active and the DB up:
    python seed.py
"""
import json
import os
import random

from models.all_models import (
    Defect,
    Module,
    Project,
    ProjectMember,
    Release,
    Requirement,
    Role,
    TestCase,
    TestRun,
    TestRunResult,
    User,
)
from models.base import SessionLocal
from services.auth_service import hash_password

PROJECT_NAME = "Home Lending System"

SEED_DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "seed_data")

# The versioning demo (append-only pattern) is grounded in a real BRS business
# rule: "Income document must be issued within the last 3 months." REQ-013 is
# seeded as v1 (6-month window, superseded) and v2 (3-month window, current).
VERSIONED_REQ_ID = "REQ-013"
VERSIONED_OLD_DESCRIPTION = (
    "System verifies the applicant's income using payslips or bank "
    "statements issued within the last 6 months."
)
VERSIONED_NEW_DESCRIPTION = (
    "System verifies the applicant's income using payslips or bank "
    "statements issued within the last 3 months, per updated compliance policy."
)

EXECUTION_RESULTS_WEIGHTED = ["Pass"] * 7 + ["Fail"] + ["Skip"] + ["Blocked"]
OPEN_DEFECT_STATUSES = {"New", "Assigned", "In Progress", "Ready for Retest"}
CLOSED_DEFECT_STATUSES = {"Fixed", "Closed"}

# backend/seed_data/defects.json carries legacy workflow-style status strings
# (New/Assigned/In Progress/Ready for Retest/Fixed) that predate the 4-value
# canonical DefectStatus enum (Open/Fixed/Closed/Wont-Fix) defined in
# backend/schemas/defects.py. The frontend filters, /defects/stats, and badge
# coloring all key off exactly those four strings, so only the mapped value
# is ever written to the defects.status column here — the raw legacy string
# from the JSON is left untouched everywhere else (fixed_in_version lookup,
# test-run pass/fail logic) so seed-generation behavior is unchanged except
# for the status column itself.
LEGACY_TO_CANONICAL_DEFECT_STATUS = {
    "New": "Open",
    "Assigned": "Open",
    "In Progress": "Open",
    "Ready for Retest": "Open",
    "Fixed": "Fixed",
}


def load_json(name):
    with open(os.path.join(SEED_DATA_DIR, name), encoding="utf-8") as f:
        return json.load(f)


def seed_project(db):
    project = Project(
        name=PROJECT_NAME,
        key="HLS",
        description=(
            "End-to-end mortgage lifecycle platform: application, KYC, "
            "income verification, property valuation, credit assessment, "
            "approval, contract, disbursement, repayment, and loan closure."
        ),
    )
    db.add(project)
    db.flush()
    return project


def seed_users(db, project):
    admin_role = db.query(Role).filter(Role.key == "admin").one()
    tester_role = db.query(Role).filter(Role.key == "tester").one()

    admin_user = User(
        email="admin@qcsuite.demo",
        hashed_password=hash_password("changeme123"),
        full_name="Demo Admin",
        is_superadmin=True,
    )
    tester_user = User(
        email="tester@qcsuite.demo",
        hashed_password=hash_password("changeme123"),
        full_name="Demo Tester",
    )
    db.add_all([admin_user, tester_user])
    db.flush()

    db.add_all([
        ProjectMember(project_id=project.id, user_id=admin_user.id, role_id=admin_role.id),
        ProjectMember(project_id=project.id, user_id=tester_user.id, role_id=tester_role.id),
    ])
    db.flush()
    return [admin_user, tester_user]


def seed_releases(db, project):
    releases = [
        Release(project_id=project.id, version_name="v1.0.0-SIT", note="SIT build, first full regression pass."),
        Release(project_id=project.id, version_name="v1.1.0-UAT", note="UAT candidate, includes AML and income-policy fixes."),
        Release(project_id=project.id, version_name="v1.2.0-GA", note="General availability release."),
    ]
    db.add_all(releases)
    db.flush()
    return releases


def seed_modules(db, project, req_data):
    names = sorted({row["module"] for row in req_data if row.get("module")})
    modules = {}
    for name in names:
        module = Module(project_id=project.id, name=name)
        db.add(module)
        modules[name] = module
    db.flush()
    return modules


def seed_requirements(db, project, req_data, modules):
    requirements = {}
    for row in req_data:
        req_id = row["req_id"]
        if req_id == VERSIONED_REQ_ID:
            v1 = Requirement(
                project_id=project.id,
                req_id=req_id,
                version=1,
                title=row["title"],
                description=VERSIONED_OLD_DESCRIPTION,
                module_id=modules[row["module"]].id,
                status="Deprecated",
                is_current=False,
            )
            db.add(v1)
            db.flush()

            v2 = Requirement(
                project_id=project.id,
                req_id=req_id,
                version=2,
                title=row["title"],
                description=VERSIONED_NEW_DESCRIPTION,
                module_id=modules[row["module"]].id,
                status="Active",
                is_current=True,
                change_note="Tightened income document validity window from 6 months to 3 months per compliance policy update.",
                changed_by="seed-script",
                previous_version_id=v1.id,
            )
            db.add(v2)
            requirements[req_id] = v2
            continue

        req = Requirement(
            project_id=project.id,
            req_id=req_id,
            version=1,
            title=row["title"],
            description=row["description"],
            module_id=modules[row["module"]].id,
            status="Active",
            is_current=True,
        )
        db.add(req)
        requirements[req_id] = req

    db.flush()
    return requirements


def seed_test_cases(db, requirements, tc_data):
    test_cases = {}
    for row in tc_data:
        req = requirements[row["req_id"]]
        preconditions = f"{row['preconditions']} Test data: {row['test_data']}."
        tc = TestCase(
            code=row["tc_id"],
            title=row["scenario"],
            preconditions=preconditions,
            steps=row["steps"],
            expected_result=row["expected_result"],
            priority=row["priority"],
            status="Active",
            requirement_id=req.id,
        )
        db.add(tc)
        test_cases[row["tc_id"]] = tc

    db.flush()
    return test_cases


def seed_defects(db, project, test_cases, requirements, defect_data, releases):
    fixed_in = next(r for r in releases if r.version_name == "v1.1.0-UAT").version_name
    defects = {}
    for row in defect_data:
        description = (
            f"Steps to Reproduce: {row['steps_to_reproduce']}\n"
            f"Expected: {row['expected_result']}\n"
            f"Actual: {row['actual_result']}\n"
            f"Root Cause: {row['root_cause']}\n"
            f"Category: {row['category']} | Priority: {row['priority']} | "
            f"Environment: {row['environment']}"
        )
        defect = Defect(
            code=row["def_id"],
            title=row["summary"],
            description=description,
            severity=row["severity"],
            status=LEGACY_TO_CANONICAL_DEFECT_STATUS.get(row["status"], row["status"]),
            testcase_id=test_cases[row["tc_id"]].id if row["tc_id"] else None,
            requirement_id=requirements[row["req_id"]].id if row["req_id"] else None,
            found_in_version=row["environment"],
            fixed_in_version=fixed_in if row["status"] in CLOSED_DEFECT_STATUSES else None,
            project_id=project.id,
        )
        db.add(defect)
        defects[row["def_id"]] = defect

    db.flush()
    return defects


def seed_test_runs(db, releases, test_cases, defect_data):
    """SIT run covers full regression; UAT run covers a targeted subset.
    Results for defect-linked test cases are consistent with defect status
    instead of random, so traceability data tells a coherent story.
    """
    defect_by_tc = {row["tc_id"]: row for row in defect_data if row["tc_id"]}

    sit_release = next(r for r in releases if r.version_name == "v1.0.0-SIT")
    uat_release = next(r for r in releases if r.version_name == "v1.1.0-UAT")

    sit_run = TestRun(release_id=sit_release.id, executed_by="seed-script", note="SIT full regression run.")
    uat_run = TestRun(release_id=uat_release.id, executed_by="seed-script", note="UAT targeted regression run.")
    db.add_all([sit_run, uat_run])
    db.flush()

    results = []

    for tc_id, tc in test_cases.items():
        defect = defect_by_tc.get(tc_id)
        if defect is not None:
            result = "Fail"
        else:
            result = random.choice(EXECUTION_RESULTS_WEIGHTED)
        results.append(TestRunResult(run_id=sit_run.id, testcase_id=tc.id, result=result))

    uat_tc_ids = [
        tc_id for tc_id in test_cases
        if tc_id in defect_by_tc or random.random() < 0.4
    ]
    for tc_id in uat_tc_ids:
        tc = test_cases[tc_id]
        defect = defect_by_tc.get(tc_id)
        if defect is not None:
            result = "Pass" if defect["status"] in CLOSED_DEFECT_STATUSES else "Fail"
        else:
            result = random.choice(EXECUTION_RESULTS_WEIGHTED)
        results.append(TestRunResult(run_id=uat_run.id, testcase_id=tc.id, result=result))

    db.add_all(results)
    db.flush()
    return results


def main():
    random.seed(42)
    db = SessionLocal()
    try:
        existing = db.query(Project).filter(Project.name == PROJECT_NAME).first()
        if existing is not None:
            print("Seed data already present, skipping.")
            return

        req_data = load_json("requirements.json")
        tc_data = load_json("test_cases.json")
        defect_data = load_json("defects.json")

        project = seed_project(db)
        users = seed_users(db, project)
        releases = seed_releases(db, project)
        modules = seed_modules(db, project, req_data)
        requirements = seed_requirements(db, project, req_data, modules)
        test_cases = seed_test_cases(db, requirements, tc_data)
        defects = seed_defects(db, project, test_cases, requirements, defect_data, releases)
        results = seed_test_runs(db, releases, test_cases, defect_data)

        db.commit()

        print(
            f"Inserted: 1 project, {len(users)} users, {len(releases)} releases, "
            f"{len(requirements)} requirements (current versions), "
            f"{len(test_cases)} test cases, {len(defects)} defects, "
            f"2 test runs, {len(results)} test run results."
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
