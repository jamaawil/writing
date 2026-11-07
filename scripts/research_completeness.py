"""Reader-facing projections of research records; source tables stay untouched."""
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import unquote


def markdown_targets(body):
    """Collect wiki, inline Markdown, and reference-style local destinations."""
    targets = re.findall(r'!?\[\[([^\]|]+)(?:\|[^\]]*)?\]\]', body)
    targets += re.findall(r'!?\[[^\]\n]*\]\(\s*<?([^\s)>]+)>?(?:\s+["\'][^\n]*["\'])?\s*\)', body)
    targets += re.findall(r'^\s*\[[^\]]+\]:\s*<?([^\s>]+)>?', body, re.M)
    return [unquote(t) for t in targets]


def import_records(source, db, entity, alias, relation, resolve, existing, report):
    def h(value):
        return hashlib.sha256(value.encode()).hexdigest()[:32]

    def fields_body(row):
        parts = []
        # Exact values, including structured arrays, remain visible; JSON raw
        # metadata also retains every field and its original type.
        for key, value in row.items():
            if value is None or value == '':
                continue
            if key in ('note_path', 'outline_path', 'novel_path', 'moc_path'):
                continue  # Local filesystem paths are not public citations.
            label = key.replace('_', ' ').capitalize()
            if isinstance(value, str):
                try:
                    parsed = json.loads(value)
                    if isinstance(parsed, (dict, list)):
                        value = '```json\n' + json.dumps(parsed, ensure_ascii=False, indent=2) + '\n```'
                except (ValueError, TypeError):
                    pass
            parts.append('## ' + label + '\n\n' + str(value))
        return '\n\n'.join(parts)

    # Every source highlight is a first-class passage, including evidence that
    # has not yet been assigned a claim. Nothing relies on a claim-only index.
    passage_count = 0
    for row in source.execute('SELECT * FROM passages'):
        r = dict(row)
        eid = 'e:' + h(r['highlight_url'])
        entity(eid, (r.get('text') or 'Source passage')[:200], 'source-passage', fields_body({k: r[k] for k in ('text', 'location', 'category', 'annotations', 'category_reason', 'criterion', 'claim', 'corrected_claim', 'verdict', 'verified', 'score')}), {'source_table': 'passages', 'record': r})
        alias(r['highlight_url'], eid, 'evidence')
        claim, book = 'd:' + str(r.get('claim_id')), 'b:' + r['book_uid']
        if claim in existing:
            relation('evidence-claim:' + h(eid + claim), 'source-evidence', claim, eid, 'has-evidence', 'a_to_b', 'recorded', None, None, {'highlight_url': r['highlight_url']})
        if book in existing:
            relation('evidence-book:' + h(eid + book), 'source-evidence', eid, book, 'from-book', 'a_to_b', 'recorded', None, None, {'highlight_url': r['highlight_url']})
        passage_count += 1
    for row in source.execute('SELECT * FROM claims'):
        r = dict(row)
        eid = 'd:' + r['claim_id']
        prior = db.execute('SELECT metadata FROM entities WHERE id=?', (eid,)).fetchone()
        if prior:
            meta = json.loads(prior[0]); meta['claim_record'] = r
            db.execute('UPDATE entities SET metadata=? WHERE id=?', (json.dumps(meta, ensure_ascii=False), eid))
    for row in source.execute('SELECT * FROM books'):
        r = dict(row)
        body = fields_body({k: r[k] for k in ('reading_stance', 'reading_purpose', 'pre_assessment', 'reading_goal_weights', 'manual_genre', 'evidence_tier', 'fidelity')})
        db.execute('UPDATE entities SET body=body || ? WHERE id=?', ('\n\n' + body, 'b:' + r['book_uid']))
    specs = {
        'chapters': ('chapter', ['book_uid', 'idx']),
        'papers': ('paper-evidence', ['claim_id']),
        'web_sources': ('web-source', ['claim_id', 'url']),
        'syntheses': ('synthesis', ['claim_id']),
        'story_frameworks': ('story-framework', ['claim_id']),
        'further_reading': ('reading-list', ['claim_id']),
        'essay_architectures': ('essay-plan', ['claim_id']),
        'bestseller_projects': ('writing-project', ['project_id']),
        'bestseller_chapters': ('writing-chapter', ['chapter_id']),
        'bestseller_claim_links': ('writing-connection', ['claim_id', 'project_id', 'chapter_id', 'position']),
        'bestseller_characters': ('character', ['project_id', 'name']),
        'bestseller_claim_sources': ('research-sources', ['claim_id']),
        'nk_bridges': ('hypothesis-bridge', ['pair_key']),
        'nk_claims': ('hypothesis-record', ['nk_id']),
        'pc_suggestions': ('reading-suggestion', ['pc_id']),
        'bl_projects': ('booklab-project', ['project_id']),
        'bl_sources': ('booklab-source', ['source_id']),
        'bl_readings': ('booklab-reading', ['reading_id']),
        'bl_analyses': ('booklab-analysis', ['analysis_id']),
        'bl_lineage': ('literary-lineage', ['item_id']),
        'bl_factchecks': ('factcheck', ['check_id']),
    }
    rows_by_table = {}
    counts = {'passages': passage_count}
    for table, (kind, keys) in specs.items():
        rows = []
        for row in source.execute('SELECT * FROM ' + table):
            r = dict(row)
            key = '\0'.join(str(r.get(k) or '') for k in keys)
            eid = 'db:' + table + ':' + h(key)
            # A schema's natural composite key must not silently collapse rows.
            if eid in existing:
                raise RuntimeError('Duplicate research projection: ' + table + ' ' + key)
            title = next((r[k] for k in ('title', 'title_claim', 'claim', 'name', 'work', 'entity', 'topic', 'anchor') if r.get(k)), None)
            if not title:
                if table == 'chapters':
                    title = 'Chapter ' + str(r['idx']) + ' · ' + str(r['book_uid'])
                elif table == 'bl_readings':
                    title = r.get('passage') or 'Booklab reading'
                elif table == 'bl_factchecks':
                    title = r.get('sentence') or r.get('fact') or 'Fact check'
                else:
                    title = kind.replace('-', ' ').capitalize() + ' · ' + key.replace('\0', ' · ')
            entity(eid, str(title)[:300], kind, fields_body(r), {'source_table': table, 'record': r})
            rows.append((eid, r))
            for field in keys:
                if r.get(field):
                    alias(str(r[field]), eid, 'database:' + table)
        counts[table] = len(rows)
        rows_by_table[table] = rows
    # Resolve FK relationships after all rows have been created, including forward
    # references. Every original row remains separate even when notes overlap.
    lookup = {}
    for table, rows in rows_by_table.items():
        keys = specs[table][1]
        if len(keys) == 1:
            for eid, r in rows:
                lookup[(table, str(r[keys[0]]))] = eid
    for table, rows in rows_by_table.items():
        for eid, r in rows:
            targets = []
            for key in ('claim_id', 'claim_a', 'claim_b'):
                if r.get(key) and 'd:' + str(r[key]) in existing:
                    targets.append(('d:' + str(r[key]), 'about-claim'))
            if r.get('book_uid') and 'b:' + r['book_uid'] in existing:
                targets.append(('b:' + r['book_uid'], 'from-book'))
            for key, target_table in [('nk_id', 'nk_claims'), ('source_id', 'bl_sources'), ('chapter_id', 'bestseller_chapters')]:
                target = lookup.get((target_table, str(r.get(key))))
                if target and target != eid:
                    targets.append((target, 'develops' if key == 'nk_id' else 'from-source'))
            if r.get('project_id'):
                target_table = 'bl_projects' if table.startswith('bl_') else 'bestseller_projects'
                target = lookup.get((target_table, str(r['project_id'])))
                if target and target != eid:
                    targets.append((target, 'in-project'))
            for field, target_table in [('parent_claims', None), ('reading_ids', 'bl_readings'), ('context_ids', 'bl_readings')]:
                try:
                    values = json.loads(r.get(field) or '[]')
                    if not isinstance(values, list):
                        continue
                    for value in values:
                        target = lookup.get((target_table, str(value))) if target_table else 'd:' + str(value)
                        if target in existing:
                            targets.append((target, 'derived-from'))
                except (ValueError, TypeError):
                    pass
            if r.get('note_path'):
                target = resolve(Path(r['note_path']).name)
                targets.append((target, 'has-note'))
                # Explicit publication flags on a note apply to its DB record.
                private = db.execute('SELECT published FROM entities WHERE id=?', (target,)).fetchone()
                if private and not private[0]:
                    db.execute('UPDATE entities SET published=0 WHERE id=?', (eid,))
            for target, predicate in set(targets):
                relation('record:' + h(eid + target + predicate), 'research-record', eid, target, predicate, 'a_to_b', 'recorded', None, None, {'table': table, 'record': r})
    # Fiction passages already have stable Distiller IDs. Fill their reading
    # bodies with the original passage plus literary annotation and source link.
    counts['fiction_passages'] = 0
    for row in source.execute('SELECT f.*,n.text FROM fiction_passages f JOIN nodes n ON n.node_id=f.node_id'):
        r = dict(row)
        eid, bid = 'd:' + r['node_id'], 'b:' + r['book_uid']
        db.execute('UPDATE entities SET body=body || ? WHERE id=?', ('\n\n' + fields_body({k: r[k] for k in ('location', 'note', 'kind', 'score', 'chapter_idx')}), eid))
        if bid in existing:
            relation('passage-book:' + h(eid + bid), 'passage-source', eid, bid, 'from-book', 'a_to_b', 'recorded', None, r.get('note'), r)
        counts['fiction_passages'] += 1
    # Named entities are research connections, distinct from similarity or mesh.
    for row in source.execute('SELECT entity,node_id FROM entities'):
        name, node_id = row
        target = 'd:' + node_id
        concept = 'concept:' + h(name)
        if target not in existing:
            target = 'missing-node:' + node_id
            if target not in existing:
                entity(target, 'Original node reference · ' + node_id, 'reference',
                    'The source database retains this concept mention, but its original node is absent from the nodes table. The original identifier is preserved for reconciliation.',
                    {'missing_node_id': node_id, 'source_table': 'entities'})
                report.setdefault('missing_named_entity_nodes', []).append(node_id)
        if concept not in existing:
            entity(concept, name, 'named-concept', 'Mentions of ' + name + ' across the research collection.', {'origin': 'distiller.entities'})
        relation('mention:' + h(name + '\0' + node_id), 'entity-mention', target, concept, 'mentions', 'a_to_b', 'recorded', None, None, dict(row))
    counts['entities'] = source.execute('SELECT count(*) FROM entities').fetchone()[0]
    report['research_projections'] = counts
    report['table_coverage'] = {}
    already = {'nodes', 'claims', 'books', 'passages', 'links', 'mesh_links', 'mesh_book_pairs', 'mesh_debates', 'mesh_debates_v1'}
    for name, in source.execute("SELECT name FROM sqlite_master WHERE type='table'"):
        if name in counts or name in already:
            report['table_coverage'][name] = 'reader-facing records, evidence, or relationships'
        else:
            report['table_coverage'][name] = 'operational processing history; exact table retained in source database snapshot'
    db.commit()
