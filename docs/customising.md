# Customising FitView

All your data lives in the **workspace** folder (default `./workspace`, or `--workspace PATH`, or `$FITVIEW_HOME`). Close a file in Excel before saving it from the app; Excel locks open files.

## Your exercise library: `workspace/FitView.xlsx`

| Sheet | What it is |
|---|---|
| **Exercises** | One row per exercise, one column per muscle |
| **Muscles** | The 34 muscle regions the body map uses (reference only, don't change the IDs) |
| **Settings** | Counting settings (also changeable in the app) |
| **README** | Short reminder of the format |

### Add an exercise

Add a row to **Exercises**:

| Column | Values |
|---|---|
| Exercise | Unique name |
| Type | `Gym` or `Calisthenics` |
| Category | `Push`, `Pull`, `Legs`, `Core`, `Skill`, `Grip`, `Cardio` or `Mobility` |
| Equipment | Free text |
| Knee Load | blank, `Low`, `Medium` or `High` (shows a knee badge for Medium / High) |
| Default Sets | Number pre-filled when you add the exercise |
| Default Amount | Number or range, e.g. `10` or `8-12` |
| Unit | `reps`, `s`, `min`, `m`, `steps` or `rounds` |
| Per Side | `yes` or blank |
| Notes | Coaching cue shown in the picker |
| *muscle columns* | `1` main, `0.5` secondary, `0.25` stabiliser, blank = not involved |

Then click **↻ Reload Excel** in the app. The cells have drop-downs and colour coding to help.

Don't rename the muscle column headers. They must match the Muscles sheet.

### Start over with the shipped library

The library is only created when `FitView.xlsx` doesn't exist. To get the latest shipped library, rename or delete your `FitView.xlsx` and restart (your plans are not affected).

## Plans: `workspace/Plans/*.xlsx`

One file per plan; the file name is the plan title. Columns:

| Column | Values |
|---|---|
| Day | `Mon` … `Sun` |
| Session | Label for the day (e.g. `Gym - Upper`, `Rest`). A row with only Day + Session labels an empty day |
| Exercise | Must match a name in the library |
| Sets | Number |
| Amount | `10` or `8-12` |
| Unit | `reps`, `s`, `min`, `m`, `steps`, `rounds` |
| Per Side | `yes` or blank |
| Load | Number (with Load Type kg / +kg / -kg) |
| Load Type | `kg`, `+kg` (added to bodyweight), `-kg` (assisted), `band`, or blank for bodyweight |
| EMOM | `yes` or blank |
| Hidden | `yes` or blank (left out of counts and exports) |
| Notes | Free text |

Exports (PDF and images) are saved next to the plan files.

## Shipped data (for contributors)

The defaults that new users get live in [`data/`](../data) as CSV, so changes are easy to review:

- `data/muscles.csv`: the 34 muscle regions
- `data/exercises.csv`: the library (same columns as the Exercises sheet)
- `data/examples/*.csv`: example plans (same columns as a plan file)

The tests check that every weight is 1 / 0.5 / 0.25, names are unique and example plans only use library exercises.
