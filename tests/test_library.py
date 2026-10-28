import shutil

import pytest

from fitview.library import (
    DATA_DIR,
    LibraryError,
    build_library_workbook,
    ensure_workspace,
    load_example_plans,
    load_exercises,
    load_muscles,
)


def test_shipped_library_is_valid():
    muscles = load_muscles()
    cols, rows = load_exercises()
    assert len(muscles) == 34
    assert len(rows) > 100
    assert set(cols) == {m[1] for m in muscles}


def test_example_plans_only_use_library_exercises():
    library = {r[0].lower() for r in load_exercises()[1]}
    plans = load_example_plans()
    assert plans, "at least one example plan should ship"
    for title, rows in plans.items():
        for r in rows:
            assert r[2] is None or r[2].lower() in library, f"{title}: unknown exercise {r[2]!r}"


def test_ensure_workspace_creates_once_and_never_overwrites(tmp_path):
    created = ensure_workspace(tmp_path)
    assert "FitView.xlsx" in created
    assert any(c.startswith("Plans/") for c in created)
    marker = (tmp_path / "FitView.xlsx").stat().st_mtime_ns
    assert ensure_workspace(tmp_path) == []
    assert (tmp_path / "FitView.xlsx").stat().st_mtime_ns == marker


def _copy_data(tmp_path):
    data = tmp_path / "data"
    shutil.copytree(DATA_DIR, data)
    return data


def test_bad_weight_is_reported(tmp_path):
    data = _copy_data(tmp_path)
    path = data / "exercises.csv"
    lines = path.read_text(encoding="utf-8").splitlines()
    cells = lines[1].split(",")
    cells[10] = "0.7"  # first muscle column
    lines[1] = ",".join(cells)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    with pytest.raises(LibraryError, match="must be 1, 0.5 or 0.25"):
        load_exercises(data)


def test_duplicate_exercise_is_reported(tmp_path):
    data = _copy_data(tmp_path)
    path = data / "exercises.csv"
    lines = path.read_text(encoding="utf-8").splitlines()
    path.write_text("\n".join(lines + [lines[1]]) + "\n", encoding="utf-8")
    with pytest.raises(LibraryError, match="duplicate exercise"):
        load_exercises(data)


def test_workbook_builds(tmp_path):
    build_library_workbook(tmp_path / "FitView.xlsx")
    assert (tmp_path / "FitView.xlsx").stat().st_size > 0
