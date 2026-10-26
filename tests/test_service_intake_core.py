import pytest
from service_intake_core import SERVICES, make_intake_draft, recovery_advice, sync_calendar

@pytest.mark.parametrize("service", SERVICES)
def test_private_intake_is_only_a_draft(service):
    item = make_intake_draft(service, "Intake", "Bespreken")
    assert item.status == "concept"
    assert item.service == service

@pytest.mark.parametrize("service,subject,note", [
    ("Onbekend", "Intake", ""),
    ("Training", "", ""),
    ("Training", "x" * 101, ""),
    ("Training", "Intake", "x" * 251),
    ("Training", "Intake", "fout\\x00"),
])
def test_invalid_intakes(service, subject, note):
    with pytest.raises(ValueError):
        make_intake_draft(service, subject, note)

def test_no_fake_recovery_or_calendar_actions():
    with pytest.raises(RuntimeError):
        recovery_advice("test")
    with pytest.raises(RuntimeError):
        sync_calendar("test")
