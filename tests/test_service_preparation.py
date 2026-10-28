"""UI and core contracts: fixed choices only, no implicit retention or action."""
from contextlib import nullcontext
from dataclasses import asdict
from itertools import product
import pytest
import service_intake_core as core
import service_intake_ui as ui


@pytest.mark.parametrize('service,purpose', list(product(core.SERVICES, core.PURPOSES)))
def test_only_minimal_fields(service, purpose):
    assert asdict(core.prepare_service_request(service, purpose)) == {
        'service': service, 'purpose': purpose, 'status': 'voorbereiding'}


@pytest.mark.parametrize('value', [None, '', 1, {}, [], 'synthetic@example.invalid', 'klachten', '<script>'])
def test_arbitrary_content_rejected(value):
    with pytest.raises(ValueError):
        core.prepare_service_request(value, core.PURPOSES[0])
    with pytest.raises(ValueError):
        core.prepare_service_request(core.SERVICES[0], value)


class Screen:
    def __init__(self, submitted, values):
        self.submitted, self.values = submitted, iter(values)
        self.messages = []
    def form(self, name, **kwargs):
        assert kwargs == {'clear_on_submit': True}
        return nullcontext()
    def selectbox(self, label, options, **kwargs):
        assert kwargs['index'] is None
        assert options in (core.SERVICES, core.PURPOSES)
        return next(self.values)
    def form_submit_button(self, label):
        assert label == 'Keuze bekijken'
        return self.submitted
    def caption(self, value):
        self.messages.append(value)
    def warning(self, value):
        self.messages.append(value)
    def write(self, value):
        self.messages.append(value)


@pytest.mark.parametrize('submitted', [False, True])
def test_ui_has_only_fixed_choices_and_no_actions(monkeypatch, submitted):
    import opslag
    import multistream_store
    def forbidden(*args, **kwargs):
        pytest.fail('preparation attempted persistence or external action')
    for module, names in [(opslag, ['laden', 'opslaan', '_rpc']),
                          (multistream_store, ['add_draft']),
                          (core, ['save_intake_draft', 'recovery_advice', 'sync_calendar'])]:
        for name in names:
            monkeypatch.setattr(module, name, forbidden)
    screen = Screen(submitted, [core.SERVICES[0], core.PURPOSES[0]])
    ui.render_preparation(screen)
    assert ('Dienst: Training' in screen.messages) is submitted


def test_ui_does_not_echo_invalid_payload():
    screen = Screen(True, ['synthetic@example.invalid', 'not allowed'])
    ui.render_preparation(screen)
    assert 'Kies een dienst en een doel.' in screen.messages
    assert not any('synthetic@example.invalid' in message for message in screen.messages)
