const toSafeObject = (value) => {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value;
};

const redactSecrets = (details = {}) => {
  const output = { ...details };
  const keys = Object.keys(output);
  keys.forEach((key) => {
    if (/password|token|secret|authorization|cookie/i.test(key)) {
      output[key] = "[redacted]";
    }
  });
  return output;
};

const emitLog = (level, event, details = {}) => {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    details: redactSecrets(toSafeObject(details)),
  };

  const message = JSON.stringify(payload);
  if (level === "error") {
    console.error(message);
    return;
  }
  if (level === "warn") {
    console.warn(message);
    return;
  }
  console.log(message);
};

export const logInfo = (event, details = {}) => emitLog("info", event, details);
export const logWarn = (event, details = {}) => emitLog("warn", event, details);
export const logError = (event, details = {}) => emitLog("error", event, details);
