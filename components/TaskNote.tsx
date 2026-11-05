// A task's note under its name. Clamped so one long note can't stretch a card or
// row; the whole text is on hover and in the edit form.
export default function TaskNote({ note }: { note: string | null }) {
  if (!note) return null;
  return (
    <span
      title={note}
      className="mt-0.5 line-clamp-2 text-[15px] break-words whitespace-pre-wrap text-ink-2"
    >
      {note}
    </span>
  );
}
