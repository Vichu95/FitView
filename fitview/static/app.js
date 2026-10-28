import { DRAWN_MUSCLES, bodySvg } from './body.js';
import {
  DAYS, DAY_NAMES, GROUP_ORDER, LEVEL_VARS, esc, fmt, level, weeklyStatus,
  makeLibrary, computeVolume as volumeOf, setsOf, bodyPair, legendHtml,
  UNITS, LOAD_TYPES, loadHasNumber, itemMeta, recoveryConflicts, recoveryHtml,
  settings, applySettings, countingNote,
} from './core.js';
import { exportDayImages, exportWeekImage } from './export-image.js';

const $ = (sel, root = document) => root.querySelector(sel);

const store = {
  get(k) { try { return localStorage.getItem('fitview.' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('fitview.' + k, v); } catch { /* storage unavailable */ } },
};

const state = {
  muscles: [], muscleById: {}, exercises: [], lib: null, plans: [],
  plan: null, view: store.get('view') || 'week', hoverExercise: null,
  pinned: null, // plan item clicked to keep it on the body map
  modal: null,
};

const hiddenCount = () => DAYS.reduce((n, d) => n + state.plan.days[d].items.filter((it) => it.hidden).length, 0);

// ---------------------------------------------------------------- API
async function api(path, body) {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

function setStatus(text, kind = '', openFolder = false) {
  const el = $('#status');
  el.textContent = text;
  el.className = 'status ' + kind;
  if (openFolder) el.insertAdjacentHTML('beforeend', ' <button class="link" data-act="open-folder">Open folder</button>');
}

// ---- manual save: edits stay on screen until Save (or Ctrl+S); Discard reloads the saved file.
let dirty = false;

function updateSaveUi() {
  $('#btn-save').disabled = !dirty;
  $('#btn-discard').hidden = !dirty;
  if (dirty) setStatus('Unsaved changes', 'warn');
}

function markDirty() {
  dirty = true;
  updateSaveUi();
}

async function savePlan() {
  if (!dirty) return true;
  setStatus('Saving…');
  try {
    await api('/api/plan/save', { name: state.plan.name, days: state.plan.days });
    dirty = false;
    updateSaveUi();
    setStatus('Saved to Excel', 'ok');
    return true;
  } catch (e) {
    setStatus('Not saved: ' + e.message, 'err');
    return false;
  }
}

// true = go ahead (nothing unsaved, or the user agreed to throw the changes away)
const confirmDiscard = (what) => !dirty || confirm(`"${state.plan.name}" has unsaved changes.\n\nDiscard them and ${what}?`);

async function loadData() {
  const data = await api('/api/data');
  state.muscles = data.muscles;
  state.exercises = data.exercises;
  state.lib = makeLibrary(data.muscles, data.exercises);
  applySettings(data.settings);
  state.muscleById = state.lib.muscleById;
  state.plans = data.plans;
  $('#version').textContent = data.version ? `v${data.version}` : '';
  $('#workspace').textContent = data.workspace || '';
  if (data.warnings?.length) setStatus('Unknown muscle columns ignored: ' + data.warnings.join(', '), 'err');
}

async function loadPlan(name) {
  state.plan = await api('/api/plan?name=' + encodeURIComponent(name));
  dirty = false;
  updateSaveUi();
  store.set('plan', state.plan.name);
  render();
}

const findEx = (name) => state.lib.findEx(name);

// Google Images search for an exercise, so you can see what it looks like.
function imageSearchUrl(name) {
  const kind = findEx(name)?.type === 'Calisthenics' ? 'calisthenics' : 'exercise';
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${name} ${kind}`)}`;
}
const exLink = (name) => `<a class="ex-link" href="${imageSearchUrl(name)}" target="_blank" rel="noopener noreferrer" draggable="false" title="See images on Google">${esc(name)}</a>`;

const pinnedInPlan = () => state.pinned && DAYS.some((d) => state.plan.days[d].items.includes(state.pinned));
// The exercise the body panel focuses on: a pinned one wins over hover.
const focusExercise = () => (pinnedInPlan() ? state.pinned.exercise : state.hoverExercise);
function unpin() {
  if (!state.pinned) return false;
  state.pinned = null;
  return true;
}
const computeVolume = (days) => volumeOf(state.plan.days, findEx, days);
// ---------------------------------------------------------------- rendering
function render() {
  renderPlanSelect();
  renderTabs();
  renderPlan();
  renderBodyPanel();
}

function renderPlanSelect() {
  $('#plan-select').innerHTML = state.plans.map((p) => `<option ${p === state.plan.name ? 'selected' : ''}>${esc(p)}</option>`).join('');
}

function renderTabs() {
  const tabs = [['week', 'Week'], ...DAYS.map((d) => [d, d])];
  const hidden = hiddenCount();
  $('#tabs').innerHTML = tabs.map(([v, l]) => {
    const n = v === 'week' ? 0 : state.plan.days[v].items.length;
    return `<button class="tab ${state.view === v ? 'active' : ''}" data-view="${v}">${l}${v !== 'week' && !n ? '<small>·</small>' : ''}</button>`;
  }).join('') + (hidden ? `<span class="hidden-note">${hidden} hidden (left out of counts and exports)<button class="btn" data-act="unhide-all">Show all</button></span>` : '');
}

function typeTag(ex) {
  if (!ex) return '<span class="tag warn">not in library</span>';
  const t = ex.type === 'Calisthenics' ? 'cal' : 'gym';
  let html = `<span class="tag ${t}">${ex.type === 'Calisthenics' ? 'Cali' : 'Gym'}</span>`;
  if (ex.knee === 'High') html += '<span class="tag knee" title="High knee load - left ACL caution">Knee: high</span>';
  else if (ex.knee === 'Medium') html += '<span class="tag knee-med" title="Moderate knee load">Knee: med</span>';
  return html;
}

function primaryChips(ex) {
  if (!ex) return '';
  return Object.entries(ex.muscles).sort((a, b) => b[1] - a[1]).filter(([, w]) => w >= 0.5)
    .map(([mid, w]) => `<span class="chip ${w >= 1 ? 'p' : 's'}">${esc(state.muscleById[mid]?.name || mid)}</span>`).join('');
}

const conflicts = () => recoveryConflicts(state.plan.days, findEx, state.muscles);

function recoveryBadge(day, list) {
  const c = list.find((x) => x.to === day);
  if (!c) return '';
  const names = c.muscles.map((m) => m.name).join(', ');
  return `<span class="rec-badge ${c.severity}" title="Also trained hard on ${DAY_NAMES[c.from]}: ${esc(names)}">⚠ after ${c.from}</span>`;
}

function dayCard(day, expanded, recovery = []) {
  const d = state.plan.days[day];
  const total = d.items.reduce((s, it) => s + (it.hidden ? 0 : Number(it.sets) || 0), 0);
  const items = d.items.map((it, i) => {
    const ex = findEx(it.exercise);
    const isHidden = !!it.hidden;
    const meta = esc(itemMeta(it));
    return `<li class="item ${isHidden ? 'is-hidden' : ''} ${it === state.pinned ? 'pinned' : ''}" data-day="${day}" data-i="${i}" draggable="true">
      <span class="grip" title="Drag to reorder or move to another day" aria-hidden="true">⠿</span>
      <div class="item-main">
        <div class="item-name">${isHidden ? '<span class="tag off">hidden</span> ' : ''}${exLink(it.exercise)}</div>
        <div class="item-meta">${meta}${it.emom ? `<span class="tag emom" title="Counts as ${settings.emom_factor} of a hard set">EMOM</span>` : ''}${typeTag(ex)}</div>
        ${it.notes ? `<div class="item-notes">${esc(it.notes)}</div>` : ''}
        ${expanded ? `<div class="chips">${primaryChips(ex)}</div>` : ''}
      </div>
      <div class="item-actions">
        <button class="icon ${isHidden ? 'on' : ''}" data-act="hide" title="${isHidden ? 'Show again' : 'Hide from the body map (view only, not saved)'}">${isHidden ? '◌' : '◉'}</button>
        <button class="icon" data-act="up" title="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="icon" data-act="down" title="Move down" ${i === d.items.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="icon" data-act="edit" title="Edit">✎</button>
        <button class="icon danger" data-act="del" title="Remove">✕</button>
      </div>
    </li>`;
  }).join('');
  return `<section class="day ${expanded ? 'expanded' : ''} ${d.items.length ? '' : 'empty'}">
    <header>
      <button class="day-name" data-view="${day}" title="Show only ${DAY_NAMES[day]}">${expanded ? DAY_NAMES[day] : day}</button>
      <input class="session" data-day="${day}" value="${esc(d.session)}" placeholder="Session label (e.g. Gym - Upper / Rest)"/>
      <span class="count">${total ? fmt(total) + ' sets' : ''}</span>
      ${recoveryBadge(day, recovery)}
    </header>
    <ol class="items">${items || '<li class="none">No exercises</li>'}</ol>
    <button class="add" data-day="${day}">+ Add exercise</button>
  </section>`;
}

function renderPlan() {
  const el = $('#plan');
  const recovery = conflicts();
  if (state.view === 'week') {
    el.className = 'plan week';
    el.innerHTML = DAYS.map((d) => dayCard(d, false, recovery)).join('');
  } else {
    el.className = 'plan single';
    el.innerHTML = dayCard(state.view, true, recovery);
  }
}

// The panel has a fixed head (title + body map + legend) and a scrolling list below it, so the body
// map never moves. The list's scroll position is kept per view across re-renders.
const panelScroll = {};
function setBodyPanel(key, head, list) {
  const panel = $('#body-panel');
  const old = panel.querySelector('.bp-scroll');
  if (old && panel.dataset.key) panelScroll[panel.dataset.key] = old.scrollTop;
  panel.dataset.key = key;
  panel.innerHTML = `<div class="bp-head">${head}</div><div class="bp-scroll">${list}</div>`;
  panel.querySelector('.bp-scroll').scrollTop = panelScroll[key] || 0;
}

function renderBodyPanel() {
  const focus = focusExercise();
  if (focus && findEx(focus)) {
    const ex = findEx(focus);
    const pinned = pinnedInPlan();
    const rows = Object.entries(ex.muscles).sort((a, b) => b[1] - a[1]).map(([mid, w]) =>
      `<li><i style="background:var(${w >= 1 ? '--lvl3' : w >= 0.5 ? '--lvl2' : '--lvl1'})"></i>${esc(state.muscleById[mid]?.name || mid)}<span>${w >= 1 ? 'main' : w >= 0.5 ? 'secondary' : 'stabiliser'}</span></li>`).join('');
    setBodyPanel('exercise', `<h2>${exLink(ex.name)}</h2>
      <p class="sub">${pinned ? 'Selected - click it again, click elsewhere or press Esc for the full body view' : 'Muscles this exercise hits (click the exercise to keep it here)'}</p>
      ${bodyPair(ex.muscles, 'weight')}${legendHtml('weight')}`, `<ul class="mlist">${rows}</ul>`);
    return;
  }
  const isWeek = state.view === 'week';
  const vol = computeVolume(isWeek ? DAYS : [state.view]);
  const values = setsOf(vol);
  const scale = isWeek ? 'week' : 'day';
  const zero = state.muscles.filter((m) => !values[m.id]);
  const low = isWeek ? state.muscles.filter((m) => values[m.id] && values[m.id] < 6) : [];

  setBodyPanel(state.view, `
    <h2>${isWeek ? 'Weekly coverage' : DAY_NAMES[state.view] + ' coverage'}</h2>
    <p class="sub">${esc(countingNote())} <button class="link" data-act="settings">change</button></p>
    ${bodyPair(values, scale)}
    ${legendHtml(scale)}`, `
    ${isWeek ? `<div class="gaps">
      ${zero.length ? `<p><b>Not trained (${zero.length}):</b> ${zero.map((m) => esc(m.name)).join(', ')}</p>` : '<p><b>Every muscle is trained at least once.</b></p>'}
      ${low.length ? `<p><b>Low (&lt;6 sets):</b> ${low.map((m) => esc(m.name)).join(', ')}</p>` : ''}
    </div>` : ''}
    ${(() => {
      const list = conflicts().filter((c) => isWeek || c.from === state.view || c.to === state.view);
      return isWeek || list.length ? `<div class="gaps">${recoveryHtml(list)}</div>` : '';
    })()}
    ${volumeTable(vol, values, isWeek)}`);
}

function volumeTable(vol, values, isWeek) {
  const max = Math.max(20, ...Object.values(values));
  const groups = GROUP_ORDER.map((g) => {
    const rows = state.muscles.filter((m) => m.group === g).map((m) => {
      const v = values[m.id] || 0;
      const lv = level(v, isWeek ? 'week' : 'day');
      const status = isWeek ? weeklyStatus(v) : '';
      const days = vol[m.id]?.days.size || 0;
      const tip = (vol[m.id]?.contrib || []).map((c) => `${c.day} ${c.exercise}: ${fmt(c.value)}`).join('\n');
      return `<tr data-m="${m.id}" title="${esc(tip)}">
        <td>${esc(m.name)}${DRAWN_MUSCLES.has(m.id) ? '' : ' <small>(not drawn)</small>'}</td>
        <td class="bar"><span style="width:${(v / max) * 100}%;background:${lv >= 0 ? `var(${LEVEL_VARS[lv]})` : 'transparent'}"></span></td>
        <td class="num">${v ? fmt(v) : '–'}</td>
        ${isWeek ? `<td class="num" title="Days with a primary/secondary hit">${days ? days + 'd' : ''}</td><td><span class="st ${status}">${status}</span></td>` : ''}
      </tr>`;
    }).join('');
    return `<tbody><tr class="grp"><th colspan="${isWeek ? 5 : 3}">${g}</th></tr>${rows}</tbody>`;
  }).join('');
  return `<table class="vol"><thead><tr><th>Muscle</th><th></th><th class="num">Sets</th>${isWeek ? '<th class="num">Freq</th><th>Status</th>' : ''}</tr></thead>${groups}</table>`;
}

// ---------------------------------------------------------------- muscle hover tooltip
function showTip(e, html) {
  const tip = $('#tip');
  tip.innerHTML = html;
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  tip.style.left = Math.min(e.clientX + 14, innerWidth - r.width - 8) + 'px';
  tip.style.top = Math.min(e.clientY + 14, innerHeight - r.height - 8) + 'px';
}

function muscleTip(mid, root) {
  const m = state.muscleById[mid];
  if (!m) return '';
  if (root.closest('.filter-body')) {
    return `<b>${esc(m.name)}</b><br>${muscleFilter.muscle === mid ? 'click to clear' : 'click to filter'}`;
  }
  if (root.closest('.modal')) {
    const w = state.modal?.selected ? findEx(state.modal.selected)?.muscles[mid] : null;
    return `<b>${esc(m.name)}</b>${w ? `<br>weight ${w}` : ''}`;
  }
  if (focusExercise()) {
    const w = findEx(focusExercise())?.muscles[mid];
    return `<b>${esc(m.name)}</b>${w ? `<br>weight ${w}` : ''}`;
  }
  const days = state.view === 'week' ? DAYS : [state.view];
  const v = computeVolume(days)[mid];
  if (!v) return `<b>${esc(m.name)}</b><br>0 sets`;
  const lines = v.contrib.sort((a, b) => b.value - a.value).slice(0, 8)
    .map((c) => `${state.view === 'week' ? c.day + ' · ' : ''}${esc(c.exercise)} <span>${fmt(c.value)}</span>`).join('<br>');
  return `<b>${esc(m.name)}: ${fmt(v.sets)} sets</b><br>${lines}`;
}

// ---------------------------------------------------------------- modal (add / edit exercise)
function openModal(day, index = null) {
  const it = index != null ? state.plan.days[day].items[index] : null;
  state.modal = {
    day, index,
    query: '', type: store.get('modal.type') || 'All', category: 'All',
    selected: it ? it.exercise : null,
    form: it ? itemToForm(it, day) : null,
  };
  $('#modal-root').hidden = false;
  renderModal(true);
}

function closeModal() {
  state.modal = null;
  $('#modal-root').hidden = true;
  $('#modal-root').innerHTML = '';
}

// Muscle filter (kept for the whole session so repeated adds keep the same filter).
const ROLES = [['primary', 'Main', 1], ['secondary', 'Main + secondary', 0.5], ['any', 'Any', 0.01]];
const muscleFilter = { muscle: null, group: 'All', role: 'secondary' };

// How strongly an exercise hits the filtered muscle/group (null = no muscle filter).
function filterWeight(e) {
  if (muscleFilter.muscle) return e.muscles[muscleFilter.muscle] || 0;
  if (muscleFilter.group === 'All') return null;
  return Math.max(0, ...Object.entries(e.muscles).filter(([mid]) => state.muscleById[mid]?.group === muscleFilter.group).map(([, w]) => w));
}

const roleLabel = (w) => (w >= 1 ? 'main' : w >= 0.5 ? 'secondary' : 'stabiliser');

function filteredExercises() {
  const { query, type, category } = state.modal;
  const minW = ROLES.find(([r]) => r === muscleFilter.role)[2];
  const tokens = query.toLowerCase().split(/[\s\-/]+/).filter(Boolean);
  const hasAll = (text) => tokens.every((t) => text.toLowerCase().includes(t));
  // Name matches first, then exercises that hit a matching muscle hardest (e.g. "upper chest").
  const score = (e) => {
    if (!tokens.length || hasAll(e.name)) return 2;
    return Math.max(0, ...Object.entries(e.muscles).map(([mid, w]) => (hasAll(state.muscleById[mid]?.name || '') ? w : 0)));
  };
  return state.exercises
    .filter((e) => (type === 'All' || e.type === type) && (category === 'All' || e.category === category))
    .map((e) => [e, score(e), filterWeight(e)])
    .filter(([, s, fw]) => s > 0 && (fw === null || fw >= minW))
    .sort((a, b) => b[1] - a[1] || (b[2] ?? 0) - (a[2] ?? 0))
    .map(([e, , fw]) => ({ e, fw }));
}

function filterPanelHtml() {
  const { muscle, group, role } = muscleFilter;
  const fills = {};
  for (const m of state.muscles) {
    if (m.id === muscle) fills[m.id] = 'var(--lvl3)';
    else if (!muscle && m.group === group) fills[m.id] = 'var(--lvl2)';
  }
  const active = muscle ? state.muscleById[muscle].name : group !== 'All' ? group : null;
  return `
    <div class="fp-title">Filter by muscle <span>click the body</span></div>
    <div class="body-pair filter-body">${bodySvg('front', fills, 'Front')}${bodySvg('back', fills, 'Back')}</div>
    <div class="chip-row">${['All', ...GROUP_ORDER].map((g) => `<button type="button" class="fchip ${!muscle && group === g ? 'active' : ''}" data-group="${g}">${g}</button>`).join('')}</div>
    <select id="muscle-select">
      <option value="">${group === 'All' ? 'Any muscle' : 'Any ' + group.toLowerCase() + ' muscle'}</option>
      ${GROUP_ORDER.map((g) => `<optgroup label="${g}">${state.muscles.filter((m) => m.group === g)
        .map((m) => `<option value="${m.id}" ${m.id === muscle ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</optgroup>`).join('')}
    </select>
    <div class="fp-label">Muscle must be</div>
    <div class="seg role-seg">${ROLES.map(([r, l]) => `<button type="button" class="${role === r ? 'active' : ''}" data-role="${r}">${l}</button>`).join('')}</div>
    ${active ? `<div class="fp-active">Showing exercises for <b>${esc(active)}</b> <button type="button" class="link" data-act="clear-filter">clear</button></div>` : ''}`;
}

function selectExercise(name) {
  const ex = findEx(name);
  state.modal.selected = ex.name;
  // Editing keeps what you entered; adding starts from the exercise's defaults.
  if (state.modal.index == null || !state.modal.form) {
    state.modal.form = itemToForm({
      sets: ex.defaultSets ?? 3, amountMin: ex.defaultAmountMin, amountMax: ex.defaultAmountMax,
      unit: ex.unit, perSide: ex.perSide, load: null, loadType: '', notes: '',
    }, state.modal.form?.day || state.modal.day);
  }
  renderModal();
}

// ---- entry form: numbers are typed (or stepped), units / side / load type are picked
const blank = (v) => v === null || v === undefined || v === '';
const numOrNull = (v) => (blank(v) || isNaN(Number(v)) ? null : Number(v));

function itemToForm(it, day) {
  return {
    day,
    sets: it.sets ?? '',
    amountMin: it.amountMin ?? '',
    amountMax: it.amountMax ?? '',
    range: !blank(it.amountMax),
    unit: it.unit || 'reps',
    perSide: !!it.perSide,
    emom: !!it.emom,
    hidden: !!it.hidden,
    load: it.load ?? '',
    loadType: it.loadType || '',
    notes: it.notes || '',
  };
}

function formToItem(f, exercise) {
  let lo = numOrNull(f.amountMin);
  let hi = f.range ? numOrNull(f.amountMax) : null;
  if (lo === null && hi !== null) [lo, hi] = [hi, null];
  if (lo !== null && hi !== null && hi < lo) [lo, hi] = [hi, lo];
  if (hi === lo) hi = null;
  return {
    exercise,
    sets: numOrNull(f.sets) ?? 0,
    amountMin: lo,
    amountMax: hi,
    unit: f.unit,
    perSide: f.perSide,
    emom: !!f.emom,
    hidden: !!f.hidden,
    load: loadHasNumber(f.loadType) ? numOrNull(f.load) : null,
    loadType: f.loadType,
    notes: String(f.notes || '').trim(),
  };
}

const STEP = { sets: () => 1, load: () => 2.5, amountMin: amountStep, amountMax: amountStep };
function amountStep() {
  return { s: 5, m: 5, steps: 2 }[state.modal.form.unit] || 1;
}

function stepper(name, value, { disabled = false, placeholder = '' } = {}) {
  return `<div class="stepper ${disabled ? 'off' : ''}">
    <button type="button" data-step="${name}" data-dir="-1" tabindex="-1" ${disabled ? 'disabled' : ''}>−</button>
    <input name="${name}" type="number" min="0" step="any" inputmode="decimal" value="${esc(value)}" placeholder="${placeholder}" ${disabled ? 'disabled' : ''}/>
    <button type="button" data-step="${name}" data-dir="1" tabindex="-1" ${disabled ? 'disabled' : ''}>+</button>
  </div>`;
}

function formHtml(m) {
  const f = m.form;
  const seg = (attr, options, current) => options.map(([v, l]) =>
    `<button type="button" class="${v === current ? 'active' : ''}" data-${attr}="${v}">${l}</button>`).join('');
  return `<form id="ex-form" class="ex-form">
    <div class="f-row">
      <label class="f-field">Day<select name="day">${DAYS.map((d) => `<option ${d === f.day ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <div class="f-field">Sets<div class="amount">${stepper('sets', f.sets)}
        <label class="check" title="EMOM sets count as ${settings.emom_factor} of a hard set"><input type="checkbox" name="emom" ${f.emom ? 'checked' : ''}/> EMOM</label></div></div>
    </div>
    <div class="f-row">
      <div class="f-field">Amount
        <div class="amount">
          ${stepper('amountMin', f.amountMin, { placeholder: f.range ? 'from' : '' })}
          ${f.range ? `<span class="dash">–</span>${stepper('amountMax', f.amountMax, { placeholder: 'to' })}` : ''}
          <label class="check"><input type="checkbox" name="range" ${f.range ? 'checked' : ''}/> range</label>
          <label class="check"><input type="checkbox" name="perSide" ${f.perSide ? 'checked' : ''}/> per side</label>
        </div>
      </div>
    </div>
    <div class="f-row">
      <div class="f-field">Unit<div class="seg">${seg('unit', UNITS, f.unit)}</div></div>
    </div>
    <div class="f-row">
      <div class="f-field">Load<div class="amount"><div class="seg">${seg('load-type', LOAD_TYPES, f.loadType)}</div>
        ${stepper('load', loadHasNumber(f.loadType) ? f.load : '', { disabled: !loadHasNumber(f.loadType) })}</div></div>
    </div>
    <label class="f-field wide">Notes<input name="notes" value="${esc(f.notes)}" placeholder="EMOM 10 min, tempo, cues…"/></label>
    <div class="f-preview">Shows as: <b id="f-preview">${esc(itemMeta(formToItem(f)) || '—')}</b></div>
    <div class="form-actions">
      <button type="button" class="btn" data-act="cancel">Cancel</button>
      <button type="submit" class="btn primary">${m.index != null ? 'Save changes' : 'Add to plan'}</button>
    </div>
  </form>`;
}

const updatePreview = () => { const p = $('#f-preview'); if (p) p.textContent = itemMeta(formToItem(state.modal.form)) || '—'; };

function renderModal(first = false) {
  const m = state.modal;
  const categories = ['All', ...new Set(state.exercises.map((e) => e.category).filter(Boolean))];
  const list = filteredExercises();
  const ex = m.selected ? findEx(m.selected) : null;
  const editing = m.index != null;

  const listHtml = list.map(({ e, fw }) => `<li class="${ex && e.name === ex.name ? 'sel' : ''}" data-name="${esc(e.name)}">
      <span>${esc(e.name)}</span><span class="tags">${fw ? `<span class="role r${fw >= 1 ? 3 : fw >= 0.5 ? 2 : 1}">${roleLabel(fw)}</span>` : ''}${typeTag(e)}</span></li>`).join('') || '<li class="none">No match - try a wider filter</li>';

  const muscleRows = ex ? Object.entries(ex.muscles).sort((a, b) => b[1] - a[1]).map(([mid, w]) =>
    `<li><i style="background:var(${w >= 1 ? '--lvl3' : w >= 0.5 ? '--lvl2' : '--lvl1'})"></i>${esc(state.muscleById[mid]?.name || mid)}<span>${w >= 1 ? 'primary' : w >= 0.5 ? 'secondary' : 'stabiliser'}</span></li>`).join('') : '';

  const detail = ex ? `
    <h3>${exLink(ex.name)}</h3>
    <p class="sub">${[ex.type, ex.category, ex.equipment].filter(Boolean).map(esc).join(' · ')} ${typeTag(ex)}</p>
    ${ex.notes ? `<p class="ex-notes">${esc(ex.notes)}</p>` : ''}
    ${bodyPair(ex.muscles, 'weight')}
    <ul class="mlist">${muscleRows}</ul>
    ${formHtml(m)}` : '<div class="placeholder">Pick an exercise to see which muscles it hits.</div>';

  const root = $('#modal-root');
  if (first) {
    root.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head"><h2>${editing ? 'Edit exercise' : 'Add exercise'} · ${DAY_NAMES[m.day]}</h2><button class="icon" data-act="cancel" title="Close">✕</button></div>
      <div class="modal-body">
        <div class="filter-panel" id="filter-panel"></div>
        <div class="picker">
          <input id="ex-search" type="search" placeholder="Search exercise or muscle (e.g. upper chest)…" autocomplete="off"/>
          <div class="filters">
            <div class="seg" id="type-seg"></div>
            <select id="cat-select"></select>
          </div>
          <div class="count-line" id="count-line"></div>
          <ul class="ex-list" id="ex-list"></ul>
        </div>
        <div class="detail" id="ex-detail"></div>
      </div>
    </div>`;
    $('#ex-search').focus();
  }
  $('#type-seg').innerHTML = ['All', 'Gym', 'Calisthenics'].map((t) => `<button type="button" class="${m.type === t ? 'active' : ''}" data-type="${t}">${t}</button>`).join('');
  $('#cat-select').innerHTML = categories.map((c) => `<option ${c === m.category ? 'selected' : ''}>${c}</option>`).join('');
  $('#filter-panel').innerHTML = filterPanelHtml();
  $('#count-line').textContent = `${list.length} exercise${list.length === 1 ? '' : 's'}`;
  $('#ex-list').innerHTML = listHtml;
  $('#ex-detail').innerHTML = detail;
  $('#ex-list .sel')?.scrollIntoView({ block: 'nearest' });
}

function submitModal() {
  const m = state.modal;
  const item = formToItem(m.form, m.selected);
  const targetDay = m.form.day;
  if (m.index != null) {
    const items = state.plan.days[m.day].items;
    if (targetDay === m.day) items[m.index] = item;
    else { items.splice(m.index, 1); state.plan.days[targetDay].items.push(item); }
  } else {
    state.plan.days[targetDay].items.push(item);
  }
  closeModal();
  render();
  markDirty();
}

// ---------------------------------------------------------------- plan management
async function newPlan(copyFrom) {
  if (!copyFrom && !confirmDiscard('create a new plan')) return;
  const ask = copyFrom
    ? `Name for the copy of "${copyFrom}":${dirty ? `\n\nThe copy includes your unsaved changes; "${copyFrom}" stays as last saved.` : ''}`
    : 'New plan title (becomes the Excel file name in Plans):';
  const name = prompt(ask, copyFrom ? copyFrom + ' copy' : '');
  if (!name) return;
  try {
    // Duplicate copies what is on screen (a "save as"), not the file on disk.
    const res = await api('/api/plan/create', copyFrom ? { name, days: state.plan.days } : { name });
    state.plans = res.plans;
    await loadPlan(res.name);
    setStatus(`Created "${res.name}"`, 'ok');
  } catch (e) { alert(e.message); }
}

async function renamePlan() {
  const name = prompt('Rename plan to:', state.plan.name);
  if (!name || name === state.plan.name) return;
  try {
    // Renames the file only; unsaved edits stay unsaved.
    const res = await api('/api/plan/save', { name, replace: state.plan.name });
    state.plans = res.plans;
    state.plan.name = res.name;
    store.set('plan', res.name);
    render();
    setStatus('Renamed', 'ok');
    updateSaveUi();
  } catch (e) { alert(e.message); }
}

async function deletePlan() {
  if (!confirm(`Delete plan "${state.plan.name}"? Its file is moved to Plans/_deleted (not erased).`)) return;
  try {
    const res = await api('/api/plan/delete', { name: state.plan.name });
    state.plans = res.plans;
    await loadPlan(res.plans[0]);
    setStatus('Plan deleted', 'ok');
  } catch (e) { alert(e.message); }
}

// ---------------------------------------------------------------- counting settings
function openSettings() {
  const root = $('#modal-root');
  const seg = (name, options, current) => `<div class="seg">${options.map(([v, l]) =>
    `<button type="button" class="${Number(v) === Number(current) ? 'active' : ''}" data-setting="${name}" data-value="${v}">${l}</button>`).join('')}</div>`;
  const draw = (s) => {
    root.innerHTML = `<div class="modal settings-modal" role="dialog" aria-modal="true">
      <div class="modal-head"><h2>Counting settings</h2><button class="icon" data-act="settings-close" title="Close">✕</button></div>
      <div class="settings-body">
        <section>
          <h3>Stabiliser muscles</h3>
          <p>Muscles marked 0.25 in the library only hold position. Research-style counting gives them no credit.</p>
          ${seg('stabiliser_weight', [[0, 'Not counted'], [0.25, 'Count as 0.25']], s.stabiliser_weight)}
        </section>
        <section>
          <h3>EMOM sets count as</h3>
          <p>EMOM sets start easy and only get hard near the end, so one EMOM set is worth less than a hard straight set.
             At 0.5, a 10-minute EMOM counts like 5 hard sets.</p>
          ${seg('emom_factor', [[0.25, '0.25'], [0.33, '0.33'], [0.5, '0.5'], [0.75, '0.75'], [1, '1 (full)']], s.emom_factor)}
        </section>
        <p class="sub">Saved in FitView.xlsx (Settings sheet) and used everywhere, including exports.
          <a href="https://github.com/Vichu95/FitView/blob/main/docs/methodology.md" target="_blank" rel="noopener">How counting works</a></p>
      </div>
    </div>`;
  };
  const pending = { ...settings };
  draw(pending);
  root.hidden = false;
  root.onclick = async (e) => {
    const b = e.target.closest('[data-setting]');
    if (b) {
      pending[b.dataset.setting] = Number(b.dataset.value);
      try {
        const res = await api('/api/settings', pending);
        applySettings(res.settings);
        draw(res.settings);
        render();
        setStatus('Settings saved', 'ok');
        if (dirty) updateSaveUi();
      } catch (err) { setStatus('Settings not saved: ' + err.message, 'err'); }
      return;
    }
    if (e.target.closest('[data-act="settings-close"]') || e.target === root) {
      root.onclick = null;
      closeModal();
    }
  };
}

// ---------------------------------------------------------------- export
function renderExportMenu() {
  const day = state.view !== 'week' ? state.view : null;
  const dayHasItems = day && state.plan.days[day].items.length;
  $('#export-menu').innerHTML = `
    <button data-act="export-pdf"><b>PDF</b><span>Weekly plan + muscle overview</span></button>
    <button data-act="export-week"><b>Week image</b><span>All 7 days in one row + body map at the end</span></button>
    <button data-act="export-days"><b>Day images</b><span>One phone-sized PNG per training day</span></button>
    ${day ? `<button data-act="export-day" ${dayHasItems ? '' : 'disabled'}><b>${DAY_NAMES[day]} image</b><span>${dayHasItems ? 'Only this day' : 'No exercises on this day'}</span></button>` : ''}
    <p>Saved next to the plan file in the Plans folder. Hidden exercises are left out. Unsaved changes are included.</p>`;
}

// Exports use what is on screen (saved or not), minus hidden exercises.
const exportPlan = () => ({
  name: state.plan.name,
  days: Object.fromEntries(DAYS.map((d) => [d, { ...state.plan.days[d], items: state.plan.days[d].items.filter((it) => !it.hidden) }])),
});

async function runExport(act) {
  try {
    const plan = exportPlan();
    if (act === 'export-pdf') {
      setStatus('Creating PDF…');
      const res = await api('/api/export/pdf', { name: plan.name, days: plan.days });
      return setStatus(`Exported ${res.file}`, 'ok', true);
    }
    setStatus('Rendering images…');
    await new Promise((r) => setTimeout(r, 30)); // let the status paint before the canvas work
    const files = act === 'export-week'
      ? exportWeekImage(plan, state.lib, state.muscles)
      : exportDayImages(plan, state.lib, act === 'export-day' ? [state.view] : DAYS);
    if (!files.length) return setStatus('No training days to export', 'err');
    const res = await api('/api/export/images', { files });
    setStatus(res.files.length === 1 ? `Exported ${res.files[0]}` : `Exported ${res.files.length} images`, 'ok', true);
  } catch (e) {
    setStatus('Export failed: ' + e.message, 'err');
  }
}

// ---------------------------------------------------------------- events
function wire() {
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('.ex-link')) return; // let the browser open the image search
    const rowClick = t.closest('.item') && !t.closest('[data-act], .grip');
    if (rowClick) {
      const el = t.closest('.item');
      const it = state.plan.days[el.dataset.day].items[Number(el.dataset.i)];
      state.pinned = state.pinned === it ? null : it;
      state.hoverExercise = null;
      renderPlan();
      return renderBodyPanel();
    }
    if (state.pinned && !t.closest('.item, #body-panel, .modal, #modal-root')) {
      unpin();
      renderPlan();
      renderBodyPanel();
    }
    const viewBtn = t.closest('[data-view]');
    if (viewBtn && !t.closest('.modal')) {
      state.view = viewBtn.dataset.view;
      state.hoverExercise = null;
      store.set('view', state.view);
      return render();
    }
    if (t.closest('.add')) return openModal(t.closest('.add').dataset.day);

    const act = t.closest('[data-act]')?.dataset.act;
    const item = t.closest('.item');
    if (item && act) {
      const { day } = item.dataset;
      const i = Number(item.dataset.i);
      const items = state.plan.days[day].items;
      if (act === 'edit') return openModal(day, i);
      if (act === 'hide') {
        const it = items[i];
        it.hidden = !it.hidden;
        state.hoverExercise = null;
        render();
        return markDirty();
      }
      if (act === 'del') items.splice(i, 1);
      if (act === 'up' && i > 0) [items[i - 1], items[i]] = [items[i], items[i - 1]];
      if (act === 'down' && i < items.length - 1) [items[i + 1], items[i]] = [items[i], items[i + 1]];
      state.hoverExercise = null;
      render();
      return markDirty();
    }

    const menu = $('#export-menu');
    if (t.closest('#btn-export')) { menu.hidden = !menu.hidden; if (!menu.hidden) renderExportMenu(); return; }
    if (!t.closest('#export-menu')) menu.hidden = true;
    if (act?.startsWith('export-')) { menu.hidden = true; return runExport(act); }
    if (act === 'settings') return openSettings();
    if (act === 'open-folder') return api('/api/open-folder', {}).catch((err) => setStatus(err.message, 'err'));

    if (act === 'unhide-all') {
      DAYS.forEach((d) => state.plan.days[d].items.forEach((it) => { it.hidden = false; }));
      render();
      return markDirty();
    }

    if (t.closest('.modal')) {
      if (act === 'cancel') return closeModal();
      const stepBtn = t.closest('[data-step]');
      if (stepBtn) {
        const name = stepBtn.dataset.step;
        const f = state.modal.form;
        const step = STEP[name]();
        const next = Math.max(0, Math.round(((numOrNull(f[name]) ?? 0) + step * Number(stepBtn.dataset.dir)) * 100) / 100);
        f[name] = next;
        stepBtn.parentElement.querySelector('input').value = next;
        return updatePreview();
      }
      const unitBtn = t.closest('[data-unit]');
      if (unitBtn) { state.modal.form.unit = unitBtn.dataset.unit; return renderModal(); }
      const loadBtn = t.closest('[data-load-type]');
      if (loadBtn) { state.modal.form.loadType = loadBtn.dataset.loadType; return renderModal(); }
      const musclePath = t.closest('.filter-body path.m');
      if (musclePath) {
        const mid = musclePath.dataset.m;
        muscleFilter.muscle = muscleFilter.muscle === mid ? null : mid;
        muscleFilter.group = muscleFilter.muscle ? state.muscleById[mid].group : 'All';
        return renderModal();
      }
      const groupBtn = t.closest('[data-group]');
      if (groupBtn) { muscleFilter.group = groupBtn.dataset.group; muscleFilter.muscle = null; return renderModal(); }
      const roleBtn = t.closest('[data-role]');
      if (roleBtn) { muscleFilter.role = roleBtn.dataset.role; return renderModal(); }
      if (act === 'clear-filter') { muscleFilter.muscle = null; muscleFilter.group = 'All'; return renderModal(); }
      const li = t.closest('#ex-list li[data-name]');
      if (li) return selectExercise(li.dataset.name);
      const typeBtn = t.closest('[data-type]');
      if (typeBtn) {
        state.modal.type = typeBtn.dataset.type;
        store.set('modal.type', state.modal.type);
        return renderModal();
      }
    } else if (t.id === 'modal-root') {
      closeModal();
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'ex-search') { state.modal.query = e.target.value; renderModal(); }
    if (e.target.closest('#ex-form') && state.modal && e.target.type !== 'checkbox' && e.target.name) {
      state.modal.form[e.target.name] = e.target.value;
      updatePreview();
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'cat-select') { state.modal.category = e.target.value; renderModal(); }
    if (e.target.closest('#ex-form') && e.target.name === 'day') state.modal.form.day = e.target.value;
    if (e.target.closest('#ex-form') && e.target.type === 'checkbox') {
      const f = state.modal.form;
      f[e.target.name] = e.target.checked;
      if (e.target.name === 'range' && f.range && blank(f.amountMax) && !blank(f.amountMin)) {
        f.amountMax = Number(f.amountMin) + amountStep() * 2;
      }
      if (e.target.name === 'range') renderModal(); else updatePreview();
    }
    if (e.target.id === 'muscle-select') {
      const mid = e.target.value || null;
      muscleFilter.muscle = mid;
      if (mid) muscleFilter.group = state.muscleById[mid].group;
      renderModal();
    }
    if (e.target.id === 'plan-select') {
      if (confirmDiscard('switch plans')) loadPlan(e.target.value);
      else e.target.value = state.plan.name;
    }
    if (e.target.classList.contains('session')) {
      state.plan.days[e.target.dataset.day].session = e.target.value.trim();
      markDirty();
    }
  });

  document.addEventListener('submit', (e) => {
    if (e.target.id === 'ex-form') { e.preventDefault(); submitModal(); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.modal) closeModal();
    else if (e.key === 'Escape' && unpin()) { renderPlan(); renderBodyPanel(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); savePlan(); }
    if (e.key === 'Enter' && e.target.classList.contains('session')) e.target.blur();
  });

  // Drag and drop: reorder within a day or move to another day.
  let drag = null; // { day, i }
  const clearDropMarks = () => document.querySelectorAll('.drop-before, .drop-after, .drop-end')
    .forEach((el) => el.classList.remove('drop-before', 'drop-after', 'drop-end'));

  // Where would a drop at this pointer position land? -> { day, index, el, cls }
  function dropTarget(e) {
    const item = e.target.closest('.item');
    if (item) {
      const r = item.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      return { day: item.dataset.day, index: Number(item.dataset.i) + (after ? 1 : 0), el: item, cls: after ? 'drop-after' : 'drop-before' };
    }
    const dayEl = e.target.closest('.day');
    if (!dayEl) return null;
    const day = dayEl.querySelector('.add').dataset.day;
    return { day, index: state.plan.days[day].items.length, el: dayEl, cls: 'drop-end' };
  }

  $('#plan').addEventListener('dragstart', (e) => {
    const item = e.target.closest('.item');
    if (!item) return;
    drag = { day: item.dataset.day, i: Number(item.dataset.i) };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
    item.classList.add('dragging');
    state.hoverExercise = null;
    $('#tip').hidden = true;
  });
  $('#plan').addEventListener('dragover', (e) => {
    if (!drag) return;
    const t = dropTarget(e);
    if (!t) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!t.el.classList.contains(t.cls)) { clearDropMarks(); t.el.classList.add(t.cls); }
  });
  $('#plan').addEventListener('drop', (e) => {
    if (!drag) return;
    e.preventDefault();
    const t = dropTarget(e);
    clearDropMarks();
    if (!t) return;
    const from = state.plan.days[drag.day].items;
    let index = t.index;
    if (t.day === drag.day) {
      if (index === drag.i || index === drag.i + 1) return; // dropped on itself
      if (index > drag.i) index -= 1;
    }
    const [moved] = from.splice(drag.i, 1);
    state.plan.days[t.day].items.splice(index, 0, moved);
    drag = null;
    render();
    markDirty();
  });
  $('#plan').addEventListener('dragend', () => {
    drag = null;
    clearDropMarks();
    document.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
  });

  // Hovering an exercise in the plan previews just that exercise on the body.
  // While the page scrolls, exercises slide under a still mouse and would fire hover previews,
  // making the body panel flicker between views. Ignore hover until scrolling has settled.
  let scrollingUntil = 0;
  window.addEventListener('scroll', () => { scrollingUntil = Date.now() + 200; }, { passive: true });

  // Keep the sticky panel sized to the header and footer heights (both wrap on narrow windows).
  const syncChrome = () => {
    document.documentElement.style.setProperty('--head-h', `${$('.top').offsetHeight}px`);
    document.documentElement.style.setProperty('--foot-h', `${$('.foot').offsetHeight}px`);
  };
  const chromeObserver = new ResizeObserver(syncChrome);
  chromeObserver.observe($('.top'));
  chromeObserver.observe($('.foot'));
  syncChrome();

  $('#plan').addEventListener('mouseover', (e) => {
    if (pinnedInPlan() || Date.now() < scrollingUntil) return;
    const item = e.target.closest('.item');
    const name = item ? state.plan.days[item.dataset.day].items[item.dataset.i]?.exercise : null;
    const next = name && findEx(name) ? name : null;
    if (next !== state.hoverExercise) { state.hoverExercise = next; renderBodyPanel(); }
  });
  $('#plan').addEventListener('mouseleave', () => {
    if (state.hoverExercise && !pinnedInPlan()) { state.hoverExercise = null; renderBodyPanel(); }
  });

  document.addEventListener('mousemove', (e) => {
    const p = e.target.closest?.('path.m, table.vol tr[data-m]');
    if (!p || p.tagName === 'TR') { $('#tip').hidden = true; return; }
    showTip(e, muscleTip(p.dataset.m, p));
  });

  $('#btn-new').onclick = () => newPlan();
  $('#btn-copy').onclick = () => newPlan(state.plan.name);
  $('#btn-rename').onclick = renamePlan;
  $('#btn-delete').onclick = deletePlan;
  $('#btn-save').onclick = savePlan;
  $('#btn-discard').onclick = async () => {
    if (!confirm('Discard all unsaved changes and go back to the last saved version?')) return;
    await loadPlan(state.plan.name);
    setStatus('Changes discarded', 'ok');
  };
  window.addEventListener('beforeunload', (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });
  $('#btn-reload').onclick = async () => {
    if (!confirmDiscard('reload from Excel')) return;
    await loadData();
    await loadPlan(state.plans.includes(state.plan.name) ? state.plan.name : state.plans[0]);
    setStatus('Reloaded from Excel', 'ok');
  };
}

async function init() {
  wire();
  try {
    if (state.view !== 'week' && !DAYS.includes(state.view)) state.view = 'week';
    await loadData();
    // ?plan=<name> in the URL wins (bookmarkable), then the last plan used, then the first one.
    const wanted = new URLSearchParams(location.search).get('plan') || store.get('plan');
    await loadPlan(state.plans.includes(wanted) ? wanted : state.plans[0]);
    setStatus('Loaded from Excel', 'ok');
  } catch (e) {
    setStatus('Could not load: ' + e.message, 'err');
  }
}

init();
