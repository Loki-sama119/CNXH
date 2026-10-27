import json
import re
import sys
from collections import Counter
from pathlib import Path

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')


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
        require(lesson in range(1, 10) and q.get('lesson') == f'Bài {lesson}', 'invalid lesson')
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
        else:
            require(False, f'unexpected question type: {t}')
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
