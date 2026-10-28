# Contributing to FitView

Thanks for helping. The most valuable contributions are **better exercise data**: new exercises and corrections to which muscles an exercise hits.

## Exercise suggestions and muscle-weight corrections

The easiest way is to open an issue with the **Exercise request / muscle weight correction** template.

To send a pull request instead, edit [`data/exercises.csv`](data/exercises.csv):

- One row per exercise; see [docs/customising.md](docs/customising.md) for the columns.
- Muscle weights: `1` main mover, `0.5` secondary, `0.25` stabiliser, blank = not involved.
- Please explain your reasoning in the PR (EMG studies, coaching references or a video help a lot).
- Keep notes short, practical and general (no personal medical advice).
- Run the tests before opening the PR (below). They validate the CSV.

## Code changes

```bash
pip install -r requirements-dev.txt
python -m pytest            # Python tests
node --test tests/js/       # JavaScript tests (Node 18+)
python -m ruff check .      # lint
python -m ruff format .     # format
```

Project layout:

```text
fitview/
  server.py       local HTTP server + JSON API (stdlib only)
  library.py      builds the workbook from data/, creates the workspace on first run
  planfile.py     reading / writing plan .xlsx files
  static/         the web UI (plain HTML, CSS and ES modules, no build step)
    core.js         counting rules shared by the app, PDF and images
    body.js         body map geometry
data/             shipped library and example plans (CSV)
docs/             documentation
tests/            pytest + node:test
```

Guidelines:

- Keep it dependency-light: the only runtime dependency is `openpyxl`, and the UI has no build step.
- Keep user data local: no network calls except the optional "see images" link to a web search.
- Counting rule changes should update [docs/methodology.md](docs/methodology.md) and the tests in `tests/js/core.test.js`.
- Add an entry to [CHANGELOG.md](CHANGELOG.md).
