// High-resolution PNG exports drawn on a canvas:
//  - one phone-shaped card per training day (gym reference)
//  - one wide week image: 7 day columns in a row, body map at the end
import { VIEWS, SIL_PATH, BODY_W, BODY_H } from './body.js';
import { DAY_NAMES, DAYS, SCALES, computeVolume, setsOf, level, fmt, itemMeta, recoveryConflicts } from './core.js';

const SCALE = 2;
const FONT = '"Segoe UI", system-ui, sans-serif';
const C = {
  bg: '#f6f5f3', card: '#ffffff', text: '#1c1917', muted: '#6b6560', line: '#e2dfdb',
  head: '#1c1917', accent: '#e5484d', accentSoft: '#f5a35c', rest: '#efede9',
  base: '#d9d4ce', sil: '#e9e6e2', silLine: '#cfcac4',
  levels: ['#fbd0bf', '#f5a35c', '#e5484d', '#8e1b33'],
  gym: '#2563eb', cal: '#0d9488', warn: '#b45309',
};

// Text sizes for one exercise entry: big for the phone day card, compact for the week image.
const DAY_SIZES = { name: 46, nameLH: 56, meta: 42, metaLH: 54, badge: 22, badgeH: 36, badgeLH: 50, note: 30, noteLH: 40, num: 32, numR: 32, pad: 32, gap: 24 };
const WEEK_SIZES = { name: 25, nameLH: 31, meta: 23, metaLH: 31, badge: 13, badgeH: 22, badgeLH: 30, note: 18, noteLH: 23, num: 16, numR: 15, pad: 14, gap: 12 };

const font = (size, weight = 400, style = '') => `${style} ${weight} ${size}px ${FONT}`.trim();

function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? line + ' ' + w : w;
    if (line && ctx.measureText(next).width > maxW) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function card(ctx, x, y, w, h, fill = C.card, dashed = false) {
  roundRect(ctx, x, y, w, h, 24);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.setLineDash(dashed ? [10, 8] : []);
  ctx.stroke();
  ctx.setLineDash([]);
}

// Pill badge; returns its width.
function badge(ctx, x, y, text, color, s) {
  ctx.font = font(s.badge, 700);
  const w = ctx.measureText(text).width + s.badge * 1.1;
  roundRect(ctx, x, y, w, s.badgeH, s.badgeH / 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, s.badge / 11);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + s.badge * 0.55, y + s.badgeH / 2 + 1);
  ctx.textBaseline = 'alphabetic';
  return w;
}

