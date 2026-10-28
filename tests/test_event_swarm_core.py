import pytest
from event_swarm_core import create_event_draft, capacity_available, request_ticket

def test_event_draft_is_not_booking():
    e = create_event_draft("Clubavond", 10, "2026-11-07T18:00:00+01:00")
    assert e.status == "concept"
    assert e.capacity == 10
    assert len(e.id) == 32

@pytest.mark.parametrize("title,capacity,start", [
    ("", 10, "2026-11-07T18:00:00+01:00"),
    ("A", 0, "2026-11-07T18:00:00+01:00"),
    ("A", True, "2026-11-07T18:00:00+01:00"),
    ("A", 10, "2026-11-07T18:00:00"),
    ("A", 10, "morgen"),
])
def test_reject_invalid_events(title, capacity, start):
    with pytest.raises(ValueError):
        create_event_draft(title, capacity, start)

def test_capacity_is_advisory_only():
    assert capacity_available(10, 9)
    assert not capacity_available(10, 10)
    assert not capacity_available(10, 11)

@pytest.mark.parametrize("capacity,confirmed", [(True, 0), (10, -1), (0, 0), (10, 0.5)])
def test_reject_invalid_counts(capacity, confirmed):
    with pytest.raises(ValueError):
        capacity_available(capacity, confirmed)

def test_claim_cannot_fake_success():
    with pytest.raises(RuntimeError):
        request_ticket("event", "user")
