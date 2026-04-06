import {
  clearAiConversation as clearAiConversationRequest,
  fetchAiCoachConfig,
  fetchAiConversation as fetchAiConversationRequest,
  readStoredAuthSession,
  sendAiChat as sendAiChatRequest,
} from "./tradesApi";

const resolveToken = () => readStoredAuthSession().token || "";

export const isAiConfigured = () => Boolean(resolveToken());

export const fetchAiConfig = async () => fetchAiCoachConfig(resolveToken());

export const fetchAiConversation = async ({ profileId }) =>
  fetchAiConversationRequest(resolveToken(), profileId);

export const clearAiConversation = async ({ profileId }) =>
  clearAiConversationRequest(resolveToken(), profileId);

export const sendAiChat = async ({ profileId, messages = [], context = null, useWeb = false }) =>
  sendAiChatRequest(resolveToken(), {
    profileId,
    messages,
    context,
    useWeb,
  });

