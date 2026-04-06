# Journex AI Service

This service is your **separate deployment** for AI coaching in Journex.

It is designed to sit beside the main app and talk to an **OpenAI-compatible open-source model endpoint** such as:

- **Ollama** (`http://localhost:11434/v1`)
- **vLLM** (`http://localhost:8000/v1`)

Recommended first model:

- `deepseek-r1:8b` on Ollama for a simple open-source first deployment

## Why separate deployment

- Keeps the main Journex API fast and predictable
- Lets you swap models without rewriting the app
- Makes it easier to scale AI independently from trades/auth

## Service location

```text
ai/
```

## Endpoints

- `GET /api/health`
- `GET /api/coach/config`
- `POST /api/coach/review`
- `POST /api/coach/trade`
- `POST /api/coach/chat`

## Local run

```powershell
cd ai
copy .env.example .env
npm install
npm start
```

## Example env

```env
PORT=8080
CLIENT_URL=http://localhost:5173
AI_BASE_URL=http://localhost:11434/v1
AI_MODEL=deepseek-r1:8b
AI_API_KEY=ollama
AI_PROVIDER_LABEL=ollama
AI_SERVICE_TOKEN=replace-with-a-shared-secret
SEARCH_BASE_URL=http://localhost:8081
```

## Example review payload

```json
{
  "profile": {
    "name": "Main Profile",
    "accountSize": 10000
  },
  "range": "weekly",
  "overview": {
    "totalTrades": 12,
    "winRate": 58.3,
    "averageRR": 1.34
  },
  "mistakes": [
    { "label": "Late entry", "costRR": 2.4, "trades": 4 }
  ],
  "bestSetup": {
    "label": "London Breakout",
    "winRate": 71,
    "trades": 7
  }
}
```

## Integration idea

Recommended pattern:

1. Journex main API sends **authenticated summarized review/trade context** to the AI service
2. AI service calls the open-source model endpoint
3. AI service returns structured coaching JSON
4. Journex renders the result in Coaching / Review / Trade Detail

Backend connection:

```env
AI_SERVICE_URL=https://your-journex-ai-service.onrender.com
AI_SERVICE_TOKEN=replace-with-the-same-shared-secret
```

Keep raw trade history out of the prompt unless needed. Send summaries first.

## Web access

The model itself is not "the web".

If you want live browsing behavior, connect this AI service to your own search layer.
The simplest open-source option is a self-hosted **SearXNG** instance and set:

```env
SEARCH_BASE_URL=http://your-searxng-host
```

Then send `useWeb: true` in the chat request.
