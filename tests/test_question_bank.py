import copy
import hashlib
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build_merged_questions import ROOT, MERGED, build_bank, exercise_key, read_blocks
from verify_questions import validate_questions
from audit_word_coverage import audit


class QuestionBankTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bank, cls.report = build_bank()

    def test_every_merged_exercise_is_represented_even_without_a_number(self):
        blocks = read_blocks(ROOT / MERGED)
        actual = {s['body_index'] for q in self.bank for s in q['sources'] if s['file'] == MERGED}
        self.assertEqual(actual, {b['source_index'] for b in blocks})
        self.assertEqual(len(blocks), 233)
        self.assertEqual(sum(b['source_q_num'] is None for b in blocks), 4)

    def test_independent_word_xml_and_full_contents_are_covered(self):
        report = audit(self.bank)
        self.assertEqual(report['errors'], [])
        self.assertEqual(report['source_exercises'], report['matched_source_exercises'])
        self.assertEqual(report['source_tables'], 25)
        self.assertEqual([(r['lesson'], r['web_number']) for r in report['unnumbered']], [(3, 31), (4, 45), (5, 38), (5, 39)])

    def test_word_variants_with_different_options_are_not_discarded(self):
        q = next(q for q in self.bank if q['lesson_num'] == 1 and q['q_num'] == 20)
        self.assertEqual(len(q['variants']), 2)
        self.assertNotEqual(q['variants'][0]['options'], q['variants'][1]['options'])
        bad = copy.deepcopy(self.bank)
        next(q for q in bad if q['lesson_num'] == 1 and q['q_num'] == 20).pop('variants')
        self.assertTrue(audit(bad)['errors'])

    def test_rebuild_is_deterministic_and_ids_ignore_display_numbers(self):
        self.assertEqual((self.bank, self.report), build_bank())
        for q in self.bank:
            self.assertEqual(q['id'], 'q-' + hashlib.sha256(exercise_key(q).encode()).hexdigest()[:16])

    def test_no_duplicates_and_correct_distribution(self):
        self.assertEqual(validate_questions(self.bank), [])
        self.assertEqual(self.report['lesson_counts'], {1: 39, 2: 40, 3: 41, 4: 46, 5: 45, 6: 27})
        self.assertEqual(self.report['tx_count'], 12)
        self.assertTrue(all('gia đình' in q['question'].lower() or q['type'] == 'true_false' or 'hôn nhân' in q['question'].lower() or 'Hằng ngày' in q['question'] or 'Quan điểm sau đây' in q['question'] or 'Tình yêu' in q['question'] for q in self.bank if q['lesson_num'] == 6))

    def test_red_color_does_not_leak_between_options_in_one_paragraph(self):
        q = next(q for q in self.bank if q['lesson_num'] == 5 and q['q_num'] == 20)
        self.assertEqual(q['type'], 'single_choice')
        self.assertEqual(q['correct_answers'], [1])
        self.assertEqual(len(q['options']), 4)

    def test_updated_word_true_false_answer_overrides_old_bank(self):
        q = next(q for q in self.bank if q['lesson_num'] == 6 and q['q_num'] == 25)
        self.assertEqual([it['correct'] for it in q['items']], [False, False, False, True])

    def test_validation_rejects_corrupt_answer_and_duplicate_content(self):
        bad = copy.deepcopy(self.bank)
        bad[0]['correct_answers'] = [99]
        self.assertTrue(any('answer indices' in e for e in validate_questions(bad)))
        bad = copy.deepcopy(self.bank)
        bad.append(copy.deepcopy(bad[0]))
        self.assertTrue(any('duplicate exercise' in e for e in validate_questions(bad)))

    def test_statement_order_does_not_bypass_duplicate_detection(self):
        q = next(q for q in self.bank if q['type'] == 'true_false')
        other = copy.deepcopy(q)
        other['items'].reverse()
        other['q_num'] += 100
        self.assertEqual(exercise_key(q), exercise_key(other))


if __name__ == '__main__':
    unittest.main()
