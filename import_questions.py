import hashlib
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
from docx import Document
from docx.text.paragraph import Paragraph

ROOT = Path(__file__).resolve().parent
SOURCE = 'NGHIỆP VỤ THƯ KÝ VP (1).docx'
SOURCE_SHA256 = hashlib.sha256((ROOT / SOURCE).read_bytes()).hexdigest()
BANK_VERSION = 'word-' + SOURCE_SHA256[:16]
DATA_VERSION = BANK_VERSION


def clean(text):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', text)).strip()


def normal(text):
    return re.sub(r'[^\w]+', '', clean(text).casefold())


def is_red(run):
    if not run.font.color or not run.font.color.rgb:
        return False
    r, g, b = tuple(run.font.color.rgb)
    return r >= 150 and r > g * 1.5 and r > b * 1.5


def read_blocks(path):
    doc = Document(path)
    blocks, current = [], None
    lesson = 0
    for index, child in enumerate(doc.element.body):
        if not child.tag.endswith('}p'):
            continue
        p = Paragraph(child, doc)
        text = clean(p.text)
        if not text:
            continue
        heading = re.fullmatch(r'(?:BÀI|Bài)\s+(\d+)', text, re.I)
        if heading:
            lesson, current = int(heading[1]), None
            continue
        m = re.match(r'^(?:Câu|câu)\s*(\d+)[\s.:]*(.*)', text, re.I)
        if m:
            number = int(m[1])
            title = m[2].strip()
            current = dict(lesson_num=lesson,
                           source_q_num=number,
                           source_title=text,
                           question_raw=title,
                           elements=[],
                           source_index=index)
            blocks.append(current)
        elif current is not None:
            current['elements'].append(p)
        else:
            raise ValueError(f'Unassigned paragraph {index}: {text}')
    return blocks


def parse_block(block, q_num_in_lesson):
    lesson = block['lesson_num']
    paragraphs = block['elements']
    
    # Expand lines if multiple options exist in a single paragraph (e.g. separated by \n)
    expanded = []
    raw_texts = []
    for p in paragraphs:
        raw_text = clean(p.text)
        if not raw_text:
            continue
        raw_texts.append(raw_text)
        lines = [clean(l) for l in p.text.split('\n') if clean(l)]
        if len(lines) > 1:
            red_texts = [clean(r.text) for r in p.runs if is_red(r) and clean(r.text)]
            for line in lines:
                is_line_red = any(rt in line or line in rt for rt in red_texts)
                expanded.append((line, is_line_red))
        else:
            red_in_p = any(is_red(r) and clean(r.text) for r in p.runs)
            expanded.append((raw_text, red_in_p))

    # Merge continuation line if any (e.g. Block 120 / Lesson 5 Q3)
    if len(expanded) > 4:
        merged = []
        for line, is_r in expanded:
            if merged and not re.match(r'^[A-D][\.\:\)]\s*', line) and len(merged) == 4:
                merged[-1] = (merged[-1][0] + ' ' + line, merged[-1][1] or is_r)
            else:
                merged.append((line, is_r))
        expanded = merged

    # If expanded still has more than 4 items, the last 4 are choices, earlier are steps
    prompt_extras = []
    if len(expanded) > 4:
        for idx, (item_text, _) in enumerate(expanded[:-4]):
            m_step = re.match(r'^\(?(\d+)\)?[\.\:]?\s*(.*)', item_text)
            if m_step:
                prompt_extras.append(f"({m_step.group(1)}) {m_step.group(2)}")
            else:
                prompt_extras.append(f"({idx+1}) {item_text}")
        option_items = expanded[-4:]
    else:
        option_items = expanded

    q_text = block['question_raw']
    if prompt_extras:
        q_text = q_text + '\n' + '\n'.join(prompt_extras)

    letters = ['A', 'B', 'C', 'D']
    options = []
    correct_idx = None
    for idx, (opt_text, opt_red) in enumerate(option_items):
        clean_text = re.sub(r'^[A-D][\.\:\)]?\s+', '', opt_text).strip()
        options.append(f"{letters[idx]}. {clean_text}")
        if opt_red:
            correct_idx = idx

    if len(options) != 4 or correct_idx is None:
        raise ValueError(f"Invalid question block at {block['source_index']}: options={len(options)}, correct={correct_idx}")

    displayed_question = f"Câu {q_num_in_lesson}: {q_text}"

    q = {
        'lesson_num': lesson,
        'question': displayed_question,
        'source_q_num': block['source_q_num'],
        'source_title': block['source_title'],
        'sources': [
            {
                'file': SOURCE,
                'question_number': block['source_q_num'],
                'body_index': block['source_index']
            }
        ],
        'source_content': [{'text': t} for t in raw_texts],
        'type': 'single_choice',
        'options': options,
        'correct_answers': [correct_idx],
        'instruction': 'Chọn 1 đáp án đúng nhất',
        'lesson': f'Bài {lesson}',
        'q_num': q_num_in_lesson,
        'body_index': block['source_index'],
        'id': f"{BANK_VERSION}-p{block['source_index']}"
    }
    return q


def build_bank():
    blocks = read_blocks(ROOT / SOURCE)
    bank = []
    lesson_counter = Counter()
    for block in blocks:
        lesson = block['lesson_num']
        lesson_counter[lesson] += 1
        q = parse_block(block, lesson_counter[lesson])
        bank.append(q)

    report = {
        'bank_version': BANK_VERSION,
        'data_version': DATA_VERSION,
        'source_sha256': SOURCE_SHA256,
        'total_questions': len(bank),
        'lesson_counts': dict(lesson_counter),
        'types': dict(Counter(q['type'] for q in bank))
    }
    return bank, report


def main():
    bank, report = build_bank()
    
    questions_json_path = ROOT / 'questions.json'
    questions_json_path.write_text(json.dumps(bank, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    
    questions_data_js_path = ROOT / 'questions-data.js'
    js_content = f'window.QUIZ_BANK_VERSION = "{DATA_VERSION}";\nwindow.QUIZ_QUESTIONS = {json.dumps(bank, ensure_ascii=False, indent=2)};\n'
    questions_data_js_path.write_text(js_content, encoding='utf-8')
    
    report_path = ROOT / 'question-build-report.json'
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    
    print(f"Built question bank with {len(bank)} questions.")
    print("Lesson counts:", report['lesson_counts'])


if __name__ == '__main__':
    main()
