"""Rebuild v6 deterministically from Word sources, never from generated JSON."""
import hashlib
import copy
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph

ROOT = Path(__file__).resolve().parent
MERGED = 'GỘP CHỦ NGHĨA XÃ HỘI KHOA HỌC - BÀI 1 2 3 4 5 6.docx'
SUPPLEMENT = 'CNKHXH BAI6.docx'
TX_SOURCE = 'CHỦ NGHĨA XH-KH (1).docx'


def clean(text):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', text)).strip()


def normal(text):
    text = re.sub(r'^(?:Câu\s*\d+\s*[:.]?|[A-F\d]+[.)])\s*', '', clean(text), flags=re.I)
    text = re.sub(r'\(Bài\s*\d+[^)]*\)\s*:', '', text, flags=re.I)
    text = re.sub(r'\(chọn\s+[^)]*\)', '', text, flags=re.I)
    return re.sub(r'[^\w]+', '', text.casefold().replace('_', ''))


def exercise_key(q):
    """Ignore numbering/order and generic titles; compare the actual exercise."""
    if q['type'] in ('single_choice', 'multiple_choice'):
        body = normal(q['question'])
    elif q['type'] == 'true_false':
        body = sorted(normal(it['statement']) for it in q['items'])
    elif q['type'] == 'drag_drop_match':
        body = sorted((normal(p['left']), normal(p['right'])) for p in q['pairs'])
    else:
        body = sorted((normal(it['text']), normal(it['category'])) for it in q['all_items'])
    return json.dumps([q['type'], body], ensure_ascii=False, sort_keys=True)


def answer_key(q):
    if 'correct_answers' in q:
        return sorted(normal(q['options'][i]) for i in q['correct_answers'])
    if q['type'] == 'true_false':
        return sorted((normal(it['statement']), it['correct']) for it in q['items'])
    return exercise_key(q)


def read_blocks(path, tx_only=False):
    doc = Document(path)
    blocks, current = [], None
    lesson, group, enabled = 1, None, not tx_only
    for index, child in enumerate(doc.element.body):
        if child.tag.endswith('}p'):
            p = Paragraph(child, doc)
            text = clean(p.text)
            if not text:
                continue
            if text == 'CÁC CÂU CÒN THIẾU':
                enabled, current = True, None
                continue
            if not enabled:
                continue
            if text.startswith('BÀI KIỂM TRA THƯỜNG XUYÊN'):
                group, current = text, None
                continue
            heading = re.match(r'^BÀI\s+(\d+)\s*$', text, re.I)
            if heading:
                lesson, current = int(heading[1]), None
                continue
            m = re.match(r'^Câu\s*(\d+)?\s*[:.]?\s*(.*)', text, re.I)
            if m:
                title = m[2]
                explicit = re.search(r'\(Bài\s+(\d+)', title, re.I)
                current = dict(lesson_num=int(explicit[1]) if explicit else lesson,
                               source_q_num=int(m[1]) if m[1] else None,
                               question=title, elements=[], source_index=index, test_group=group)
                blocks.append(current)
            elif current:
                current['elements'].append(p)
        elif enabled and current and child.tag.endswith('}tbl'):
            current['elements'].append(Table(child, doc))
    return blocks


def red(run):
    rgb = run.font.color.rgb
    if rgb is None:
        return False
    r, g, b = tuple(rgb)
    return r >= 160 and r > g * 1.5 and r > b * 1.5


