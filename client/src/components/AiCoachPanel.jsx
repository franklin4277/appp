import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyAiAction,
  clearAiConversation,
  fetchAiConfig,
  fetchAiConversation,
  isAiConfigured,
  sendAiChat,
} from "../api/aiApi";

const BASE_QUICK_PROMPTS = [
  {
    label: "Review My Week",
    prompt: "Review my current week and tell me the biggest leak, the strongest pattern, and the next adjustment to make.",
  },
  {
    label: "Review My Rules",
    prompt: "Review my current rules and tell me which one is helping most, which one needs tightening, and whether my limits still fit my recent trades.",
  },
  {
    label: "Show Screenshots",
    prompt: "Show me the most relevant screenshot-ready trades in my current review context and explain what I should look at first.",
  },
  {
    label: "Strongest Edge",
    prompt: "What setup, session, or behavior currently looks strongest and why?",
  },
  {
    label: "Tighten Risk",
    prompt: "Based on my recent trades, should I tighten any risk rule right now? Be specific and practical.",
  },
];

const buildQuickPrompts = (context) => {
  const prompts = [...BASE_QUICK_PROMPTS];
  const selectedTrade = context?.selectedTrade;
  if (selectedTrade?.id && (selectedTrade?.screenshots?.before || selectedTrade?.screenshots?.after)) {
    prompts.unshift(
      {
        label: "Review This Trade",
        prompt: `Review the currently selected trade on ${selectedTrade.pair || "my chart"} and tell me the biggest execution issue first.`,
      },
      {
        label: "Review Screenshot",
        prompt: "Review this selected trade screenshot and tell me what confirmation was present, what was missing, and what I should focus on next time.",
      }
    );
  }
  return prompts.slice(0, 6);
};

const normalizeAction = (message) => {
  if (!message || typeof message !== "object") {
    return null;
  }
  if (!message.actionType || !message.actionPayload) {
    return null;
  }
  return {
    type: String(message.actionType || ""),
    label: String(message.actionLabel || ""),
    status: String(message.actionStatus || ""),
    payload: message.actionPayload,
  };
};

const actionKeyFor = (action) =>
  `${action?.payload?.ruleKey || action?.payload?.page || action?.payload?.tradeId || ""}-${action?.type || ""}`;

