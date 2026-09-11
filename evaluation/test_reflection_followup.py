#!/usr/bin/env python3
"""Regression tests for the weekly uncertainty follow-up."""

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


class ReflectionFollowupTest(unittest.TestCase):
    def test_multiple_matches_do_not_anchor_the_question_to_one_concept(self):
        llm = Mock()
        with patch.object(reflections, "_llm", llm):
            question = reflections.followup_question(
                "I learned about actors, use cases, and system boundaries.",
                ["Actor Identification", "Use Cases", "System Boundaries"],
            )

        self.assertIn("ideas you recalled", question)
        self.assertIn("anything else from this week", question)
        self.assertNotIn("Actor Identification", question)
        llm.invoke.assert_not_called()

    def test_no_match_uses_a_week_wide_question(self):
        question = reflections.followup_question("I am not sure what I learned.", [])

        self.assertIn("this week's material", question)
        self.assertIn("which part is unclear", question)


if __name__ == "__main__":
    unittest.main(verbosity=2)
