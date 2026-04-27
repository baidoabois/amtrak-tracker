import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT, 10),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export async function sendEmail({ to, subject, html }) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html,
  });
}

export function buildDelayEmail(train, user) {
  const delayText = train.delayMinutes > 0
    ? `approximately <strong>${train.delayMinutes} minutes late</strong>`
    : 'delayed (exact time unknown)';

  return {
    subject: `Amtrak Train ${train.number} (${train.route}) is delayed`,
    html: `
      <h2>Train Delay Alert</h2>
      <p>Hi ${user.name},</p>
      <p>
        <strong>Train ${train.number} — ${train.route}</strong> is currently ${delayText}.
      </p>
      ${train.statusMsg ? `<p><em>${train.statusMsg}</em></p>` : ''}
      <p>Current state: ${train.state}</p>
      <p>This is an automated notification from your Amtrak Tracker.</p>
    `,
  };
}

export function buildCancellationEmail(train, user) {
  return {
    subject: `Amtrak Train ${train.number} (${train.route}) — Service Disruption`,
    html: `
      <h2>Service Disruption Alert</h2>
      <p>Hi ${user.name},</p>
      <p>
        <strong>Train ${train.number} — ${train.route}</strong> has a service disruption.
      </p>
      ${train.statusMsg ? `<p><strong>Status:</strong> ${train.statusMsg}</p>` : ''}
      <p>This is an automated notification from your Amtrak Tracker.</p>
    `,
  };
}
