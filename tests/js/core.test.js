// Unit tests for the counting rules in fitview/static/core.js. Run: node --test tests/js/
import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import {
  DAYS, applySettings, computeVolume, setsOf, level, weeklyStatus, itemMeta, recoveryConflicts, makeLibrary,
} from '../../fitview/static/core.js';

const muscles = [
  { id: 'chest_m', name: 'Chest - Mid', group: 'Chest' },
  { id: 'tri_lat', name: 'Triceps - Lateral/Medial', group: 'Arms' },
  { id: 'chest_u', name: 'Chest - Upper', group: 'Chest' },
  { id: 'quads', name: 'Quads', group: 'Legs' },
  { id: 'abs', name: 'Abs (Rectus)', group: 'Core' },
];
const exercises = [
  { name: 'Bench', muscles: { chest_m: 1, tri_lat: 0.5, chest_u: 0.25 } },
  { name: 'Squat', muscles: { quads: 1 } },
  { name: 'Crunch', muscles: { abs: 1 } },
];
const lib = makeLibrary(muscles, exercises);
const week = (byDay) => Object.fromEntries(DAYS.map((d) => [d, { session: '', items: byDay[d] || [] }]));

beforeEach(() => applySettings({ stabiliser_weight: 0, emom_factor: 0.5 }));

test('sets x weight, stabilisers not counted by default', () => {
  const v = setsOf(computeVolume(week({ Mon: [{ exercise: 'Bench', sets: 4 }] }), lib.findEx, DAYS));
  assert.deepEqual(v, { chest_m: 4, tri_lat: 2 });
});

test('stabiliser credit when enabled', () => {
  applySettings({ stabiliser_weight: 0.25 });
  const v = setsOf(computeVolume(week({ Mon: [{ exercise: 'Bench', sets: 4 }] }), lib.findEx, DAYS));
  assert.equal(v.chest_u, 1);
});

test('EMOM sets count with the EMOM factor', () => {
  const v = setsOf(computeVolume(week({ Mon: [{ exercise: 'Squat', sets: 10, emom: true }] }), lib.findEx, DAYS));
  assert.equal(v.quads, 5);
});

test('hidden items and unknown exercises are ignored', () => {
  const plan = week({ Mon: [{ exercise: 'Squat', sets: 3, hidden: true }, { exercise: 'Nope', sets: 3 }] });
  assert.deepEqual(setsOf(computeVolume(plan, lib.findEx, DAYS)), {});
});

test('weekly bands', () => {
  assert.equal(weeklyStatus(0), 'none');
  assert.equal(weeklyStatus(5), 'low');
  assert.equal(weeklyStatus(8), 'maintain');
  assert.equal(weeklyStatus(15), 'growth');
  assert.equal(weeklyStatus(25), 'high');
  assert.equal(level(0, 'week'), -1);
  assert.equal(level(12, 'week'), 2);
});

test('back-to-back days are flagged, fast-recovery muscles are not', () => {
  const plan = week({
    Mon: [{ exercise: 'Squat', sets: 3 }, { exercise: 'Crunch', sets: 3 }],
    Tue: [{ exercise: 'Squat', sets: 3 }, { exercise: 'Crunch', sets: 3 }],
  });
  const c = recoveryConflicts(plan, lib.findEx, muscles);
  assert.equal(c.length, 1);
  assert.equal(c[0].from, 'Mon');
  assert.deepEqual(c[0].muscles.map((m) => m.id), ['quads']);
  assert.equal(c[0].severity, 'high');
});

test('Sunday to Monday wraps around', () => {
  const plan = week({ Sun: [{ exercise: 'Squat', sets: 3 }], Mon: [{ exercise: 'Squat', sets: 3 }] });
  assert.equal(recoveryConflicts(plan, lib.findEx, muscles)[0].from, 'Sun');
});

test('item text', () => {
  assert.equal(itemMeta({ sets: 3, amountMin: 8, amountMax: 12, unit: 'reps' }), '3 × 8–12 reps');
  assert.equal(itemMeta({ sets: 3, amountMin: 10, unit: 'reps', perSide: true }), '3 × 10 reps/side');
  assert.equal(itemMeta({ sets: 10, amountMin: 4, unit: 'reps', load: 10, loadType: '+kg' }), '10 × 4 reps · +10 kg');
  assert.equal(itemMeta({ sets: 3, amountMin: 20, unit: 's' }), '3 × 20 s');
});
