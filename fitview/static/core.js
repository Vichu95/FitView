// Shared by the app, the PDF print page and the image export.
import { bodySvg } from './body.js';

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAY_NAMES = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };
export const GROUP_ORDER = ['Chest', 'Shoulders', 'Back', 'Arms', 'Core', 'Legs'];

// Colour scales. Week = weighted sets per week, Day = weighted sets in one session.
export const SCALES = {
  week: { cuts: [6, 10, 20], labels: ['1–5 low', '6–9 maintain', '10–20 growth', '20+ high'] },
  day: { cuts: [2, 4, 8], labels: ['<2', '2–3', '4–8', '8+'] },
  weight: { cuts: [0.5, 1, 99], labels: ['0.25 stabiliser', '0.5 secondary', '1 primary'] },
};

export const LEVEL_VARS = ['--lvl1', '--lvl2', '--lvl3', '--lvl4'];
const WEIGHT_VARS = ['--lvl1', '--lvl2', '--lvl3'];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n) => (Math.round(n * 100) / 100).toString();

// 0-3 colour level for a value on a scale (-1 = nothing). 'weight' has only 3 levels.
export function level(value, scale) {
  if (!value) return -1;
  if (scale === 'weight') return value >= 1 ? 2 : value >= 0.5 ? 1 : 0;
  const { cuts } = SCALES[scale];
  if (value < cuts[0]) return 0;
  if (value < cuts[1]) return 1;
  if (value <= cuts[2]) return 2;
  return 3;
}

export const weeklyStatus = (v) => (v === 0 ? 'none' : v < 6 ? 'low' : v < 10 ? 'maintain' : v <= 20 ? 'growth' : 'high');

export function makeLibrary(muscles, exercises) {
  const byName = Object.fromEntries(exercises.map((e) => [e.name.toLowerCase(), e]));
  return {
    muscles,
    muscleById: Object.fromEntries(muscles.map((m) => [m.id, m])),
    findEx: (name) => byName[String(name).toLowerCase()],
  };
}

// ---------- counting settings (stored in the Settings sheet of FitView.xlsx)
export const DEFAULT_SETTINGS = { stabiliser_weight: 0, emom_factor: 0.5 };
export const settings = { ...DEFAULT_SETTINGS };
export const applySettings = (s) => Object.assign(settings, DEFAULT_SETTINGS, s || {});

// Muscle weight as counted: stabiliser (0.25) work gets the configured credit, possibly 0.
export const countedWeight = (w) => (w < 0.5 ? (settings.stabiliser_weight > 0 ? w : 0) : w);
// Sets as counted: EMOM sets are easier than hard straight sets, so they count for less.
export const countedSets = (it) => (Number(it.sets) || 0) * (it.emom ? settings.emom_factor : 1);
export const isHiddenItem = (it) => !!it.hidden;
export const countingNote = () =>
  `Weighted sets = sets × weight (main 1 · secondary 0.5 · stabiliser ${settings.stabiliser_weight > 0 ? '0.25' : 'not counted'}) · EMOM sets × ${settings.emom_factor}`;

// { muscleId: { sets, days:Set, contrib:[{day, exercise, value, w}] } }
export function computeVolume(planDays, findEx, days, isHidden = isHiddenItem) {
  const vol = {};
  for (const day of days) {
    for (const it of planDays[day].items) {
      const ex = findEx(it.exercise);
      if (!ex || isHidden(it)) continue;
      const sets = countedSets(it);
      for (const [mid, rawW] of Object.entries(ex.muscles)) {
        const w = countedWeight(rawW);
        if (!w) continue;
        const v = (vol[mid] ||= { sets: 0, days: new Set(), contrib: [] });
        v.sets += sets * w;
        if (w >= 0.5 && sets > 0) v.days.add(day);
        v.contrib.push({ day, exercise: ex.name, value: sets * w, w });
      }
    }
  }
  return vol;
}

// ---------- HTML helpers (colours come from CSS variables --base, --lvl1..4)
export function fillsFor(values, scale) {
  const vars = scale === 'weight' ? WEIGHT_VARS : LEVEL_VARS;
  const fills = {};
  for (const [mid, v] of Object.entries(values)) {
    const lv = level(v, scale);
    if (lv >= 0) fills[mid] = `var(${vars[lv]})`;
  }
  return fills;
}

export function legendHtml(scale) {
  const vars = scale === 'weight' ? WEIGHT_VARS : LEVEL_VARS;
  return `<div class="legend"><span><i style="background:var(--base)"></i>0</span>${SCALES[scale].labels
    .map((l, i) => `<span><i style="background:var(${vars[i]})"></i>${l}</span>`).join('')}</div>`;
}