// One exercise entry (number, name, sets x reps, badges, notes). Returns its height.
function drawItem(ctx, lib, it, i, x, y, w, s, draw) {
  const ex = lib.findEx(it.exercise);
  const textX = x + s.pad + s.numR * 2 + s.gap;
  const textW = x + w - s.pad - textX;
  ctx.font = font(s.name, 700);
  const nameLines = wrap(ctx, it.exercise, textW);
  const meta = itemMeta(it, '  ·  ');
  ctx.font = font(s.note, 400, 'italic');
  const noteLines = it.notes ? wrap(ctx, it.notes, textW) : [];
  const h = s.pad * 2 + nameLines.length * s.nameLH + (meta ? s.metaLH : 0) + s.badgeLH + noteLines.length * s.noteLH - s.pad / 4;
  if (!draw) return h;

  const top = y + s.pad;
  ctx.beginPath();
  ctx.arc(x + s.pad + s.numR, top + s.nameLH / 2, s.numR, 0, Math.PI * 2);
  ctx.fillStyle = C.head;
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = font(s.num, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(i + 1), x + s.pad + s.numR, top + s.nameLH / 2 + 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  let ty = top + s.nameLH * 0.79;
  ctx.fillStyle = C.text;
  ctx.font = font(s.name, 700);
  for (const l of nameLines) { ctx.fillText(l, textX, ty); ty += s.nameLH; }
  if (meta) {
    ctx.fillStyle = C.accent;
    ctx.font = font(s.meta, 700);
    ctx.fillText(meta, textX, ty + s.metaLH * 0.05);
    ty += s.metaLH;
  }
  let bx = textX;
  const by = ty - s.nameLH * 0.79 + (s.badgeLH - s.badgeH) / 2;
  if (ex) bx += badge(ctx, bx, by, ex.type === 'Calisthenics' ? 'CALISTHENICS' : 'GYM', ex.type === 'Calisthenics' ? C.cal : C.gym, s) + s.badge * 0.5;
  if (ex?.knee === 'High') badge(ctx, bx, by, 'KNEE: HIGH', C.accent, s);
  else if (ex?.knee === 'Medium') badge(ctx, bx, by, 'KNEE: MED', C.warn, s);
  ty += s.badgeLH;
  ctx.fillStyle = C.muted;
  ctx.font = font(s.note, 400, 'italic');
  for (const l of noteLines) { ctx.fillText(l, textX, ty - s.noteLH * 0.25); ty += s.noteLH; }
  return h;
}

function drawBody(ctx, view, fills, x, y, h) {
  const k = h / BODY_H;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.lineWidth = 1;
  ctx.fillStyle = C.sil;
  ctx.strokeStyle = C.silLine;
  const sil = new Path2D(SIL_PATH);
  ctx.fill(sil);
  ctx.stroke(sil);
  ctx.beginPath();
  ctx.ellipse(100, 26, 15, 19, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = C.sil;
  ctx.lineWidth = 0.8;
  for (const { id, d } of VIEWS[view]) {
    ctx.fillStyle = fills[id] || C.base;
    for (const dd of d) {
      const p = new Path2D(dd);
      ctx.fill(p);
      ctx.stroke(p);
    }
  }
  ctx.restore();
}

// Card with front + back body maps and a legend. Returns its height.
function drawBodyPanel(ctx, values, scale, x, y, w, title, bodyH, draw, extraLines = []) {
  const bodyW = (bodyH * BODY_W) / BODY_H;
  const gap = Math.min(80, w - bodyW * 2 - 40);
  ctx.font = font(24, 400);
  const wrapped = extraLines.flatMap(([label, text]) => {
    ctx.font = font(24, 400);
    return wrap(ctx, `${label} ${text}`, w - 64).map((l, i) => [i === 0 ? label : '', i === 0 ? l.slice(label.length + 1) : l]);
  });
  const h = 80 + bodyH + 50 + 60 + (wrapped.length ? wrapped.length * 34 + 30 : 0);
  if (!draw) return h;

  const fills = {};
  for (const [mid, v] of Object.entries(values)) {
    const lv = level(v, scale);
    if (lv >= 0) fills[mid] = C.levels[lv];
  }
  card(ctx, x, y, w, h);
  ctx.fillStyle = C.text;
  ctx.font = font(36, 700);
  ctx.fillText(title, x + 32, y + 58);
  const bx = x + (w - (bodyW * 2 + gap)) / 2;
  drawBody(ctx, 'front', fills, bx, y + 80, bodyH);
  drawBody(ctx, 'back', fills, bx + bodyW + gap, y + 80, bodyH);
  ctx.fillStyle = C.muted;
  ctx.font = font(24, 600);
  ctx.textAlign = 'center';
  ctx.fillText('FRONT', bx + bodyW / 2, y + 80 + bodyH + 34);
  ctx.fillText('BACK', bx + bodyW * 1.5 + gap, y + 80 + bodyH + 34);
  ctx.textAlign = 'left';

  const labels = ['0', ...SCALES[scale].labels.map((l) => (scale === 'day' ? l + ' sets' : l))];
  const colors = [C.base, ...C.levels];
  ctx.font = font(24, 400);
  const widths = labels.map((l) => ctx.measureText(l).width + 44);
  let lx = x + (w - widths.reduce((a, b) => a + b, 0)) / 2;
  const ly = y + 80 + bodyH + 90;
  labels.forEach((l, i) => {
    roundRect(ctx, lx, ly - 19, 24, 24, 5);
    ctx.fillStyle = colors[i];
    ctx.fill();
    ctx.fillStyle = C.muted;
    ctx.fillText(l, lx + 32, ly);
    lx += widths[i];
  });

  let ty = ly + 60;
  for (const [label, text] of wrapped) {
    ctx.font = font(24, 700);
    ctx.fillStyle = C.text;
    ctx.fillText(label, x + 32, ty);
    const lw = label ? ctx.measureText(label + ' ').width : 0;
    ctx.font = font(24, 400);
    ctx.fillText(text, x + 32 + lw, ty);
    ty += 34;
  }
  return h;
}

function newCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w * SCALE;
  canvas.height = h * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, w, h);
  return ctx;
}