def parse_block(block, filename):
    q = {k: block[k] for k in ('lesson_num', 'question')}
    q['sources'] = [dict(file=filename, question_number=block['source_q_num'], body_index=block['source_index'])]
    if block.get('test_group'):
        q.update(is_thuong_xuyen=True, test_group=block['test_group'])
    tables = [x for x in block['elements'] if isinstance(x, Table)]
    paragraphs = [x for x in block['elements'] if isinstance(x, Paragraph)]
    if tables:
        if len(tables) != 1:
            raise ValueError(f'Multiple tables in one exercise: {q}')
        rows = [[clean(c.text) for c in r.cells] for r in tables[0].rows]
        if len(rows) == 2 and any('\n' in c.text for c in tables[0].rows[1].cells):
            q['categories'] = [dict(title=rows[0][i], items=[clean(s) for s in tables[0].rows[1].cells[i].text.splitlines() if clean(s)]) for i in range(2)]
            q.update(type='drag_drop_categorize', instruction='Kéo hoặc chọn từng mục vào đúng cột tương ứng')
            q['all_items'] = [dict(text=s, category=c['title']) for c in q['categories'] for s in c['items']]
        else:
            q['pairs'] = [dict(left=r[0], right=r[1]) for r in rows]
            q.update(type='drag_drop_match', instruction='Kéo hoặc chọn đáp án đúng ghép vào vế tương ứng')
            q['options_pool'] = list(dict.fromkeys(p['right'] for p in q['pairs']))
        return q
    if re.search(r'đúng\s*\)?\s*(?:hoặc|/)\s*sai', q['question'], re.I):
        items, statement = [], None
        for p in paragraphs:
            text = clean(p.text).rstrip(' *')
            if '→' in text:
                statement, answer = text.rsplit('→', 1)
                if clean(answer).casefold() not in ('đúng', 'sai'):
                    raise ValueError(f'Invalid true/false answer: {text}')
                items.append(dict(statement=clean(statement), correct=clean(answer).casefold() == 'đúng'))
                statement = None
            elif text.casefold() in ('đúng', 'sai'):
                if statement is None:
                    raise ValueError(f'Answer without statement: {q}')
                items.append(dict(statement=statement, correct=text.casefold() == 'đúng'))
                statement = None
            else:
                if statement is not None:
                    raise ValueError(f'Missing true/false answer: {q}')
                statement = text
        if statement is not None:
            raise ValueError(f'Missing final true/false answer: {q}')
        q.update(type='true_false', items=items, instruction='Chọn Đúng hoặc Sai cho mỗi phát biểu sau')
        return q
    if any('→' in p.text for p in paragraphs):
        q['pairs'] = [dict(zip(('left', 'right'), map(clean, p.text.split('→', 1)))) for p in paragraphs if '→' in p.text]
        q.update(type='drag_drop_match', options_pool=list(dict.fromkeys(p['right'] for p in q['pairs'])), instruction='Kéo hoặc chọn đáp án đúng ghép vào vế tương ứng')
        return q
    # Preserve exact character-level colors: one run can contain several options.
    text, marks = '', []
    for p in paragraphs:
        for run in p.runs:
            text += run.text
            marks.extend([red(run)] * len(run.text))
        text += '\n'
        marks.append(False)
    matches = list(re.finditer(r'(?:^|\n)\s*([A-F])(?:[.)]\s*|\s+)', text))
    options, correct = [], []
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        raw = re.split(r'\n\s*Đáp án', text[m.end():end], flags=re.I)[0]
        options.append(f'{m[1]}. {clean(raw)}')
        if any(marks[j] and not text[j].isspace() for j in range(m.end(), m.end() + len(raw))):
            correct.append(i)
    explicit = re.search(r'Đáp án(?: đúng)?:\s*([A-F](?:\s*(?:,|và)\s*[A-F])*)', text, re.I)
    if explicit:
        correct = [ord(s.upper()) - 65 for s in re.findall(r'[A-F]', explicit[1], re.I)]
    if not correct or len(options) < 2:
        raise ValueError(f'Cannot parse answers: {filename} / {block["source_q_num"]}: {text}')
    requested = re.search(r'chọn\s+(\d+)\s*(?:đáp|phương)', q['question'], re.I)
    if requested and int(requested[1]) != len(correct):
        raise ValueError(f'Answer count mismatch: {q}')
    q.update(type='multiple_choice' if len(correct) > 1 else 'single_choice', options=options, correct_answers=correct,
             instruction=f'Chọn {len(correct)} đáp án đúng' if len(correct) > 1 else 'Chọn 1 đáp án đúng nhất')
    return q


