"""Offline contract tests: real store/cache, fake authenticated RPC, no client data."""
import ast
import copy
from pathlib import Path
import pytest
import opslag
import multistream_store as store
import service_intake_core as intake

@pytest.fixture
def accounts(monkeypatch):
    database = {}
    monkeypatch.delenv('ASSISTENT_LOKAAL', raising=False)
    opslag.vergeet_gegevens()
    def rpc(function, **params):
        name, token = params['p_naam'], params['p_wachtwoord']
        if (name, token) not in {('a', 'token-a'), ('b', 'token-b')}:
            return {'geen_toegang': True} if function == 'mijn_gegevens' else False
        if function == 'mijn_gegevens':
            return {'gebruiker': {'id': {'a': 1, 'b': 2}[name]}, 'data': copy.deepcopy(database.get(name, {}))}
        assert function == 'mijn_gegevens_bewaren'
        database[name] = copy.deepcopy(params['p_data'])
        return True
    monkeypatch.setattr(opslag, '_rpc', rpc)
    yield database
    opslag.gebruik_account('', '')
    opslag.vergeet_gegevens()

def test_account_profile_cache_and_delete_isolation(accounts):
    opslag.gebruik_account('a', 'token-a')
    item = store.add_draft('synthetic boundary marker', 'Privé')
    assert store.list_drafts('Zakelijk') == []
    assert store.list_drafts('Community') == []
    assert not store.delete_draft(item['id'], 'Zakelijk')
    opslag.gebruik_account('b', 'token-b')
    assert store.list_drafts() == []
    assert not store.delete_draft(item['id'])
    store.add_draft('second synthetic marker')
    opslag.gebruik_account('a', 'token-a')
    assert [x['id'] for x in store.list_drafts()] == [item['id']]
    assert store.delete_draft(item['id'])
    assert store.list_drafts() == []
    opslag.gebruik_account('b', 'token-b')
    assert len(store.list_drafts()) == 1

@pytest.mark.parametrize('name,token', [('', ''), ('a', 'invalid'), ('b', 'token-a')])
def test_unauthorized_store_access_is_denied(accounts, name, token):
    opslag.gebruik_account(name, token)
    with pytest.raises(opslag.GeenToegang):
        store.list_drafts()
    with pytest.raises(opslag.GeenToegang):
        store.add_draft('synthetic marker')
    assert accounts == {}

@pytest.mark.parametrize('local', ['0', '1'])
def test_intake_cannot_reach_storage(monkeypatch, local):
    monkeypatch.setenv('ASSISTENT_LOKAAL', local)
    def forbidden(*args, **kwargs):
        pytest.fail('disabled intake reached storage')
    monkeypatch.setattr(opslag, 'laden', forbidden)
    monkeypatch.setattr(opslag, 'opslaan', forbidden)
    monkeypatch.setattr(store, 'add_draft', forbidden)
    with pytest.raises(RuntimeError, match='uitgeschakeld'):
        intake.save_intake_draft('Training', 'synthetic marker')

def test_master_hub_has_no_intake_input_or_write_path():
    tree = ast.parse(Path('app.py').read_text())
    hub = next(n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == 'master_hub_pagina')
    block = next(n for n in ast.walk(hub) if isinstance(n, ast.With) and any(
        isinstance(v, ast.Constant) and v.value == 'Dienstverlening - intake' for v in ast.walk(n.items[0].context_expr)))
    calls = [ast.unparse(n.func) for n in ast.walk(block) if isinstance(n, ast.Call)]
    assert calls == ['st.expander', 'service_intake_ui.render_preparation']
