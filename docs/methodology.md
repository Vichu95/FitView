# How FitView counts training volume

FitView turns a weekly plan into a number per muscle: **weighted weekly sets**. This page explains how, what is backed by research, what is a judgement call, and where the numbers can mislead you.

## 1. Muscle weights

Every exercise in the library gives each muscle a weight:

| Weight | Meaning | Example: flat bench press |
|---|---|---|
| **1** main | Main mover, works hard through the whole range | Chest (mid) |
| **0.5** secondary | Clearly contributes, but isn't the limiting muscle | Front delts, triceps (lateral head), lower chest |
| **0.25** stabiliser | Holds position, little growth stimulus | Upper chest, triceps long head |

- **Main = 1 and secondary = 0.5** follows *fractional set counting*. A large 2024 meta-regression (Pelland et al., *The Resistance Training Dose-Response*) found hypertrophy is best predicted by counting direct sets as 1 and indirect sets as 0.5.
- **Stabiliser = 0.25** is a FitView addition. By default it is **not counted** (credit 0), matching how the research counts. You can turn it on in the app's counting settings.
- **Which muscle gets which weight** is a judgement per exercise, based on biomechanics and common coaching knowledge. Treat it as an informed estimate, not a measurement. Corrections are welcome (see [CONTRIBUTING](../CONTRIBUTING.md)).

## 2. Weighted sets

```
weekly volume (muscle) = Σ  sets × weight
```

Example: 3 sets of incline DB press adds **3** to upper chest and **1.5** to mid chest and front delts.

This assumes every set is a **hard set**, taken within about 0–3 reps of failure. That is how the research counts sets.

### EMOM sets

In an EMOM (every minute on the minute) the early minutes are easy and only the last few are hard. So an EMOM set counts as a fraction of a hard set: **0.5 by default** (a 10-minute EMOM ≈ 5 hard sets). Configurable from 0.25 to 1.

## 3. Weekly bands

| Band | Weekly sets | Basis |
|---|---|---|
| Low | 1–5 | Below what most studies need to show meaningful growth |
| Maintain | 6–9 | Muscle is kept with far less volume than it takes to build it (e.g. Bickel et al. 2011); ~6 is a common rule of thumb |
| Growth | 10–20 | Schoenfeld, Ogborn & Krieger (2017): 10+ weekly sets gave clearly more growth than < 5 |
| High | 20+ | **Not "bad".** Growth may keep rising but with diminishing returns and more fatigue; check recovery |

The cut-offs (6, 10, 20) are conventions, not sharp biological lines. 9 and 11 sets are practically the same. Coaching frameworks such as volume landmarks (MEV / MAV / MRV) use similar ranges.

## 4. Back-to-back check

A muscle is flagged when it gets **at least 2 weighted sets of main or secondary work on two consecutive days** (Sunday → Monday counts, because the week repeats).

- **Red:** it is a main muscle on both days.
- **Orange:** otherwise.

Based on the general guideline of about 48 h between hard sessions for the same muscle. The 2-set threshold is a FitView choice.

Muscles that recover quickly and are commonly trained daily are **not flagged**: forearms / grip, abs, obliques, deep core, calves, tibialis, rotator cuff, serratus and hip flexors.

## 5. Where the numbers mislead

1. **Easy sets are overcounted.** Warm-up sets and anything far from failure count the same as hard sets (apart from the EMOM factor).
2. **Short skill holds aren't the same as hard sets.** A 5–8 s planche hold mostly trains skill and tendons. It counts as a full set here.
3. **Load, reps and range of motion are ignored.** Stretched-position exercises (incline curls, overhead extensions) probably deserve slightly more credit than they get.
4. **One scale for every muscle.** Small muscles (side delts, calves) tolerate more volume; heavy compounds cost more fatigue per set.
5. **Muscle-head splits are approximate.** Regional growth is real (incline press → more upper chest), but splitting volume exactly by head is an estimate.

### How to use the numbers

- **Most trustworthy:** muscles at zero or very low (real gaps), big outliers, and back-to-back warnings.
- **Approximate (about ±30%):** the middle bands. Don't redesign a plan because a muscle shows 9 instead of 10.

## References

- Pelland, J. C. et al. (2024). *The Resistance Training Dose-Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gains.* SportRxiv preprint.
- Schoenfeld, B. J., Ogborn, D., & Krieger, J. W. (2017). Dose-response relationship between weekly resistance training volume and increases in muscle mass: A systematic review and meta-analysis. *Journal of Sports Sciences*, 35(11), 1073–1082.
- Bickel, C. S., Cross, J. M., & Bamman, M. M. (2011). Exercise dosing to retain resistance training adaptations in young and older adults. *Medicine & Science in Sports & Exercise*, 43(7), 1177–1187.
