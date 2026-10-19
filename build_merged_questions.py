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
TX_SOURCE = 'cac_cau_con_thieu_to_do.docx'


def clean(text):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', text)).strip()


def normal(text):
    text = re.sub(r'\[Gốc:[^\]]*\]', '', text, flags=re.I)
    text = re.sub(r'^(?:Câu\s*\d+\s*[:.]?|[A-F\d]+[.)])\s*', '', clean(text), flags=re.I)
    text = re.sub(r'\(Bài\s*\d+[^)]*\)\s*:', '', text, flags=re.I)
    text = re.sub(r'\(chọn\s+[^)]*\)', '', text, flags=re.I)
    return re.sub(r'[^\w]+', '', text.casefold().replace('_', ''))


def exercise_key(q):
    """Normalized signature of the exercise content."""
    if q['type'] in ('single_choice', 'multiple_choice'):
        body = [normal(q['question']), sorted(normal(o) for o in q.get('options', []))]
    elif q['type'] == 'true_false':
        body = [(normal(it['statement']), it.get('correct')) for it in q.get('items', [])]
    elif q['type'] == 'drag_drop_match':
        body = sorted((normal(p['left']), normal(p['right'])) for p in q.get('pairs', []))
    else:
        body = sorted((normal(it['text']), normal(it['category'])) for it in q.get('all_items', []))
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
            if not text or text.lower().startswith('đáp án'):
                continue
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
    if q['lesson_num'] == 5:
        if 'xác định số lượng tôn giáo' in q['question']:
            q['correct_answers'] = [2]  # C. 16 tôn giáo (43 là số tổ chức tôn giáo)
    return q


