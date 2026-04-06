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
    });
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

    const response = await requestAiChat({
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      context: req.body.context || null,
      useWeb: Boolean(req.body.useWeb),
    });

    const assistantMessage = {
      role: "assistant",
      content: String(response?.reply || "").trim() || "No reply returned.",
      createdAt: new Date(),
    };

    const nextMessages = [...messages, assistantMessage].slice(-20);
    const nextThreads = getAiThreads(req.user).filter((thread) => thread.profileId !== profile.id);
    nextThreads.push({
      profileId: profile.id,
      title: buildThreadTitle(nextMessages, `${profile.name} AI Chat`),
      messages: nextMessages,
      updatedAt: new Date(),
    });
    req.user.aiAssistant.profileThreads = nextThreads;
    await req.user.save();

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
      messages: nextMessages,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

