import pytest

from fitview.planfile import PLAN_HEADERS, format_amount, parse_amount, read_plan_rows, write_plan_file


@pytest.mark.parametrize(
    "value, expected",
    [
        ("10", (10, None)),
        (10, (10, None)),
        ("8-12", (8, 12)),
        ("8 – 12", (8, 12)),
        ("12-12", (12, None)),
        ("2.5", (2.5, None)),
        ("", (None, None)),
        (None, (None, None)),
        ("abc", (None, None)),
        ("10/side", (None, None)),
    ],
)
def test_parse_amount(value, expected):
    assert parse_amount(value) == expected


def test_format_amount_roundtrip():
    assert format_amount(8, 12) == "8-12"
    assert format_amount(10, None) == 10
    assert format_amount(None, None) is None
    assert parse_amount(format_amount(8, 12)) == (8, 12)


def test_write_and_read_plan_file(tmp_path):
    path = tmp_path / "p.xlsx"
    rows = [
        ["Mon", "Legs", "Barbell Back Squat", 3, "6-10", "reps", None, 60, "kg", None, None, "Belt"],
        ["Tue", "Rest", None, None, None, None, None, None, None, None, None, None],
    ]
    write_plan_file(path, rows)
    header, read = read_plan_rows(path)
    assert header == PLAN_HEADERS
    assert read[0][:5] == ["Mon", "Legs", "Barbell Back Squat", 3, "6-10"]
    assert read[0][7] == 60
    assert read[1][1] == "Rest"