const Bubble = ({ message, busyActionKey = "", onApplyAction }) => {
  const role = message?.role === "assistant" ? "assistant" : "user";
  const action = normalizeAction(message);
  const isBusy = action ? busyActionKey === actionKeyFor(action) : false;

  return (
    <article className={`ai-chat-bubble ${role === "assistant" ? "ai-chat-bubble-assistant" : "ai-chat-bubble-user"}`}>
      <span className="ai-chat-role">{role === "assistant" ? "Journex AI" : "You"}</span>
      <p>{message?.content}</p>
      {role === "assistant" && action && typeof onApplyAction === "function" ? (
        <div className="saas-settings-actions mt-3">
          {action.type === "rule-update" && action.status === "pending" ? (
            <>
              <button
                type="button"
                className="btn-primary"
                disabled={isBusy}
                onClick={() => void onApplyAction(action, "confirm")}
              >
                {isBusy ? "Applying..." : "Confirm Change"}
              </button>
              <button
                type="button"
                className="landing-cta-secondary"
                disabled={isBusy}
                onClick={() => void onApplyAction(action, "dismiss")}
              >
                Keep Current Rule
              </button>
            </>
          ) : null}
          {(action.type === "navigate" || action.type === "open-trade") && action.status === "ready" ? (
            <button
              type="button"
              className="btn-primary"
              disabled={isBusy}
              onClick={() => void onApplyAction(action, "run")}
            >
              {action.label || "Open"}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
};

const AiCoachPanel = ({
  context,
  activeProfileName = "Workspace",
  profileId = "main",
  onExecuteAction,
}) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [serviceInfo, setServiceInfo] = useState(null);
  const [useWeb, setUseWeb] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [busyActionKey, setBusyActionKey] = useState("");
  const threadEndRef = useRef(null);

  const quickPrompts = useMemo(() => buildQuickPrompts(context), [context]);

  useEffect(() => {
    if (!isAiConfigured()) {
      return;
    }
    let alive = true;
    fetchAiConfig()
      .then((data) => {
        if (alive) {
          setServiceInfo(data);
          setUseWeb(Boolean(data?.webSearch));
        }
      })
      .catch(() => {
        if (alive) {
          setServiceInfo(null);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!isAiConfigured() || !profileId) {
      return;
    }
    let alive = true;
    setLoadingHistory(true);
    fetchAiConversation({ profileId })
      .then((data) => {
        if (!alive) {
          return;
        }
        setMessages(Array.isArray(data?.messages) ? data.messages : []);
      })
      .catch((loadError) => {
        if (!alive) {
          return;
        }
        setMessages([]);
        setError(loadError.message || "Could not load AI conversation.");
      })
      .finally(() => {
        if (alive) {
          setLoadingHistory(false);
        }
      });

    return () => {
      alive = false;
    };
  }, [profileId]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({
      block: "end",
      behavior: "smooth",
    });
  }, [loadingHistory, messages, sending]);

  const canSend = useMemo(() => input.trim().length >= 2 && !sending, [input, sending]);

  const handleSend = async (content) => {
    const prompt = String(content || input).trim();
    if (prompt.length < 2 || sending) {
      return;
    }

    const nextMessages = [...messages, { role: "user", content: prompt }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setError("");

    try {
      const response = await sendAiChat({
        profileId,
        messages: nextMessages,
        context,
        useWeb,
      });
      setMessages(
        Array.isArray(response?.messages)
          ? response.messages
          : [...nextMessages, { role: "assistant", content: response.reply || "No reply returned." }]
      );
    } catch (sendError) {
      setError(sendError.message || "Could not reach Journex AI.");
    } finally {
      setSending(false);
    }
  };

  const handleApplyAction = async (action, mode) => {
    const actionKey = actionKeyFor(action);
    setBusyActionKey(actionKey);
    setError("");
    try {
      if (mode === "run") {
        if (typeof onExecuteAction === "function") {
          onExecuteAction(action);
        }
        return;
      }

      const response = await applyAiAction({
        profileId,
        action:
          mode === "dismiss"
            ? { type: "dismiss-action" }
            : action?.payload,
        context,
      });
      setMessages(Array.isArray(response?.messages) ? response.messages : messages);
    } catch (actionError) {
      setError(actionError.message || "Could not apply that AI action.");
    } finally {
      setBusyActionKey("");
    }
  };

  if (!isAiConfigured()) {
    return (
      <article className="panel saas-card">
        <div className="saas-card-head">
          <div>
            <h3 className="saas-card-title">AI Coach</h3>
            <p className="saas-card-subtitle">Journex AI is available after sign-in when the backend and AI service are configured.</p>
          </div>
        </div>
        <div className="saas-empty-state mt-3">
          <strong>AI service not configured</strong>
          <p>Check the backend AI proxy envs and your live AI deployment, then reload the app.</p>
        </div>
      </article>
    );
  }

  return (
    <section className="space-y-4">
      <article className="panel saas-card">
        <div className="saas-card-head">
          <div>
            <h3 className="saas-card-title">AI Coach</h3>
            <p className="saas-card-subtitle">
              Your in-app Journex copilot for review, rules, screenshots, and next-step coaching, with optional live web search when you need outside context.
            </p>
          </div>
          <div className="saas-settings-actions">
            <span className="chip text-textMain">{activeProfileName}</span>
            {serviceInfo?.model ? <span className="chip text-textMain">{serviceInfo.model}</span> : null}
            {serviceInfo?.provider ? <span className="chip text-textMain">{serviceInfo.provider}</span> : null}
          </div>
        </div>

        <div className="ai-chat-shell mt-4">
          <div className="ai-chat-shell-head">
            <div className="ai-chat-toolbar">
              <div className="ai-chat-toolbar-copy">
                <strong>{useWeb ? "Web search on" : "Web search off"}</strong>
                <span>
                  {serviceInfo?.webSearch
                    ? "Use fresh search results when you want market context, definitions, or up-to-date references."
                    : "Live browsing is off right now. Journex AI will stay focused on your saved context instead."}
                </span>
              </div>
              <button
                type="button"
                className={`chip text-textMain ${useWeb ? "chip-btn-active" : ""}`}
                onClick={() => setUseWeb((current) => !current)}
                disabled={!serviceInfo?.webSearch || sending}
              >
                {useWeb ? "Using Web" : "Use Web"}
              </button>
            </div>

            <div className="ai-chat-quick-prompts">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt.label}
                  type="button"
                  className="chip text-textMain"
                  onClick={() => void handleSend(prompt.prompt)}
                  disabled={sending}
                >
                  {prompt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ai-chat-thread-wrap">
            <div className="ai-chat-thread">
              {loadingHistory ? (
                <div className="saas-empty-state">
                  <strong>Loading conversation</strong>
                  <p>Pulling your saved AI chat for {activeProfileName}.</p>
                </div>
              ) : messages.length ? (
                messages.map((message, index) => (
                  <Bubble
                    key={`${message.role}-${message.createdAt || index}-${index}`}
                    message={message}
                    busyActionKey={busyActionKey}
                    onApplyAction={handleApplyAction}
                  />
                ))
              ) : (
                <div className="saas-empty-state">
                  <strong>No chat yet</strong>
                  <p>Ask Journex AI about your current performance, risk, playbooks, screenshots, or what to improve next.</p>
                </div>
              )}
              {sending ? <Bubble message={{ role: "assistant", content: "Thinking..." }} /> : null}
              <div ref={threadEndRef} />
            </div>
          </div>

          <div className="ai-chat-composer">
            <textarea
              className="input"
              rows={3}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about your trades, rules, screenshots, playbooks, or tell Journex AI to change a supported risk rule..."
            />
            <div className="saas-settings-actions mt-3">
              <button type="button" className="btn-primary" disabled={!canSend} onClick={() => void handleSend()}>
                {sending ? "Sending..." : "Send"}
              </button>
              <button
                type="button"
                className="landing-cta-secondary"
                onClick={async () => {
                  try {
                    setSending(true);
                    setError("");
                    await clearAiConversation({ profileId });
                    setMessages([]);
                  } catch (clearError) {
                    setError(clearError.message || "Could not clear AI conversation.");
                  } finally {
                    setSending(false);
                  }
                }}
                disabled={sending}
              >
                Clear Profile Chat
              </button>
            </div>
            {error ? <p className="saas-alert saas-alert-error mt-3">{error}</p> : null}
          </div>
        </div>
      </article>
    </section>
  );
};

export default AiCoachPanel;
