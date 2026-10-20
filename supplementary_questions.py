"""Add only the nine missing user questions and group existing family exercises."""
import copy
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MANIFEST = json.loads((ROOT / 'supplemental-lesson6.json').read_text(encoding='utf-8'))
MANIFEST_HASH = hashlib.sha256(json.dumps(MANIFEST, ensure_ascii=False, sort_keys=True,
                                        separators=(',', ':')).encode('utf-8')).hexdigest()[:8]


def source_blocks():
    source = (ROOT / MANIFEST['source_file']).read_text(encoding='utf-8')
    if hashlib.sha256(source.encode('utf-8')).hexdigest() != MANIFEST['source_sha256']:
        raise ValueError('Supplementary source differs from the user text')
    parts = re.split(r'(?m)^Câu\s+(\d+)\s*:', source)[1:]
    return {int(parts[i]): parts[i + 1].strip() for i in range(0, len(parts), 2)}


def add_lesson6(bank):
    blocks = source_blocks()
    existing = {int(number): index for number, index in MANIFEST['existing_word_questions'].items()}
    placement = {index: number for number, index in existing.items()}
    placement.update({index: 21 + i for i, index in enumerate(MANIFEST['additional_family_word_questions'])})
    if len(placement) != 14 or set(existing) & set(MANIFEST['added_question_numbers']):
        raise ValueError('Duplicate family question mapping')
    found = set()
    for q in bank:
        index = q['body_index']
        if index in placement:
            if q['lesson_num'] != 6:
                raise ValueError('Family mapping points outside the unheaded source section')
            q.update(lesson_num=6, lesson='Bài 6', q_num=placement[index])
            q['question'] = re.sub(r'^Câu\s*\d+:', f'Câu {q["q_num"]}:', q['question'])
            found.add(index)
        elif q['lesson_num'] == 6:
            q.update(lesson_num=7, lesson='Bổ sung')
    if found != set(placement):
        raise ValueError('Missing existing family exercise')
    for entry in MANIFEST['questions']:
        q = copy.deepcopy(entry)
        number = q['source_q_num']
        if q['source_content'] != blocks[number]:
            raise ValueError(f'Changed user source: lesson 6 question {number}')
        q.update(lesson_num=6, lesson='Bài 6', q_num=number,
                 id=f'user-lesson6-{MANIFEST["source_sha256"][:16]}-q{number}',
                 sources=[dict(file=MANIFEST['source_file'], question_number=number)],
                 source_content=[dict(text=blocks[number])])
        q['question'] = f'Câu {number}: {q["question"]}'
        bank.append(q)
    return bank


def audit_supplement(bank):
    """Compare prompts/options/statements/table cells directly with the pasted source."""
    blocks = source_blocks()
    errors = []
    new = [q for q in bank if any(s['file'] == MANIFEST['source_file'] for s in q['sources'])]
    if sorted(q['source_q_num'] for q in new) != MANIFEST['added_question_numbers']:
        errors.append('Missing, duplicate or extra supplementary question')
    entries = {q['source_q_num']: q for q in MANIFEST['questions']}
    tidy = lambda text: ' '.join(text.split())
    for q in new:
        n = q['source_q_num']
        if n not in entries:
            continue
        expected = entries[n]
        block = blocks[n]
        label = f'User lesson 6 question {n}'
        def check(condition, message):
            if not condition:
                errors.append(f'{label}: {message}')
        check(q['lesson_num'] == 6 and q['lesson'] == 'Bài 6' and q['q_num'] == n, 'wrong lesson/number')
        check(q['source_title'] == f'Câu {n}: ' + block.splitlines()[0].strip(), 'changed source title')
        check(q['source_content'] == [dict(text=block)], 'changed source text')
        check(q['type'] == expected['type'], 'changed type')
        check(q['answer_verification'] == expected['answer_verification'], 'missing verification reference')
        if q['type'] in ('single_choice', 'multiple_choice'):
            parts = re.split(r'(?m)^\s*([A-D])\s*\.\s*', block)
            prompt = tidy(parts[0]).replace('Sinh viên chọn 2 phương án đúng nhất', '(Chọn 2 đáp án đúng)')
            options = [parts[i] + '. ' + tidy(parts[i + 1]) for i in range(1, len(parts), 2)]
            check(q['question'] == f'Câu {n}: {prompt}', 'changed prompt')
            check(q['options'] == options, 'changed/dropped choices')
            check(q['correct_answers'] == expected['correct_answers'], 'changed verified answer')
        elif q['type'] == 'true_false':
            pairs = re.findall(r'(\d+\).*?)\s*\n\s*(Đúng|Sai)\s*(?=\n|$)', block, re.S)
            check(q['question'] == f'Câu {n}: {block.splitlines()[0]}', 'changed prompt')
            check(q['items'] == [dict(statement=tidy(s), correct=a == 'Đúng') for s, a in pairs], 'changed statements/answers')
        elif q['type'] == 'drag_drop_categorize':
            lines = block.splitlines()
            categories = [dict(title=h, items=[]) for h in lines[1].split('\t')]
            for line in lines[2:]:
                for i, text in enumerate(line.split('\t')):
                    categories[i]['items'].append(text.strip())
            check(q['question'] == f'Câu {n}: {lines[0]}', 'changed prompt')
            check(q['categories'] == categories, 'changed column assignments')
            check(q['all_items'] == [dict(text=t, category=c['title']) for c in categories for t in c['items']], 'changed grading assignments')
    family = [q for q in bank if q['lesson_num'] == 6]
    check_numbers = {q['q_num'] for q in family}
    if len(family) != 23 or check_numbers != set(range(1, 24)):
        errors.append('Lesson 6 must contain the 20 supplied exercises and three existing extra exercises')
    for number, index in MANIFEST['existing_word_questions'].items():
        if not any(q.get('body_index') == index and q['q_num'] == int(number) for q in family):
            errors.append(f'Existing Word exercise {index} missing from lesson 6')
    return errors
