import { recordAudit } from "../services/audit.js";
import { getAiServiceConfig, requestAiChat } from "../services/aiProxy.js";

const badRequest = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const findProfileOrThrow = (user, profileId = "") => {
  const resolvedId = String(profileId || user?.activeProfileId || "").trim();
  const profile = (user?.profiles || []).find((entry) => entry.id === resolvedId);
  if (!profile) {
    throw badRequest("Profile was not found for AI history.");
  }
  return profile;
};

const getAiThreads = (user) => {
  if (!user.aiAssistant || typeof user.aiAssistant !== "object") {
    user.aiAssistant = { profileThreads: [] };
  }
  if (!Array.isArray(user.aiAssistant.profileThreads)) {
    user.aiAssistant.profileThreads = [];
  }
  return user.aiAssistant.profileThreads;
};

const getThread = (user, profileId) => getAiThreads(user).find((thread) => thread.profileId === profileId) || null;

const sanitizeMessages = (messages = []) =>
  (Array.isArray(messages) ? messages : [])
    .filter((message) => message && typeof message === "object")
    .slice(-20)
    .map((message) => ({
      role: String(message.role || "").trim() === "assistant" ? "assistant" : "user",
      content: String(message.content || "").trim().slice(0, 4000),
      createdAt: new Date(),
    }))
    .filter((message) => message.content);

const buildThreadTitle = (messages = [], fallback = "AI Conversation") => {
  const firstUserMessage = messages.find((message) => message.role === "user")?.content || "";
  const trimmed = String(firstUserMessage || "").trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed;
};

const buildThreadMemory = ({ profile, context, latestUserMessage = "", assistantReply = "" }) => {
  const bestSetup = context?.review?.bestSetup?.label || context?.topPatterns?.setups?.[0]?.label || "";
  const bestSession = context?.review?.bestSession?.label || context?.topPatterns?.sessions?.[0]?.label || "";
  const topMistake = context?.review?.topMistake?.label || "";
  const maxRisk = context?.risk?.maxRiskPerTradePercent;
  const parts = [
    profile?.name ? `Profile ${profile.name}` : "",
    latestUserMessage ? `Last ask: ${String(latestUserMessage).slice(0, 100)}` : "",
    bestSetup ? `Best setup: ${bestSetup}` : "",
    bestSession ? `Best session: ${bestSession}` : "",
    topMistake ? `Top leak: ${topMistake}` : "",
    Number.isFinite(Number(maxRisk)) ? `Max risk: ${maxRisk}%` : "",
    assistantReply ? `Last guidance: ${String(assistantReply).slice(0, 120)}` : "",
  ].filter(Boolean);
  return parts.join(" | ").slice(0, 500);
};

const clampPercent = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.max(0, Math.min(parsed, 100));
};

const parseRuleUpdateRequest = (message = "") => {
  const text = String(message || "").trim();
  if (!text) {
    return null;
  }

  const rules = [
    {
      key: "maxRiskPerTradePercent",
      label: "max risk per trade",
      pattern: /(?:set|change|update|adjust|make)?[\s\w-]*(?:max risk(?: per trade)?|risk cap)[^\d]{0,12}(\d+(?:\.\d+)?)\s*%/i,
    },
    {
      key: "dailyProfitTargetPercent",
      label: "daily profit target",
      pattern: /(?:set|change|update|adjust|make)?[\s\w-]*(?:daily profit target|daily target)[^\d]{0,12}(\d+(?:\.\d+)?)\s*%/i,
    },
    {
      key: "weeklyProfitTargetPercent",
      label: "weekly profit target",
      pattern: /(?:set|change|update|adjust|make)?[\s\w-]*(?:weekly profit target|weekly target)[^\d]{0,12}(\d+(?:\.\d+)?)\s*%/i,
    },
    {
      key: "maxDailyDrawdownPercent",
      label: "max daily drawdown",
      pattern: /(?:set|change|update|adjust|make)?[\s\w-]*(?:max daily drawdown|daily drawdown cap|daily loss cap)[^\d]{0,12}(\d+(?:\.\d+)?)\s*%/i,
    },
  ];

  for (const rule of rules) {
    const match = text.match(rule.pattern);
    if (!match) {
      continue;
    }
    const value = clampPercent(match[1]);
    if (value === null) {
      continue;
    }
    return {
      ...rule,
      value,
    };
  }

  return null;
};