const measureCtx = () => document.createElement('canvas').getContext('2d');
const daySets = (d) => d.items.reduce((s, it) => s + (Number(it.sets) || 0), 0);

// ---------------------------------------------------------------- day card (phone)
const DAY_W = 1080, PAD = 40;

function layoutDay(ctx, plan, lib, day, draw) {
  const d = plan.days[day];
  const headH = 250;
  if (draw) {
    ctx.fillStyle = C.head;
    ctx.fillRect(0, 0, DAY_W, headH);
    ctx.fillStyle = '#ffffff';
    ctx.font = font(92, 800);
    ctx.fillText(DAY_NAMES[day].toUpperCase(), PAD + 20, 128);
    ctx.fillStyle = C.accentSoft;
    ctx.font = font(42, 600);
    ctx.fillText(d.session || ' ', PAD + 20, 192);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#a8a29e';
    ctx.font = font(28, 400);
    ctx.fillText(plan.name, DAY_W - PAD - 20, 66);
    ctx.fillStyle = '#ffffff';
    ctx.font = font(32, 600);
    ctx.fillText(`${d.items.length} exercises · ${fmt(daySets(d))} sets`, DAY_W - PAD - 20, 192);
    ctx.textAlign = 'left';
  }
  let y = headH + 30;
  const cardW = DAY_W - PAD * 2;
  d.items.forEach((it, i) => {
    const h = drawItem(ctx, lib, it, i, PAD, y, cardW, DAY_SIZES, false);
    if (draw) {
      card(ctx, PAD, y, cardW, h);
      drawItem(ctx, lib, it, i, PAD, y, cardW, DAY_SIZES, true);
    }
    y += h + 18;
  });
  y += 22;
  const values = setsOf(computeVolume(plan.days, lib.findEx, [day]));
  y += drawBodyPanel(ctx, values, 'day', PAD, y, cardW, 'Muscles worked today', 760, draw) + 30;
  if (draw) footer(ctx, plan, DAY_W / 2, y + 10);
  return y + 40;
}

function footer(ctx, plan, cx, y) {
  ctx.fillStyle = C.muted;
  ctx.font = font(22, 400);
  ctx.textAlign = 'center';
  ctx.fillText(`FitView · ${plan.name} · ${new Date().toLocaleDateString()}`, cx, y);
  ctx.textAlign = 'left';
}

export function renderDayPng(plan, lib, day) {
  const height = Math.max(1920, Math.ceil(layoutDay(measureCtx(), plan, lib, day, false)));
  const ctx = newCanvas(DAY_W, height);
  layoutDay(ctx, plan, lib, day, true);
  return ctx.canvas.toDataURL('image/png');
}

// ---------------------------------------------------------------- week (one row of columns)
const COL_W = 380, COL_GAP = 20, BODY_COL_W = 820;
const WEEK_W = PAD * 2 + COL_W * 7 + COL_GAP * 7 + BODY_COL_W;

