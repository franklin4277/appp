import { useEffect, useMemo, useState } from "react";
import { fetchAiConfig, isAiConfigured, sendAiChat } from "../api/aiApi";

const STORAGE_KEY = "journex-ai-chat-history";

const readStoredMessages = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const persistMessages = (messages = []) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-20)));
};

const QUICK_PROMPTS = [
  "Review my current performance and tell me the biggest leak.",
  "What should I improve in my risk management next?",
  "What setup or session looks strongest right now?",
  "Give me a weekly coaching summary in plain language.",
];

const Bubble = ({ role, content }) => (
  <article className={`ai-chat-bubble ${role === "assistant" ? "ai-chat-bubble-assistant" : "ai-chat-bubble-user"}`}>
    <span className="ai-chat-role">{role === "assistant" ? "Journex AI" : "You"}</span>
    <p>{content}</p>
  </article>
);

const AiCoachPanel = ({ context, activeProfileName = "Workspace" }) => {
  const [messages, setMessages] = useState(() => readStoredMessages());
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [serviceInfo, setServiceInfo] = useState(null);
  const [useWeb, setUseWeb] = useState(false);

  useEffect(() => {
    persistMessages(messages);
  }, [messages]);

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
        messages: nextMessages,
        context,
        useWeb,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: response.reply || "No reply returned." }]);
    } catch (sendError) {
      setError(sendError.message || "Could not reach Journex AI.");
    } finally {
      setSending(false);
    }
  };

  if (!isAiConfigured()) {
    return (
      <article className="panel saas-card">
        <div className="saas-card-head">
          <div>
            <h3 className="saas-card-title">AI Coach</h3>
            <p className="saas-card-subtitle">Connect your separate Journex AI deployment by setting <code>VITE_AI_URL</code>.</p>
          </div>
        </div>
        <div className="saas-empty-state mt-3">
          <strong>AI service not configured</strong>
          <p>Set <code>VITE_AI_URL</code> to your deployed AI service URL, then reload the app.</p>
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
              Your own Journex chat assistant, using your separate AI deployment, your current trading context, and optional live web search.
            </p>
          </div>
          <div className="saas-settings-actions">
            <span className="chip text-textMain">{activeProfileName}</span>
            {serviceInfo?.model ? <span className="chip text-textMain">{serviceInfo.model}</span> : null}
            {serviceInfo?.provider ? <span className="chip text-textMain">{serviceInfo.provider}</span> : null}
          </div>
        </div>

        <div className="ai-chat-toolbar mt-4">
          <div className="ai-chat-toolbar-copy">
            <strong>{useWeb ? "Web search on" : "Web search off"}</strong>
            <span>
              {serviceInfo?.webSearch
                ? "Use fresh search results when you want market context, definitions, or current references."
                : "Add SEARCH_BASE_URL in the AI service to enable live browsing."}
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

        <div className="ai-chat-quick-prompts mt-4">
          {QUICK_PROMPTS.map((prompt) => (
            <button key={prompt} type="button" className="chip text-textMain" onClick={() => void handleSend(prompt)} disabled={sending}>
              {prompt}
            </button>
          ))}
        </div>

        <div className="ai-chat-thread mt-4">
          {messages.length ? (
            messages.map((message, index) => <Bubble key={`${message.role}-${index}`} role={message.role} content={message.content} />)
          ) : (
            <div className="saas-empty-state">
              <strong>No chat yet</strong>
              <p>Ask Journex AI about your current performance, risk, playbooks, or what to improve next.</p>
            </div>
          )}
          {sending ? <Bubble role="assistant" content="Thinking..." /> : null}
        </div>

        <div className="ai-chat-composer mt-4">
          <textarea
            className="input"
            rows={4}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about your trades, risk, review, playbooks, or what to improve next..."
          />
          <div className="saas-settings-actions mt-3">
            <button type="button" className="btn-primary" disabled={!canSend} onClick={() => void handleSend()}>
              {sending ? "Sending..." : "Send"}
            </button>
            <button
              type="button"
              className="landing-cta-secondary"
              onClick={() => {
                setMessages([]);
                setError("");
                localStorage.removeItem(STORAGE_KEY);
              }}
              disabled={sending}
            >
              Clear Chat
            </button>
          </div>
          {error ? <p className="saas-alert saas-alert-error mt-3">{error}</p> : null}
        </div>
      </article>
    </section>
  );
};

export default AiCoachPanel;