def repair(q):
    """Explicit restorations of words omitted in Word, without shifting answers."""
    replacements = [
        ('troChính sách an sinh xã hộing', 'trong'), ('các pbiểu', 'các phát biểu'),
        ('Đảng, Việt Nam', 'Đảng, Nhà nước Việt Nam'),
        ('quyền lực , chức năng của được', 'quyền lực nhà nước, chức năng của nhà nước được'),
        ('dân chủ xã hội chủ nghĩa và xã hội chủ nghĩa', 'dân chủ xã hội chủ nghĩa và nhà nước xã hội chủ nghĩa'),
        ('hoạt động của xã hội chủ nghĩa', 'hoạt động của nhà nước xã hội chủ nghĩa'),
        ('còn xã hội chủ nghĩa', 'còn nhà nước xã hội chủ nghĩa'),
        ('của pháp quyền', 'của nhà nước pháp quyền'), ('trong pháp quyền', 'trong nhà nước pháp quyền'),
        ('quyền làm chủ và xã hội', 'quyền làm chủ nhà nước và xã hội'),
        ('Quyền lực là', 'Quyền lực nhà nước là'), ('Quyền lực thống nhất', 'Quyền lực nhà nước thống nhất'),
        ('lãnh đạo theo phương thức', 'lãnh đạo nhà nước theo phương thức'), ('lật đổ của', 'lật đổ nhà nước của'),
        ('các mô hình khác trong lịch sử thì pháp quyền', 'các mô hình nhà nước khác trong lịch sử thì nhà nước pháp quyền'),
        ('ra đời của xã hội chủ nghĩa', 'ra đời của nhà nước xã hội chủ nghĩa'),
        ('Kiểu nào sau đây', 'Kiểu nhà nước nào sau đây'), ('"nửa "', '"nửa nhà nước"'),
        ('Bò qua', 'Bỏ qua'), ('phong kiển', 'phong kiến'), ('Xây dựng nên kinh tế', 'Xây dựng nền kinh tế'),
        ('Tại sao quyền lực ở Việt Nam', 'Tại sao quyền lực nhà nước ở Việt Nam'),
        ('xây dựng pháp quyền xã hội chủ nghĩa', 'xây dựng nhà nước pháp quyền xã hội chủ nghĩa'),
        ('Xây dựng pháp quyền xã hội chủ nghĩa', 'Xây dựng nhà nước pháp quyền xã hội chủ nghĩa'),
        ('thực hiện bằng pháp quyền xã hội chủ nghĩa', 'thực hiện bằng nhà nước pháp quyền xã hội chủ nghĩa'),
        ('các cơ quan của không', 'các cơ quan của nhà nước không'),
        ('một hình thái ,', 'một hình thái nhà nước,'),
        ('sự xuất hiện và phát triển của', 'sự xuất hiện và phát triển của nhà nước'),
        ('trao quyền lực của mình cho trực tiếp bầu ra', 'trao quyền lực của mình cho tổ chức mà nhân dân trực tiếp bầu ra'),
        ('thông qua các thức dân chủ', 'thông qua các hình thức dân chủ'),
        ('Đảng, , mặt trận', 'Đảng, Nhà nước, Mặt trận'),
        ('phủ định sách tron', 'phủ định sạch trơn'), ('cácgiai cấp', 'các giai cấp'),
        ('thời kỳ quả độ', 'thời kỳ quá độ'), ('thể hệ trẻ', 'thế hệ trẻ'),
        ('là gi?', 'là gì?'), ('thanh niện', 'thanh niên'), ('giảm thiếu', 'giảm thiểu'),
        ('đậm đà bán sắc', 'đậm đà bản sắc'), ('của Đáng', 'của Đảng'),
    ]
    def visit(v):
        if isinstance(v, str):
            v = clean(v)
            for a, b in replacements:
                if a == 'sự xuất hiện và phát triển của' and b in v:
                    continue
                v = v.replace(a, b)
            if v.endswith(' của'):
                v += ' Nhà nước'
            if v == 'C. Chế độ dân chủ không phụ thuộc vào':
                v += ' Nhà nước'
            if v.startswith('D. chủ yếu thực hiện'):
                v = v.replace('D. chủ yếu', 'D. Nhà nước chủ yếu', 1)
            if v.startswith('A. xã hội chủ nghĩa và sự ủng hộ'):
                v = 'A. Nhà nước ' + v[3:]
            return v
        if isinstance(v, list):
            return [visit(x) for x in v]
        if isinstance(v, dict):
            return {k: visit(x) for k, x in v.items()}
        return v
    q = visit(q)
    if q['lesson_num'] == 3:
        if q['question'].startswith('pháp quyền'):
            q['question'] = 'Nhà nước ' + q['question']
        if 'Kiểu nhà nước nào' in q['question']:
            q['options'] = [re.sub(r'^([A-D]\. )', r'\1Nhà nước ', o) for o in q['options']]
        if 'nguyên tắc nào sau đây' in q['question']:
            q['options'] = [o.replace('D. quản lý xã hội', 'D. Nhà nước quản lý xã hội') for o in q['options']]
    return q


