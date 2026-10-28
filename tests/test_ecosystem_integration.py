"""Integration of the supplied ecosystem prototype with the existing hub."""
import ast
from pathlib import Path
import pytest
from streamlit.testing.v1 import AppTest
import ecosystem_core as core
import multistream_core

@pytest.mark.parametrize('prompt,category', [
    ('massage', 'Herstel & Coaching'), ('herstel', 'Herstel & Coaching'),
    ('stijf', 'Herstel & Coaching'), ('client', 'Herstel & Coaching'),
    ('cliënt', 'Herstel & Coaching'), ('dienst', 'Dienstverlening'),
    ('micro-pass', 'Dienstverlening'), ('winkel', 'Verkoop'),
    ('organiseer community event', 'Community'), ('club', 'Community'),
    ('groep', 'Community'), ('verkoop mijn fiets', 'Verkoop'),
    ('bokstraining', 'Sport'), ('verhuur de zaal', 'Verhuur / Rooster'),
    ('Start een videoproject', 'Video Project'), ('project deadline', 'Projecten'),
])
def test_category_filter_consistency(prompt, category):
    result = core.suggest(prompt, core.ROLES[0])
    assert result.category == category
    assert core.classify_intent(prompt) == category
    assert multistream_core.filter_drafts([{'category': category}], category)
    assert result.status == 'suggestie'

@pytest.mark.parametrize('bad', [None, 42, [], '', '   ', 'x'*501, 'x\x00', 'x\x7f'])
def test_invalid_input(bad):
    with pytest.raises(ValueError):
        core.suggest(bad, core.ROLES[0])


def test_roles_never_change_permissions_or_output():
    results = [core.suggest('Verkoop mijn fiets', role) for role in core.ROLES]
    assert all(result == results[0] for result in results)
    with pytest.raises(ValueError):
        core.suggest('Verkoop mijn fiets', 'admin')


def test_no_invented_clinical_or_action_results():
    for text in ['massage', 'event', 'dienst', 'agenda', 'amsterdam']:
        result = core.suggest(text, core.ROLES[0])
        for unsupported in ['48u', 'weefselbelasting gedetecteerd', 'succesvol gepubliceerd',
                            'automatisch geactiveerd', 'naadloos bijgewerkt', 'Global Node']:
            assert unsupported not in result.message
        assert not hasattr(result, 'lat')
        assert not hasattr(result, 'lon')


def test_local_engine_has_no_external_modules():
    tree = ast.parse(Path('ecosystem_core.py').read_text())
    imports = {n.module for n in ast.walk(tree) if isinstance(n, ast.ImportFrom)}
    imports |= {a.name for n in ast.walk(tree) if isinstance(n, ast.Import) for a in n.names}
    assert imports <= {'dataclasses', 'unicodedata', 'master_hub_core', 'multistream_core'}


def make_app():
    return AppTest.from_string('''
import streamlit as st
import ecosystem_ui
st.session_state.setdefault('master_hub_route', None)
ecosystem_ui.render_command_stream(st)
''').run()


def test_real_ui_submit_reset_and_no_history():
    at = make_app()
    assert not at.exception
    assert not at.text_input[0].value
    at.text_input[0].set_value('Verkoop mijn fiets')
    at.button[0].click().run()
    assert not at.exception
    assert at.session_state['master_hub_route'].destination == 'winkel'
    assert 'winkelomgeving' in at.markdown[0].value
    assert 'messages' not in at.session_state
    assert 'global_ecosystem_db' not in at.session_state
    assert 'authenticated' not in at.session_state
    at.text_input[0].set_value('')
    at.button[0].click().run()
    assert not at.exception
    assert 'master_hub_route' not in at.session_state or at.session_state['master_hub_route'] is None
    assert at.warning


def test_health_ui_keeps_advice_and_client_data_blocked():
    at = make_app()
    at.text_input[0].set_value('Ik wil massage voor herstel')
    at.button[0].click().run()
    assert not at.exception
    assert 'passende professional' in at.markdown[0].value
    assert at.session_state['master_hub_route'] is None


def test_ui_does_not_call_storage_or_external_ai(monkeypatch):
    import multistream_store
    import opslag
    import gemini_service
    def forbidden(*args, **kwargs):
        pytest.fail('command UI attempted retention or external processing')
    monkeypatch.setattr(multistream_store, 'add_draft', forbidden)
    monkeypatch.setattr(multistream_store, 'list_drafts', forbidden)
    monkeypatch.setattr(opslag, 'laden', forbidden)
    monkeypatch.setattr(opslag, 'opslaan', forbidden)
    monkeypatch.setattr(opslag, '_rpc', forbidden)
    monkeypatch.setattr(gemini_service, 'get_gemini_response', forbidden)
    at = make_app()
    at.text_input[0].set_value('Organiseer community event in Amsterdam')
    at.button[0].click().run()
    assert not at.exception
    assert 'automatisch' not in at.markdown[0].value


def test_two_ui_sessions_do_not_share_navigation():
    first, second = make_app(), make_app()
    first.text_input[0].set_value('Verkoop mijn fiets')
    first.button[0].click().run()
    second.run()
    assert first.session_state['master_hub_route'].destination == 'winkel'
    assert second.session_state['master_hub_route'] is None
    assert not second.markdown


def test_existing_master_hub_invokes_new_command_panel():
    tree = ast.parse(Path('app.py').read_text())
    hub = next(n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == 'master_hub_pagina')
    calls = [ast.unparse(n.func) for n in ast.walk(hub) if isinstance(n, ast.Call)]
    assert 'ecosystem_ui.render_command_stream' in calls
    assert 'service_intake_ui.render_preparation' in calls
