// An assignee field may hold several comma-separated names ("ანა, გიო");
// each name counts as a separate assignee.
export function splitAssignees(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Canonical storage form: trimmed names joined with ", ".
export function normalizeAssignees(value: string): string {
  return splitAssignees(value).join(", ");
}
