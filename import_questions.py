"""Build from the current Word document and explicitly approved answer corrections."""
import hashlib
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path
from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph

ROOT = Path(__file__).resolve().parent
SOURCE = 'CHỦ NGHĨA XH-KH (2).docx'
SOURCE_SHA256 = hashlib.sha256((ROOT / SOURCE).read_bytes()).hexdigest()
BANK_VERSION = 'word-' + SOURCE_SHA256[:16]
CORRECTIONS_PATH = ROOT / 'answer-corrections.json'
CORRECTIONS = json.loads(CORRECTIONS_PATH.read_text(encoding='utf-8'))
CORRECTIONS_DATA = json.dumps(CORRECTIONS, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
DATA_VERSION = BANK_VERSION + '-answers-' + hashlib.sha256(CORRECTIONS_DATA).hexdigest()[:8]


def clean(text):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', text)).strip()


def normal(text):
    return re.sub(r'[^\w]+', '', clean(text).casefold())


def read_blocks(path):
    doc = Document(path)
    blocks, current = [], None
    lesson, group, previous = 0, None, 0
    for index, child in enumerate(doc.element.body):
        if child.tag.endswith('}p'):
            p = Paragraph(child, doc)
            text = clean(p.text)
            if not text:
                continue
            heading = re.fullmatch(r'BÀI\s+(\d+)', text, re.I)
            if heading:
                lesson, current, previous = int(heading[1]), None, 0
                continue
            if text == 'CÁC CÂU CÒN THIẾU':
                current = None
                continue
            if text.startswith('BÀI KIỂM TRA THƯỜNG XUYÊN'):
                group, current = text, None
                continue
            m = re.match(r'^Câu\s*(\d+)\s*(.*)', text, re.I)
            if m:
                number = int(m[1])
                # A new mixed-topic section restarts at 1 without a heading.
                if lesson == 5 and number == 1 and previous > 1 and not group:
                    lesson = 6  # Internal filter key only; displayed as Bổ sung.
                explicit = re.search(r'\(Bài\s+(\d+)', m[2], re.I)
                title = m[2].lstrip(' :.').strip()
                if explicit:
                    title = re.sub(r'^\(Bài[^)]*\)\s*:\s*', '', title)
                current = dict(lesson_num=int(explicit[1]) if explicit else lesson,
                               source_q_num=number, source_title=text, question=title,
                               elements=[], source_index=index, test_group=group)
                blocks.append(current)
                previous = number
            elif current is not None:
                current['elements'].append(p)
            else:
                raise ValueError(f'Unassigned paragraph {index}: {text}')
        elif child.tag.endswith('}tbl'):
            if current is None:
                raise ValueError(f'Unassigned table {index}')
            current['elements'].append(Table(child, doc))
    return blocks


def red(run):
    rgb = run.font.color.rgb
    if rgb is None:
        return False
    r, g, b = tuple(rgb)
    return r >= 160 and r > g * 1.5 and r > b * 1.5


def categorize(q, categories):
    q.update(type='drag_drop_categorize', categories=categories,
             instruction='Kéo hoặc chọn từng mục vào đúng cột tương ứng')
    q['all_items'] = [dict(text=s, category=c['title']) for c in categories for s in c['items']]
    return q


def matching(q, pairs):
    q.update(type='drag_drop_match', pairs=pairs,
             options_pool=list(dict.fromkeys(p['right'] for p in pairs)),
             instruction='Kéo hoặc chọn đáp án đúng ghép vào vế tương ứng')
    return q


def parse_block(block):
    q = {k: block[k] for k in ('lesson_num', 'question', 'source_q_num', 'source_title')}
    q['sources'] = [dict(file=SOURCE, question_number=block['source_q_num'], body_index=block['source_index'])]
    q['source_content'] = [dict(text=clean(el.text)) if isinstance(el, Paragraph) else
                           dict(table=[[clean(c.text) for c in row.cells] for row in el.rows])
                           for el in block['elements']]
    if block.get('test_group'):
        q.update(is_thuong_xuyen=True, test_group=block['test_group'])
    tables = [x for x in block['elements'] if isinstance(x, Table)]
    paragraphs = [x for x in block['elements'] if isinstance(x, Paragraph)]
    texts = [clean(p.text) for p in paragraphs]
    notes = [t for t in texts if t.startswith('Đáp án')]
    if any('chưa kiểm chứng' in t for t in notes):
        q['source_warning'] = 'Tài liệu ghi: ' + next(t for t in notes if 'chưa kiểm chứng' in t)
    if tables:
        if len(tables) != 1:
            raise ValueError(f'Multiple tables: {block["source_index"]}')
        rows = [[clean(c.text) for c in row.cells] for row in tables[0].rows]
        if 'cột tương ứng' in q['question'].lower():
            cats = [dict(title=rows[0][i], items=[]) for i in range(2)]
            for row in tables[0].rows[1:]:
                for i, cell in enumerate(row.cells):
                    cats[i]['items'].extend(clean(s) for s in cell.text.splitlines() if clean(s))
            if texts:
                q['unassigned_source_items'] = texts
                q['source_warning'] = 'Mục “' + '”; “'.join(texts) + '” nằm ngoài bảng trong tài liệu, chưa xác định cột; chỉ chấm các mục trong bảng.'
            return categorize(q, cats)
        return matching(q, [dict(left=r[0], right=r[1]) for r in rows])
    if re.search(r'đúng\s*\)?\s*(?:hoặc|/)\s*sai', q['question'], re.I):
        items, pending = [], None
        for text in texts:
            if text.lower().startswith('đáp án'):
                continue
            m = re.fullmatch(r'(.*?)\s*(?:→\s*|\s)(Đúng|Sai)\s*\**', text, re.I)
            if text.casefold() in ('đúng', 'sai'):
                if pending is None:
                    raise ValueError(f'Answer without statement: {block["source_index"]}')
                items.append(dict(statement=pending, correct=text.casefold() == 'đúng'))
                pending = None
            elif m and m[1].strip():
                if pending is not None:
                    raise ValueError(f'Missing true/false answer: {block["source_index"]}')
                items.append(dict(statement=clean(m[1]), correct=m[2].casefold() == 'đúng'))
            elif pending is None:
                pending = text
            else:
                raise ValueError(f'Missing true/false answer: {block["source_index"]}')
        if pending is not None or not items:
            raise ValueError(f'Incomplete true/false: {block["source_index"]}')
        q.update(type='true_false', items=items, instruction='Chọn Đúng hoặc Sai cho mỗi phát biểu sau')
        return q
    if any('→' in t for t in texts):
        pairs, numbered = [], {}
        for p in paragraphs:
            text = clean(p.text)
            if text.startswith('Đáp án') or text == 'Các đáp án:':
                continue
            if '→' not in text:
                for line in p.text.splitlines():
                    m = re.match(r'^(\d+)\.\s*(.*)', clean(line))
                    if m:
                        numbered[m[1]] = m[2]
                continue
            left, right = map(clean, text.split('→', 1))
            pairs.append(dict(left=numbered.get(left, left), right=right))
        return matching(q, pairs)
    if any(re.search(r'\[[^\]]+\]', t) for t in texts):
        pairs = []
        for text in texts:
            m = re.search(r'\[([^\]]+)\]', text)
            if not m:
                raise ValueError(f'Unmapped bracket statement: {block["source_index"]}')
            pairs.append(dict(left=text[:m.start()] + '______' + text[m.end():], right=m[1]))
        return matching(q, pairs)
    if q['question'].lower().startswith('kéo thả') and 'cột tương ứng' in q['question'].lower():
        cats = []
        for p, text in zip(paragraphs, texts):
            if any(red(r) for r in p.runs if r.text.strip()):
                if not cats:
                    raise ValueError(f'Item without category: {block["source_index"]}')
                cats[-1]['items'].append(text)
            else:
                cats.append(dict(title=text, items=[]))
        return categorize(q, cats)
    if re.search(r'kéo thả', q['question'], re.I):
        pairs, pool = [], []
        for p in paragraphs:
            spans, offset = [], 0
            for run in p.runs:
                if red(run) and run.text.strip():
                    if spans and not p.text[spans[-1][1]:offset].strip():
                        spans[-1] = (spans[-1][0], offset + len(run.text))
                    else:
                        spans.append((offset, offset + len(run.text)))
                offset += len(run.text)
            if not spans:
                raise ValueError(f'Unmarked matching statement: {block["source_index"]}')
            if len(spans) != 1:
                raise ValueError(f'Multiple blanks per statement: {block["source_index"]}')
            start, end = spans[0]
            answer = clean(p.text[start:end])
            pool.append(answer)
            if clean(p.text) != answer:
                pairs.append(dict(left=clean(p.text[:start] + ' ______ ' + p.text[end:]), right=answer))
        if not pairs:
            raise ValueError(f'No matching statements: {block["source_index"]}')
        matching(q, pairs)
        q['options_pool'] = list(dict.fromkeys(pool))
        return q
    # Read per-character colors; several options can share a Word run.
    text, marks, instruction_lines, choice_paragraphs = '', [], [], []
    for p in paragraphs:
        if clean(p.text).startswith('(Sinh viên chọn'):
            instruction_lines.append(clean(p.text))
            continue
        if clean(p.text).startswith('Đáp án'):
            continue
        choice_paragraphs.append(p)
        for run in p.runs:
            text += run.text
            marks.extend([red(run)] * len(run.text))
        text += '\n'
        marks.append(False)
    matches = list(re.finditer(r'(?:^|\n)\s*([A-F])(?:[.)]\s*|\s+)', text))
    options, correct = [], []
    if matches:
        for i, m in enumerate(matches):
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            options.append(f'{m[1]}. {clean(text[m.end():end])}')
            if any(marks[j] and not text[j].isspace() for j in range(m.start(), end)):
                correct.append(i)
    else:
        for i, p in enumerate(choice_paragraphs):
            options.append(f'{chr(65+i)}. {clean(p.text)}')
            if any(red(r) for r in p.runs if r.text.strip()):
                correct.append(i)
    explicit = re.search(r'Đáp án(?: đúng)?:\s*([A-F](?:\s*(?:,|và)\s*[A-F])*)', '\n'.join(notes), re.I)
    if explicit:
        expected = [ord(s.upper()) - 65 for s in re.findall(r'[A-F]', explicit[1], re.I)]
        if correct and sorted(correct) != sorted(expected):
            raise ValueError(f'Conflicting marked and written answers: {block["source_index"]}')
        correct = expected
    if not correct or len(options) < 2:
        raise ValueError(f'Missing marked answers: {block["source_index"]}')
    requested = re.search(r'chọn\s+(\d+)\s*(?:đáp|phương)', ' '.join([q['question'], *instruction_lines]), re.I)
    if requested and int(requested[1]) != len(correct):
        raise ValueError(f'Wrong requested answer count: {block["source_index"]}')
    if instruction_lines:
        q['source_instruction'] = ' '.join(instruction_lines)
    q.update(type='multiple_choice' if len(correct) > 1 else 'single_choice', options=options,
             correct_answers=correct, instruction=f'Chọn {len(correct)} đáp án đúng' if len(correct) > 1 else 'Chọn 1 đáp án đúng nhất')
    return q


def build_bank():
    if CORRECTIONS['source_sha256'] != SOURCE_SHA256:
        raise ValueError('Answer corrections belong to a different Word source')
    bank, counts = [], Counter()
    for block in read_blocks(ROOT / SOURCE):
        q = parse_block(block)
        lesson = q['lesson_num']
        counts[lesson] += 1
        q.update(lesson='Bổ sung' if lesson == 6 else f'Bài {lesson}', q_num=counts[lesson],
                 body_index=block['source_index'], id=f'{BANK_VERSION}-p{block["source_index"]}')
        q['question'] = f'Câu {q["q_num"]}: {q["question"]}'
        bank.append(q)
    applied = set()
    for correction in CORRECTIONS['corrections']:
        index = correction['body_index']
        if index in applied:
            raise ValueError(f'Duplicate answer correction: {index}')
        target = next((q for q in bank if q['body_index'] == index), None)
        if target is None or target['source_title'] != correction['source_title'] or target.get('options') != correction['options'] or target.get('correct_answers') != correction['source_correct_answers']:
            raise ValueError(f'Answer correction does not match source exercise: {index}')
        if correction['approved_by'] != 'user':
            raise ValueError(f'Unapproved answer correction: {index}')
        target['correct_answers'] = correction['approved_correct_answers'].copy()
        target['answer_correction'] = correction.copy()
        applied.add(index)
    for correction in CORRECTIONS.get('category_corrections', []):
        index = correction['body_index']
        if index in applied:
            raise ValueError(f'Duplicate category correction: {index}')
        target = next((q for q in bank if q['body_index'] == index), None)
        if target is None or target['source_title'] != correction['source_title'] or target.get('categories') != correction['source_categories'] or target.get('unassigned_source_items', []) != correction['source_unassigned_items']:
            raise ValueError(f'Category correction does not match source exercise: {index}')
        if correction['approved_by'] != 'user':
            raise ValueError(f'Unapproved category correction: {index}')
        categories = json.loads(json.dumps(correction['approved_categories'], ensure_ascii=False))
        categorize(target, categories)
        target['category_correction'] = correction.copy()
        target.pop('unassigned_source_items', None)
        target.pop('source_warning', None)
        applied.add(index)
    bank.sort(key=lambda q: (q['lesson_num'], q['q_num']))
    playable = [q for q in bank if q.get('is_gradable', True)]
    report = dict(source_file=SOURCE, source_sha256=SOURCE_SHA256, bank_version=DATA_VERSION,
                  approved_answer_corrections=CORRECTIONS['corrections'],
                  approved_category_corrections=CORRECTIONS.get('category_corrections', []),
                  source_exercises=len(bank), total=len(bank), playable=len(playable), reference_only=len(bank)-len(playable),
                  lesson_counts=dict(counts), playable_lesson_counts=dict(Counter(q['lesson_num'] for q in playable)),
                  type_counts=dict(Counter(q['type'] for q in bank)), tx_count=sum(bool(q.get('is_thuong_xuyen')) for q in playable),
                  source_notes=[dict(id=q['id'], source_title=q['source_title'], warning=q['source_warning']) for q in bank if q.get('source_warning')],
                  section_note='43 câu bắt đầu lại từ Câu 1 sau Bài 5 không có tiêu đề bài; hiển thị riêng ở mục Bổ sung.')
    return bank, report


def main():
    from verify_questions import validate_questions
    bank, report = build_bank()
    errors = validate_questions(bank)
    if errors:
        raise ValueError('\n'.join(errors))
    payload = json.dumps(bank, ensure_ascii=False, indent=2)
    (ROOT / 'questions.json').write_text(payload + '\n', encoding='utf-8')
    (ROOT / 'questions-data.js').write_text('window.QUIZ_BANK_VERSION = ' + json.dumps(DATA_VERSION) + ';\nwindow.QUIZ_QUESTIONS = ' + payload + ';\n', encoding='utf-8')
    (ROOT / 'question-build-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    html_path = ROOT / 'index.html'
    html = html_path.read_text(encoding='utf-8')
    html = re.sub(r'(<meta name="quiz-bank-version" content=")[^"]+', lambda m: m[1] + DATA_VERSION, html)
    html = re.sub(r'((?:style\.css|script\.js|questions-data\.js)\?v=)[^"\s]+', lambda m: m[1] + DATA_VERSION, html)
    html_path.write_text(html, encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
