// Loads the staff directory from Emails.xlsx into the `people` table, making the
// database match the workbook: new rows are added, changed rows updated, and
// people no longer listed removed.
//
//   npm run people:import              # reads ./Emails.xlsx
//   npm run people:import -- other.xlsx
//
// The workbook holds real addresses and the repository is public, so it is
// gitignored and stays on this machine.
import ExcelJS from "exceljs";
import { neon } from "@neondatabase/serverless";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local — DATABASE_URL is expected to be in the environment already.
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (put it in .env.local)");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(process.argv[2] ?? "Emails.xlsx");
const sheet = workbook.worksheets[0];

// Hyperlinked cells come back as { text, hyperlink }.
const text = (cell) => String(cell.value?.text ?? cell.value ?? "").trim();

const people = [];
sheet.eachRow((row, number) => {
  if (number === 1) return; // header
  const [first_name, first_name_en, full_name, full_name_en, email] = [
    1, 2, 3, 4, 5,
  ].map((column) => text(row.getCell(column)));
  if (!first_name && !email) return;
  if (!first_name || !first_name_en || !full_name || !full_name_en) {
    throw new Error(`row ${number}: a name column is empty`);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`row ${number}: "${email}" is not an email address`);
  }
  people.push({
    first_name,
    first_name_en,
    full_name,
    full_name_en,
    email: email.toLowerCase(),
  });
});
if (people.length === 0) throw new Error("no people found in the workbook");

for (const p of people) {
  await sql.query(
    `INSERT INTO people (first_name, first_name_en, full_name, full_name_en, email)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE
       SET first_name = $1, first_name_en = $2, full_name = $3, full_name_en = $4`,
    [p.first_name, p.first_name_en, p.full_name, p.full_name_en, p.email]
  );
}
const removed = await sql.query(
  "DELETE FROM people WHERE NOT (email = ANY($1)) RETURNING email",
  [people.map((p) => p.email)]
);
console.log(`imported ${people.length} people, removed ${removed.length}`);
