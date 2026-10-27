// Gantt chart export to XLSX (a dated table with a week-by-week bar grid) and
// PDF (the chart redrawn on canvas, one A4 landscape page per screenful of
// rows). Everything runs in the browser on the projects Dashboard already
// holds; exceljs and jspdf are imported on demand so they stay out of the main
// bundle.
import type { Milestone, Project, Task } from "./types";
import type { StrKey } from "./i18n";
import { fmtDate, fmtMonthShort, parseDate, todayStr } from "./dates";
import { deliverableNames } from "./linked";

type T = (key: StrKey, params?: Record<string, string>) => string;

export type ExportOptions = {
  includeTasks: boolean;
  t: T;
  locale: string;
};

const DAY = 86_400_000;

// Light-theme values from app/globals.css. An export is a document, so it is
// drawn on white whatever theme the screen is in — keep these in step.
const SERIES = [
  "#db4536", "#099c57", "#f2a50a", "#434751",
  "#2a78d6", "#7d4fc0", "#e87ba4", "#0f9bab",
];
const INK = "#24272d";
const INK_2 = "#434751";
const MUTED = "#8a8d93";
const GRID = "#e4e3de";
const BASELINE = "#c6c5bd";
const CRITICAL = "#db4536";

// Finished projects go grey, as on the dashboard Gantt.
function projectColor(p: Project) {
  return p.status === "done" ? BASELINE : SERIES[((p.color_slot % 8) + 8) % 8];
}

