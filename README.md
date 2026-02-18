# LLM Council

![llmcouncil](header.jpg)

The idea of this repo is that instead of asking a question to your favorite LLM provider (e.g. OpenAI GPT 5.1, Google Gemini 3.0 Pro, Anthropic Claude Sonnet 4.5, xAI Grok 4, eg.c), you can group them into your "LLM Council". This repo is a simple, local web app that essentially looks like ChatGPT except it uses Ollama to send your query to multiple LLMs running locally, it then asks them to review and rank each other's work, and finally a Chairman LLM produces the final response.

In a bit more detail, here is what happens when you submit a query:

1. **Stage 1: First opinions**. The user query is given to all LLMs individually, and the responses are collected. The individual responses are shown in a "tab view", so that the user can inspect them all one by one.
2. **Stage 2: Review**. Each individual LLM is given the responses of the other LLMs. Under the hood, the LLM identities are anonymized so that the LLM can't play favorites when judging their outputs. The LLM is asked to rank them in accuracy and insight.
3. **Stage 3: Final response**. The designated Chairman of the LLM Council takes all of the model's responses and compiles them into a single final answer that is presented to the user.

## Vibe Code Alert

This project was 99% vibe coded as a fun Saturday hack because I wanted to explore and evaluate a number of LLMs side by side in the process of [reading books together with LLMs](https://x.com/karpathy/status/1990577951671509438). It's nice and useful to see multiple responses side by side, and also the cross-opinions of all LLMs on each other's outputs. I'm not going to support it in any way, it's provided here as is for other people's inspiration and I don't intend to improve it. Code is ephemeral now and libraries are over, ask your LLM to change it in whatever way you like.

## Setup

### 1. Install Dependencies

The project uses [uv](https://docs.astral.sh/uv/) for project management.

**Backend:**
```bash
uv sync
```

**Frontend:**
```bash
cd frontend
npm install
cd ..
```

### 2. Configure Ollama Mode

The application supports both **local Ollama** and **Ollama Cloud** providers. Choose based on your needs:

#### **For Local Ollama (Free, Private):**
```bash
# Install Ollama from https://ollama.ai/
# Start Ollama service
ollama serve

# Pull required models
ollama pull llama3.2:3b
ollama pull llama3.1:8b

# Configure .env for local usage
echo "OLLAMA_MODE=local" > .env
echo "OLLAMA_API_URL=http://localhost:11434" >> .env
```

#### **For Ollama Cloud (Paid, Fast):**
```bash
# Get API key from https://ollama.ai/
# Configure .env for cloud usage
echo "OLLAMA_MODE=cloud" > .env
echo "OLLAMA_CLOUD_API_URL=https://ollama.com/api/chat" >> .env
echo "OLLAMA_CLOUD_API_KEY=your_api_key_here" >> .env
```

In cloud mode, your model names must exist in Ollama Cloud for your account. If requests return HTTP 404 with "model not found", update `COUNCIL_MODELS` in `.env`.

### 3. Configure Models (Optional)

Set these values in `.env` to customize the council:

```python
COUNCIL_MODELS=llama3.2:3b,llama3.1:8b
CHAIRMAN_MODEL=llama3.2:3b
TITLE_MODEL=llama3.2:3b
```

## Running the Application

**Option 1: Use the start script**
```bash
./start.sh
```

**Option 2: Run manually**

Terminal 1 (Backend):
```bash
uv run python -m backend.main
```

Terminal 2 (Frontend):
```bash
cd frontend
npm run dev
```

Then open http://localhost:5173 in your browser.

## Switching Between Local And Cloud

You can switch between local and cloud Ollama by updating your `.env` file:

**To use Local Ollama:**
```bash
echo "OLLAMA_MODE=local" > .env
echo "OLLAMA_API_URL=http://localhost:11434" >> .env
# Make sure Ollama is running: ollama serve
```

**To use Ollama Cloud:**
```bash
echo "OLLAMA_MODE=cloud" > .env
echo "OLLAMA_CLOUD_API_URL=https://ollama.com/api/chat" >> .env
echo "OLLAMA_CLOUD_API_KEY=your_api_key_here" >> .env
```

Restart the application after changing providers.

## Tech Stack

- **Backend:** FastAPI (Python 3.10+), async httpx, Ollama (local/cloud) APIs
- **Frontend:** React + Vite, react-markdown for rendering
- **Storage:** JSON files in `data/conversations/`
- **Package Management:** uv for Python, npm for JavaScript
# llm-council-v2
