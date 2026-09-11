#!/usr/bin/env python3
"""Regression tests for deterministic reflection input validation."""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

os.environ.setdefault("OPENAI_API_KEY", "test-key")

import reflections  # noqa: E402


class ReflectionInputValidationTest(unittest.TestCase):
    concepts = [
        "Systems Development Life Cycle (SDLC)",
        "Use Cases",
        "需求分析",
    ]

    def test_obvious_noise_is_rejected_without_calling_the_model(self):
        for text in ["", "   ", "aa", "???", "zzzzzz", "I forgot", "不知道"]:
            with self.subTest(text=text):
                llm = Mock()
                with (
                    patch.object(
                        reflections.db,
                        "get_concepts_for_week",
                        return_value=self.concepts,
                    ),
                    patch.object(reflections, "_llm", llm),
                ):
                    self.assertEqual(
                        reflections.classify_recall("course", 1, text),
                        ([], [], []),
                    )
                    llm.invoke.assert_not_called()

    def test_short_confirmed_concepts_still_reach_semantic_classification(self):
        cases = [
            ("SDLC", 1),
            ("Use Cases", 2),
            ("需求分析", 3),
        ]

        for text, matched_index in cases:
            with self.subTest(text=text):
                llm = Mock()
                llm.invoke.return_value = Mock(
                    content=(
                        '{"matched": [%d], "unmatched": [], "shaky": []}'
                        % matched_index
                    )
                )
                with (
                    patch.object(
                        reflections.db,
                        "get_concepts_for_week",
                        return_value=self.concepts,
                    ),
                    patch.object(reflections, "_llm", llm),
                ):
                    matched, unmatched, shaky = reflections.classify_recall("course", 1, text)
                    self.assertEqual(matched, [self.concepts[matched_index - 1]])
                    self.assertEqual(unmatched, [])
                    self.assertEqual(shaky, [])
                    llm.invoke.assert_called_once()


if __name__ == "__main__":
    unittest.main(verbosity=2)