/** `hex` laid over white at `alpha` — a flat tint, since cells have no opacity. */
function tint(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return (
    "#" +
    [n >> 16, (n >> 8) & 255, n & 255]
      .map((v) => Math.round(255 - (255 - v) * alpha))
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}

function ms(s: string) {
  return parseDate(s).getTime();
}

/** Bar extent of a task with at least one date; a one-ended task is one day. */
function taskSpan(task: Task): [number, number] {
  const s = ms((task.start_date ?? task.end_date)!);
  const e = ms((task.end_date ?? task.start_date)!);
  return [s, Math.max(e, s)];
}

/** How far a bar is drawn solid — the same rule the dashboard Gantt uses. */
function projectSolidUntil(p: Project, todayMs: number) {
  const s = ms(p.start_date);
  const e = ms(p.end_date);
  if (p.tentative === 1) return s;
  return p.status === "done" ? e + DAY : Math.min(Math.max(todayMs, s), e + DAY);
}

function taskSolidUntil(task: Task, todayMs: number) {
  const [s, e] = taskSpan(task);
  if (task.status === "done") return e + DAY;
  if (task.status === "in-progress") return Math.min(Math.max(todayMs, s), e + DAY);
  return s;
}

function taskOverdue(task: Task, today: string) {
  return task.status !== "done" && task.end_date !== null && task.end_date < today;
}

function milestoneOverdue(m: Milestone, today: string) {
  return !m.done && m.due_date < today;
}

/** Date range covering every bar and deliverable of the exported projects. */
function range(projects: Project[], includeTasks: boolean) {
  let min = Infinity;
  let max = -Infinity;
  const take = (t: number) => {
    min = Math.min(min, t);
    max = Math.max(max, t);
  };
  for (const p of projects) {
    take(ms(p.start_date));
    take(ms(p.end_date));
    for (const m of p.milestones) take(ms(m.due_date));
    if (includeTasks)
      for (const task of p.tasks) {
        if (task.start_date) take(ms(task.start_date));
        if (task.end_date) take(ms(task.end_date));
      }
  }
  return { min, max: max + DAY };
}

export function exportFileName(projects: Project[], ext: "xlsx" | "pdf") {
  const base = projects.length === 1 ? projects[0].name : "gantt";
  const safe = base.replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 60);
  return `${safe || "gantt"} ${todayStr()}.${ext}`;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // revoke on the next tick — some browsers start the download asynchronously
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ---------------------------------------------------------------- XLSX

const FIXED_COLS = 5; // name, start, end, status, person

function argb(hex: string) {
  return "FF" + hex.slice(1).toUpperCase();
}

function solid(hex: string) {
  return {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { argb: argb(hex) },
  };
}

/** A YYYY-MM-DD string as an Excel date. UTC, so no timezone shifts the day. */
function excelDate(s: string | null) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export async function buildXlsx(
  projects: Project[],
  { includeTasks, t, locale }: ExportOptions
): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const today = todayStr();
  const todayMs = ms(today);

  // one timeline column per Monday-starting week
  const { min, max } = range(projects, includeTasks);
  const weeks: number[] = [];
  const d = new Date(min);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
  while (d.getTime() < max) {
    weeks.push(d.getTime());
    d.setDate(d.getDate() + 7);
  }
  const weekEnd = (i: number) => weeks[i + 1] ?? weeks[i] + 7 * DAY;

  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const ws = wb.addWorksheet("Gantt", {
    views: [{ state: "frozen", xSplit: FIXED_COLS, ySplit: 2 }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  ws.columns = [
    { width: 44 },
    { width: 12 },
    { width: 12 },
    { width: 18 },
    { width: 24 },
    ...weeks.map(() => ({ width: 3.6 })),
  ];

  // header: fixed column titles span both rows; months over day-of-month
  const titles = [
    t("colName"),
    t("colStart"),
    t("colEnd"),
    t("fieldStatus"),
    t("colPerson"),
  ];
  const head1 = ws.getRow(1);
  const head2 = ws.getRow(2);
  titles.forEach((title, i) => {
    head1.getCell(i + 1).value = title;
    ws.mergeCells(1, i + 1, 2, i + 1);
  });
  let monthStart = 0;
  weeks.forEach((w, i) => {
    const col = FIXED_COLS + 1 + i;
    const date = new Date(w);
    head2.getCell(col).value = date.getDate();
    const next = weeks[i + 1];
    if (next === undefined || new Date(next).getMonth() !== date.getMonth()) {
      head1.getCell(FIXED_COLS + 1 + monthStart).value = fmtMonthShort(
        new Date(weeks[monthStart]),
        locale
      );
      if (i > monthStart)
        ws.mergeCells(1, FIXED_COLS + 1 + monthStart, 1, col);
      monthStart = i + 1;
    }
    if (w <= todayMs && todayMs < weekEnd(i)) {
      head2.getCell(col).fill = solid(CRITICAL);
      head2.getCell(col).font = { bold: true, color: { argb: argb("#ffffff") } };
    }
  });
  for (const row of [head1, head2]) {
    row.eachCell((cell) => {
      cell.font ??= { bold: true, color: { argb: argb(INK) } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = { bottom: { style: "thin", color: { argb: argb(BASELINE) } } };
    });
  }
  head1.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  head2.font = { size: 9, color: { argb: argb(MUTED) } };

  type Bar = { from: number; to: number; solidUntil: number; color: string };

  function addRow(opts: {
    name: string;
    indent: boolean;
    start: string | null;
    end: string | null;
    status: string;
    statusRed?: boolean;
    person: string | null;
    bar?: Bar;
    diamond?: { at: number; color: string };
    bold?: boolean;
    muted?: boolean;
    topRule?: boolean;
  }) {
    const row = ws.addRow([
      opts.name,
      excelDate(opts.start),
      excelDate(opts.end),
      opts.status,
      opts.person ?? "",
    ]);
    const color = argb(opts.muted ? MUTED : INK);
    for (let c = 1; c <= FIXED_COLS; c++)
      row.getCell(c).font = { bold: opts.bold, color: { argb: color } };
    row.getCell(1).alignment = { indent: opts.indent ? 2 : 0 };
    row.getCell(2).numFmt = "dd.mm.yyyy";
    row.getCell(3).numFmt = "dd.mm.yyyy";
    if (opts.statusRed)
      row.getCell(4).font = { bold: opts.bold, color: { argb: argb(CRITICAL) } };

    weeks.forEach((w, i) => {
      const cell = row.getCell(FIXED_COLS + 1 + i);
      const end = weekEnd(i);
      const bar = opts.bar;
      if (bar && w < bar.to && end > bar.from) {
        // a week counts as elapsed once at least half of it is — or once the
        // whole bar is, however little of this week the bar covers
        const elapsed =
          bar.solidUntil >= bar.to || w + (end - w) / 2 < bar.solidUntil;
        cell.fill = solid(elapsed ? bar.color : tint(bar.color, 0.32));
      }
      if (opts.diamond && w <= opts.diamond.at && opts.diamond.at < end) {
        cell.value = "◆";
        cell.font = { color: { argb: argb(opts.diamond.color) } };
        cell.alignment = { horizontal: "center" };
      }
    });
    if (opts.topRule)
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = { top: { style: "thin", color: { argb: argb(BASELINE) } } };
      });
  }

  for (const p of projects) {
    const color = projectColor(p);
    const finished = p.status === "done";
    addRow({
      name: p.name,
      indent: false,
      start: p.start_date,
      end: p.end_date,
      status:
        t(`status_${p.status}`) +
        (p.tentative === 1 ? ` · ${t("tentativeBadge")}` : ""),
      person: p.responsible,
      bar: {
        from: ms(p.start_date),
        to: ms(p.end_date) + DAY,
        solidUntil: projectSolidUntil(p, todayMs),
        color,
      },
      bold: true,
      muted: finished,
      topRule: true,
    });

    // A task and a deliverable of the same name are one commitment: with tasks
    // included, the task row carries it and gets the diamond at its end.
    const linked = includeTasks ? deliverableNames(p) : new Set<string>();
    if (includeTasks)
      for (const task of p.tasks) {
        const dated = task.start_date || task.end_date;
        const overdue = taskOverdue(task, today);
        const span = dated ? taskSpan(task) : null;
        const deliverable = p.milestones.find((m) => m.name === task.name);
        addRow({
          name: task.name,
          indent: true,
          start: task.start_date,
          end: task.end_date,
          status: overdue ? t("overdueWord") : t(`tstatus_${task.status}`),
          statusRed: overdue,
          person: task.assignee,
          bar: span
            ? {
                from: span[0],
                to: span[1] + DAY,
                solidUntil: taskSolidUntil(task, todayMs),
                color,
              }
            : undefined,
          diamond: deliverable
            ? {
                at: ms(deliverable.due_date),
                color: milestoneOverdue(deliverable, today) ? CRITICAL : color,
              }
            : undefined,
          muted: finished,
        });
      }

    const deliverables = p.milestones
      .filter((m) => !linked.has(m.name))
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
    for (const m of deliverables) {
      const overdue = milestoneOverdue(m, today);
      addRow({
        name: m.name,
        indent: true,
        start: null,
        end: m.due_date,
        status: m.done ? t("msDone") : overdue ? t("msOverdue") : t("msUpcoming"),
        statusRed: overdue,
        person: null,
        diamond: { at: ms(m.due_date), color: overdue ? CRITICAL : color },
        muted: finished,
      });
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ---------------------------------------------------------------- PDF

// Page geometry in CSS pixels: A4 landscape at 96 dpi, rendered at 2× for print.
const PAGE_W = 1123;
const PAGE_H = 794;
const SCALE = 2;
const MARGIN = 36;
const HEAD_H = 40; // title block
const AXIS_H = 28;
const GUTTER = 260;
const ROW_H = 34;
const BAR_H = 14;
const TASK_ROW_H = 22;
const TASK_BAR_H = 9;

type PdfRow =
  | { kind: "project"; p: Project; index: number; cont?: boolean }
  | { kind: "task"; p: Project; task: Task; index: number };

function rowHeight(r: PdfRow) {
  return r.kind === "project" ? ROW_H : TASK_ROW_H;
}

/** Greedy page fill that never leaves a project's name alone at a page foot. */
function paginate(rows: PdfRow[], avail: number): PdfRow[][] {
  const pages: PdfRow[][] = [];
  let page: PdfRow[] = [];
  let used = 0;
  rows.forEach((r, i) => {
    const next = rows[i + 1];
    const need =
      r.kind === "project" && next?.kind === "task"
        ? ROW_H + TASK_ROW_H
        : rowHeight(r);
    if (page.length > 0 && used + need > avail) {
      pages.push(page);
      page = [];
      used = 0;
      // tasks carried over to a new page get their project row repeated
      if (r.kind === "task") {
        page.push({ kind: "project", p: r.p, index: r.index, cont: true });
        used += ROW_H;
      }
    }
    page.push(r);
    used += rowHeight(r);
  });
  if (page.length) pages.push(page);
  return pages;
}

function fit(ctx: CanvasRenderingContext2D, s: string, maxW: number) {
  if (ctx.measureText(s).width <= maxW) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(s.slice(0, mid) + "…").width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return s.slice(0, lo) + "…";
}

export async function buildPdf(
  projects: Project[],
  { includeTasks, t, locale }: ExportOptions
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const today = todayStr();
  const todayMs = ms(today);

  // Draw with the page's own (Noto Sans + Noto Sans Georgian) web fonts, and
  // make sure the faces covering every string we draw have finished loading —
  // a canvas silently falls back to a system font otherwise.
  const family = getComputedStyle(document.body).fontFamily;
  const sample = [
    t("appTitle"),
    ...projects.flatMap((p) => [p.name, ...p.tasks.map((x) => x.name)]),
  ].join(" ");
  await Promise.all([
    document.fonts.load(`12px ${family}`, sample),
    document.fonts.load(`600 12px ${family}`, sample),
  ]);
  const font = (size: number, weight = 400) => `${weight} ${size}px ${family}`;

  const rows: PdfRow[] = [];
  projects.forEach((p, index) => {
    rows.push({ kind: "project", p, index });
    if (includeTasks)
      for (const task of p.tasks)
        if (task.start_date || task.end_date)
          rows.push({ kind: "task", p, task, index });
  });

  const axisTop = MARGIN + HEAD_H;
  const rowsTop = axisTop + AXIS_H;
  const pages = paginate(rows, PAGE_H - MARGIN - rowsTop);

  const { min, max } = range(projects, includeTasks);
  const pad = Math.max(3 * DAY, (max - min) * 0.02);
  const t0 = min - pad;
  const t1 = max + pad;
  const left = MARGIN + GUTTER;
  const right = PAGE_W - MARGIN;
  const x = (tm: number) => left + ((tm - t0) / (t1 - t0)) * (right - left);

  const months: number[] = [];
  {
    const d = new Date(t0);
    d.setHours(0, 0, 0, 0);
    d.setDate(1);
    if (d.getTime() < t0) d.setMonth(d.getMonth() + 1);
    while (d.getTime() <= t1) {
      months.push(d.getTime());
      d.setMonth(d.getMonth() + 1);
    }
  }
  const monthPx = months.length > 1 ? x(months[1]) - x(months[0]) : right - left;
  const monthStep = Math.max(1, Math.ceil(52 / monthPx));
  const weeks: number[] = [];
  if ((7 * DAY * (right - left)) / (t1 - t0) >= 6) {
    const d = new Date(t0);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7)); // next Monday
    while (d.getTime() <= t1) {
      weeks.push(d.getTime());
      d.setDate(d.getDate() + 7);
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = PAGE_W * SCALE;
  canvas.height = PAGE_H * SCALE;
  const ctx = canvas.getContext("2d")!;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setProperties({ title: t("exportTitle") });
  const pdfW = doc.internal.pageSize.getWidth();
  const pdfH = doc.internal.pageSize.getHeight();

  function line(x1: number, y1: number, x2: number, y2: number, color: string, w = 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function bar(
    from: number,
    to: number,
    yMid: number,
    h: number,
    color: string,
    solidUntil: number,
    tentative: boolean
  ) {
    const bx = x(from);
    const bw = Math.max(x(to) - bx, 3);
    ctx.globalAlpha = tentative ? 0.16 : 0.32;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(bx, yMid - h / 2, bw, h, 3);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (tentative) {
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (solidUntil > from) {
      ctx.beginPath();
      ctx.roundRect(bx, yMid - h / 2, Math.max(x(Math.min(solidUntil, to)) - bx, 2), h, 3);
      ctx.fill();
    }
  }

  function diamond(cx: number, cy: number, r: number, fill: string, stroke: string) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  const generated = t("exportGenerated", { date: fmtDate(today, locale) });

  pages.forEach((page, pageIndex) => {
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    ctx.textBaseline = "alphabetic";

    // title block
    ctx.fillStyle = INK;
    ctx.font = font(18, 600);
    ctx.textAlign = "left";
    ctx.fillText(t("appTitle"), MARGIN, MARGIN + 18);
    ctx.font = font(10);
    ctx.fillStyle = MUTED;
    ctx.textAlign = "right";
    ctx.fillText(
      `${generated} · ${t("exportPage", {
        n: String(pageIndex + 1),
        total: String(pages.length),
      })}`,
      right,
      MARGIN + 18
    );
    ctx.textAlign = "left";

    // rows: lay out first so grid lines can stop at the last one
    const placed: { r: PdfRow; y: number }[] = [];
    let y = rowsTop;
    for (const r of page) {
      placed.push({ r, y });
      y += rowHeight(r);
    }
    const bottom = y;

    // zebra bands per project, as on screen
    for (let i = 0; i < placed.length; ) {
      const { r, y: top } = placed[i];
      let j = i;
      let h = 0;
      while (j < placed.length && placed[j].r.p === r.p) h += rowHeight(placed[j++].r);
      if (r.index % 2 === 1) {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = GRID;
        ctx.fillRect(MARGIN, top, right - MARGIN, h);
        ctx.globalAlpha = 1;
      }
      if (i > 0) line(MARGIN, top, right, top, GRID);
      i = j;
    }

    // time grid
    for (const w of weeks) {
      ctx.globalAlpha = 0.6;
      line(x(w), axisTop + AXIS_H - 8, x(w), bottom, GRID);
      ctx.globalAlpha = 1;
    }
    ctx.font = font(10);
    ctx.fillStyle = MUTED;
    months.forEach((mt, i) => {
      line(x(mt), axisTop + 4, x(mt), bottom, BASELINE);
      if (i % monthStep === 0 && x(mt) + 40 < right)
        ctx.fillText(fmtMonthShort(new Date(mt), locale), x(mt) + 4, axisTop + 14);
    });
    line(left, axisTop + AXIS_H - 8, right, axisTop + AXIS_H - 8, BASELINE);
    line(left, axisTop + 4, left, bottom, BASELINE);

    for (const { r, y: top } of placed) {
      const p = r.p;
      const color = projectColor(p);
      const finished = p.status === "done";
      if (r.kind === "project") {
        const yMid = top + ROW_H / 2;
        ctx.font = font(12, 600);
        ctx.fillStyle = finished ? MUTED : INK;
        const suffix = r.cont ? ` (${t("exportContinued")})` : "";
        ctx.fillText(
          fit(ctx, p.name, GUTTER - 16 - ctx.measureText(suffix).width) + suffix,
          MARGIN + 6,
          yMid + 4
        );
        const start = ms(p.start_date);
        bar(
          start,
          ms(p.end_date) + DAY,
          yMid,
          BAR_H,
          color,
          projectSolidUntil(p, todayMs),
          p.tentative === 1
        );
        for (const m of p.milestones) {
          const at = ms(m.due_date) + DAY / 2;
          diamond(
            x(at),
            yMid,
            6,
            m.done ? color : "#ffffff",
            milestoneOverdue(m, today) ? CRITICAL : color
          );
        }
      } else {
        const task = r.task;
        const yMid = top + TASK_ROW_H / 2;
        ctx.font = font(10.5);
        ctx.fillStyle = finished ? MUTED : INK_2;
        ctx.fillText(fit(ctx, task.name, GUTTER - 30), MARGIN + 20, yMid + 3.5);
        const [s, e] = taskSpan(task);
        bar(s, e + DAY, yMid, TASK_BAR_H, color, taskSolidUntil(task, todayMs), false);
        if (taskOverdue(task, today)) {
          ctx.strokeStyle = CRITICAL;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(x(s), yMid - TASK_BAR_H / 2, Math.max(x(e + DAY) - x(s), 3), TASK_BAR_H, 3);
          ctx.stroke();
        }
      }
    }

    // today
    if (todayMs >= t0 && todayMs <= t1) {
      line(x(todayMs), axisTop + 4, x(todayMs), bottom, CRITICAL, 1.5);
      ctx.font = font(9, 600);
      ctx.fillStyle = CRITICAL;
      ctx.fillText(t("today"), x(todayMs) + 4, bottom + 11);
    }

    if (pageIndex > 0) doc.addPage();
    // "FAST" flate-compresses the pixels; without it jsPDF stores them raw and
    // a two-page export weighs ~20 MB
    doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, pdfW, pdfH, undefined, "FAST");
  });

  return doc.output("blob");
}
