import { query } from "./db";
import { splitAssignees } from "./assignees";
import { fmtDate } from "./dates";
import { mailEnabled, mailTestAddress, sendMail } from "./mail";
import { loadPeople, personFinder, type Person } from "./people";
import { isWorkingDay, tbilisiToday, workingDaysUntil } from "./workdays";

export const REMINDER_WORKING_DAYS = 3;

// `notifications` records what has gone out, one row per person and item. What
// is owed is always worked out by comparing the current state with it, never from
// individual edits, so a bulk edit, a contract import, an undo and a retry after a
// failed send all follow one rule: nobody is told the same thing twice. A
// reminder's row includes the deadline, so moving a deadline earns a new reminder.
//
// Assignments wait for a PM: they mail only from sendAssignments, which the
// dashboard's outbox calls, so trying things out on the dashboard reaches nobody,
// and an assignment that is changed back simply stops being owed. Deadline
// reminders go out by themselves from the daily run.
//
// Changed dates wait for the PM too. An assignment's row keeps the dates that
// person was last told, so a change is owed while the task's dates differ from
// them, and moving a date back before anything is sent just leaves the list.
//
// A person gets one mail per project, however many things it says. Assignments
// and date changes wait for the PM, so a daily mail only ever holds reminders, but pressing
// Send takes along any reminder owed on that person's project, which then isn't
// sent again.
type Kind = "assigned" | "deadline" | "changed";

interface Notice {
  kind: Kind;
  item: string; // "t12"
  name: string; // the person as written on the task
  due: string; // the deadline a reminder is about, "" on an assignment
  project_id: number;
  project: string;
  title: string;
  dates: string; // the task's dates now, see datesKey
  was?: string; // on a date change, the dates the person was last told
  start: string | null;
  deadline: string | null;
  note: string | null;
  muted: boolean; // recorded as sent without mailing anyone
}

export interface NotificationReport {
  sent: { to: string; items: string[] }[];
  failed: { to: string; error: string }[];
  unknownPeople: string[]; // named on open work, not in the directory
}

interface TaskRow {
  id: number;
  name: string;
  start_date: string | null;
  end_date: string | null;
  note: string | null;
  assignee: string | null;
  project_id: number;
  project: string;
  project_status: string;
  tentative: number;
}

const openTasks = () =>
  query<TaskRow>(
    `SELECT t.id, t.name, t.start_date, t.end_date, t.note, t.assignee, p.id AS project_id,
            p.name AS project, p.status AS project_status, p.tentative
       FROM tasks t JOIN projects p ON p.id = t.project_id
      WHERE t.status <> 'done' AND p.status <> 'done'`
  );

const noticeKey = (n: Pick<Notice, "kind" | "item" | "name" | "due">) =>
  `${n.kind}|${n.item}|${n.name}|${n.due}`;

interface SentRow {
  kind: Kind;
  item: string;
  person: string;
  due_date: string;
  dates: string | null;
}

const sentRows = () =>
  query<SentRow>("SELECT kind, item, person, due_date, dates FROM notifications");

const sentKeys = (rows: SentRow[]) =>
  new Set(
    rows.map((r) =>
      noticeKey({ kind: r.kind, item: r.item, name: r.person, due: r.due_date })
    )
  );

const datesKey = (start: string | null, end: string | null) =>
  `${start ?? ""}|${end ?? ""}`;

function parseDatesKey(dates: string) {
  const [start, end] = dates.split("|");
  return { start: start || null, end: end || null };
}

function assignmentNotices(tasks: TaskRow[]): Notice[] {
  return tasks.flatMap((task) =>
    splitAssignees(task.assignee).map((name) => ({
      kind: "assigned" as const,
      item: `t${task.id}`,
      name,
      due: "",
      project_id: task.project_id,
      project: task.project,
      title: task.name,
      dates: datesKey(task.start_date, task.end_date),
      start: task.start_date,
      deadline: task.end_date,
      note: task.note,
      muted: !!task.tentative,
    }))
  );
}