const buildRuleUpdateReply = ({ label, previousValue, value }) => {
  const fromText = Number.isFinite(previousValue) ? `${previousValue}%` : "your previous setting";
  return `Done. I updated your ${label} from ${fromText} to ${value}%.

Journex will use that on the next risk check, coaching pass, and trade guardrail review.`;
};

const RULE_LIMITS = {
  maxRiskPerTradePercent: { min: 0.1, max: 5 },
  dailyProfitTargetPercent: { min: 0.1, max: 15 },
  weeklyProfitTargetPercent: { min: 0.5, max: 30 },
  maxDailyDrawdownPercent: { min: 0.5, max: 10 },
};

const buildActionMessage = ({ content, actionType = "", actionLabel = "", actionStatus = "", actionPayload = null }) => ({
  role: "assistant",
  content: String(content || "").trim(),
  createdAt: new Date(),
  actionType,
  actionLabel,
  actionStatus,
  actionPayload,
});

const persistThread = async ({ req, profile, messages, memory }) => {
  const nextThreads = getAiThreads(req.user).filter((thread) => thread.profileId !== profile.id);
  nextThreads.push({
    profileId: profile.id,
    title: buildThreadTitle(messages, `${profile.name} AI Chat`),
    messages,
    updatedAt: new Date(),
    memory,
  });
  req.user.aiAssistant.profileThreads = nextThreads;
  await req.user.save();
};

const parseUiActionRequest = (message = "", context = {}) => {
  const text = String(message || "").trim().toLowerCase();
  if (!text) {
    return null;
  }

  if (/(open|show|review).*(screenshot|replay)/i.test(text)) {
    const selectedTrade = context?.selectedTrade;
    const screenshotTrade =
      (selectedTrade?.screenshots?.before || selectedTrade?.screenshots?.after ? selectedTrade : null) ||
      (Array.isArray(context?.screenshotTrades) ? context.screenshotTrades[0] : null);
    if (screenshotTrade?.id) {
      return {
        type: "open-trade",
        label: "Open screenshot trade",
        payload: {
          tradeId: screenshotTrade.id,
          focus: screenshotTrade?.screenshots?.before || screenshotTrade?.before ? "before" : "after",
        },
        reply: `I found a screenshot-ready trade for ${screenshotTrade.pair || "your current review"}. Use the button below and I’ll take you straight to it.`,
      };
    }
  }

  if (/(open|go to|take me to).*(risk center|risk page|risk)/i.test(text)) {
    return {
      type: "navigate",
      label: "Open Risk Center",
      payload: { page: "risk" },
      reply: "Use the button below and I’ll move you to Risk Center.",
    };
  }

  if (/(open|go to|take me to).*(review)/i.test(text)) {
    return {
      type: "navigate",
      label: "Open Review",
      payload: { page: "review" },
      reply: "Use the button below and I’ll take you back to Review.",
    };
  }

  if (/(open|go to|take me to).*(coaching|coach)/i.test(text)) {
    return {
      type: "navigate",
      label: "Open Coaching",
      payload: { page: "coaching" },
      reply: "Use the button below and I’ll keep you in the coaching workspace.",
    };
  }

  if (/(open|show).*(latest|recent).*(trade)/i.test(text)) {
    const recentTrade = Array.isArray(context?.recentTrades) ? context.recentTrades[0] : null;
    if (recentTrade?.id) {
      return {
        type: "open-trade",
        label: "Open latest trade",
        payload: { tradeId: recentTrade.id },
        reply: `I found your latest trade on ${recentTrade.pair || "the latest symbol"}. Use the button below and I’ll open it.`,
      };
    }
  }

  return null;
};

export const getAiConfig = async (_req, res, next) => {
  try {
    const config = await getAiServiceConfig();
    res.json(config);
  } catch (error) {
    next(error);
  }
};

