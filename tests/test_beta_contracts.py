import pytest
from beta_contracts import ProviderMode, disabled_ai, disabled_payment


def test_payment_disabled_by_default():
    result = disabled_payment("order-1", 2500)
    assert result.mode == ProviderMode.DISABLED
    assert result.status == "unavailable"
    assert result.external_id is None


@pytest.mark.parametrize("order_id,amount", [("", 100), ("x", 0), ("x", -1)])
def test_invalid_payment(order_id, amount):
    with pytest.raises(ValueError):
        disabled_payment(order_id, amount)


def test_ai_disabled_by_default():
    result = disabled_ai("Hallo")
    assert result.mode == ProviderMode.DISABLED
    assert result.status == "unavailable"


def test_empty_ai_prompt():
    with pytest.raises(ValueError):
        disabled_ai(" ")
