"""Audit Word XML independently of the importer, including red answer spans."""
import hashlib
import json
import re
import unicodedata
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent
SOURCE = 'CHỦ NGHĨA XH-KH (2).docx'
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
            marked = r >= 160 and r > g * 1.5 and r > b * 1.5
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
            if re.fullmatch(r'BÀI\s+\d+', text) or text.startswith('BÀI KIỂM TRA THƯỜNG XUYÊN') or text == 'CÁC CÂU CÒN THIẾU':
                headings.append(text)
                current = None
            elif re.match(r'^Câu\s*\d+', text):
                current = dict(index=i, title=text, elements=[], xml=[])
                blocks.append(current)
            elif current is not None:
                current['elements'].append(dict(text=text))
                current['xml'].append(el)
            else:
                raise ValueError(f'Unassigned source paragraph {i}: {text}')
        elif el.tag == W+'tbl':
            if current is None:
                raise ValueError(f'Unassigned table {i}')
            rows = [[tidy(text_of(c)) for c in row.findall(W+'tc')] for row in el.findall(W+'tr')]
            current['elements'].append(dict(table=rows))
            current['xml'].append(el)
    return blocks, headings


def audit(bank=None):
    bank = bank if bank is not None else json.loads((ROOT/'questions.json').read_text(encoding='utf8'))
    blocks, headings = xml_inventory()
    errors, mapping = [], []
    refs = Counter(s['body_index'] for q in bank for s in q['sources'])
    if set(refs) != {b['index'] for b in blocks} or any(n != 1 for n in refs.values()):
        errors.append('Missing, duplicate or extra source exercise references')
    targets = {q['sources'][0]['body_index']: q for q in bank}
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
        check(q['source_content'] == block['elements'], 'changed or missing source paragraphs/table cells')
        title = re.sub(r'^Câu\s*\d+\s*', '', block['title']).lstrip(' :.').strip()
        title = re.sub(r'^\(Bài[^)]*\)\s*:\s*', '', title)
        check(q['question'] == f'Câu {q["q_num"]}: {title}', 'changed displayed question')
        paragraphs = [el for el in block['xml'] if el.tag == W+'p']
        tables = [el for el in block['xml'] if el.tag == W+'tbl']
        texts = [tidy(text_of(el)) for el in paragraphs]
        if q['type'] in ('single_choice', 'multiple_choice'):
            # XML characters are split into lines first; no importer or repair helpers.
            chars = []
            for p in paragraphs:
                t = tidy(text_of(p))
                if t.startswith('Đáp án') or t.startswith('(Sinh viên chọn'):
                    continue
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
            options, answers = [], []
            for i, line in enumerate(lines):
                t = tidy(''.join(c for c, _ in line))
                m = re.match(r'^([A-F])(?:[.)]\s*|\s+)(.*)$', t)
                options.append(f'{m[1]}. {m[2]}' if m else f'{chr(65+i)}. {t}')
                if any(marked and ch.strip() for ch, marked in line):
                    answers.append(i)
            explicit = next((re.match(r'Đáp án(?: đúng)?:\s*([A-F](?:(?:\s*,\s*|\s+và\s+)[A-F])*)', t) for t in texts if t.startswith('Đáp án')), None)
            if explicit:
                expected = [ord(x)-65 for x in re.findall('[A-F]', explicit[1])]
                if answers:
                    check(answers == expected, 'red marks differ from written answer')
                answers = expected
            check(q['options'] == options, 'changed or missing options')
            check(q['correct_answers'] == answers, 'wrong answer indices from red marks')
        elif q['type'] == 'true_false':
            items, pending = [], None
            for t in texts:
                if t.startswith('Đáp án'):
                    continue
                if t.casefold() in ('đúng', 'sai'):
                    items.append(dict(statement=pending, correct=t.casefold() == 'đúng'))
                    pending = None
                else:
                    m = re.search(r'\s*(?:→\s*)?(Đúng|Sai)\s*$', t, re.I)
                    if m:
                        items.append(dict(statement=t[:m.start()].strip(), correct=m[1].casefold() == 'đúng'))
                    else:
                        pending = t
            check(pending is None and q['items'] == items, 'changed true/false statements or answers')
        elif q['type'] == 'drag_drop_categorize':
            if tables:
                rows = tables[0].findall(W+'tr')
                expected = []
                for col in range(2):
                    title = tidy(text_of(rows[0].findall(W+'tc')[col]))
                    content = []
                    for row in rows[1:]:
                        cell = row.findall(W+'tc')[col]
                        content.extend(tidy(s) for s in text_of(cell).splitlines() if tidy(s))
                    expected.append(dict(title=title, items=content))
                check(q.get('unassigned_source_items', []) == texts, 'outside-table items not preserved')
            else:
                expected = []
                for p in paragraphs:
                    text = tidy(text_of(p))
                    if any(marked and ch.strip() for ch, marked in red_characters(p)):
                        expected[-1]['items'].append(text)
                    else:
                        expected.append(dict(title=text, items=[]))
            check(q['categories'] == expected, 'changed category names, items or assignments')
        elif q['type'] == 'drag_drop_match':
            if tables:
                expected = [dict(left=r['table'][i][0], right=r['table'][i][1])
                            for r in block['elements'] if 'table' in r for i in range(len(r['table']))]
                check(q['pairs'] == expected, 'changed matching rows')
            elif any('→' in t for t in texts):
                statements = {}
                for p in paragraphs:
                    for line in text_of(p).splitlines():
                        m = re.match(r'^(\d+)\.\s*(.*)$', tidy(line))
                        if m:
                            statements[m[1]] = m[2]
                expected = []
                for t in texts:
                    if '→' in t and not t.startswith('Đáp án'):
                        left, right = map(tidy, t.split('→', 1))
                        expected.append(dict(left=statements.get(left, left), right=right))
                check(q['pairs'] == expected, 'changed arrow matching answers')
            elif any('[' in t for t in texts):
                expected = []
                for t in texts:
                    m = re.search(r'\[([^]]+)\]', t)
                    expected.append(dict(left=t[:m.start()]+'______'+t[m.end():], right=m[1]))
                check(q['pairs'] == expected, 'changed bracket matching answers')
            else:
                expected, pool = [], []
                for p in paragraphs:
                    chars = red_characters(p)
                    answer = tidy(''.join(ch for ch, marked in chars if marked))
                    pool.append(answer)
                    if tidy(text_of(p)) == answer:
                        continue
                    first = next(i for i, (ch, marked) in enumerate(chars) if marked and ch.strip())
                    last = max(i for i, (ch, marked) in enumerate(chars) if marked and ch.strip())
                    left = tidy(''.join(ch for ch, _ in chars[:first])+' ______ '+''.join(ch for ch, _ in chars[last+1:]))
                    expected.append(dict(left=left, right=answer))
                check(q['pairs'] == expected, 'changed inline-red matching answers')
                check(set(q['options_pool']) == set(pool), 'lost matching choices or distractors')
        else:
            check(False, 'unplayable source exercise')
        mapping.append(dict(body_index=block['index'], source_title=block['title'], web_id=q['id'], type=q['type']))
    return dict(source_file=SOURCE, source_sha256=hashlib.sha256((ROOT/SOURCE).read_bytes()).hexdigest(),
                source_exercises=len(blocks), matched_source_exercises=len(mapping),
                source_tables=sum(len([e for e in b['elements'] if 'table' in e]) for b in blocks),
                headings=headings, mapping=mapping, errors=errors)


if __name__ == '__main__':
    report = audit()
    (ROOT/'word-coverage-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    print(json.dumps({k:v for k,v in report.items() if k != 'mapping'}, ensure_ascii=False, indent=2))
    raise SystemExit(bool(report['errors']))
