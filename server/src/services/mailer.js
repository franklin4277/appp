import nodemailer from "nodemailer";

const toString = (value = "") => String(value || "").trim();
const toBool = (value, fallback = false) => {
  const normalized = toString(value).toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
};

const smtpConfig = () => ({
  url: toString(process.env.SMTP_URL),
  host: toString(process.env.SMTP_HOST),
  port: Number(process.env.SMTP_PORT || 0),
  secure: toBool(process.env.SMTP_SECURE, false),
  user: toString(process.env.SMTP_USER),
  pass: toString(process.env.SMTP_PASS),
  from: toString(process.env.EMAIL_FROM),
  requireTls: toBool(process.env.SMTP_REQUIRE_TLS, false),
  rejectUnauthorized: toBool(process.env.SMTP_TLS_REJECT_UNAUTHORIZED, true),
  serverName: toString(process.env.SMTP_TLS_SERVERNAME),
});

export const isMailerConfigured = () => {
  const config = smtpConfig();
  const hasTransport = Boolean(config.url || (config.host && config.port > 0));
  return Boolean(hasTransport && config.from);
};

export const getMailerDiagnostics = () => {
  const config = smtpConfig();
  const hasTransport = Boolean(config.url || (config.host && config.port > 0));

  return {
    configured: isMailerConfigured(),
    hasTransport,
    hasFrom: Boolean(config.from),
    mode: config.url ? "url" : "host",
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTls: config.requireTls,
    tlsRejectUnauthorized: config.rejectUnauthorized,
    tlsServerName: config.serverName,
    authUser: config.user,
    from: config.from,
  };
};

let transporter = null;
let cachedKey = "";
let verified = false;

const configKey = (config) =>
  [
    config.url,
    config.host,
    config.port,
    config.secure ? "secure" : "starttls",
    config.user,
    config.from,
    config.requireTls ? "require-tls" : "optional-tls",
    config.rejectUnauthorized ? "strict-tls" : "relaxed-tls",
    config.serverName,
  ].join("|");

const createTransporter = (config) => {
  if (config.url) {
    return nodemailer.createTransport(config.url, {
      connectionTimeout: 15_000,
      greetingTimeout: 12_000,
      socketTimeout: 20_000,
      requireTLS: config.requireTls,
      tls: {
        rejectUnauthorized: config.rejectUnauthorized,
        servername: config.serverName || undefined,
      },
    });
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 12_000,
    socketTimeout: 20_000,
    requireTLS: config.requireTls,
    tls: {
      rejectUnauthorized: config.rejectUnauthorized,
      servername: config.serverName || undefined,
    },
  });
};

const getTransporter = () => {
  const config = smtpConfig();
  const key = configKey(config);
  if (!transporter || key !== cachedKey) {
    transporter = createTransporter(config);
    cachedKey = key;
    verified = false;
  }
  return transporter;
};

const classifyError = (error) => {
  const code = toString(error?.code || error?.responseCode || "UNKNOWN");
  const message = toString(error?.message || "SMTP delivery failed.");
  const map = {
    EAUTH: "SMTP auth failed. Check SMTP_USER/SMTP_PASS and app-password settings.",
    ETIMEDOUT: "SMTP timeout. Check SMTP_HOST/PORT and firewall/network access.",
    ESOCKET: "SMTP socket error. Confirm host/port/security mode (465 secure, 587 starttls).",
    ENOTFOUND: "SMTP host not found. Verify SMTP_HOST value.",
    ECONNECTION: "SMTP connection failed. Verify host/port and TLS mode.",
    EENVELOPE: "Sender/recipient address rejected. Check EMAIL_FROM and target email.",
    535: "SMTP login rejected. Use valid SMTP credentials or app password.",
    550: "Sender or recipient rejected by SMTP provider policy.",
  };

  return {
    code,
    message,
    hint: map[code] || "Check SMTP settings and provider logs.",
  };
};

const verifyIfNeeded = async (tx) => {
  if (verified) {
    return;
  }
  await tx.verify();
  verified = true;
};

export const sendEmail = async ({ to = "", subject = "", text = "", html = "" } = {}) => {
  const recipient = toString(to);
  if (!recipient) {
    return {
      sent: false,
      error: "Recipient email is required.",
      errorCode: "MISSING_RECIPIENT",
      errorHint: "Provide a valid recipient email address.",
    };
  }

  if (!isMailerConfigured()) {
    return {
      sent: false,
      error: "SMTP mailer is not configured.",
      errorCode: "SMTP_NOT_CONFIGURED",
      errorHint: "Set SMTP_HOST/PORT (or SMTP_URL) and EMAIL_FROM in backend env vars.",
    };
  }

  const config = smtpConfig();

  try {
    const tx = getTransporter();
    await verifyIfNeeded(tx);
    const result = await tx.sendMail({
      from: config.from,
      to: recipient,
      subject: toString(subject) || "Trading Journal Notification",
      text: toString(text),
      html: toString(html) || undefined,
    });

    return {
      sent: true,
      messageId: result?.messageId || "",
      accepted: Array.isArray(result?.accepted) ? result.accepted : [],
      rejected: Array.isArray(result?.rejected) ? result.rejected : [],
    };
  } catch (error) {
    verified = false;
    const classified = classifyError(error);
    return {
      sent: false,
      error: classified.message,
      errorCode: classified.code,
      errorHint: classified.hint,
    };
  }
};
