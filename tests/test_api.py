import json
import urllib.error
import urllib.request

import pytest

from fitview import server


def get(url):
    with urllib.request.urlopen(url) as r:
        return json.loads(r.read())


def post(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def test_data_endpoint(live_server):
    data = get(f"{live_server}/api/data")
    assert len(data["muscles"]) == 34
    assert len(data["exercises"]) > 100
    assert len(data["plans"]) >= 1
    assert data["settings"] == {"stabiliser_weight": 0.0, "emom_factor": 0.5}


def test_ui_is_served(live_server):
    with urllib.request.urlopen(f"{live_server}/") as r:
        assert b"FitView" in r.read()
    with pytest.raises(urllib.error.HTTPError):
        urllib.request.urlopen(f"{live_server}/../server.py")


def test_plan_lifecycle(live_server, workspace):
    item = {
        "exercise": "Pull-up",
        "sets": 3,
        "amountMin": 6,
        "amountMax": 10,
        "unit": "reps",
        "perSide": False,
        "load": 10,
        "loadType": "+kg",
        "emom": True,
        "hidden": True,
        "notes": "test",
    }
    days = {"Mon": {"session": "Pull", "items": [item]}, "Tue": {"session": "Rest", "items": []}}

    status, res = post(f"{live_server}/api/plan/create", {"name": "My Test", "days": days})
    assert status == 200 and "My Test" in res["plans"]

    plan = get(f"{live_server}/api/plan?name=My%20Test")
    saved = plan["days"]["Mon"]["items"][0]
    assert {k: saved[k] for k in item} == item
    assert plan["days"]["Tue"]["session"] == "Rest"

    # rename only (no days) keeps the contents
    status, res = post(f"{live_server}/api/plan/save", {"name": "Renamed", "replace": "My Test"})
    assert status == 200 and "Renamed" in res["plans"] and "My Test" not in res["plans"]
    assert get(f"{live_server}/api/plan?name=Renamed")["days"]["Mon"]["items"][0]["exercise"] == "Pull-up"

    # delete moves the file to Plans/_deleted
    status, res = post(f"{live_server}/api/plan/delete", {"name": "Renamed"})
    assert status == 200 and "Renamed" not in res["plans"]
    assert any(p.name.startswith("Renamed (") for p in (workspace / "Plans" / "_deleted").iterdir())


@pytest.mark.parametrize("name", ["", "bad/name", "a:b", "_private", "con", "dot."])
def test_invalid_titles_are_rejected(live_server, name):
    status, res = post(f"{live_server}/api/plan/create", {"name": name})
    assert status == 400 and res["error"]


def test_duplicate_title_is_rejected(live_server):
    existing = get(f"{live_server}/api/data")["plans"][0]
    status, _ = post(f"{live_server}/api/plan/create", {"name": existing.upper()})
    assert status == 409


def test_settings_roundtrip_and_validation(live_server):
    status, res = post(f"{live_server}/api/settings", {"emom_factor": 0.75, "stabiliser_weight": 0.25})
    assert status == 200 and res["settings"] == {"emom_factor": 0.75, "stabiliser_weight": 0.25}
    assert get(f"{live_server}/api/data")["settings"]["emom_factor"] == 0.75
    status, _ = post(f"{live_server}/api/settings", {"emom_factor": 5})
    assert status == 400


def test_image_export_names_are_validated(live_server, workspace):
    png = "data:image/png;base64,iVBORw0KGgo="
    status, res = post(f"{live_server}/api/export/images", {"files": [{"name": "x - 1 Mon.png", "data": png}]})
    assert status == 200 and (workspace / "Plans" / "x - 1 Mon.png").exists()
    status, _ = post(f"{live_server}/api/export/images", {"files": [{"name": "../evil.png", "data": png}]})
    assert status == 400


def test_cannot_delete_last_plan(live_server, workspace):
    for name in get(f"{live_server}/api/data")["plans"][1:]:
        post(f"{live_server}/api/plan/delete", {"name": name})
    last = get(f"{live_server}/api/data")["plans"]
    assert len(last) == 1
    status, _ = post(f"{live_server}/api/plan/delete", {"name": last[0]})
    assert status == 400


def test_server_module_points_at_workspace(workspace):
    assert server.XLSX == workspace / "FitView.xlsx"
