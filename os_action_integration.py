"""Safe bridge between intent plans and action lifecycle.

No side effects: execution remains in authenticated, durable service adapters.
"""
from dataclasses import dataclass
from typing import Mapping, Sequence

from os_action_recovery import ActionState, Status, transition


@dataclass(frozen=True)
class PlannedAction:
    key: str
    dependencies: tuple[str, ...] = ()
    requires_approval: bool = True


def eligible_actions(
    steps: Sequence[PlannedAction],
    states: Mapping[str, ActionState],
) -> tuple[str, ...]:
    keys = [step.key for step in steps]
    if len(keys) != len(set(keys)):
        raise ValueError("duplicate action key")
    known = set(keys)
    for step in steps:
        if not set(step.dependencies).issubset(known):
            raise ValueError("unknown dependency")
        if step.key in step.dependencies:
            raise ValueError("self dependency")
    for key, state in states.items():
        if key not in known or state.action_id != key:
            raise ValueError("invalid state mapping")
    done = {key for key, state in states.items() if state.status == Status.SUCCEEDED}
    eligible = []
    for step in steps:
        state = states.get(step.key)
        if state is None or state.status not in (Status.PREPARED, Status.AWAITING_APPROVAL):
            continue
        if not set(step.dependencies).issubset(done):
            continue
        if step.requires_approval and not state.approved:
            continue
        eligible.append(step.key)
    return tuple(eligible)


def start_eligible(
    step: PlannedAction,
    states: Mapping[str, ActionState],
    steps: Sequence[PlannedAction],
) -> ActionState:
    if step.key not in eligible_actions(steps, states):
        raise PermissionError("action is not eligible")
    return transition(states[step.key], Status.RUNNING)
