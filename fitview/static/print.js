// PDF layout: one page per training day (exercises left, that day's body map right),
// then a weekly summary page. Pages are a fixed width but their height grows to fit the
// content, so a long day is never cut off. Data is embedded by the server.
import { DRAWN_MUSCLES } from './body.js';
import {
  DAYS, DAY_NAMES, GROUP_ORDER, LEVEL_VARS, esc, fmt, level, weeklyStatus, itemMeta,
  makeLibrary, computeVolume, setsOf, bodyPair, legendHtml, recoveryConflicts, recoveryHtml, applySettings, countingNote,
  countedSets,
} from './core.js';

const PAGE_W_MM = 297;
const PX_PER_MM = 96 / 25.4;

const { plan, muscles, exercises, generated, settings } = window.FITVIEW_DATA;
applySettings(settings);
const lib = makeLibrary(muscles, exercises);

const vol = computeVolume(plan.days, lib.findEx, DAYS);
const values = setsOf(vol);
const recovery = recoveryConflicts(plan.days, lib.findEx, muscles);
const daySets = (d) => plan.days[d].items.reduce((a, it) => a + (Number(it.sets) || 0), 0);
const totalSets = DAYS.reduce((s, d) => s + daySets(d), 0);
const trainingDays = DAYS.filter((d) => plan.days[d].items.length);

const brand = `<div class="brand">Fit<span>View</span> · ${esc(plan.name)}</div>`;

function tags(ex, it) {
  if (!ex) return '<span class="tag warn">not in library</span>';
  const t = ex.type === 'Calisthenics' ? '<span class="tag cal">Cali</span>' : '<span class="tag gym">Gym</span>';
  const knee = ex.knee === 'High' ? '<span class="tag knee">knee: high</span>' : ex.knee === 'Medium' ? '<span class="tag knee-med">knee: med</span>' : '';
  return t + knee + (it.emom ? '<span class="tag emom">EMOM</span>' : '');
}

const mainMuscles = (ex) => (ex ? Object.entries(ex.muscles).filter(([, w]) => w >= 1)
  .map(([mid]) => lib.muscleById[mid]?.name).filter(Boolean).join(', ') : '');

// ---------------------------------------------------------------- one page per training day
function dayPage(day) {
  const d = plan.days[day];
  const dvol = computeVolume(plan.days, lib.findEx, [day]);
  const dvals = setsOf(dvol);
  const counted = d.items.reduce((s, it) => s + countedSets(it), 0);
  const top = Object.entries(dvals).sort((a, b) => b[1] - a[1]);
  const rec = recovery.filter((c) => c.from === day || c.to === day);

  const items = d.items.map((it, i) => {
    const ex = lib.findEx(it.exercise);
    const main = mainMuscles(ex);
    return `<li>
      <div class="n">${i + 1}</div>
      <div class="li-body">
        <div class="ex">${esc(it.exercise)}</div>
        <div class="sr"><b>${esc(itemMeta(it))}</b> ${tags(ex, it)}</div>
        ${main ? `<div class="mm">Main: ${esc(main)}</div>` : ''}
        ${it.notes ? `<div class="nt">${esc(it.notes)}</div>` : ''}
      </div>
    </li>`;
  }).join('');

  const muscleRows = top.map(([mid, v]) => {
    const lv = level(v, 'day');
    return `<tr><td>${esc(lib.muscleById[mid]?.name || mid)}</td>
      <td class="bar"><span style="width:${Math.min(100, (v / Math.max(8, top[0][1])) * 100)}%;background:var(${LEVEL_VARS[Math.max(lv, 0)]})"></span></td>
      <td class="num">${fmt(v)}</td></tr>`;
  }).join('');

  return `<section class="page day-page" data-page="${day}">
    <header class="page-head">
      <div>${brand}<h1>${DAY_NAMES[day]}</h1><div class="session">${esc(d.session)}</div></div>
      <div class="meta"><b>${d.items.length} exercises · ${fmt(daySets(day))} sets</b><br>${fmt(counted)} counted (EMOM × ${settings.emom_factor ?? 0.5})</div>
    </header>
    <div class="day-grid">
      <ol class="ex-list">${items}</ol>
      <aside class="day-side">
        ${bodyPair(dvals, 'day')}
        ${legendHtml('day')}
        <h3>Muscles today <small>weighted sets</small></h3>
        <table class="vol compact">${muscleRows}</table>
        ${rec.length ? `<div class="recovery-box">${recoveryHtml(rec)}</div>` : ''}
      </aside>
    </div>
  </section>`;
}

