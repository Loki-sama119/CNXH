"""Independently inventory Word XML and verify every exercise's full content."""
import json
import re
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path
from zipfile import ZipFile

from build_merged_questions import ROOT, MERGED, normal, read_blocks, parse_block, repair

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'


def xml_inventory(path):
    with ZipFile(path) as archive:
        doc = ET.fromstring(archive.read('word/document.xml'))
    inventory, outside, tables = [], [], []
    current, lesson = None, 0
    for index, element in enumerate(doc.find(W + 'body')):
        if element.tag == W + 'p':
            text = ''.join((node.text or '') if node.tag == W + 't' else '\n' if node.tag in (W + 'br', W + 'cr') else '\t' if node.tag == W + 'tab' else '' for node in element.iter()).strip()
            if not text:
                continue
            heading = re.fullmatch(r'BÀI\s+(\d+)', text, re.I)
            if heading:
                lesson, current = int(heading[1]), None
                continue
            question = re.match(r'^Câu\s*(?:(\d+)\s*[:.]?\s*|[:.]\s*)(.*)$', text, re.I | re.S)
            if question:
                current = dict(lesson=lesson, body_index=index,
                               source_number=int(question[1]) if question[1] else None,
                               title=question[2], paragraphs=[], tables=[])
                inventory.append(current)
            elif current is not None:
                current['paragraphs'].append(text)
            else:
                outside.append(dict(body_index=index, text=text))
        elif element.tag == W + 'tbl':
            tables.append(index)
            if current is not None:
                current['tables'].append(index)
    return inventory, outside, tables, len(list(doc.iter(W + 'tbl')))


def content_signature(q):
    if 'options' in q:
        content = [normal(q['question']), list(map(normal, q['options'])),
                   sorted(normal(q['options'][i]) for i in q['correct_answers'])]
    elif q['type'] == 'true_false':
        content = sorted((normal(it['statement']), it['correct']) for it in q['items'])
    elif q['type'] == 'drag_drop_match':
        content = sorted((normal(p['left']), normal(p['right'])) for p in q['pairs'])
    else:
        content = sorted((normal(it['text']), normal(it['category'])) for it in q['all_items'])
    return json.dumps([q['type'], content], ensure_ascii=False)


def audit(bank=None):
    bank = bank if bank is not None else json.loads((ROOT / 'questions.json').read_text(encoding='utf-8'))
    inventory, outside, tables, all_table_count = xml_inventory(ROOT / MERGED)
    blocks = {b['source_index']: b for b in read_blocks(ROOT / MERGED)}
    references = defaultdict(list)
    for q in bank:
        for source in q['sources']:
            if source['file'] == MERGED:
                references[source['body_index']].append(q)
    errors = []
    if outside:
        errors.append(f'Text outside exercises: {outside}')
    if set(blocks) != {item['body_index'] for item in inventory}:
        errors.append('Importer question boundaries differ from independent XML inventory')
    assigned_tables = {i for item in inventory for i in item['tables']}
    if assigned_tables != set(tables) or all_table_count != len(tables):
        errors.append('Unassigned or nested Word tables')
    stats = defaultdict(Counter)
    mapping, unnumbered = [], []
    for item in inventory:
        index, lesson = item['body_index'], item['lesson']
        counts = stats[lesson]
        counts['source_exercises'] += 1
        counts['drag_exercises'] += len(item['tables'])
        tf_answers = sum(bool(re.fullmatch(r'(?:Đúng|Sai)\s*\**', p.strip(), re.I)) for p in item['paragraphs'])
        counts['tf_statements'] += tf_answers
        counts['tf_groups'] += bool(tf_answers)
        counts['choice_exercises'] += not tf_answers and not item['tables']
        counts['unnumbered'] += item['source_number'] is None
        targets = references.get(index, [])
        if len(targets) != 1 or index not in blocks:
            errors.append(f'Word exercise {lesson}/{index}: missing or ambiguous bank reference')
            continue
        target = targets[0]
        expected = repair(parse_block(blocks[index], MERGED))
        candidates = [target, *target.get('variants', [])]
        if content_signature(expected) not in {content_signature(q) for q in candidates}:
            errors.append(f'Word exercise {lesson}/{index}: question, options, items or answers not preserved')
        if 'options' in expected:
            option_count = len(re.findall(r'^\s*[A-F](?:[.)]\s*|\s+)', '\n'.join(item['paragraphs']), re.M))
            if option_count != len(expected['options']):
                errors.append(f'Word exercise {lesson}/{index}: option count differs from XML')
        if tf_answers != len(expected.get('items', [])):
            errors.append(f'Word exercise {lesson}/{index}: true/false statement count differs from XML')
        row = dict(lesson=lesson, source_number=item['source_number'], body_index=index,
                   web_id=target['id'], web_number=target['q_num'], type=target['type'])
        mapping.append(row)
        if item['source_number'] is None:
            unnumbered.append({**row, 'title': item['title']})
    for lesson, counts in stats.items():
        primary = [q for q in bank if q['lesson_num'] == lesson and any(s['file'] == MERGED for s in q['sources'])]
        counts['unique_web_exercises_from_source'] = len(primary)
        counts['unique_choice_exercises'] = sum('options' in q for q in primary)
        counts['unique_tf_statements'] = sum(len(q.get('items', [])) for q in primary)
        counts['source_expanded_total'] = counts['choice_exercises'] + counts['tf_statements'] + counts['drag_exercises']
        counts['unique_expanded_total'] = counts['unique_choice_exercises'] + counts['unique_tf_statements'] + counts['drag_exercises']
    totals = {key: sum(row[key] for row in stats.values()) for key in ('source_exercises', 'choice_exercises', 'tf_groups', 'tf_statements', 'drag_exercises', 'unnumbered', 'unique_web_exercises_from_source', 'unique_choice_exercises', 'unique_tf_statements', 'source_expanded_total', 'unique_expanded_total')}
    totals['all_web_exercises'] = len(bank)
    totals['all_web_expanded_total'] = sum(len(q['items']) if q['type'] == 'true_false' else 1 for q in bank)
    return dict(source_file=MERGED, source_exercises=len(inventory), source_tables=len(tables), totals=totals,
                matched_source_exercises=len(mapping), unnumbered=unnumbered,
                lesson_counts={str(k): dict(v) for k, v in stats.items()}, mapping=mapping,
                errors=errors)


if __name__ == '__main__':
    report = audit()
    (ROOT / 'word-coverage-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k != 'mapping'}, ensure_ascii=False, indent=2))
    raise SystemExit(bool(report['errors']))