function layoutWeek(ctx, plan, lib, muscles, draw) {
  const headH = 170;
  const total = DAYS.reduce((s, d) => s + daySets(plan.days[d]), 0);
  const training = DAYS.filter((d) => plan.days[d].items.length).length;
  if (draw) {
    ctx.fillStyle = C.head;
    ctx.fillRect(0, 0, WEEK_W, headH);
    ctx.fillStyle = '#ffffff';
    ctx.font = font(72, 800);
    ctx.fillText(plan.name, PAD + 10, 108);
    ctx.textAlign = 'right';
    ctx.fillStyle = C.accentSoft;
    ctx.font = font(34, 700);
    ctx.fillText('WEEKLY PLAN', WEEK_W - PAD - 10, 78);
    ctx.fillStyle = '#ffffff';
    ctx.font = font(30, 400);
    ctx.fillText(`${training} training days · ${fmt(total)} sets`, WEEK_W - PAD - 10, 124);
    ctx.textAlign = 'left';
  }
  const top = headH + 30;

  // Day columns: measure all first so every column gets the same height.
  const colHead = 104;
  const heights = DAYS.map((day) => colHead + plan.days[day].items.reduce((s, it, i) =>
    s + drawItem(ctx, lib, it, i, 0, 0, COL_W, WEEK_SIZES, false), 0) + 16);

  // Body panel at the end of the row.
  const vol = computeVolume(plan.days, lib.findEx, DAYS);
  const values = setsOf(vol);
  const names = (list) => (list.length ? list.map((m) => m.name).join(', ') : 'none');
  const extra = [
    ['Not trained:', names(muscles.filter((m) => !values[m.id]))],
    ['Low (<6 sets):', names(muscles.filter((m) => values[m.id] && values[m.id] < 6))],
    ['High (>20 sets):', names(muscles.filter((m) => values[m.id] > 20))],
  ];
  const recovery = recoveryConflicts(plan.days, lib.findEx, muscles);
  extra.push(['Back-to-back days:', recovery.length ? '' : 'none']);
  for (const c of recovery) extra.push([`${c.from} → ${c.to}:`, c.muscles.map((m) => m.name).join(', ')]);
  const bodyX = PAD + (COL_W + COL_GAP) * 7;
  const bodyPanelH = drawBodyPanel(ctx, values, 'week', bodyX, top, BODY_COL_W, 'Weekly muscle coverage', 760, false, extra);
  const rowH = Math.max(...heights, bodyPanelH);

  if (draw) {
    DAYS.forEach((day, di) => {
      const d = plan.days[day];
      const x = PAD + di * (COL_W + COL_GAP);
      const rest = !d.items.length;
      card(ctx, x, top, COL_W, rowH, rest ? C.rest : C.card, rest);
      ctx.fillStyle = C.text;
      ctx.font = font(38, 800);
      ctx.fillText(DAY_NAMES[day], x + 20, top + 52);
      ctx.fillStyle = C.accent;
      ctx.font = font(22, 600);
      ctx.fillText(d.session || (rest ? 'Rest' : ''), x + 20, top + 86);
      if (!rest) {
        ctx.textAlign = 'right';
        ctx.fillStyle = C.muted;
        ctx.font = font(20, 400);
        ctx.fillText(`${fmt(daySets(d))} sets`, x + COL_W - 20, top + 52);
        ctx.textAlign = 'left';
      }
      let y = top + colHead;
      d.items.forEach((it, i) => {
        if (i) {
          ctx.strokeStyle = C.line;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x + 14, y);
          ctx.lineTo(x + COL_W - 14, y);
          ctx.stroke();
        }
        y += drawItem(ctx, lib, it, i, x, y, COL_W, WEEK_SIZES, true);
      });
    });
    drawBodyPanel(ctx, values, 'week', bodyX, top, BODY_COL_W, 'Weekly muscle coverage', 760, true, extra);
    footer(ctx, plan, WEEK_W / 2, top + rowH + 50);
  }
  return top + rowH + 80;
}

export function renderWeekPng(plan, lib, muscles) {
  const height = Math.ceil(layoutWeek(measureCtx(), plan, lib, muscles, false));
  const ctx = newCanvas(WEEK_W, height);
  layoutWeek(ctx, plan, lib, muscles, true);
  return ctx.canvas.toDataURL('image/png');
}

// ---------------------------------------------------------------- export entry points
// days: which days to export; empty days are skipped. File names sort Mon..Sun.
export function exportDayImages(plan, lib, days = DAYS) {
  return days
    .filter((d) => plan.days[d].items.length)
    .map((d) => ({ name: `${plan.name} - ${DAYS.indexOf(d) + 1} ${d}.png`, data: renderDayPng(plan, lib, d) }));
}

export function exportWeekImage(plan, lib, muscles) {
  return [{ name: `${plan.name} - Week.png`, data: renderWeekPng(plan, lib, muscles) }];
}
