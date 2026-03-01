"""JSON-based storage for conversations with file-level locking."""

import fcntl
import json
import logging
import os
import re
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from .config import DATA_DIR

logger = logging.getLogger(__name__)

_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def _session_data_dir(session_id: str | None = None) -> str:
    """Return the data directory, scoped to session when provided."""
    if session_id and _UUID_RE.match(session_id):
        return os.path.join(DATA_DIR, session_id)
    return DATA_DIR


def ensure_data_dir(session_id: str | None = None):
    """Ensure the data directory exists."""
    Path(_session_data_dir(session_id)).mkdir(parents=True, exist_ok=True)


def get_conversation_path(conversation_id: str, session_id: str | None = None) -> str:
    """Get the file path for a conversation."""
    return os.path.join(_session_data_dir(session_id), f"{conversation_id}.json")


@contextmanager
def _locked_read(path: str):
    """Context manager: open file with a shared (read) lock."""
    with open(path, "r") as fh:
        fcntl.flock(fh, fcntl.LOCK_SH)
        try:
            yield fh
        finally:
            fcntl.flock(fh, fcntl.LOCK_UN)


@contextmanager
def _locked_write(path: str):
    """Context manager: open file with an exclusive (write) lock."""
    try:
        fh = open(path, "r+")
    except FileNotFoundError:
        fh = open(path, "w")
    fcntl.flock(fh, fcntl.LOCK_EX)
    try:
        yield fh
    finally:
        fcntl.flock(fh, fcntl.LOCK_UN)
        fh.close()


def _write_json(fh, data: Dict[str, Any]):
    """Truncate file and write JSON data."""
    fh.seek(0)
    fh.truncate()
    json.dump(data, fh, indent=2)
    fh.flush()


def create_conversation(conversation_id: str, session_id: str | None = None) -> Dict[str, Any]:
    """Create a new conversation."""
    ensure_data_dir(session_id)

    conversation = {
        "id": conversation_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "title": "New Conversation",
        "messages": [],
    }

    path = get_conversation_path(conversation_id, session_id)
    with _locked_write(path) as fh:
        _write_json(fh, conversation)

    logger.debug("Created conversation %s", conversation_id)
    return conversation


def get_conversation(conversation_id: str, session_id: str | None = None) -> Optional[Dict[str, Any]]:
    """Load a conversation from storage."""
    path = get_conversation_path(conversation_id, session_id)

    if not os.path.exists(path):
        return None

    with _locked_read(path) as fh:
        return json.load(fh)


def save_conversation(conversation: Dict[str, Any], session_id: str | None = None):
    """Save a conversation to storage (locked)."""
    ensure_data_dir(session_id)

    path = get_conversation_path(conversation["id"], session_id)
    with _locked_write(path) as fh:
        _write_json(fh, conversation)


def list_conversations(session_id: str | None = None) -> List[Dict[str, Any]]:
    """List all conversations (metadata only)."""
    data_dir = _session_data_dir(session_id)
    ensure_data_dir(session_id)

    conversations = []
    for filename in os.listdir(data_dir):
        if not filename.endswith(".json"):
            continue
        path = os.path.join(data_dir, filename)
        try:
            with _locked_read(path) as fh:
                data = json.load(fh)
            conversations.append(
                {
                    "id": data["id"],
                    "created_at": data["created_at"],
                    "title": data.get("title", "New Conversation"),
                    "message_count": len(data["messages"]),
                }
            )
        except (json.JSONDecodeError, KeyError) as exc:
            logger.warning("Skipping corrupt conversation file %s: %s", filename, exc)

    conversations.sort(key=lambda x: x["created_at"], reverse=True)
    return conversations


def delete_conversation(conversation_id: str, session_id: str | None = None) -> bool:
    """Delete a conversation. Returns True if deleted, False if not found."""
    path = get_conversation_path(conversation_id, session_id)
    if not os.path.exists(path):
        return False
    try:
        os.remove(path)
        logger.info("Deleted conversation %s", conversation_id)
        return True
    except OSError as exc:
        logger.error("Failed to delete conversation %s: %s", conversation_id, exc)
        return False


def add_user_message(conversation_id: str, content: str, session_id: str | None = None):
    """Add a user message to a conversation (locked read-modify-write)."""
    path = get_conversation_path(conversation_id, session_id)

    with _locked_write(path) as fh:
        fh.seek(0)
        conversation = json.load(fh)
        conversation["messages"].append({"role": "user", "content": content})
        _write_json(fh, conversation)


def add_assistant_message(
    conversation_id: str,
    stage1: List[Dict[str, Any]],
    stage2: List[Dict[str, Any]],
    stage3: Dict[str, Any],
    metadata: Optional[Dict[str, Any]] = None,
    session_id: str | None = None,
):
    """Add an assistant message with all 3 stages + metadata to a conversation."""
    path = get_conversation_path(conversation_id, session_id)

    with _locked_write(path) as fh:
        fh.seek(0)
        conversation = json.load(fh)

        message: Dict[str, Any] = {
            "role": "assistant",
            "stage1": stage1,
            "stage2": stage2,
            "stage3": stage3,
        }
        if metadata:
            message["metadata"] = metadata

        conversation["messages"].append(message)
        _write_json(fh, conversation)


def update_conversation_title(conversation_id: str, title: str, session_id: str | None = None):
    """Update the title of a conversation (locked read-modify-write)."""
    path = get_conversation_path(conversation_id, session_id)

    with _locked_write(path) as fh:
        fh.seek(0)
        conversation = json.load(fh)
        conversation["title"] = title
        _write_json(fh, conversation)
