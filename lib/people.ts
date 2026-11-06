import { query } from "./db";

// The staff directory, loaded into `people` from Emails.xlsx by
// `npm run people:import`. It lives in the database because the repository is
// public; addresses must stay server-side, so no API route returns them.
export interface Person {
  first_name: string;
  first_name_en: string;
  full_name: string;
  full_name_en: string;
  email: string;
}

// Assignees are free text, and the same person appears as both ნიკოლოზ and
// ნიკოლოზი: the Georgian nominative ending is dropped before comparing.
const nameKey = (name: string) =>
  name.trim().toLowerCase().replace(/ი$/, "");

export async function loadPeople(): Promise<Person[]> {
  return query<Person>(
    "SELECT first_name, first_name_en, full_name, full_name_en, email FROM people"
  );
}

/**
 * A lookup from any spelling of a name to its person. A key two people share
 * resolves to nobody, because a mail to the wrong colleague is worse than none.
 */
export function personFinder(people: Person[]) {
  const byKey = new Map<string, Person | null>();
  for (const person of people) {
    for (const name of [
      person.first_name,
      person.first_name_en,
      person.full_name,
      person.full_name_en,
    ]) {
      const key = nameKey(name);
      const clash = byKey.has(key) && byKey.get(key)?.email !== person.email;
      byKey.set(key, clash ? null : person);
    }
  }
  return (name: string) => byKey.get(nameKey(name)) ?? null;
}
