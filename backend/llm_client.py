"""Ollama API client supporting both local and cloud deployments."""

import asyncio
import json
import logging

import httpx
from typing import List, Dict, Any, Optional, AsyncGenerator, Tuple

from .config import (
    OLLAMA_MODE,
    OLLAMA_LOCAL_CHAT_URL,
    OLLAMA_LOCAL_GENERATE_URL,
    OLLAMA_CLOUD_API_URL,
    OLLAMA_CLOUD_API_KEY,
    MODEL_QUERY_MAX_RETRIES,
)

logger = logging.getLogger(__name__)

CLOUD_NATIVE_CHAT_URL = "https://ollama.com/api/chat"
CLOUD_OPENAI_CHAT_COMPLETIONS_URL = "https://api.ollama.ai/v1/chat/completions"

# Limit concurrent cloud requests to avoid 429 rate-limit errors.
_CLOUD_CONCURRENCY = 2
_cloud_semaphore = asyncio.Semaphore(_CLOUD_CONCURRENCY)


class RateLimitError(Exception):
    """Raised on HTTP 429 so the retry loop can back off."""
    pass


def _cloud_endpoint_candidates(configured_url: str) -> List[str]:
    """Try configured URL first, then known Ollama cloud alternative if needed."""
    normalized = (configured_url or CLOUD_NATIVE_CHAT_URL).strip().rstrip("/")
    candidates = [normalized]
    alternates = {
        CLOUD_NATIVE_CHAT_URL: CLOUD_OPENAI_CHAT_COMPLETIONS_URL,
        CLOUD_OPENAI_CHAT_COMPLETIONS_URL: CLOUD_NATIVE_CHAT_URL,
    }
    alternate = alternates.get(normalized)
    if alternate and alternate not in candidates:
        candidates.append(alternate)
    return candidates


def _extract_error_detail(response: httpx.Response) -> str:
    """Extract concise error detail from API response body."""
    try:
        payload = response.json()
        if isinstance(payload, dict):
            for key in ("error", "message", "detail"):
                value = payload.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
            return str(payload)
        return str(payload)
    except Exception:
        text = response.text.strip()
        return text[:300]


def _is_model_not_found(status_code: int, detail: str) -> bool:
    detail_lower = (detail or "").lower()
    return status_code == 404 and "model" in detail_lower and "not found" in detail_lower


async def query_model(
    model: str,
    messages: List[Dict[str, str]],
    timeout: float = 120.0,
    _retries: int = MODEL_QUERY_MAX_RETRIES,
) -> Optional[Dict[str, Any]]:
    """
    Query a single model via Ollama API with retry.

    Args:
        model: Ollama model name (e.g., "llama3.2", "mistral")
        messages: List of message dicts with 'role' and 'content'
        timeout: Request timeout in seconds
        _retries: Number of retries on transient failure

    Returns:
        Response dict with 'content' and optional metadata, or None if failed
    """
    # Use more retries for cloud to handle 429 rate-limiting
    effective_retries = max(_retries, 4) if OLLAMA_MODE == "cloud" else _retries
    last_err: Optional[Exception] = None
    for attempt in range(effective_retries + 1):
        try:
            if OLLAMA_MODE == "cloud":
                async with _cloud_semaphore:
                    result = await _query_ollama_cloud(model, messages, timeout)
            else:
                result = await _query_ollama_local(model, messages, timeout)
            if result is not None:
                return result
        except RateLimitError as exc:
            last_err = exc
            backoff = 2.0 * (attempt + 1)  # 2s, 4s, 6s, 8s …
            logger.info(
                "Rate-limited (429) for %s, retry %d/%d in %.1fs",
                model, attempt + 1, effective_retries, backoff,
            )
            if attempt < effective_retries:
                await asyncio.sleep(backoff)
                continue
        except Exception as exc:
            last_err = exc
            logger.warning(
                "Attempt %d/%d for model %s failed: %s",
                attempt + 1, effective_retries + 1, model, exc,
            )
        if attempt < effective_retries:
            await asyncio.sleep(1.5 * (attempt + 1))  # linear backoff

    if last_err:
        logger.error("All %d attempts for model %s exhausted.", effective_retries + 1, model)
    return None


