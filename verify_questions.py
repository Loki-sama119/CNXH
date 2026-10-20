"""Fail on invalid answers, duplicate IDs and incorrect lesson numbering."""
import json
import re
from collections import Counter
from pathlib import Path


def validate_questions(questions):
    from import_questions import normal
    errors, ids = [], set()
    counts = Counter()
    for q in questions:
        label = f'{q.get("lesson")} / {q.get("q_num")} ({q.get("id")})'
        def require(test, message):
            if not test:
                errors.append(f'{label}: {message}')
        require(q.get('id') not in ids, 'duplicate ID')
        ids.add(q.get('id'))
        lesson = q.get('lesson_num')
        require(lesson in range(1, 7) and q.get('lesson') == ('Bổ sung' if lesson == 6 else f'Bài {lesson}'), 'invalid lesson')
        counts[lesson] += 1
        require(q.get('q_num') == counts[lesson], 'nonsequential lesson number')
        require(bool(q.get('sources')), 'missing source')
        require(bool(re.match(rf'^Câu\s*{q.get("q_num")}\b', q.get('question', ''))), 'title number mismatch')
        t = q['type']
        if t in ('single_choice', 'multiple_choice'):
            opts, answers = q.get('options', []), q.get('correct_answers', [])
            require(len(opts) >= 2 and all(normal(o) for o in opts), 'empty options')
            require(len(set(normal(o) for o in opts)) == len(opts), 'duplicate options')
            require(bool(answers) and len(answers) == len(set(answers)) and all(type(a) is int and 0 <= a < len(opts) for a in answers), 'invalid correct answer indices')
            require(len(answers) == 1 if t == 'single_choice' else len(answers) >= 2, 'wrong choice type')
            requested = re.search(r'chọn\s+(\d+)\s*(?:đáp|phương)', q['question'], re.I)
            require(not requested or int(requested[1]) == len(answers), 'requested answer count mismatch')
            for variant in q.get('variants', []):
                opts, answers = variant.get('options', []), variant.get('correct_answers', [])
                require(bool(variant.get('question')) and bool(variant.get('sources')), 'variant missing question/source')
                require(len(opts) >= 2 and all(normal(o) for o in opts), 'variant empty options')
                require(bool(answers) and len(answers) == len(set(answers)) and all(type(a) is int and 0 <= a < len(opts) for a in answers), 'variant invalid answer indices')
                require(len(answers) == 1 if variant['type'] == 'single_choice' else len(answers) >= 2, 'variant wrong choice type')
        elif t == 'true_false':
            items = q.get('items', [])
            require(len(items) >= 2 and all(i.get('statement') and type(i.get('correct')) is bool for i in items), 'invalid true/false items')
            require(len(set(normal(i['statement']) for i in items)) == len(items), 'duplicate statements')
        elif t == 'drag_drop_match':
            pairs, pool = q.get('pairs', []), q.get('options_pool', [])
            require(len(pairs) >= 2 and all(p.get('left') and p.get('right') for p in pairs), 'empty pairs')
            require(len(set(normal(p['left']) for p in pairs)) == len(pairs), 'duplicate left pair')
            require(len(pool) == len(set(pool)) and all(p['right'] in pool for p in pairs), 'missing/duplicate pool answer')
        elif t == 'drag_drop_categorize':
            cats, items = q.get('categories', []), q.get('all_items', [])
            require(len(cats) == 2 and len(set(c['title'] for c in cats)) == 2, 'invalid categories')
            require(all(c['title'] and c['items'] for c in cats), 'empty categories')
            require(len(set(i['text'] for i in items)) == len(items), 'duplicate category items')
            require(sorted((s, c['title']) for c in cats for s in c['items']) == sorted((i['text'], i['category']) for i in items), 'category membership mismatch')
        else:
            require(False, 'unknown question type')
    return errors


if __name__ == '__main__':
    root = Path(__file__).resolve().parent
    bank = json.loads((root / 'questions.json').read_text(encoding='utf-8'))
    errors = validate_questions(bank)
    js = (root / 'questions-data.js').read_text(encoding='utf-8').split('window.QUIZ_QUESTIONS = ', 1)[1].strip().removesuffix(';')
    if json.loads(js) != bank:
        errors.append('JSON and offline JS bank differ')
    print('\n'.join(errors) if errors else f'PASS: {len(bank)} questions with distinct IDs, valid answers, numbering and identical offline data')
    raise SystemExit(bool(errors))
