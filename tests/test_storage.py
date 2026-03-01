"""Tests for backend.storage operations."""

import json
import os
import uuid

import pytest

# Override DATA_DIR before importing storage so tests use tmp dir
_TEST_DIR = None


@pytest.fixture(autouse=True)
def _use_tmp_data_dir(tmp_path, monkeypatch):
    """Redirect storage to a temp directory for every test."""
    global _TEST_DIR
    _TEST_DIR = str(tmp_path / "conversations")
    monkeypatch.setattr("backend.storage.DATA_DIR", _TEST_DIR)


from backend.storage import (
    add_assistant_message,
    add_user_message,
    create_conversation,
    delete_conversation,
    get_conversation,
    list_conversations,
    save_conversation,
    update_conversation_title,
)


# ── create & get ───────────────────────────────────────────────────────

class TestCreateAndGet:
    def test_create_returns_conversation(self):
        conv = create_conversation("test-id")
        assert conv["id"] == "test-id"
        assert conv["messages"] == []
        assert "created_at" in conv

    def test_get_returns_created(self):
        create_conversation("abc")
        result = get_conversation("abc")
        assert result is not None
        assert result["id"] == "abc"

    def test_get_missing_returns_none(self):
        assert get_conversation("nonexistent") is None


# ── list ───────────────────────────────────────────────────────────────

class TestList:
    def test_list_empty(self):
        assert list_conversations() == []

    def test_list_multiple(self):
        create_conversation("a")
        create_conversation("b")
        result = list_conversations()
        assert len(result) == 2

    def test_list_skips_corrupt_file(self, tmp_path):
        create_conversation("good")
        # Write a corrupt file
        corrupt_path = os.path.join(_TEST_DIR, "bad.json")
        with open(corrupt_path, "w") as f:
            f.write("{{{invalid json")
        result = list_conversations()
        assert len(result) == 1
        assert result[0]["id"] == "good"


# ── delete ─────────────────────────────────────────────────────────────

class TestDelete:
    def test_delete_existing(self):
        create_conversation("del-me")
        assert delete_conversation("del-me") is True
        assert get_conversation("del-me") is None

    def test_delete_missing(self):
        assert delete_conversation("nope") is False


# ── messages ───────────────────────────────────────────────────────────

class TestMessages:
    def test_add_user_message(self):
        create_conversation("msg-test")
        add_user_message("msg-test", "Hello")
        conv = get_conversation("msg-test")
        assert len(conv["messages"]) == 1
        assert conv["messages"][0]["content"] == "Hello"

    def test_add_assistant_message_with_metadata(self):
        create_conversation("assist-test")
        add_assistant_message(
            "assist-test",
            stage1=[{"model": "m1", "response": "r1"}],
            stage2=[{"model": "m1", "ranking": "r"}],
            stage3={"model": "m1", "response": "final"},
            metadata={"label_to_model": {"Response A": "m1"}},
        )
        conv = get_conversation("assist-test")
        msg = conv["messages"][0]
        assert msg["role"] == "assistant"
        assert msg["metadata"]["label_to_model"]["Response A"] == "m1"

    def test_add_assistant_message_without_metadata(self):
        create_conversation("no-meta")
        add_assistant_message(
            "no-meta",
            stage1=[], stage2=[], stage3={"model": "m", "response": "ok"},
        )
        conv = get_conversation("no-meta")
        assert "metadata" not in conv["messages"][0]


# ── title ──────────────────────────────────────────────────────────────

class TestTitle:
    def test_update_title(self):
        create_conversation("title-test")
        update_conversation_title("title-test", "My Title")
        conv = get_conversation("title-test")
        assert conv["title"] == "My Title"


# ── save_conversation ──────────────────────────────────────────────────

class TestSave:
    def test_overwrite(self):
        conv = create_conversation("save-test")
        conv["title"] = "Overwritten"
        save_conversation(conv)
        loaded = get_conversation("save-test")
        assert loaded["title"] == "Overwritten"