// ---------------------------------------------------------------- weekly summary
function weekColumn(day) {
  const d = plan.days[day];
  const items = d.items.map((it, i) => `<li><span class="n">${i + 1}</span><div>
      <div class="ex">${esc(it.exercise)}</div><div class="sr">${esc(itemMeta(it))}${it.emom ? ' · EMOM' : ''}</div></div></li>`).join('');
  return `<section class="col ${d.items.length ? '' : 'rest'}">
    <h2>${day}</h2>
    <div class="session">${esc(d.session) || (d.items.length ? '&nbsp;' : 'Rest')}</div>
    ${items ? `<ol>${items}</ol>` : ''}
  </section>`;
}

function coverageTable(groups) {
  const max = Math.max(20, ...Object.values(values));
  return `<table class="vol"><thead><tr><th>Muscle</th><th></th><th class="num">Sets</th><th class="num">Freq</th><th>Status</th></tr></thead>
    ${groups.map((g) => `<tbody><tr class="grp"><th colspan="5">${g}</th></tr>${muscles.filter((m) => m.group === g).map((m) => {
      const v = values[m.id] || 0;
      const lv = level(v, 'week');
      const days = vol[m.id]?.days.size || 0;
      const st = weeklyStatus(v);
      return `<tr><td>${esc(m.name)}${DRAWN_MUSCLES.has(m.id) ? '' : ' <small>(not drawn)</small>'}</td>
        <td class="bar"><span style="width:${(v / max) * 100}%;background:${lv >= 0 ? `var(${LEVEL_VARS[lv]})` : 'transparent'}"></span></td>
        <td class="num">${v ? fmt(v) : '–'}</td><td class="num">${days ? days + 'd' : ''}</td>
        <td><span class="st ${st}">${st}</span></td></tr>`;
    }).join('')}</tbody>`).join('')}</table>`;
}

const zero = muscles.filter((m) => !values[m.id]);
const low = muscles.filter((m) => values[m.id] && values[m.id] < 6);
const high = muscles.filter((m) => values[m.id] > 20);

const summaryPage = `<section class="page summary-page" data-page="summary">
  <header class="page-head">
    <div>${brand}<h1>Weekly summary</h1></div>
    <div class="meta"><b>${trainingDays.length} training days · ${fmt(totalSets)} sets</b><br>${generated}</div>
  </header>
  <div class="week">${DAYS.map(weekColumn).join('')}</div>
  <div class="overview">
    <div class="bodies">
      ${bodyPair(values, 'week')}
      ${legendHtml('week')}
      <p class="explain">${esc(countingNote())}. Freq = days with a main/secondary hit.</p>
      <div class="gaps">
        <p><b>Not trained (${zero.length}):</b> ${zero.length ? zero.map((m) => esc(m.name)).join(', ') : 'none'}</p>
        <p><b>Low (&lt;6 sets):</b> ${low.length ? low.map((m) => esc(m.name)).join(', ') : 'none'}</p>
        <p><b>High (&gt;20 sets):</b> ${high.length ? high.map((m) => esc(m.name)).join(', ') : 'none'}</p>
      </div>
      <div class="recovery-box">${recoveryHtml(recovery)}</div>
    </div>
    <div class="tables">
      ${coverageTable(GROUP_ORDER.slice(0, 3))}
      ${coverageTable(GROUP_ORDER.slice(3))}
    </div>
  </div>
</section>`;

document.getElementById('root').innerHTML = trainingDays.map(dayPage).join('') + summaryPage;

// ---------------------------------------------------------------- page sizes
// Each page gets its own @page size: fixed width, height measured from its content.
const rules = [...document.querySelectorAll('.page')].map((el) => {
  const name = `p-${el.dataset.page}`;
  el.style.page = name;
  const hMm = Math.ceil(el.getBoundingClientRect().height / PX_PER_MM) + 2;
  return `@page ${name} { size: ${PAGE_W_MM}mm ${hMm}mm; margin: 0; }`;
});
const style = document.createElement('style');
style.textContent = rules.join('\n');
document.head.appendChild(style);