def build_bank():
    merged_blocks = read_blocks(ROOT / MERGED)
    bank = []
    lesson_counters = Counter()
    for b in merged_blocks:
        q = repair(parse_block(b, MERGED))
        lesson = q['lesson_num']
        lesson_counters[lesson] += 1
        seq_num = lesson_counters[lesson]
        source_num = b['source_q_num']
        body_idx = b['source_index']

        q['source_q_num'] = source_num
        q['body_index'] = body_idx
        q['lesson'] = f"Bài {lesson}"
        q['q_num'] = seq_num
        q['id'] = f"q-b{lesson}-c{seq_num}-{body_idx}"

        clean_title = q['question'].strip()
        clean_title = re.sub(r'^(?:Câu\s*\d+\s*[:.]?|[A-F\d]+[.)])\s*', '', clean_title, flags=re.I).strip()

        if source_num is not None and source_num != seq_num:
            q['question'] = f"Câu {seq_num} [Gốc: Câu {source_num}]: {clean_title}"
        elif source_num is None:
            q['question'] = f"Câu {seq_num} [Gốc: Chưa đánh số]: {clean_title}"
        else:
            q['question'] = f"Câu {seq_num}: {clean_title}"

        bank.append(q)

    # Supplement questions from CNKHXH BAI6.docx (all missing questions added directly into Bài 6)
    supp_path = ROOT / SUPPLEMENT
    supp_added_count = 0
    if supp_path.exists():
        supp_blocks = read_blocks(supp_path)
        for b in supp_blocks:
            sq_num = b['source_q_num']
            if 1 <= sq_num <= 29:
                q = repair(parse_block(b, SUPPLEMENT))
                target_lesson = 6
                lesson_counters[target_lesson] += 1
                seq_num = lesson_counters[target_lesson]
                body_idx = b['source_index']

                q['lesson_num'] = target_lesson
                q['source_q_num'] = sq_num
                q['body_index'] = body_idx
                q['lesson'] = f"Bài {target_lesson}"
                q['q_num'] = seq_num
                q['id'] = f"q-b{target_lesson}-c{seq_num}-b6doc{body_idx}"

                clean_title = q['question'].strip()
                clean_title = re.sub(r'^(?:Câu\s*\d+\s*[:.]?|[A-F\d]+[.)])\s*', '', clean_title, flags=re.I).strip()
                q['question'] = f"Câu {seq_num} [Gốc: Câu {sq_num} trong {SUPPLEMENT}]: {clean_title}"

                bank.append(q)
                supp_added_count += 1

    # Regular inspection tests (BÀI KIỂM TRA THƯỜNG XUYÊN) from cac_cau_con_thieu_to_do.docx
    tx_path = ROOT / TX_SOURCE
    tx_added_count = 0
    if tx_path.exists():
        tx_blocks = read_blocks(tx_path, tx_only=True)
        for b in tx_blocks:
            sq_num = b['source_q_num']
            les = b['lesson_num']
            group = b['test_group']
            body_idx = b['source_index']

            if sq_num == 22 and les == 1:
                target = next(x for x in bank if x['lesson_num'] == 1 and 'Giai cấp tư sản, trong quá trình' in x['question'])
                target.update(is_thuong_xuyen=True, test_group=group)
                target['sources'].append(dict(file=TX_SOURCE, question_number=sq_num, body_index=body_idx))
            elif sq_num == 23 and les == 1:
                target = next(x for x in bank if x['lesson_num'] == 1 and x['type'] == 'drag_drop_match' and any('giải phóng thế giới' in p.get('left', '') for p in x.get('pairs', [])))
                target.update(is_thuong_xuyen=True, test_group=group)
                target['sources'].append(dict(file=TX_SOURCE, question_number=sq_num, body_index=body_idx))
            elif sq_num == 26 and les == 2:
                target = next(x for x in bank if x['lesson_num'] == 2 and 'Những đặc điểm nổi bật trong thời kỳ quá độ' in x['question'])
                target.update(is_thuong_xuyen=True, test_group=group)
                target['sources'].append(dict(file=TX_SOURCE, question_number=sq_num, body_index=body_idx))
            elif sq_num == 27 and les == 2:
                # NEW QUESTION for Bài 2
                q = repair(parse_block(b, TX_SOURCE))
                lesson_counters[2] += 1
                seq_num = lesson_counters[2]
                q['lesson_num'] = 2
                q['source_q_num'] = sq_num
                q['body_index'] = body_idx
                q['lesson'] = "Bài 2"
                q['q_num'] = seq_num
                q['id'] = f"q-b2-c{seq_num}-tx{body_idx}"
                clean_title = q['question'].strip()
                clean_title = re.sub(r'^(?:Câu\s*\d+\s*[:.]?|[A-F\d]+[.)])\s*', '', clean_title, flags=re.I).strip()
                q['question'] = f"Câu {seq_num} [Gốc: Câu {sq_num} trong {TX_SOURCE}]: {clean_title}"
                q.update(is_thuong_xuyen=True, test_group=group)
                bank.append(q)
                tx_added_count += 1
            elif sq_num == 30 and les == 3:
                target = next(x for x in bank if x['lesson_num'] == 3 and 'chọn phương án đúng về mối quan hệ giữa dân chủ' in x['question'])
                target.update(is_thuong_xuyen=True, test_group=group)
                target['sources'].append(dict(file=TX_SOURCE, question_number=sq_num, body_index=body_idx))
            elif sq_num == 6 and les == 4:
                target = next(x for x in bank if x['lesson_num'] == 4 and 'cơ cấu xã hội nào giữ vị trí quan trọng hàng đầu' in x['question'])
                target.update(is_thuong_xuyen=True, test_group=group)
                target['sources'].append(dict(file=TX_SOURCE, question_number=sq_num, body_index=body_idx))
            elif sq_num == 7 and les == 4:
                target = next(x for x in bank if x['lesson_num'] == 4 and 'thường xuyên biến đổi theo mấy quy luật cơ bản' in x['question'])
                target.update(is_thuong_xuyen=True, test_group=group)
                target['sources'].append(dict(file=TX_SOURCE, question_number=sq_num, body_index=body_idx))
            elif sq_num == 10 and les == 5:
                # NEW QUESTION for Bài 5
                q = repair(parse_block(b, TX_SOURCE))
                lesson_counters[5] += 1
                seq_num = lesson_counters[5]
                q['lesson_num'] = 5
                q['source_q_num'] = sq_num
                q['body_index'] = body_idx
                q['lesson'] = "Bài 5"
                q['q_num'] = seq_num
                q['id'] = f"q-b5-c{seq_num}-tx{body_idx}"
                clean_title = q['question'].strip()
                clean_title = re.sub(r'^(?:Câu\s*\d+\s*[:.]?|[A-F\d]+[.)])\s*', '', clean_title, flags=re.I).strip()
                q['question'] = f"Câu {seq_num} [Gốc: Câu {sq_num} trong {TX_SOURCE}]: {clean_title}"
                q.update(is_thuong_xuyen=True, test_group=group)
                bank.append(q)
                tx_added_count += 1
            elif sq_num == 19 and les == 4:
                target = next(x for x in bank if x['lesson_num'] == 4 and x['type'] == 'drag_drop_categorize' and x['categories'][0]['title'].startswith('Giai cấp/tầng lớp'))
                target.update(is_thuong_xuyen=True, test_group=group)
                target['sources'].append(dict(file=TX_SOURCE, question_number=sq_num, body_index=body_idx))
            elif sq_num == 20 and les == 4:
                target = next(x for x in bank if x['lesson_num'] == 4 and x['type'] == 'drag_drop_match' and any('Nội dung kinh tế' in p.get('right', '') for p in x.get('pairs', [])))
                target.update(is_thuong_xuyen=True, test_group=group)
                target['sources'].append(dict(file=TX_SOURCE, question_number=sq_num, body_index=body_idx))
            elif sq_num == 28 and les == 5:
                # NEW QUESTION for Bài 5
                q = repair(parse_block(b, TX_SOURCE))
                lesson_counters[5] += 1
                seq_num = lesson_counters[5]
                q['lesson_num'] = 5
                q['source_q_num'] = sq_num
                q['body_index'] = body_idx
                q['lesson'] = "Bài 5"
                q['q_num'] = seq_num
                q['id'] = f"q-b5-c{seq_num}-tx{body_idx}"
                clean_title = q['question'].strip()
                clean_title = re.sub(r'^(?:Câu\s*\d+\s*[:.]?|[A-F\d]+[.)])\s*', '', clean_title, flags=re.I).strip()
                q['question'] = f"Câu {seq_num} [Gốc: Câu {sq_num} trong {TX_SOURCE}]: {clean_title}"
                q.update(is_thuong_xuyen=True, test_group=group)
                bank.append(q)
                tx_added_count += 1
            elif sq_num == 30 and les == 5:
                target = next(x for x in bank if x['lesson_num'] == 5 and x['type'] == 'true_false' and any('Tín ngưỡng có hệ thống giáo lý' in it['statement'] for it in x.get('items', [])))
                target.update(is_thuong_xuyen=True, test_group=group)
                target['sources'].append(dict(file=TX_SOURCE, question_number=sq_num, body_index=body_idx))

    bank.sort(key=lambda item: (item['lesson_num'], item['q_num']))
    tx_total = sum(bool(q.get('is_thuong_xuyen')) for q in bank)
    return bank, dict(
        source_exercises=len(merged_blocks) + supp_added_count + tx_added_count,
        merged_source_exercises=len(merged_blocks),
        supplement_exercises=supp_added_count,
        tx_new_exercises=tx_added_count,
        duplicate_groups=[],
        lesson_counts=dict(lesson_counters),
        type_counts=dict(Counter(q['type'] for q in bank)),
        total=len(bank),
        tx_count=tx_total
    )


def main():
    from verify_questions import validate_questions
    bank, report = build_bank()
    errors = validate_questions(bank)
    if errors:
        raise ValueError('\n'.join(errors))
    payload = json.dumps(bank, ensure_ascii=False, indent=2)
    (ROOT / 'questions.json').write_text(payload + '\n', encoding='utf-8')
    legacy = {str(i): q['id'] for i, q in enumerate(bank, 1)}
    (ROOT / 'legacy-question-ids.json').write_text(json.dumps(legacy, indent=2) + '\n', encoding='utf-8')
    (ROOT / 'questions-data.js').write_text('window.QUIZ_BANK_VERSION = "v7-20261020-exact-word-265";\nwindow.QUIZ_LEGACY_IDS = ' + json.dumps(legacy) + ';\nwindow.QUIZ_QUESTIONS = ' + payload + ';\n', encoding='utf-8')
    (ROOT / 'question-build-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
