import re

from sqlalchemy.orm import Session


def next_code(db: Session, model: type, code_column: str, prefix: str, padding: int = 3) -> str:
    column = getattr(model, code_column)
    like_pattern = f"{prefix}-%"
    rows = db.query(column).filter(column.like(like_pattern)).all()

    pattern = re.compile(rf"^{re.escape(prefix)}-(\d+)$")
    max_num = 0
    for (code,) in rows:
        match = pattern.match(code)
        if match:
            max_num = max(max_num, int(match.group(1)))

    return f"{prefix}-{max_num + 1:0{padding}d}"


def extract_number_suffix(code: str) -> str | None:
    """Pulls the trailing digit run off a code like "REQ-010" -> "010", preserving
    its zero-padding so child codes line up with the parent's own numbering width."""
    match = re.search(r"(\d+)$", code)
    return match.group(1) if match else None


def next_child_code(
    db: Session, model: type, code_column: str, prefix: str, parent_number: str, padding: int = 3
) -> str:
    """Like next_code, but scoped to a parent — e.g. TC-010-003 is the 3rd test case
    under requirement number 010. The sequence is independent per parent number, so two
    different requirements can both have a "-001"."""
    column = getattr(model, code_column)
    like_pattern = f"{prefix}-{parent_number}-%"
    rows = db.query(column).filter(column.like(like_pattern)).all()

    pattern = re.compile(rf"^{re.escape(prefix)}-{re.escape(parent_number)}-(\d+)$")
    max_num = 0
    for (code,) in rows:
        match = pattern.match(code)
        if match:
            max_num = max(max_num, int(match.group(1)))

    return f"{prefix}-{parent_number}-{max_num + 1:0{padding}d}"
