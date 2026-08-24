from services.agent_cache_service import get_cached_result, make_cache_key, store_result


def test_make_cache_key_is_deterministic():
    assert make_cache_key("REQ-015", 3) == make_cache_key("REQ-015", 3)


def test_make_cache_key_differs_by_version():
    assert make_cache_key("REQ-015", 3) != make_cache_key("REQ-015", 4)


def test_get_cached_result_returns_none_when_absent(db_session):
    assert get_cached_result(db_session, make_cache_key("REQ-999", 1)) is None


def test_store_then_get_round_trips(db_session):
    key = make_cache_key("REQ-015", 3)
    result = {"req_id": "REQ-015", "version": 3, "summary": {"linked_tc_count": 0, "related_tc_count": 0, "defect_count": 0}, "tc_updates": [], "tc_gaps": [], "questions": []}

    store_result(db_session, key, result)

    assert get_cached_result(db_session, key) == result


def test_store_result_overwrites_existing_key(db_session):
    key = make_cache_key("REQ-015", 3)
    store_result(db_session, key, {"req_id": "REQ-015", "version": 3, "summary": {"linked_tc_count": 0, "related_tc_count": 0, "defect_count": 0}, "tc_updates": [], "tc_gaps": [], "questions": []})
    store_result(db_session, key, {"req_id": "REQ-015", "version": 3, "summary": {"linked_tc_count": 1, "related_tc_count": 0, "defect_count": 0}, "tc_updates": [], "tc_gaps": [], "questions": []})

    cached = get_cached_result(db_session, key)
    assert cached["summary"]["linked_tc_count"] == 1
