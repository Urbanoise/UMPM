import nodemailer from "nodemailer";

// Mail goes out through a Google Workspace mailbox, so it needs SMTP_USER and an
// app password in SMTP_PASS. Without them nothing is sent, which is what keeps
// local development quiet even though it shares the production database.
export function mailEnabled(): boolean {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

/** While set, every message goes to this one address instead of its recipient. */
export function mailTestAddress(): string | null {
  return process.env.MAIL_TEST_TO?.trim() || null;
}

export async function sendMail(to: string, subject: string, html: string) {
  const port = Number(process.env.SMTP_PORT) || 465;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const testAddress = mailTestAddress();
  await transport.sendMail({
    from: `"STS Timelines" <${process.env.MAIL_FROM || process.env.SMTP_USER}>`,
    to: testAddress ?? to,
    subject: testAddress ? `[TEST → ${to}] ${subject}` : subject,
    html,
  });
}
