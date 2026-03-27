import nodemailer from "nodemailer";

const toString = (value = "") => String(value || "").trim();

const smtpConfig = () => ({
  host: toString(process.env.SMTP_HOST),
  port: Number(process.env.SMTP_PORT || 0),
  secure: String(process.env.SMTP_SECURE || "false").trim().toLowerCase() === "true",
  user: toString(process.env.SMTP_USER),
  pass: toString(process.env.SMTP_PASS),
  from: toString(process.env.EMAIL_FROM),
});

export const isMailerConfigured = () => {
  const config = smtpConfig();
  return Boolean(config.host && config.port > 0 && config.user && config.pass && config.from);
};

let transporter = null;
let cachedKey = "";

const configKey = (config) =>
  `${config.host}:${config.port}:${config.secure ? "secure" : "starttls"}:${config.user}:${config.from}`;

const getTransporter = () => {
  const config = smtpConfig();
  const key = configKey(config);
  if (!transporter || key !== cachedKey) {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });
    cachedKey = key;
  }
  return transporter;
};

export const sendEmail = async ({
  to = "",
  subject = "",
  text = "",
  html = "",
} = {}) => {
  const recipient = toString(to);
  if (!recipient) {
    return {
      sent: false,
      error: "Recipient email is required.",
    };
  }

  if (!isMailerConfigured()) {
    return {
      sent: false,
      error: "SMTP mailer is not configured.",
    };
  }

  const config = smtpConfig();

  try {
    const tx = await getTransporter().sendMail({
      from: config.from,
      to: recipient,
      subject: String(subject || "").trim() || "Trading Journal Notification",
      text: String(text || "").trim(),
      html: String(html || "").trim() || undefined,
    });

    return {
      sent: true,
      messageId: tx.messageId || "",
    };
  } catch (error) {
    return {
      sent: false,
      error: error.message || "SMTP delivery failed.",
    };
  }
};