export function bodyPair(values, scale) {
  const fills = fillsFor(values, scale);
  return `<div class="body-pair">${bodySvg('front', fills, 'Front')}${bodySvg('back', fills, 'Back')}</div>`;
}

// ---------- recovery: same muscle trained hard on two days in a row
// Small / postural muscles recover quickly and are fine to train daily, so they are not flagged.
export const FAST_RECOVERY = new Set(['fore_flex', 'fore_ext', 'abs', 'obl', 'tva', 'calves', 'tib', 'cuff', 'serr', 'hipflex']);
const HARD_HIT_SETS = 2; // weighted sets from main/secondary work that count as a real hit

// [{ from, to, severity: 'high'|'medium', muscles: [{ id, name, fromEx: [...], toEx: [...], severity }] }]
export function recoveryConflicts(planDays, findEx, muscles, isHidden = isHiddenItem) {
  const hits = {}; // day -> muscleId -> { sets, primary, exercises:Set }
  for (const day of DAYS) {
    hits[day] = {};
    for (const it of planDays[day].items) {
      const ex = findEx(it.exercise);
      const sets = countedSets(it);
      if (!ex || isHidden(it) || !sets) continue;
      for (const [mid, w] of Object.entries(ex.muscles)) {
        if (w < 0.5 || FAST_RECOVERY.has(mid)) continue;
        const h = (hits[day][mid] ||= { sets: 0, primary: false, exercises: new Set() });
        h.sets += sets * w;
        h.primary ||= w >= 1;
        h.exercises.add(ex.name);
      }
    }
  }
  const out = [];
  DAYS.forEach((from, i) => {
    const to = DAYS[(i + 1) % 7];
    const list = muscles
      .filter((m) => hits[from][m.id]?.sets >= HARD_HIT_SETS && hits[to][m.id]?.sets >= HARD_HIT_SETS)
      .map((m) => {
        const a = hits[from][m.id], b = hits[to][m.id];
        return { id: m.id, name: m.name, fromEx: [...a.exercises], toEx: [...b.exercises], severity: a.primary && b.primary ? 'high' : 'medium' };
      });
    if (list.length) out.push({ from, to, severity: list.some((x) => x.severity === 'high') ? 'high' : 'medium', muscles: list });
  });
  return out;
}

export function recoveryHtml(conflicts) {
  if (!conflicts.length) return '<p class="rec-ok"><b>Back-to-back days:</b> none - every major muscle gets at least a day off between hard sessions.</p>';
  return `<div class="rec"><p><b>Back-to-back days (recovery)</b></p>${conflicts.map((c) => `
    <div class="rec-pair ${c.severity}"><div class="rec-days">${c.from} → ${c.to}</div><ul>${c.muscles.map((m) => `
      <li><span class="rec-dot ${m.severity}"></span><b>${esc(m.name)}</b> <span class="rec-ex">${esc(m.fromEx.join(', '))} → ${esc(m.toEx.join(', '))}</span></li>`).join('')}
    </ul></div>`).join('')}</div>`;
}

export const setsOf = (vol) => Object.fromEntries(Object.entries(vol).map(([k, v]) => [k, v.sets]));
// ---------- amount / load (numbers are entered, units are picked)
// [value stored in Excel, button label]
export const UNITS = [['reps', 'reps'], ['s', 'sec'], ['min', 'min'], ['m', 'm'], ['steps', 'steps'], ['rounds', 'rounds']];
export const LOAD_TYPES = [['', 'none'], ['kg', 'kg'], ['+kg', '+kg'], ['-kg', '−kg'], ['band', 'band']];
export const loadHasNumber = (type) => type === 'kg' || type === '+kg' || type === '-kg';

// "8–12 reps/side", "20 s", "" when no amount.
export function amountText(it) {
  if (it.amountMin == null || it.amountMin === '') return it.perSide ? 'per side' : '';
  const n = it.amountMax != null && it.amountMax !== '' ? `${fmt(it.amountMin)}–${fmt(it.amountMax)}` : fmt(it.amountMin);
  return `${n} ${it.unit || 'reps'}${it.perSide ? '/side' : ''}`;
}

// "+10 kg", "12 kg", "−5 kg", "band", "" for bodyweight.
export function loadText(it) {
  if (it.loadType === 'band') return 'band';
  if (!loadHasNumber(it.loadType) || it.load == null || it.load === '') return '';
  const sign = { '+kg': '+', '-kg': '−' }[it.loadType] || '';
  return `${sign}${fmt(it.load)} kg`;
}

// "3 × 8–12 reps · +10 kg"
export function itemMeta(it, sep = ' · ') {
  const amount = amountText(it);
  const sets = it.sets ? fmt(it.sets) : '';
  const main = sets && amount ? `${sets} × ${amount}` : sets ? `${sets} sets` : amount;
  return [main, loadText(it)].filter(Boolean).join(sep);
}
