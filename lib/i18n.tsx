"use client";

import { useCallback, useSyncExternalStore } from "react";

export type Lang = "ka" | "en";

const STRINGS = {
  appTitle: { ka: "პროექტების მართვა", en: "Project Management" },
  newProject: { ka: "+ ახალი პროექტი", en: "+ New project" },
  loading: { ka: "იტვირთება…", en: "Loading…" },

  statProjects: { ka: "პროექტები", en: "Projects" },
  statActive: { ka: "მიმდინარე", en: "Active" },
  statMilestones30: {
    ka: "ჩასაბარებელი დოკუმენტები უახლოეს 30 დღეში",
    en: "Deliverables in next 30 days",
  },
  statOverdue: { ka: "ვადაგადაცილებული", en: "Overdue items" },

  emptyState: {
    ka: "პროექტები ჯერ არ არის. დაამატეთ პირველი პროექტი, რომ გამოჩნდეს განრიგზე.",
    en: "No projects yet. Add your first project to see it on the timeline.",
  },
  hint: {
    ka: "დააწკაპუნეთ პროექტზე განრიგში, რომ მისი თასქები გამოჩნდეს განრიგზე და შეცვალოთ ჩასაბარებელი დოკუმენტები, თასქები და პასუხისმგებელი პირები.",
    en: "Click a project on the timeline to expand its tasks on the chart and edit its deliverables, tasks and responsible people.",
  },

  themeLabel: { ka: "თემა", en: "Theme" },
  themeLight: { ka: "ნათელი", en: "Light" },
  themeDark: { ka: "მუქი", en: "Dark" },

  dragReorder: {
    ka: "გადაათრიეთ პროექტის გადასაადგილებლად",
    en: "Drag to reorder project",
  },

  today: { ka: "დღეს", en: "TODAY" },
  tasksDoneSuffix: { ka: "თასქი შესრულებულია", en: "tasks done" },
  msDone: { ka: "✓ შესრულებულია", en: "✓ Done" },
  msOverdue: { ka: "⚠ ვადაგადაცილებული", en: "⚠ Overdue" },
  msUpcoming: { ka: "მოსალოდნელი", en: "Upcoming" },

  workloadTitle: { ka: "დატვირთვა პირების მიხედვით", en: "Workload by person" },
  workloadEmpty: { ka: "ღია თასქები არ არის.", en: "No open tasks." },
  workloadHint: {
    ka: "დააწკაპუნეთ სახელზე მისი ღია თასქების სანახავად.",
    en: "Click a name to see their open tasks.",
  },
  openTasks: { ka: "ღია თასქები", en: "Open tasks" },
  noDate: { ka: "თარიღის გარეშე", en: "No date" },
  unassigned: { ka: "შემსრულებლის გარეშე", en: "Unassigned" },
  overdueWord: { ka: "ვადაგადაცილებული", en: "Overdue" },

  deadlinesTitle: { ka: "უახლოესი ვადები", en: "Upcoming deadlines" },
  deadlinesEmpty: {
    ka: "უახლოეს 6 კვირაში ვადები არ არის.",
    en: "No deadlines in the next 6 weeks.",
  },
  typeMilestone: { ka: "ჩასაბარებელი დოკუმენტი", en: "Deliverable" },
  typeTask: { ka: "თასქი", en: "Task" },
  moreItems: { ka: "+{n} სხვა", en: "+{n} more" },

  healthTitle: { ka: "პროექტების პროგრესი", en: "Project health" },
  legendTasksDone: { ka: "შესრულებული თასქები", en: "Tasks done" },
  timeElapsed: { ka: "გასული დრო", en: "Time elapsed" },
  daysLeft: { ka: "დარჩენილია {n} დღე", en: "{n} days left" },
  daysOver: { ka: "ვადას გადაცდა {n} დღით", en: "{n} days past end" },
  behindBadge: { ka: "ჩამორჩება", en: "Behind" },

  calendarTitle: {
    ka: "ჩასაბარებელი დოკუმენტების კალენდარი",
    en: "Deliverables calendar",
  },
  prevMonth: { ka: "წინა თვე", en: "Previous month" },
  nextMonth: { ka: "შემდეგი თვე", en: "Next month" },
  breakdownTitle: { ka: "სტატუსების მიმოხილვა", en: "Status breakdown" },
  byAssignee: { ka: "შემსრულებლების მიხედვით", en: "By assignee" },
  byProject: { ka: "პროექტების მიხედვით", en: "By project" },

  status_planned: { ka: "დაგეგმილი", en: "Planned" },
  status_active: { ka: "მიმდინარე", en: "Active" },
  "status_on-hold": { ka: "შეჩერებული", en: "On hold" },
  status_done: { ka: "დასრულებული", en: "Done" },

  tstatus_todo: { ka: "გასაკეთებელი", en: "To do" },
  "tstatus_in-progress": { ka: "მიმდინარე", en: "In progress" },
  tstatus_done: { ka: "შესრულებული", en: "Done" },

  edit: { ka: "რედაქტირება", en: "Edit" },
  delete: { ka: "წაშლა", en: "Delete" },
  responsiblePrefix: { ka: "პასუხისმგებელი:", en: "Responsible:" },
  taskProgress: { ka: "თასქების პროგრესი", en: "Task progress" },
  doneWord: { ka: "შესრულებულია", en: "done" },
  milestones: { ka: "ჩასაბარებელი დოკუმენტები", en: "Deliverables" },
  tasks: { ka: "თასქები", en: "Tasks" },
  noMilestones: {
    ka: "ჩასაბარებელი დოკუმენტები ჯერ არ არის.",
    en: "No deliverables yet.",
  },
  noTasks: { ka: "თასქები ჯერ არ არის.", en: "No tasks yet." },
  newMilestone: {
    ka: "ახალი ჩასაბარებელი დოკუმენტი",
    en: "New deliverable",
  },
  newTask: { ka: "ახალი თასქი", en: "New task" },
  assignee: { ka: "შემსრულებელი", en: "Assignee" },
  add: { ka: "დამატება", en: "Add" },
  taskStart: { ka: "თასქის დაწყება", en: "Task start date" },
  taskEnd: { ka: "თასქის დასრულება", en: "Task end date" },
  confirmDelete: {
    ka: "წავშალო პროექტი „{name}“ ყველა ჩასაბარებელი დოკუმენტითა და თასქით?",
    en: 'Delete project "{name}" and all its deliverables and tasks?',
  },
  showOptions: { ka: "სიის ჩვენება", en: "Show options" },
  markDone: { ka: "მონიშნე შესრულებულად:", en: "Mark done:" },
  deleteMilestone: {
    ka: "ჩასაბარებელი დოკუმენტის წაშლა:",
    en: "Delete deliverable:",
  },
  deleteTask: { ka: "თასქის წაშლა:", en: "Delete task:" },
  statusOf: { ka: "სტატუსი:", en: "Status of:" },

  formTitleEditTask: { ka: "თასქის რედაქტირება", en: "Edit task" },
  fieldTaskName: { ka: "თასქის სახელი", en: "Task name" },
  errTaskRequired: {
    ka: "თასქის სახელი სავალდებულოა.",
    en: "Task name is required.",
  },

  selectTask: { ka: "მონიშნეთ თასქი:", en: "Select task:" },
  selectAllTasks: { ka: "ყველას მონიშვნა", en: "Select all" },
  nSelected: { ka: "მონიშნულია {n}", en: "{n} selected" },
  bulkEdit: { ka: "მონიშნულების რედაქტირება", en: "Edit selected" },
  clearSelection: { ka: "მონიშვნის მოხსნა", en: "Clear selection" },
  formTitleBulkEdit: {
    ka: "მონიშნული თასქების რედაქტირება",
    en: "Edit selected tasks",
  },
  bulkHint: {
    ka: "მონიშნეთ ველები, რომელთა შეცვლაც გსურთ ყველა არჩეულ თასქზე. მონიშნული, მაგრამ ცარიელი ველი წაშლის არსებულ მნიშვნელობას.",
    en: "Tick the fields you want to change on every selected task. A ticked but empty field clears that value.",
  },
  bulkApply: { ka: "გამოყენება {n} თასქზე", en: "Apply to {n} tasks" },
  errBulkNoField: {
    ka: "მონიშნეთ სულ მცირე ერთი ველი.",
    en: "Tick at least one field to change.",
  },
  warnInverted: {
    ka: "{n} თასქს დასრულების თარიღი დაწყებაზე ადრე დარჩება.",
    en: "{n} task(s) would end up with an end date before their start date.",
  },

  formTitleNew: { ka: "ახალი პროექტი", en: "New project" },
  formTitleEdit: { ka: "პროექტის რედაქტირება", en: "Edit project" },
  fieldName: { ka: "პროექტის სახელი", en: "Project name" },
  fieldDescription: {
    ka: "აღწერა (არასავალდებულო)",
    en: "Description (optional)",
  },
  fieldStart: { ka: "დაწყების თარიღი", en: "Start date" },
  fieldEnd: { ka: "დასრულების თარიღი", en: "End date" },
  fieldStatus: { ka: "სტატუსი", en: "Status" },
  fieldResponsible: { ka: "პასუხისმგებელი პირი", en: "Responsible person" },
  fieldTentative: {
    ka: "დაწყების თარიღი დაუდასტურებელია",
    en: "Start date not yet confirmed",
  },
  fieldTentativeHint: {
    ka: "მონიშნეთ, თუ თარიღი სავარაუდოა (მაგ. ხელშეკრულების ხელმოწერას ელოდება). ხანგრძლივობა შენარჩუნდება — დადასტურებისას უბრალოდ გადაწიეთ ორივე თარიღი.",
    en: "Tick if the date is provisional (e.g. awaiting contract signature). Duration is kept — once confirmed, just shift both dates.",
  },
  tentativeBadge: { ka: "თარიღი დაუდასტურებელია", en: "Start TBD" },
  cancel: { ka: "გაუქმება", en: "Cancel" },
  saveChanges: { ka: "შენახვა", en: "Save changes" },
  createProject: { ka: "პროექტის შექმნა", en: "Create project" },
  saving: { ka: "ინახება…", en: "Saving…" },
  errRequired: {
    ka: "სახელი, დაწყების და დასრულების თარიღები სავალდებულოა.",
    en: "Name, start date and end date are required.",
  },
  errDates: {
    ka: "დასრულების თარიღი უნდა იყოს დაწყების თარიღის შემდეგ ან იმავე დღეს.",
    en: "End date must be on or after the start date.",
  },
  errSave: {
    ka: "შენახვისას მოხდა შეცდომა.",
    en: "Something went wrong saving the project.",
  },
} as const;

export type StrKey = keyof typeof STRINGS;

const LANG_KEY = "lang";
const LANG_EVENT = "lang-change";

function subscribe(callback: () => void) {
  window.addEventListener(LANG_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(LANG_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): Lang {
  const saved = localStorage.getItem(LANG_KEY);
  return saved === "en" ? "en" : "ka";
}

export function useLang() {
  const lang = useSyncExternalStore(subscribe, getSnapshot, () => "ka" as Lang);
  const setLang = useCallback((l: Lang) => {
    localStorage.setItem(LANG_KEY, l);
    document.documentElement.lang = l;
    window.dispatchEvent(new Event(LANG_EVENT));
  }, []);
  const t = useCallback(
    (key: StrKey, params?: Record<string, string>) => {
      let s: string = STRINGS[key][lang];
      for (const [k, v] of Object.entries(params ?? {})) {
        s = s.replace(`{${k}}`, v);
      }
      return s;
    },
    [lang]
  );
  const locale = lang === "ka" ? "ka-GE" : "en-GB";
  return { lang, setLang, t, locale };
}
