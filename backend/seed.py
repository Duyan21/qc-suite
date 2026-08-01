"""CLI script to populate the dev DB with demo data (Sprint 1 task S1-F).

Run from backend/ with the venv active and the DB up:
    python seed.py
"""
import random

from models.all_models import (
    Defect,
    Project,
    Release,
    Requirement,
    TestCase,
    TestRun,
    TestRunResult,
)
from models.base import SessionLocal

PROJECT_NAME = "Home Lending Platform"

REQ_GROUPS = [
    "Loan Application Intake",
    "Credit & Risk Assessment",
    "Authentication & Account Access",
    "Document Verification",
    "Approval Workflow",
    "Disbursement & Servicing",
]

REQ_STATUSES = ["Active", "Active", "Active", "Draft", "Deprecated"]
TC_PRIORITIES = ["High", "Medium", "Low"]
TC_STATUSES = ["Active", "Active", "Active", "Draft", "Deprecated"]
DEFECT_SEVERITIES = ["Critical", "High", "Medium", "Low"]
DEFECT_STATUSES = ["Open", "Fixed", "Closed", "Wont-Fix"]
EXECUTION_RESULTS = ["Pass", "Pass", "Pass", "Fail", "Skip", "Blocked"]

USER_LOGIN_POSITION = 15  # 1-based index into the 50 requirements
NUM_REQUIREMENTS = 50
NUM_TEST_CASES = 350
NUM_DEFECTS = 50
NUM_UNCOVERED_REQUIREMENTS = 3


def seed_project(db):
    project = Project(
        name=PROJECT_NAME,
        description="Consumer home lending origination and servicing platform.",
    )
    db.add(project)
    db.flush()
    return project


def seed_releases(db, project):
    releases = []
    for i in range(5):
        release = Release(
            project_id=project.id,
            version_name=f"v2.{i}.0",
            note=f"Release v2.{i}.0",
        )
        db.add(release)
        releases.append(release)
    db.flush()
    return releases


def seed_requirements(db, project):
    requirements = []
    for i in range(1, NUM_REQUIREMENTS + 1):
        req_id = f"REQ-{i:03d}"
        group = REQ_GROUPS[(i - 1) % len(REQ_GROUPS)]

        if i == USER_LOGIN_POSITION:
            v1 = Requirement(
                project_id=project.id,
                req_id=req_id,
                version=1,
                title="User Login",
                description=(
                    "As a registered user, I can log in with my email and "
                    "password to access my loan dashboard."
                ),
                status="Deprecated",
                is_current=False,
            )
            db.add(v1)
            db.flush()

            v2 = Requirement(
                project_id=project.id,
                req_id=req_id,
                version=2,
                title="User Login",
                description=(
                    "As a registered user, I can log in with my email and "
                    "password, then confirm a one-time passcode (OTP) sent "
                    "to my phone before accessing my loan dashboard."
                ),
                status="Active",
                is_current=True,
                change_note="Added OTP step after login incident.",
                changed_by="seed-script",
                previous_version_id=v1.id,
            )
            db.add(v2)
            requirements.append(v2)
            continue

        req = Requirement(
            project_id=project.id,
            req_id=req_id,
            version=1,
            title=f"{group} - Feature {i}",
            description=f"Requirement covering {group.lower()} scenario #{i}.",
            status=random.choice(REQ_STATUSES),
            is_current=True,
        )
        db.add(req)
        requirements.append(req)

    db.flush()
    return requirements


def seed_test_cases(db, requirements):
    uncovered = set(random.sample(range(len(requirements)), NUM_UNCOVERED_REQUIREMENTS))

    covered_requirements = [
        req for idx, req in enumerate(requirements) if idx not in uncovered
    ]

    test_cases = []
    counter = 1
    while len(test_cases) < NUM_TEST_CASES:
        for req in covered_requirements:
            if len(test_cases) >= NUM_TEST_CASES:
                break
            tc = TestCase(
                code=f"TC-{counter:03d}",
                title=f"Verify {req.title} - case {counter}",
                preconditions="User has a valid account and is on the relevant screen.",
                steps="1. Navigate to the feature.\n2. Perform the action.\n3. Observe the result.",
                expected_result="The system behaves as described in the requirement.",
                priority=random.choice(TC_PRIORITIES),
                status=random.choice(TC_STATUSES),
                requirement_id=req.id,
            )
            db.add(tc)
            test_cases.append(tc)
            counter += 1

    db.flush()
    return test_cases


def seed_defects(db, test_cases, requirements):
    defects = []
    for i in range(1, NUM_DEFECTS + 1):
        testcase_id = None
        requirement_id = None
        if random.random() < 0.7:
            testcase_id = random.choice(test_cases).id
        if random.random() < 0.5:
            requirement_id = random.choice(requirements).id

        defect = Defect(
            code=f"DEF-{i:03d}",
            title=f"Defect #{i} in demo data",
            description=f"Auto-generated defect #{i} for seed/demo purposes.",
            severity=random.choice(DEFECT_SEVERITIES),
            status=random.choice(DEFECT_STATUSES),
            testcase_id=testcase_id,
            requirement_id=requirement_id,
            found_in_version="v2.1.0",
        )
        db.add(defect)
        defects.append(defect)

    db.flush()
    return defects


def seed_test_runs(db, releases, test_cases):
    target_releases = [r for r in releases if r.version_name in ("v2.3.0", "v2.4.0")]

    results = []
    for release in target_releases:
        run = TestRun(
            release_id=release.id,
            executed_by="seed-script",
            note=f"Seed execution run for {release.version_name}",
        )
        db.add(run)
        db.flush()

        sample_size = max(1, int(len(test_cases) * 0.6))
        for tc in random.sample(test_cases, sample_size):
            result = TestRunResult(
                run_id=run.id,
                testcase_id=tc.id,
                result=random.choice(EXECUTION_RESULTS),
            )
            db.add(result)
            results.append(result)

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

        project = seed_project(db)
        releases = seed_releases(db, project)
        requirements = seed_requirements(db, project)
        test_cases = seed_test_cases(db, requirements)
        defects = seed_defects(db, test_cases, requirements)
        results = seed_test_runs(db, releases, test_cases)

        db.commit()

        print(
            f"Inserted: 1 project, {len(releases)} releases, "
            f"{len(requirements)} requirements (current versions), "
            f"{len(test_cases)} test cases, {len(defects)} defects, "
            f"2 test runs, {len(results)} test run results."
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