async def _query_ollama_cloud(
    model: str,
    messages: List[Dict[str, str]],
    timeout: float = 120.0
) -> Optional[Dict[str, Any]]:
    """Query Ollama Cloud API (native /api/chat endpoint)."""
    if not OLLAMA_CLOUD_API_KEY:
        logger.error("OLLAMA_CLOUD_API_KEY not configured for cloud mode")
        return None

    headers = {
        "Authorization": f"Bearer {OLLAMA_CLOUD_API_KEY}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
    }

    endpoint_candidates = _cloud_endpoint_candidates(OLLAMA_CLOUD_API_URL)
    errors: List[Dict[str, Any]] = []

    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            for endpoint in endpoint_candidates:
                try:
                    response = await client.post(
                        endpoint,
                        headers=headers,
                        json=payload
                    )
                    response.raise_for_status()

                    data = response.json()
                    choices = data.get("choices", [])
                    if choices and isinstance(choices, list):
                        message = choices[0].get("message", {})
                    else:
                        message = data.get("message", {})

                    return {
                        "content": message.get("content", ""),
                        "reasoning_details": message.get("reasoning_details")
                    }
                except httpx.HTTPStatusError as e:
                    status_code = e.response.status_code
                    detail = _extract_error_detail(e.response)
                    errors.append(
                        {
                            "endpoint": endpoint,
                            "status_code": status_code,
                            "detail": detail,
                        }
                    )

                    # Raise on 429 so the outer retry loop can back off.
                    if status_code == 429:
                        raise RateLimitError(f"429 rate-limited for {model}: {detail}")

                    # If the model is not in cloud catalog, trying another endpoint won't help.
                    if _is_model_not_found(status_code, detail):
                        break

                    # Only fail over to alternate endpoint on 404 route-style failures.
                    if status_code == 404 and endpoint != endpoint_candidates[-1]:
                        continue
                    break

        if errors:
            model_not_found = next(
                (
                    err for err in errors
                    if _is_model_not_found(err["status_code"], err["detail"])
                ),
                None
            )
            if model_not_found:
                logger.error(
                    "Cloud model %s not found: %s. Use a cloud-available model name.",
                    model, model_not_found["detail"],
                )
                return None

            latest = errors[-1]
            status = latest.get("status_code")
            detail = latest.get("detail") or "No response body"
            attempted_endpoints = ", ".join(err["endpoint"] for err in errors)
            logger.error(
                "Cloud model %s query failed: HTTP %s from %s. Detail: %s",
                model, status, attempted_endpoints, detail,
            )
            return None

    except Exception as e:
        logger.error(
            "Cloud model %s query failed: %s (endpoint: %s)",
            model, e, OLLAMA_CLOUD_API_URL,
        )
        return None


def _messages_to_prompt(messages: List[Dict[str, str]]) -> str:
    """Convert role-based chat messages to a single prompt for /api/generate fallback."""
    if not messages:
        return "Hello"

    prompt_parts = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "system":
            prompt_parts.insert(0, f"System: {content}")
        elif role == "assistant":
            prompt_parts.append(f"Assistant: {content}")
        else:
            prompt_parts.append(f"User: {content}")
    return "\n\n".join(prompt_parts)


async def _query_ollama_local_generate(
    model: str,
    messages: List[Dict[str, str]],
    timeout: float = 120.0
) -> Optional[Dict[str, Any]]:
    """Query local Ollama /api/generate endpoint (fallback path)."""
    payload = {
        "model": model,
        "prompt": _messages_to_prompt(messages),
        "stream": False,
    }

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                OLLAMA_LOCAL_GENERATE_URL,
                headers={"Content-Type": "application/json"},
                json=payload
            )
            response.raise_for_status()
            data = response.json()

            return {
                "content": data.get("response", ""),
                "done": data.get("done", False),
            }
    except Exception as e:
        logger.error("Local Ollama generate model %s error: %s", model, e)
        return None


async def _query_ollama_local(
    model: str,
    messages: List[Dict[str, str]],
    timeout: float = 120.0
) -> Optional[Dict[str, Any]]:
    """Query local Ollama API."""
    headers = {"Content-Type": "application/json"}

    # Prefer /api/chat for better multi-turn behavior.
    # Fall back to /api/generate for older Ollama installs that do not expose chat.
    payload = {
        "model": model,
        "messages": messages or [{"role": "user", "content": "Hello"}],
        "stream": False,
    }

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                OLLAMA_LOCAL_CHAT_URL,
                headers=headers,
                json=payload
            )

            if response.status_code == 404:
                return await _query_ollama_local_generate(model, messages, timeout)

            response.raise_for_status()
            data = response.json()
            message = data.get("message", {})

            return {
                "content": message.get("content", ""),
                "done": data.get("done", False),
            }

    except httpx.HTTPStatusError as e:
        logger.error("Local Ollama chat model %s HTTP error: %s", model, e)
        return None
    except Exception as e:
        logger.error("Local Ollama chat model %s error: %s", model, e)
        return None


async def query_models_parallel(
    models: List[str],
    messages: List[Dict[str, str]]
) -> Dict[str, Optional[Dict[str, Any]]]:
    """
    Query multiple models in parallel.

    Args:
        models: List of model names
        messages: List of message dicts to send to each model

    Returns:
        Dict mapping model name to response dict (or None if failed)
    """
    tasks = [query_model(model, messages) for model in models]
    responses = await asyncio.gather(*tasks)
    return {model: response for model, response in zip(models, responses)}


# ---------------------------------------------------------------------------
# Streaming helpers – yield content tokens from Ollama streaming responses.
# ---------------------------------------------------------------------------

async def query_model_stream(
    model: str,
    messages: List[Dict[str, str]],
    timeout: float = 180.0,
) -> AsyncGenerator[str, None]:
    """Yield content token strings from a streaming Ollama response."""
    if OLLAMA_MODE == "cloud":
        async for token in _query_ollama_cloud_stream(model, messages, timeout):
            yield token
    else:
        async for token in _query_ollama_local_stream(model, messages, timeout):
            yield token


