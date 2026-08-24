import hashlib
import json

from sqlalchemy.orm import Session

from models.all_models import AgentCache


def make_cache_key(req_id: str, version: int) -> str:
    return hashlib.md5(f"{req_id}_{version}".encode()).hexdigest()


def get_cached_result(db: Session, cache_key: str) -> dict | None:
    row = db.query(AgentCache).filter(AgentCache.cache_key == cache_key).first()
    if row is None:
        return None
    return json.loads(row.result_json)


def store_result(db: Session, cache_key: str, result: dict) -> None:
    row = db.query(AgentCache).filter(AgentCache.cache_key == cache_key).first()
    if row is not None:
        row.result_json = json.dumps(result)
    else:
        row = AgentCache(cache_key=cache_key, result_json=json.dumps(result))
        db.add(row)
    db.commit()