export const getAiConversation = async (req, res, next) => {
  try {
    const profile = findProfileOrThrow(req.user, req.params.profileId || req.query.profileId);
    const thread = getThread(req.user, profile.id);
    res.json({
      ok: true,
      profileId: profile.id,
      profileName: profile.name,
      title: thread?.title || "",
      memory: thread?.memory || "",
      messages: thread?.messages || [],
      updatedAt: thread?.updatedAt || null,
    });
  } catch (error) {
    next(error);
  }
};

export const clearAiConversation = async (req, res, next) => {
  try {
    const profile = findProfileOrThrow(req.user, req.params.profileId);
    req.user.aiAssistant.profileThreads = getAiThreads(req.user).filter((thread) => thread.profileId !== profile.id);
    await req.user.save();

    await recordAudit({
      req,
      userId: req.user._id,
      action: "ai.conversation.cleared",
      targetType: "profile",
      targetId: profile.id,
    });

    res.json({
      ok: true,
      profileId: profile.id,
      messages: [],
      memory: "",
    });
  } catch (error) {
    next(error);
  }
};

export const applyAiAction = async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      throw badRequest("AI action payload is required.");
    }
    const profile = findProfileOrThrow(req.user, req.body.profileId);
    const action = req.body.action || {};
    const type = String(action.type || "").trim();

    if (type === "confirm-rule-update") {
      const ruleKey = String(action.ruleKey || "").trim();
      const label = String(action.label || "").trim() || "rule";
      const nextValue = clampPercent(action.value);
      const limits = RULE_LIMITS[ruleKey];
      if (!limits || nextValue === null) {
        throw badRequest("This AI rule change request is invalid.");
      }
      if (nextValue < limits.min || nextValue > limits.max) {
        throw badRequest(`That ${label} value is outside the safe Journex range (${limits.min}%-${limits.max}%).`);
      }

      const previousValue = Number(req.user?.settings?.riskControls?.[ruleKey]);
      req.user.settings.riskControls[ruleKey] = nextValue;
      const existingThread = getThread(req.user, profile.id);
      const existingMessages = Array.isArray(existingThread?.messages) ? existingThread.messages : [];
      const assistantMessage = buildActionMessage({
        content:
          previousValue === nextValue
            ? `Your ${label} is already set to ${nextValue}%.`
            : buildRuleUpdateReply({ label, previousValue, value: nextValue }),
        actionType: "rule-update",
        actionLabel: label,
        actionStatus: "done",
        actionPayload: {
          ruleKey,
          value: nextValue,
        },
      });
      const nextMessages = [...existingMessages, assistantMessage].slice(-20);
      const memory = buildThreadMemory({
        profile,
        context: req.body.context || null,
        latestUserMessage: `Confirmed ${label} ${nextValue}%`,
        assistantReply: assistantMessage.content,
      });
      await persistThread({
        req,
        profile,
        messages: nextMessages,
        memory,
      });

      await recordAudit({
        req,
        userId: req.user._id,
        action: "ai.rule.updated",
        targetType: "profile",
        targetId: profile.id,
        metadata: {
          rule: ruleKey,
          value: nextValue,
        },
      });

      res.json({
        ok: true,
        profileId: profile.id,
        model: "journex-rule-action",
        reply: assistantMessage.content,
        memory,
        messages: nextMessages,
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    if (type === "dismiss-action") {
      const existingThread = getThread(req.user, profile.id);
      const existingMessages = Array.isArray(existingThread?.messages) ? existingThread.messages : [];
      const assistantMessage = buildActionMessage({
        content: "No problem. I left that unchanged.",
        actionType: "dismiss",
        actionLabel: "dismissed",
        actionStatus: "done",
      });
      const nextMessages = [...existingMessages, assistantMessage].slice(-20);
      const memory = buildThreadMemory({
        profile,
        context: req.body.context || null,
        latestUserMessage: "Dismissed AI action",
        assistantReply: assistantMessage.content,
      });
      await persistThread({ req, profile, messages: nextMessages, memory });
      res.json({
        ok: true,
        profileId: profile.id,
        model: "journex-rule-action",
        reply: assistantMessage.content,
        memory,
        messages: nextMessages,
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    throw badRequest("Unsupported AI action.");
  } catch (error) {
    next(error);
  }
};

export const chatWithAi = async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      throw badRequest("AI chat payload is required.");
    }

    const profile = findProfileOrThrow(req.user, req.body.profileId);
    const messages = sanitizeMessages(req.body.messages);
    if (!messages.length) {
      throw badRequest("At least one chat message is required.");
    }

    const latestUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content || "";
    const requestedRuleUpdate = parseRuleUpdateRequest(latestUserMessage);
    if (requestedRuleUpdate) {
      const limits = RULE_LIMITS[requestedRuleUpdate.key];
      if (requestedRuleUpdate.value < limits.min || requestedRuleUpdate.value > limits.max) {
        throw badRequest(
          `That ${requestedRuleUpdate.label} request is outside the safe Journex range (${limits.min}%-${limits.max}%).`
        );
      }
      const previousValue = Number(req.user?.settings?.riskControls?.[requestedRuleUpdate.key]);
      const assistantMessage = buildActionMessage({
        content:
          previousValue === requestedRuleUpdate.value
            ? `Your ${requestedRuleUpdate.label} is already set to ${requestedRuleUpdate.value}%.`
            : `I can change your ${requestedRuleUpdate.label} from ${
                Number.isFinite(previousValue) ? `${previousValue}%` : "the current setting"
              } to ${requestedRuleUpdate.value}%. Confirm below if you want me to apply it.`,
        actionType: "rule-update",
        actionLabel: requestedRuleUpdate.label,
        actionStatus: previousValue === requestedRuleUpdate.value ? "done" : "pending",
        actionPayload:
          previousValue === requestedRuleUpdate.value
            ? {
                ruleKey: requestedRuleUpdate.key,
                value: requestedRuleUpdate.value,
              }
            : {
                type: "confirm-rule-update",
                ruleKey: requestedRuleUpdate.key,
                label: requestedRuleUpdate.label,
                previousValue: Number.isFinite(previousValue) ? previousValue : null,
                value: requestedRuleUpdate.value,
              },
      });

      const nextMessages = [...messages, assistantMessage].slice(-20);
      const memory = buildThreadMemory({
        profile,
        context: req.body.context || null,
        latestUserMessage,
        assistantReply: assistantMessage.content,
      });
      await persistThread({ req, profile, messages: nextMessages, memory });

      res.json({
        ok: true,
        profileId: profile.id,
        title: buildThreadTitle(nextMessages, `${profile.name} AI Chat`),
        model: "journex-rule-action",
        reply: assistantMessage.content,
        memory,
        messages: nextMessages,
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    const requestedUiAction = parseUiActionRequest(latestUserMessage, req.body.context || {});
    if (requestedUiAction) {
      const assistantMessage = buildActionMessage({
        content: requestedUiAction.reply,
        actionType: requestedUiAction.type,
        actionLabel: requestedUiAction.label,
        actionStatus: "ready",
        actionPayload: requestedUiAction.payload,
      });
      const nextMessages = [...messages, assistantMessage].slice(-20);
      const memory = buildThreadMemory({
        profile,
        context: req.body.context || null,
        latestUserMessage,
        assistantReply: assistantMessage.content,
      });
      await persistThread({ req, profile, messages: nextMessages, memory });

      res.json({
        ok: true,
        profileId: profile.id,
        title: buildThreadTitle(nextMessages, `${profile.name} AI Chat`),
        model: "journex-ui-action",
        reply: assistantMessage.content,
        memory,
        messages: nextMessages,
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    const response = await requestAiChat({
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      context: req.body.context || null,
      useWeb: Boolean(req.body.useWeb),
    });

    const assistantMessage = buildActionMessage({
      content: String(response?.reply || "").trim() || "No reply returned.",
    });

    const nextMessages = [...messages, assistantMessage].slice(-20);
    const memory = buildThreadMemory({
      profile,
      context: req.body.context || null,
      latestUserMessage,
      assistantReply: assistantMessage.content,
    });
    await persistThread({ req, profile, messages: nextMessages, memory });

    await recordAudit({
      req,
      userId: req.user._id,
      action: "ai.chat.sent",
      targetType: "profile",
      targetId: profile.id,
    });

    res.json({
      ok: true,
      profileId: profile.id,
      title: buildThreadTitle(nextMessages, `${profile.name} AI Chat`),
      model: response?.model || "",
      reply: assistantMessage.content,
      memory,
      messages: nextMessages,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};
