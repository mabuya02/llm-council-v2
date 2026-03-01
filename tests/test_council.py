"""Tests for backend.council parsing and aggregation helpers."""

import pytest

from backend.council import (
    parse_ranking_from_text,
    calculate_aggregate_rankings,
    _build_chairman_prompt,
    _fallback_title_from_query,
)


# ── parse_ranking_from_text ────────────────────────────────────────────

class TestParseRanking:
    def test_numbered_ranking(self):
        text = (
            "Here is my evaluation...\n\nFINAL RANKING:\n"
            "1. Response C\n2. Response A\n3. Response B\n"
        )
        assert parse_ranking_from_text(text) == [
            "Response C", "Response A", "Response B"
        ]

    def test_plain_ranking(self):
        text = "FINAL RANKING:\nResponse B\nResponse A\n"
        assert parse_ranking_from_text(text) == ["Response B", "Response A"]

    def test_fallback_without_header(self):
        text = "I think Response A is best, followed by Response B."
        assert parse_ranking_from_text(text) == ["Response A", "Response B"]

    def test_empty_text(self):
        assert parse_ranking_from_text("") == []

    def test_no_matches(self):
        assert parse_ranking_from_text("Nothing useful here.") == []

    def test_multiple_final_ranking_sections(self):
        """Only the text after the first FINAL RANKING: header is parsed."""
        text = (
            "FINAL RANKING:\n1. Response A\n2. Response B\n\n"
            "FINAL RANKING:\n1. Response B\n2. Response A\n"
        )
        result = parse_ranking_from_text(text)
        # Should parse everything after the first header split
        assert result[0] == "Response A"


# ── calculate_aggregate_rankings ───────────────────────────────────────

class TestAggregateRankings:
    def _make_results(self, rankings):
        """Helper: rankings is a list of (model, ranking_text) tuples."""
        return [{"model": model, "ranking": text} for model, text in rankings]

    def test_basic_aggregate(self):
        label_to_model = {
            "Response A": "model-1",
            "Response B": "model-2",
        }
        stage2 = self._make_results([
            ("model-1", "FINAL RANKING:\n1. Response B\n2. Response A"),
            ("model-2", "FINAL RANKING:\n1. Response A\n2. Response B"),
        ])
        result = calculate_aggregate_rankings(stage2, label_to_model)
        assert len(result) == 2
        # Both should have average rank 1.5
        for entry in result:
            assert entry["average_rank"] == 1.5

    def test_clear_winner(self):
        label_to_model = {
            "Response A": "model-1",
            "Response B": "model-2",
            "Response C": "model-3",
        }
        stage2 = self._make_results([
            ("model-1", "FINAL RANKING:\n1. Response C\n2. Response A\n3. Response B"),
            ("model-2", "FINAL RANKING:\n1. Response C\n2. Response B\n3. Response A"),
            ("model-3", "FINAL RANKING:\n1. Response C\n2. Response A\n3. Response B"),
        ])
        result = calculate_aggregate_rankings(stage2, label_to_model)
        assert result[0]["model"] == "model-3"
        assert result[0]["average_rank"] == 1.0

    def test_self_ranking_tracked(self):
        label_to_model = {
            "Response A": "model-1",
            "Response B": "model-2",
        }
        stage2 = self._make_results([
            ("model-1", "FINAL RANKING:\n1. Response A\n2. Response B"),
            ("model-2", "FINAL RANKING:\n1. Response A\n2. Response B"),
        ])
        result = calculate_aggregate_rankings(stage2, label_to_model)
        model_1_entry = next(e for e in result if e["model"] == "model-1")
        assert model_1_entry.get("self_rank") == 1  # ranked itself first

    def test_empty_results(self):
        assert calculate_aggregate_rankings([], {}) == []

    def test_unparseable_ranking(self):
        """Models that produce garbage text are gracefully skipped."""
        label_to_model = {"Response A": "model-1"}
        stage2 = self._make_results([
            ("model-1", "I don't know what to say."),
        ])
        result = calculate_aggregate_rankings(stage2, label_to_model)
        assert result == []


# ── _build_chairman_prompt ─────────────────────────────────────────────

class TestBuildChairmanPrompt:
    def test_includes_query_and_responses(self):
        prompt = _build_chairman_prompt(
            user_query="What is AI?",
            stage1_results=[
                {"model": "m1", "response": "AI is intelligence."},
                {"model": "m2", "response": "AI is machine learning."},
            ],
            stage2_results=[
                {"model": "m1", "ranking": "FINAL RANKING:\n1. Response A"},
            ],
        )
        assert "What is AI?" in prompt
        assert "m1" in prompt
        assert "AI is intelligence." in prompt


# ── _fallback_title_from_query ─────────────────────────────────────────

class TestFallbackTitle:
    def test_short_query(self):
        assert _fallback_title_from_query("Hi") == "Hi"

    def test_truncation(self):
        long_query = "alpha beta gamma delta epsilon zeta eta theta"
        title = _fallback_title_from_query(long_query)
        # Only first 5 words, title-cased
        assert title == "Alpha Beta Gamma Delta Epsilon"

    def test_empty(self):
        assert _fallback_title_from_query("") == "New Conversation"
