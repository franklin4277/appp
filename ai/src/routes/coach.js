import { Router } from "express";
import { getAiConfig, requestChatResponse, requestStructuredCoachResponse } from "../services/llm.js";
import { isSearchConfigured } from "../services/search.js";

const router = Router();

const badRequest = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

router.get("/config", (_req, res) => {
  res.json({
    ok: true,
    ...getAiConfig(),
    webSearch: isSearchConfigured(),
  });
});

router.post("/review", async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      throw badRequest("Review payload is required.");
    }

    const response = await requestStructuredCoachResponse({
      mode: "review",
      payload: req.body,
    });

    res.json({
      ok: true,
      mode: "review",
      model: response.model,
      coach: response.parsed || {
        summary: response.raw,
        keep: [],
        stop: [],
        test: [],
        risk_watch: "",
        confidence_note: "Model returned unstructured text.",
      },
      raw: response.raw,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/trade", async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      throw badRequest("Trade payload is required.");
    }

    const response = await requestStructuredCoachResponse({
      mode: "trade",
      payload: req.body,
    });

    res.json({
      ok: true,
      mode: "trade",
      model: response.model,
      coach: response.parsed || {
        summary: response.raw,
        setup_quality: "",
        risk_note: "",
        execution_note: "",
        next_step: "",
        warning: "",
      },
      raw: response.raw,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/chat", async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      throw badRequest("Chat payload is required.");
    }

    const response = await requestChatResponse({
      messages: req.body.messages || [],
      context: req.body.context || null,
      useWeb: Boolean(req.body.useWeb),
    });

    res.json({
      ok: true,
      mode: "chat",
      model: response.model,
      reply: response.raw,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