// Only someone already told about a task can be told it moved. A pending
// assignment carries the new dates anyway.
function dateChangeNotices(tasks: TaskRow[], rows: SentRow[]): Notice[] {
  const told = new Map(
    rows
      .filter((r) => r.kind === "assigned" && r.dates !== null)
      .map((r) => [`${r.item}|${r.person}`, r.dates as string])
  );
  return assignmentNotices(tasks).flatMap((notice) => {
    const was = told.get(`${notice.item}|${notice.name}`);
    if (was === undefined || was === notice.dates) return [];
    return [{ ...notice, kind: "changed" as const, was }];
  });
}

/** What waits for a PM. A person never has both for one task. */
function pendingNotices(tasks: TaskRow[], rows: SentRow[]) {
  const sent = sentKeys(rows);
  const assigned = assignmentNotices(tasks).filter(
    (n) => !sent.has(noticeKey(n))
  );
  return [...assigned, ...dateChangeNotices(tasks, rows)].filter((n) => !n.muted);
}

/** Whether a deadline is inside the reminder window. Overdue work is not. */
function dueSoon(date: string, today: string) {
  const left = workingDaysUntil(today, date);
  return left >= 0 && left <= REMINDER_WORKING_DAYS;
}

// Only tasks are reminded about, and only to their assignees. A deliverable is
// covered by the task it is linked to; one with no task mails nobody.
function deadlineNotices(tasks: TaskRow[], today: string): Notice[] {
  const out: Notice[] = [];
  for (const task of tasks) {
    if (task.project_status === "on-hold") continue;
    if (!task.end_date || !dueSoon(task.end_date, today)) continue;
    for (const name of splitAssignees(task.assignee)) {
      out.push({
        kind: "deadline",
        item: `t${task.id}`,
        name,
        due: task.end_date,
        project_id: task.project_id,
        project: task.project,
        title: task.name,
        dates: datesKey(task.start_date, task.end_date),
        start: task.start_date,
        deadline: task.end_date,
        note: task.note,
        muted: !!task.tentative,
      });
    }
  }
  return out;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

function dashboardUrl(): string | null {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return process.env.APP_URL || (host ? `https://${host}` : null);
}

function deadlineText(notice: Notice, today: string) {
  if (!notice.deadline) return "ვადის გარეშე / no deadline";
  const date = fmtDate(notice.deadline, "ka-GE");
  if (!dueSoon(notice.deadline, today)) return date;
  const left = workingDaysUntil(today, notice.deadline);
  return left === 0
    ? `${date} (დღეს / today)`
    : `${date} (${left} სამუშაო დღე / ${left} working day${left === 1 ? "" : "s"})`;
}

function rangeText(start: string | null, end: string | null) {
  const last = end ? fmtDate(end, "ka-GE") : "ვადის გარეშე / no deadline";
  return start ? `${fmtDate(start, "ka-GE")} – ${last}` : last;
}

const countLabel = (list: Notice[], one: string, many: string) =>
  list.length === 0
    ? null
    : list.length === 1
      ? one
      : `${many} (${list.length})`;

/** One project's news for one person. All `items` share that project. */
function renderMail(person: Person, items: Notice[], today: string) {
  const project = items[0].project;
  const assigned = items.filter((n) => n.kind === "assigned");
  const changed = items.filter((n) => n.kind === "changed");
  // A task that is new or moved and also due soon is listed once, with its countdown.
  const covered = new Set([...assigned, ...changed].map((n) => n.item));
  const reminders = items.filter(
    (n) => n.kind === "deadline" && !covered.has(n.item)
  );

  const summary = [
    countLabel(assigned, "ახალი დავალება", "ახალი დავალებები"),
    countLabel(changed, "შეცვლილი თარიღი", "შეცვლილი თარიღები"),
    countLabel(reminders, "მოახლოებული ვადა", "მოახლოებული ვადები"),
  ]
    .filter(Boolean)
    .join(", ");
  const listed = [...assigned, ...changed, ...reminders];
  const subject =
    listed.length === 1
      ? `${project}: ${summary}: ${listed[0].title}`
      : `${project}: ${summary}`;

  const cell =
    'style="padding:8px 12px;border-bottom:1px solid #e5e5e5;vertical-align:top"';
  const section = (intro: string, list: Notice[]) => {
    if (list.length === 0) return "";
    const rows = list
      .map((n) => {
        const note = n.note
          ? `<br><span style="color:#666">${escapeHtml(n.note)}</span>`
          : "";
        const told = n.was ? parseDatesKey(n.was) : null;
        const was = told
          ? `<br><span style="color:#666">იყო / was: ${escapeHtml(rangeText(told.start, told.end))}</span>`
          : "";
        const when = deadlineText(n, today);
        const now = told && n.start ? `${fmtDate(n.start, "ka-GE")} – ${when}` : when;
        return `<tr>
        <td ${cell}><strong>${escapeHtml(n.title)}</strong>${note}</td>
        <td ${cell}>${escapeHtml(now)}${was}</td>
      </tr>`;
      })
      .join("");
    return `<p>${escapeHtml(intro)}</p>
    <table style="border-collapse:collapse;width:100%;max-width:640px">${rows}</table>`;
  };
  const url = dashboardUrl();
  const link = url
    ? `<p><a href="${escapeHtml(url)}" style="color:#db4536">გახსენი დაფა / Open the dashboard</a></p>`
    : "";
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">
    <p>${escapeHtml(person.first_name)},</p>
    <p><strong>${escapeHtml(project)}</strong></p>
    ${section("თქვენ დაგენიშნათ დავალება. / You have been assigned the following.", assigned)}
    ${section("დავალების თარიღები შეიცვალა. / The dates of these tasks have changed.", changed)}
    ${section(`ვადა იწურება ${REMINDER_WORKING_DAYS} სამუშაო დღის განმავლობაში. / Due within ${REMINDER_WORKING_DAYS} working days.`, reminders)}
    ${link}
  </div>`;
  return { subject, html };
}

// Moves the dates on the person's assignment row. The match on the old dates is
// what stops two overlapping sends both claiming the change.
const moveToldDates = (n: Notice, from: string, to: string) =>
  query(
    `UPDATE notifications SET dates = $1
      WHERE kind = 'assigned' AND item = $2 AND person = $3 AND dates = $4
      RETURNING id`,
    [to, n.item, n.name, from]
  );

async function claim(n: Notice): Promise<boolean> {
  if (n.kind === "changed") {
    return (await moveToldDates(n, n.was as string, n.dates)).length > 0;
  }
  const rows = await query(
    `INSERT INTO notifications (kind, item, person, due_date, dates)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING RETURNING id`,
    [n.kind, n.item, n.name, n.due, n.dates]
  );
  return rows.length > 0;
}

// A failed mail gives its items back, so the next run tries them again.
const release = (n: Notice) =>
  n.kind === "changed"
    ? moveToldDates(n, n.dates, n.was as string)
    : query(
        `DELETE FROM notifications
          WHERE kind = $1 AND item = $2 AND person = $3 AND due_date = $4`,
        [n.kind, n.item, n.name, n.due]
      );

/**
 * Sends one mail per person and project, recording each item before its mail
 * goes out. `alongside` joins a mail that is already going and never starts one.
 */
async function deliver(
  notices: Notice[],
  report: NotificationReport,
  today: string,
  dryRun: boolean,
  alongside: Notice[] = []
) {
  const sent = sentKeys(await sentRows());
  const find = personFinder(await loadPeople());
  const mails = new Map<string, { person: Person; items: Notice[] }>();
  const mailKey = (person: Person, notice: Notice) =>
    `${person.email}|${notice.project_id}`;
  // Test mail leaves no record, so the real recipients still get theirs later.
  const record = !dryRun && !mailTestAddress();
  for (const notice of notices) {
    // A tentative project's dates are unconfirmed, so it mails nobody. Its items
    // are recorded instead, or confirming the project would send them all at once.
    if (notice.muted) {
      if (record && !sent.has(noticeKey(notice))) await claim(notice);
      continue;
    }
    const person = find(notice.name);
    if (!person) {
      if (!report.unknownPeople.includes(notice.name)) {
        report.unknownPeople.push(notice.name);
      }
      continue;
    }
    if (sent.has(noticeKey(notice))) continue;
    const key = mailKey(person, notice);
    const mail = mails.get(key) ?? { person, items: [] };
    mail.items.push(notice);
    mails.set(key, mail);
  }
  for (const notice of alongside) {
    const person = find(notice.name);
    const mail = person && mails.get(mailKey(person, notice));
    if (mail && !sent.has(noticeKey(notice))) mail.items.push(notice);
  }

  for (const { person, items } of mails.values()) {
    // Claiming first means two overlapping runs cannot both mail the same item.
    const claimed: Notice[] = [];
    for (const notice of items) {
      if (!record || (await claim(notice))) claimed.push(notice);
    }
    if (claimed.length === 0) continue;
    if (!dryRun) {
      try {
        const { subject, html } = renderMail(person, claimed, today);
        await sendMail(person.email, subject, html);
      } catch (error) {
        if (record) await Promise.all(claimed.map(release));
        report.failed.push({ to: person.email, error: String(error) });
        continue;
      }
    }
    report.sent.push({
      to: person.email,
      items: claimed.map((n) => `${n.kind}: ${n.project} / ${n.title}`),
    });
  }
}

const emptyReport = (): NotificationReport => ({
  sent: [],
  failed: [],
  unknownPeople: [],
});

export interface PendingAssignment {
  task_id: number;
  name: string; // the assignee as written on the task
  project_id: number;
  project: string;
  title: string;
  start: string | null;
  deadline: string | null;
  was: { start: string | null; end: string | null } | null; // set on a date change
}

/** Assignment emails waiting for a PM. The dashboard reads this: no addresses. */
export async function pendingAssignments(): Promise<PendingAssignment[]> {
  const [tasks, rows, people] = await Promise.all([
    openTasks(),
    sentRows(),
    loadPeople(),
  ]);
  const find = personFinder(people);
  const items: PendingAssignment[] = [];
  for (const notice of pendingNotices(tasks, rows)) {
    if (!find(notice.name)) continue;
    items.push({
      task_id: Number(notice.item.slice(1)),
      name: notice.name,
      project_id: notice.project_id,
      project: notice.project,
      title: notice.title,
      start: notice.start,
      deadline: notice.deadline,
      was: notice.was ? parseDatesKey(notice.was) : null,
    });
  }
  return items;
}

type Selection = Pick<PendingAssignment, "task_id" | "name">[];

/** The picked emails that are still owed, whatever a stale tab asked for. */
async function selectedNotices(selection: Selection, tasks: TaskRow[]) {
  const wanted = new Set(selection.map((s) => `t${s.task_id}|${s.name}`));
  return pendingNotices(tasks, await sentRows()).filter((n) =>
    wanted.has(`${n.item}|${n.name}`)
  );
}

export async function sendAssignments(
  selection: Selection
): Promise<NotificationReport> {
  const report = emptyReport();
  if (!mailEnabled()) return report;
  const tasks = await openTasks();
  const today = tbilisiToday();
  const reminders = deadlineNotices(tasks, today).filter((n) => !n.muted);
  const notices = await selectedNotices(selection, tasks);
  await deliver(notices, report, today, false, reminders);
  return report;
}

/** Records the picked emails as handled, without mailing anyone. */
export async function dismissAssignments(selection: Selection) {
  const notices = await selectedNotices(selection, await openTasks());
  await Promise.all(notices.map(claim));
  return notices.length;
}

/** The daily run: deadline reminders, and quietly recording tentative work. */
export async function runDailyNotifications(
  dryRun = false,
  today = tbilisiToday()
): Promise<NotificationReport> {
  const report = emptyReport();
  if (!dryRun && !mailEnabled()) return report;
  const [tasks, rows] = await Promise.all([openTasks(), sentRows()]);
  const notices = [
    ...assignmentNotices(tasks),
    ...dateChangeNotices(tasks, rows),
  ].filter((n) => n.muted);
  if (isWorkingDay(today)) notices.push(...deadlineNotices(tasks, today));
  await deliver(notices, report, today, dryRun);
  return report;
}
