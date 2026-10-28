import pytest
from neural_video_core import make_edit_plan, ai_sync, render_video, privacy_blur

def test_valid_plan_is_only_a_concept():
    plan = make_edit_plan("project1", ["camera1.MP4", "camera2.mov"], "Knip de intro")
    assert plan.status == "concept"
    assert len(plan.sources) == 2

@pytest.mark.parametrize("sources", [
    [], ["bad.exe"], ["../private.mp4"], ["/tmp/file.mp4"],
    ["one.mp4", "one.mp4"], ["one.mp4"] * 9,
])
def test_invalid_sources_rejected(sources):
    with pytest.raises(ValueError):
        make_edit_plan("project1", sources)

def test_missing_project_rejected():
    with pytest.raises(ValueError):
        make_edit_plan("", ["one.mp4"])

def test_overlong_notes_rejected():
    with pytest.raises(ValueError):
        make_edit_plan("project1", ["one.mp4"], "x" * 501)

@pytest.mark.parametrize("action", [ai_sync, render_video, privacy_blur])
def test_no_fake_processing(action):
    with pytest.raises(RuntimeError):
        action("project1")
