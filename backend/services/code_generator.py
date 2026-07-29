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