def build_bank():
    blocks = read_blocks(ROOT / MERGED)
    duplicates, bank, keys = [], [], {}
    def keep_choice_variant(kept, incoming):
        if 'options' not in kept or 'options' not in incoming:
            return
        def signature(q):
            return (normal(q['question']), tuple(map(normal, q['options'])), tuple(q['correct_answers']))
        fields = ('question', 'type', 'options', 'correct_answers', 'instruction', 'sources')
        if signature(kept) != signature(incoming):
            variants = kept.setdefault('variants', [{k: copy.deepcopy(kept[k]) for k in fields}])
            if all(signature(v) != signature(incoming) for v in variants):
                variants.append({k: copy.deepcopy(incoming[k]) for k in fields})
    def add(q):
        key = exercise_key(q)
        if key in keys:
            kept = keys[key]
            same_options = sorted(map(normal, kept.get('options', []))) == sorted(map(normal, q.get('options', [])))
            if answer_key(kept) != answer_key(q) and same_options:
                raise ValueError(f'Conflicting duplicate answers: {kept["sources"]} / {q["sources"]}')
            keep_choice_variant(kept, q)
            kept['sources'].extend(q['sources'])
            if q.get('is_thuong_xuyen'):
                kept.update(is_thuong_xuyen=True, test_group=q['test_group'])
            duplicates.append(q['sources'])
            return kept
        keys[key] = q
        bank.append(q)
        return q
    # Reviewed paraphrases with the same task and correct concept.
    aliases = {(2, 10): (2, 7), (3, 10): (3, 5)}
    locations = {}
    for b in blocks:
        q = repair(parse_block(b, MERGED))
        loc = (b['lesson_num'], b['source_q_num'])
        if loc in aliases:
            target = locations[aliases[loc]]
            keep_choice_variant(target, q)
            target['sources'].extend(q['sources'])
            duplicates.append(q['sources'])
        else:
            locations.setdefault(loc, add(q))
    # BAI6 has mixed topics. Import only distinct supplementary tasks to their actual lessons.
    supplement_lessons = {12: 5, 13: 5, 14: 5, 16: 5, 25: 3, 26: 3, 29: 4}
    for b in read_blocks(ROOT / SUPPLEMENT):
        if b['source_q_num'] in supplement_lessons:
            b['lesson_num'] = supplement_lessons[b['source_q_num']]
            add(repair(parse_block(b, SUPPLEMENT)))
    for b in read_blocks(ROOT / TX_SOURCE, tx_only=True):
        if b['source_q_num'] == 19 and b['lesson_num'] == 4:
            target = next(q for q in bank if q['lesson_num'] == 4 and q['type'] == 'drag_drop_categorize' and q['categories'][0]['title'] == 'Giai cấp/tầng lớp trong cơ cấu xã hội')
            target.update(is_thuong_xuyen=True, test_group=b['test_group'])
            target['sources'].append(dict(file=TX_SOURCE, question_number=19, body_index=b['source_index']))
            continue
        q = repair(parse_block(b, TX_SOURCE))
        # These two TX variants have minor wording changes but identical tasks/answers.
        if b['source_q_num'] == 22 and b['lesson_num'] == 1:
            target = next(x for x in bank if x['lesson_num'] == 1 and 'Giai cấp tư sản, trong quá trình' in x['question'])
        elif b['source_q_num'] == 30 and b['lesson_num'] == 3:
            target = next(x for x in bank if x['lesson_num'] == 3 and 'mối quan hệ giữa dân chủ' in x['question'])
        else:
            target = None
        if target:
            target.update(is_thuong_xuyen=True, test_group=b['test_group'])
            target['sources'].extend(q['sources'])
        else:
            add(q)
    counts = Counter()
    bank.sort(key=lambda q: q['lesson_num'])
    for q in bank:
        lesson = q['lesson_num']
        counts[lesson] += 1
        q.update(id='q-' + hashlib.sha256(exercise_key(q).encode()).hexdigest()[:16], lesson=f'Bài {lesson}', q_num=counts[lesson])
        q['question'] = f'Câu {q["q_num"]}: {q["question"]}'
    return bank, dict(source_exercises=len(blocks), duplicate_groups=duplicates, lesson_counts=dict(counts),
                     type_counts=dict(Counter(q['type'] for q in bank)), total=len(bank),
                     tx_count=sum(bool(q.get('is_thuong_xuyen')) for q in bank))


def main():
    from verify_questions import validate_questions
    bank, report = build_bank()
    errors = validate_questions(bank)
    if errors:
        raise ValueError('\n'.join(errors))
    payload = json.dumps(bank, ensure_ascii=False, indent=2)
    (ROOT / 'questions.json').write_text(payload + '\n', encoding='utf-8')
    legacy = json.loads((ROOT / 'legacy-question-ids.json').read_text(encoding='utf-8')) if (ROOT / 'legacy-question-ids.json').exists() else {}
    (ROOT / 'questions-data.js').write_text('window.QUIZ_BANK_VERSION = "v6-20261019-word-audit";\nwindow.QUIZ_LEGACY_IDS = ' + json.dumps(legacy) + ';\nwindow.QUIZ_QUESTIONS = ' + payload + ';\n', encoding='utf-8')
    (ROOT / 'question-build-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
