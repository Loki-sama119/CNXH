import copy
import sys
import unittest
from pathlib import Path

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from import_questions import ROOT, SOURCE, BANK_VERSION, build_bank
from verify_questions import validate_questions
from audit_word_coverage import audit


class QuestionBankTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bank, cls.report = build_bank()

    def test_question_bank_total_and_lessons(self):
        self.assertEqual(len(self.bank), 276)
        self.assertEqual(
            self.report['lesson_counts'],
            {1: 31, 2: 34, 3: 30, 4: 33, 5: 30, 6: 30, 7: 35, 8: 32, 9: 21}
        )
        self.assertEqual(validate_questions(self.bank), [])
        self.assertEqual(len({q['id'] for q in self.bank}), 276)
        self.assertTrue(all(q['id'].startswith(BANK_VERSION) for q in self.bank))

    def test_independent_xml_audit_verifies_all_exercises(self):
        report = audit(self.bank)
        self.assertEqual(report['errors'], [])
        self.assertEqual(report['source_exercises'], 276)
        self.assertEqual(report['matched_source_exercises'], 276)
        self.assertEqual(report['source_tables'], 0)

    def test_every_question_is_single_choice_with_four_options(self):
        for q in self.bank:
            self.assertEqual(q['type'], 'single_choice')
            self.assertEqual(len(q['options']), 4)
            self.assertEqual(len(q['correct_answers']), 1)
            self.assertIn(q['correct_answers'][0], [0, 1, 2, 3])

    def test_audit_catches_tampered_option_or_answer(self):
        bank = copy.deepcopy(self.bank)
        # Flip correct answer of first question
        bank[0]['correct_answers'] = [2 if bank[0]['correct_answers'] == [1] else 1]
        report = audit(bank)
        self.assertTrue(len(report['errors']) > 0)


if __name__ == '__main__':
    unittest.main()