async def _query_ollama_local_stream(
    model: str,
    messages: List[Dict[str, str]],
    timeout: float = 180.0,
) -> AsyncGenerator[str, None]:
    """Stream tokens from local Ollama /api/chat endpoint."""
    payload = {
        "model": model,
        "messages": messages or [{"role": "user", "content": "Hello"}],
        "stream": True,
    }
    headers = {"Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream(
                "POST", OLLAMA_LOCAL_CHAT_URL, json=payload, headers=headers
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    content = data.get("message", {}).get("content", "")
                    if content:
                        yield content
                    if data.get("done"):
                        break
    except Exception as e:
        logger.error("Error streaming local Ollama model %s: %s", model, e)


async def _query_ollama_cloud_stream(
    model: str,
    messages: List[Dict[str, str]],
    timeout: float = 180.0,
) -> AsyncGenerator[str, None]:
    """Stream tokens from Ollama Cloud API."""
    if not OLLAMA_CLOUD_API_KEY:
        logger.error("OLLAMA_CLOUD_API_KEY not configured for cloud streaming")
        return

    headers = {
        "Authorization": f"Bearer {OLLAMA_CLOUD_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
    }

    endpoint_candidates = _cloud_endpoint_candidates(OLLAMA_CLOUD_API_URL)

    for endpoint in endpoint_candidates:
        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                async with client.stream(
                    "POST", endpoint, json=payload, headers=headers
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            data = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        # Handle both OpenAI and native Ollama response format
                        choices = data.get("choices", [])
                        if choices and isinstance(choices, list):
                            delta = choices[0].get("delta", {})
                            content = delta.get("content", "")
                        else:
                            content = data.get("message", {}).get("content", "")
                        if content:
                            yield content
                        if data.get("done"):
                            break
                    # Success – don't try other endpoints
                    return
        except httpx.HTTPStatusError as e:
            detail = _extract_error_detail(e.response)
            if e.response.status_code == 429:
                raise RateLimitError(f"429 rate-limited streaming {model}: {detail}")
            if _is_model_not_found(e.response.status_code, detail):
                logger.error("Cloud stream model %s not found: %s", model, detail)
                return
            if e.response.status_code == 404 and endpoint != endpoint_candidates[-1]:
                continue
            logger.error("Cloud stream model %s HTTP %s: %s", model, e.response.status_code, detail)
            return
        except RateLimitError:
            raise  # propagate to caller for retry
        except Exception as e:
            logger.error("Cloud stream model %s error: %s", model, e)
            return


# ---------------------------------------------------------------------------
# Parallel streaming – stream tokens from multiple models concurrently.
# ---------------------------------------------------------------------------

async def query_models_parallel_stream(
    models: List[str],
    messages: List[Dict[str, str]],
    timeout: float = 180.0,
) -> AsyncGenerator[Tuple[str, str, bool], None]:
    """
    Stream tokens from multiple models concurrently.

    Yields ``(model_name, text, is_done)`` tuples.
    * ``is_done=False`` → ``text`` is a single token fragment.
    * ``is_done=True``  → ``text`` is the full accumulated response for
      that model (all tokens concatenated).  After every model has emitted
      an ``is_done=True`` tuple the generator finishes.
    """
    queue: asyncio.Queue[Tuple[str, str, bool]] = asyncio.Queue()

    async def _run_model(model: str) -> None:
        accumulated = ""
        max_attempts = 5 if OLLAMA_MODE == "cloud" else 2
        for attempt in range(max_attempts):
            try:
                if OLLAMA_MODE == "cloud":
                    async with _cloud_semaphore:
                        async for token in _query_ollama_cloud_stream(model, messages, timeout):
                            accumulated += token
                            await queue.put((model, token, False))
                else:
                    async for token in _query_ollama_local_stream(model, messages, timeout):
                        accumulated += token
                        await queue.put((model, token, False))
                # Finished successfully
                await queue.put((model, accumulated, True))
                return
            except RateLimitError:
                backoff = 2.0 * (attempt + 1)
                logger.info(
                    "Rate-limited streaming %s, retry %d/%d in %.1fs",
                    model, attempt + 1, max_attempts, backoff,
                )
                # Reset accumulated – the retry will re-stream from scratch
                accumulated = ""
                if attempt < max_attempts - 1:
                    await asyncio.sleep(backoff)
                    continue
            except Exception as exc:
                logger.error("Parallel stream model %s failed: %s", model, exc)
                break

        # Failed / exhausted retries – still signal done
        await queue.put((model, accumulated, True))

    tasks = [asyncio.create_task(_run_model(m)) for m in models]
    done_count = 0
    total = len(models)

    try:
        while done_count < total:
            item = await queue.get()
            yield item
            if item[2]:  # is_done
                done_count += 1
    finally:
        for t in tasks:
            if not t.done():
                t.cancel()
