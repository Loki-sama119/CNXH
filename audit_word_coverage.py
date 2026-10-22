"""Audit Word XML independently of the importer, including red answer spans."""
import hashlib
import json
import re
import unicodedata
import xml.etree.ElementTree as ET
import sys
from collections import Counter
from pathlib import Path
from zipfile import ZipFile

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).resolve().parent
SOURCE = 'NGHIỆP VỤ THƯ KÝ VP.docx'
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'


def tidy(text):
    return ' '.join(unicodedata.normalize('NFC', text).split())


def text_of(element):
    return ''.join(n.text or '' if n.tag == W+'t' else '\n' if n.tag in (W+'br', W+'cr') else '\t' if n.tag == W+'tab' else '' for n in element.iter())


def red_characters(paragraph):
    result = []
    for run in paragraph.iter(W+'r'):
        color = run.find(W+'rPr/'+W+'color')
        value = color.get(W+'val', '') if color is not None else ''
        marked = False
        if re.fullmatch('[0-9a-fA-F]{6}', value):
            r, g, b = (int(value[i:i+2], 16) for i in (0, 2, 4))
            marked = r >= 150 and r > g * 1.5 and r > b * 1.5
        result.extend((ch, marked) for ch in text_of(run))
    return result


def xml_inventory():
    with ZipFile(ROOT / SOURCE) as archive:
        doc = ET.fromstring(archive.read('word/document.xml'))
    blocks, current, headings = [], None, []
    for i, el in enumerate(doc.find(W+'body')):
        if el.tag == W+'p':
            text = tidy(text_of(el))
            if not text:
                continue
            if re.fullmatch(r'(?:BÀI|Bài)\s+\d+', text):
                headings.append(text)
                current = None
            elif re.match(r'^Câu\s*\d+', text, re.I):
                current = dict(index=i, title=text, elements=[], xml=[])
                blocks.append(current)
            elif current is not None:
                current['elements'].append(dict(text=text))
                current['xml'].append(el)
            else:
                raise ValueError(f'Unassigned source paragraph {i}: {text}')
        elif el.tag == W+'tbl':
            raise ValueError(f'Unexpected table at paragraph {i}')
    return blocks, headings


def audit(bank=None):
    bank = bank if bank is not None else json.loads((ROOT / 'questions.json').read_text(encoding='utf8'))
    blocks, headings = xml_inventory()
    errors, mapping = [], []
    
    word_bank = [q for q in bank if q['sources'][0]['file'] == SOURCE]
    refs = Counter(s['body_index'] for q in word_bank for s in q['sources'])
    if set(refs) != {b['index'] for b in blocks} or any(n != 1 for n in refs.values()):
        errors.append('Missing, duplicate or extra source exercise references')
        
    targets = {q['sources'][0]['body_index']: q for q in word_bank}
    letters = ['A', 'B', 'C', 'D']
    
    for block in blocks:
        q = targets.get(block['index'])
        if q is None:
            continue
        label = f'Word paragraph {block["index"]}'
        def check(condition, message):
            if not condition:
                errors.append(f'{label}: {message}')
                
        check(q['sources'][0]['file'] == SOURCE, 'old source file')
        check(q['source_title'] == block['title'], 'changed source title')
        check(q['source_content'] == block['elements'], 'changed or missing source paragraphs')
        check(q['type'] == 'single_choice', 'unexpected question type')

        paragraphs = [el for el in block['xml'] if el.tag == W+'p']
        chars = []
        for p in paragraphs:
            chars.extend(red_characters(p))
            chars.append(('\n', False))
            
        lines, line = [], []
        for char in chars:
            if char[0] == '\n':
                if tidy(''.join(c for c, _ in line)):
                    lines.append(line)
                line = []
            else:
                line.append(char)

        if len(lines) > 4:
            opt_lines = lines[-4:]
        else:
            opt_lines = lines

        options, answers = [], []
        for i, opt_line in enumerate(opt_lines):
            t = tidy(''.join(c for c, _ in opt_line))
            clean_t = re.sub(r'^[A-D][\.\:\)]\s*', '', t).strip()
            options.append(f'{letters[i]}. {clean_t}')
            if any(marked and ch.strip() for ch, marked in opt_line):
                answers.append(i)

        check(q['options'] == options, f"changed or missing options: expected {options}, got {q.get('options')}")
        check(q['correct_answers'] == answers, f"wrong answer indices: expected {answers}, got {q.get('correct_answers')}")
        mapping.append(dict(body_index=block['index'], source_title=block['title'], web_id=q['id'], type=q['type']))

    source_sha256 = hashlib.sha256((ROOT / SOURCE).read_bytes()).hexdigest()
    return dict(
        source_file=SOURCE,
        source_sha256=source_sha256,
        source_exercises=len(blocks),
        matched_source_exercises=len(mapping),
        source_tables=0,
        headings=headings,
        mapping=mapping,
        errors=errors
    )


def generate_coverage_markdown(report):
    md = f"""# Báo cáo đối chiếu tài liệu nguồn

Nguồn duy nhất: `{report['source_file']}` (SHA256: `{report['source_sha256']}`).

## Thống kê tổng quan
- **Tổng số câu hỏi trong tài liệu**: {report['source_exercises']}
- **Số câu đối chiếu thành công**: {report['matched_source_exercises']}
- **Số bảng**: {report['source_tables']}
- **Số lỗi**: {len(report['errors'])}

## Các bài học
{chr(10).join(f"- {h}" for h in report['headings'])}

Toàn bộ {report['matched_source_exercises']} câu hỏi đều là trắc nghiệm 4 lựa chọn (A, B, C, D) với 1 đáp án đúng được xác định từ chữ tô đỏ trong tài liệu gốc.
"""
    return md


if __name__ == '__main__':
    report = audit()
    (ROOT / 'word-coverage-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    (ROOT / 'WORD_COVERAGE.md').write_text(generate_coverage_markdown(report), encoding='utf8')
    print(json.dumps({k: v for k, v in report.items() if k != 'mapping'}, ensure_ascii=False, indent=2))
    raise SystemExit(bool(report['errors']))
