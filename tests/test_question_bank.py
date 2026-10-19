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
        self.assertEqual(sum(b['source_q_num'] is None for b in blocks), 0)

    def test_independent_word_xml_and_full_contents_are_covered(self):
        report = audit(self.bank)
        self.assertEqual(report['errors'], [])
        self.assertEqual(report['source_exercises'], report['matched_source_exercises'])
        self.assertEqual(report['source_tables'], 25)
        self.assertEqual(report['unnumbered'], [])

    def test_distinct_questions_with_similar_titles_are_both_preserved(self):
        q20 = next(q for q in self.bank if q['lesson_num'] == 1 and q['q_num'] == 20)
        q26 = next(q for q in self.bank if q['lesson_num'] == 1 and q['q_num'] == 26)
        self.assertNotEqual(q20['id'], q26['id'])
        self.assertNotEqual(q20['options'], q26['options'])
        self.assertEqual(len(self.bank), 255)

    def test_rebuild_is_deterministic_and_ids_are_unique(self):
        self.assertEqual((self.bank, self.report), build_bank())
        self.assertEqual(len({q['id'] for q in self.bank}), 255)

    def test_no_duplicates_and_correct_distribution(self):
        self.assertEqual(validate_questions(self.bank), [])
        self.assertEqual(self.report['lesson_counts'], {1: 41, 2: 41, 3: 46, 4: 47, 5: 53, 6: 27})
        self.assertEqual(self.report['total'], 255)
        self.assertEqual(self.report['tx_count'], 12)
        self.assertTrue(all('gia đình' in q['question'].lower() or q['type'] == 'true_false' or 'hôn nhân' in q['question'].lower() or 'Hằng ngày' in q['question'] or 'Quan điểm sau đây' in q['question'] or 'Tình yêu' in q['question'] for q in self.bank if q['lesson_num'] == 6))

    def test_supplement_questions_from_bai6_doc_are_represented(self):
        supp_questions = [q for q in self.bank if any(s['file'] == 'CNKHXH BAI6.docx' for s in q['sources'])]
        self.assertEqual(len(supp_questions), 19)
        self.assertEqual(sum(q['lesson_num'] == 3 for q in supp_questions), 5)
        self.assertEqual(sum(q['lesson_num'] == 4 for q in supp_questions), 2)
        self.assertEqual(sum(q['lesson_num'] == 5 for q in supp_questions), 12)

    def test_tx_questions_are_represented_and_tagged(self):
        tx_questions = [q for q in self.bank if q.get('is_thuong_xuyen')]
        self.assertEqual(len(tx_questions), 12)
        self.assertEqual(sum(q.get('test_group') == 'BÀI KIỂM TRA THƯỜNG XUYÊN 1' for q in tx_questions), 5)
        self.assertEqual(sum(q.get('test_group') == 'BÀI KIỂM TRA THƯỜNG XUYÊN 2' for q in tx_questions), 7)

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
        bad[1]['id'] = bad[0]['id']
        self.assertTrue(any('duplicate ID' in e for e in validate_questions(bad)))


if __name__ == '__main__':
    unittest.main()
