"""CLI script to backfill modules onto the Home Lending System seed data.

seed.py has seeded Module rows and linked requirements.module_id since
c7f3a9d2e158_add_modules_table landed, but seed.py exits early ("Seed data
already present, skipping") whenever the project already exists — so a DB
that was seeded before that logic was added is stuck with zero modules and
every requirement.module_id NULL. This script backfills that gap using the
same req_id -> module mapping in seed_data/requirements.json, without
touching anything else seed.py already got right.

Safe to re-run: modules are get-or-created by (project_id, name), and only
requirement rows with module_id IS NULL are updated.

Run from backend/ with the venv active and the DB up:
    python backfill_modules.py
"""
from seed import PROJECT_NAME, load_json
from models.all_models import Module, Project, Requirement
from models.base import SessionLocal


def main() -> None:
    db = SessionLocal()
    try:
        project = db.query(Project).filter(Project.name == PROJECT_NAME).first()
        if project is None:
            print(f'No project named "{PROJECT_NAME}" found — run seed.py first.')
            return

        req_data = load_json("requirements.json")
        module_by_req_id = {row["req_id"]: row["module"] for row in req_data if row.get("module")}

        existing_modules = {m.name: m for m in db.query(Module).filter(Module.project_id == project.id)}
        modules = dict(existing_modules)
        for name in sorted(set(module_by_req_id.values())):
            if name not in modules:
                module = Module(project_id=project.id, name=name)
                db.add(module)
                modules[name] = module
        db.flush()

        unlinked = (
            db.query(Requirement)
            .filter(Requirement.project_id == project.id, Requirement.module_id.is_(None))
            .all()
        )
        updated = 0
        skipped_req_ids = set()
        for req in unlinked:
            module_name = module_by_req_id.get(req.req_id)
            if module_name is None:
                skipped_req_ids.add(req.req_id)
                continue
            req.module_id = modules[module_name].id
            updated += 1

        db.commit()

        created_count = len(modules) - len(existing_modules)
        print(f"Modules: {created_count} created, {len(existing_modules)} already present.")
        print(f"Requirements: {updated} linked to a module.")
        if skipped_req_ids:
            print(
                f"Skipped {len(skipped_req_ids)} requirement(s) not in requirements.json "
                f"(no module mapping available): {', '.join(sorted(skipped_req_ids))}"
            )
    finally:
        db.close()


if __name__ == "__main__":
    main()
