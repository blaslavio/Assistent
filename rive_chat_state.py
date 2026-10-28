"""Map real assistant lifecycle events to Rive animation states.

UI-only representation; never claims AI actions, tool success or model thinking.
"""
from __future__ import annotations

from enum import Enum


class AssistantEvent(str, Enum):
    READY = "ready"
    USER_TYPING = "user_typing"
    USER_RECORDING = "user_recording"
    REQUEST_STARTED = "request_started"
    RESPONSE_RECEIVED = "response_received"
    RESPONSE_PRESENTED = "response_presented"
    ACTION_SUCCEEDED = "action_succeeded"
    ACTION_FAILED = "action_failed"


_EVENT_TO_STATE = {
    AssistantEvent.READY: "idle",
    AssistantEvent.USER_TYPING: "listening",
    AssistantEvent.USER_RECORDING: "listening",
    AssistantEvent.REQUEST_STARTED: "thinking",
    AssistantEvent.RESPONSE_RECEIVED: "speaking",
    AssistantEvent.RESPONSE_PRESENTED: "idle",
    AssistantEvent.ACTION_SUCCEEDED: "success",
    AssistantEvent.ACTION_FAILED: "error",
}


def state_for_event(event: AssistantEvent | str) -> str:
    """Return a safe idle fallback for unknown event names."""
    try:
        return _EVENT_TO_STATE[AssistantEvent(event)]
    except (ValueError, TypeError):
        return "idle"


def render_for_event(event: AssistantEvent | str, **kwargs) -> bool:
    """Render when an approved asset exists; safe no-op otherwise."""
    from rive_assistant import render_assistant_character
    return render_assistant_character(state=state_for_event(event), **kwargs)
