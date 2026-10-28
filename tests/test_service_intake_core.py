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
    ("Training", "Intake", "fout" + chr(0)),
])
def test_invalid_intakes(service, subject, note):
    with pytest.raises(ValueError):
        make_intake_draft(service, subject, note)

def test_no_fake_recovery_or_calendar_actions():
    with pytest.raises(RuntimeError):
        recovery_advice("test")
    with pytest.raises(RuntimeError):
        sync_calendar("test")

@pytest.mark.parametrize('subject,note', [(None, ''), (42, ''), ('   ', ''), ('Intake', None), ('Intake', 42), ('Intake', '\x7f'), ('Intake', '\x01')])
def test_invalid_types_and_controls(subject, note):
    with pytest.raises(ValueError):
        make_intake_draft('Training', subject, note)

def test_exact_limits_and_trimming():
    item = make_intake_draft('Training', 'x' * 100, 'y' * 250)
    assert len(item.subject) == 100
    assert len(item.note) == 250
    assert make_intake_draft('Training', '  Intake  ', '  note  ').subject == 'Intake'
