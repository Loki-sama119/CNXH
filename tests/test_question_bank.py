import copy
import json
import sys
import unittest
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from import_questions import ROOT, SOURCE, BANK_VERSION, build_bank
from verify_questions import validate_questions
from audit_word_coverage import audit


class QuestionBankTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bank, cls.report = build_bank()

    def at(self, paragraph):
        return next(q for q in self.bank if q['body_index'] == paragraph)

    def test_current_word_only_and_every_exercise_is_preserved(self):
        self.assertEqual(len(self.bank), 252)
        self.assertEqual(self.report['lesson_counts'], {1:41, 2:45, 3:39, 4:45, 5:39, 6:43})
        self.assertEqual(validate_questions(self.bank), [])
        self.assertTrue(all(s['file'] == SOURCE for q in self.bank for s in q['sources']))
        self.assertTrue(all(q['id'].startswith(BANK_VERSION) for q in self.bank))
        self.assertEqual(len({q['id'] for q in self.bank}), 252)
        self.assertEqual(self.report['reference_only'], 0)

    def test_independent_xml_audit_checks_every_question_and_answer(self):
        report = audit(self.bank)
        self.assertEqual(report['errors'], [])
        self.assertEqual(report['source_exercises'], 252)
        self.assertEqual(report['matched_source_exercises'], 252)
        self.assertEqual(report['source_tables'], 15)

    def test_inline_red_matching_answers_are_blanks_and_extra_choice_survives(self):
        q = self.at(179)
        self.assertEqual(q['type'], 'drag_drop_match')
        self.assertEqual([p['right'] for p in q['pairs']], ['tầng lớp nhân dân', 'giai cấp, tầng lớp', 'tầng lớp trí thức'])
        self.assertIn('Đảng Cộng Sản', q['options_pool'])
        self.assertTrue(all('______' in p['left'] and '______Việt' not in p['left'] for p in q['pairs']))

    def test_user_approved_lesson_1_question_10_uses_b_and_preserves_source(self):
        q = self.at(46)
        self.assertEqual(q['correct_answers'], [1])
        self.assertEqual(q['options'][1], 'B. Trình độ khoa học kỹ thuật chưa cao')
        self.assertEqual(q['answer_correction']['source_correct_answers'], [2])
        self.assertEqual(q['answer_correction']['approved_by'], 'user')
        self.assertEqual(sum('answer_correction' in q for q in self.bank), 1)
        bad = copy.deepcopy(self.bank)
        next(q for q in bad if q['body_index'] == 46)['correct_answers'] = [2]
        self.assertTrue(audit(bad)['errors'])

    def test_word_automatic_option_labels_do_not_drop_choices(self):
        q = self.at(659)
        self.assertEqual(len(q['options']), 4)
        self.assertEqual(q['options'][0], 'A. Giai cấp công nhân')
        self.assertEqual(q['correct_answers'], [0])
        self.assertEqual(len(self.at(765)['options']), 4)

    def test_red_colors_do_not_leak_between_options_in_a_single_paragraph(self):
        for q in self.bank:
            if q['body_index'] == 1009:
                self.assertEqual(q['correct_answers'], [0])
                self.assertEqual(len(q['options']), 4)
        q = self.at(1096)
        self.assertEqual(q['correct_answers'], [1, 3])
        self.assertEqual(q['type'], 'multiple_choice')

    def test_true_false_handles_separate_inline_and_arrow_answers(self):
        self.assertEqual([i['correct'] for i in self.at(156)['items']], [True, True, True, False])
        self.assertEqual([i['correct'] for i in self.at(859)['items']], [True, False, False, True])
        self.assertEqual([i['correct'] for i in self.at(1138)['items']], [False, True, False, True])

    def test_matching_numbered_answer_key_uses_full_left_statement(self):
        q = self.at(1129)
        self.assertEqual(q['pairs'][0], dict(left='Biến đổi về quy mô gia đình', right='A. Gia đình hạt nhân'))
        self.assertEqual(len(q['pairs']), 4)

    def test_categories_follow_columns_and_question_40_includes_women_in_column_one(self):
        q = self.at(175)
        self.assertEqual(q['type'], 'drag_drop_categorize')
        self.assertEqual(len(q['all_items']), 4)
        q = self.at(855)
        self.assertEqual(len(q['all_items']), 8)
        self.assertEqual([len(c['items']) for c in q['categories']], [4, 4])
        self.assertEqual(q['categories'][0]['items'], ['Giai cấp công nhân', 'Giai cấp nông dân', 'Tầng lớp phụ nữ', 'Đảng Cộng sản'])
        self.assertNotIn('unassigned_source_items', q)
        self.assertNotIn('source_warning', q)
        self.assertEqual(q['category_correction']['source_unassigned_items'], ['Tầng lớp phụ nữ'])
        bad = copy.deepcopy(self.bank)
        altered = next(q for q in bad if q['body_index'] == 855)
        next(item for item in altered['all_items'] if item['text'] == 'Tầng lớp phụ nữ')['category'] = altered['categories'][1]['title']
        self.assertTrue(audit(bad)['errors'])

    def test_unheaded_section_and_regular_tests_preserve_source_structure(self):
        self.assertEqual(self.at(1009)['lesson'], 'Bổ sung')
        self.assertEqual(self.at(1129)['lesson'], 'Bổ sung')
        tx = [q for q in self.bank if q.get('is_thuong_xuyen')]
        self.assertEqual(len(tx), 12)
        self.assertEqual(sum(q['test_group'].endswith('1') for q in tx), 5)
        self.assertEqual(sum(q['test_group'].endswith('2') for q in tx), 7)
        self.assertIn('chưa kiểm chứng', self.at(1170)['source_warning'])

    def test_exact_source_text_is_preserved_without_old_repairs(self):
        self.assertIn('troChính sách an sinh xã hộing', self.at(813)['pairs'][0]['left'])
        payload = json.dumps(self.bank, ensure_ascii=False)
        self.assertEqual(payload, unicodedata.normalize('NFC', payload))
        self.assertNotIn('\ufffd', payload)

    def test_rebuild_is_deterministic_and_matches_both_shipped_banks(self):
        self.assertEqual((self.bank, self.report), build_bank())
        self.assertEqual(self.bank, json.loads((ROOT/'questions.json').read_text(encoding='utf8')))
        js = (ROOT/'questions-data.js').read_text(encoding='utf8').split('window.QUIZ_QUESTIONS = ',1)[1].strip().removesuffix(';')
        self.assertEqual(self.bank, json.loads(js))

    def test_audit_rejects_changed_prompt_choice_answer_pair_and_category(self):
        for field in ['question', 'options', 'correct_answers', 'pairs', 'categories', 'items', 'source_content']:
            bank = copy.deepcopy(self.bank)
            q = next(q for q in bank if field in q)
            if field == 'question': q[field] += ' changed'
            elif field == 'options': q[field][0] += ' changed'
            elif field == 'correct_answers': q[field] = [99]
            elif field == 'pairs': q[field][0]['right'] += ' changed'
            elif field == 'categories': q[field][0]['items'][0] += ' changed'
            elif field == 'items': q[field][0]['correct'] = not q[field][0]['correct']
            else: q[field][0]['text'] += ' changed'
            self.assertTrue(audit(bank)['errors'], field)

    def test_validation_rejects_bad_answer_and_duplicate_id(self):
        bad = copy.deepcopy(self.bank)
        bad[0]['correct_answers'] = [99]
        self.assertTrue(any('answer indices' in e for e in validate_questions(bad)))
        bad[1]['id'] = bad[0]['id']
        self.assertTrue(any('duplicate ID' in e for e in validate_questions(bad)))


if __name__ == '__main__':
    unittest.main()
