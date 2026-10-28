from unified_hub_core import classify, filter_items, map_points, safe_html


def test_html_is_escaped():
    assert "<script>" not in safe_html("<script>alert(1)</script>")
    assert "&lt;script&gt;" in safe_html("<script>")


def test_classification_is_suggestion_only():
    assert classify("Maak een videoproject") == "Video Project"
    assert classify("Goedemorgen") == "Chat"


def test_filter_does_not_mutate_input():
    items = [{"type": "Sport", "titel": "Training"}, {"type": "Verkoop"}]
    filtered = filter_items(items, "Sport")
    filtered[0]["titel"] = "Anders"
    assert items[0]["titel"] == "Training"


def test_one_map_dataset_with_invalid_coordinates_skipped():
    points = map_points([{"lat": 50.8, "lon": 5.7}, {"lat": 999, "lon": 5.7}, {"titel": "zonder locatie"}])
    assert points == [{"lat": 50.8, "lon": 5.7}]
