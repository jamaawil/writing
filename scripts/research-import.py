#!/usr/bin/env python3
"""Build a non-destructive, reproducible research publication from local sources.

Source databases are opened read-only and backed up with SQLite's backup API.
Original rows, embeddings and notes remain in the private snapshot; the serving
database is a projection. No source file is changed, pruned or regenerated.
"""
import argparse
import collections
import datetime
import hashlib
import io
import mimetypes
from research_completeness import import_records, markdown_targets
import json
import os
from pathlib import Path
import re
import sqlite3
import tarfile
import subprocess
import atexit
import unicodedata
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
YAML_WORKER = None


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def normalized(value):
    value = unicodedata.normalize('NFC', unquote(str(value))).strip().replace('\\', '/')
    value = re.sub(r'^https?://jamaawil\.github\.io/Digitalmind/', '', value, flags=re.I)
    value = re.sub(r'^/?Digitalmind/', '', value, flags=re.I)
    value = re.sub(r'\.(md|html)$', '', value.rstrip('/'), flags=re.I)
    return value.casefold().lstrip('/')


def frontmatter(raw):
    """Metadata is advisory; untouched source bytes are always archived."""
    match = re.match(r'^---\r?\n(.*?)\r?\n---\s*\n?', raw, re.S)
    if not match:
        return {}, raw
    fields = {}
    if YAML_WORKER:
        YAML_WORKER.stdin.write(json.dumps(match[1]) + '\n')
        YAML_WORKER.stdin.flush()
        parsed = YAML_WORKER.stdout.readline()
        if not parsed:
            raise RuntimeError('YAML metadata parser stopped unexpectedly')
        result = json.loads(parsed)
        if 'value' in result:
            fields = result['value']
            fields['_yaml'] = match[1]
            return fields, raw[match.end():]
    for line in match[1].splitlines():
        item = re.match(r'^([\w-]+):\s*(.*)$', line)
        if not item:
            continue
        key, value = item.groups()
        try:
            fields[key] = json.loads(value)
        except (ValueError, TypeError):
            fields[key] = value.strip('"\'')
    fields['_yaml'] = match[1]
    return fields, raw[match.end():]


def json_text(value):
    return json.dumps(value, ensure_ascii=False, default=str, separators=(',', ':'))


def readonly(path, immutable=False):
    conn = sqlite3.connect(path.resolve().as_uri() + '?mode=ro' + ('&immutable=1' if immutable else ''), uri=True)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA query_only=ON')
    return conn


def main():
    global YAML_WORKER
    YAML_WORKER = subprocess.Popen(['node', str(ROOT / 'scripts/research-yaml.js')], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    atexit.register(YAML_WORKER.terminate)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--vault', type=Path, default=Path.home() / 'Documents/Distiller-vault')
    parser.add_argument('--distiller', type=Path, default=Path.home() / 'distiller/state/queue.db')
    parser.add_argument('--mind', type=Path, default=Path.home() / 'Documents/Mind')
    parser.add_argument('--output', type=Path, default=ROOT / '.research')
    args = parser.parse_args()
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    snapshot = args.output / 'snapshots' / stamp
    snapshot.mkdir(parents=True, exist_ok=False)
    report = {'version': 1, 'created_at': stamp, 'source_tables': {}, 'warnings': [], 'snapshots': {}, 'missing_note_paths': []}
    for label, path in [('distiller', args.distiller), ('dmce', args.mind / 'connections/dmce.sqlite3')]:
        print('Snapshot:', label, flush=True)
        src = readonly(path, immutable=label == 'dmce')
        dest = snapshot / (label + '.sqlite3')
        out = sqlite3.connect(dest)
        src.backup(out)
        out.close()
        src.close()
        report['snapshots'][label] = {'file': dest.name, 'bytes': dest.stat().st_size}
    source = readonly(snapshot / 'distiller.sqlite3', immutable=True)
    dmce = readonly(snapshot / 'dmce.sqlite3', immutable=True)
    for label, src in [('distiller', source), ('dmce', dmce)]:
        report['source_tables'][label] = {r[0]: src.execute('SELECT count(*) FROM "' + r[0] + '"').fetchone()[0]
            for r in src.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    db_path = snapshot / 'research.sqlite3'
    db = sqlite3.connect(db_path)
    db.executescript('''
      PRAGMA journal_mode=DELETE;
      CREATE TABLE entities(id TEXT PRIMARY KEY,title TEXT NOT NULL,kind TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',metadata TEXT NOT NULL DEFAULT '{}',source_path TEXT,
        published INTEGER NOT NULL DEFAULT 1,href TEXT);
      CREATE TABLE aliases(alias TEXT NOT NULL,entity_id TEXT NOT NULL,origin TEXT NOT NULL,
        PRIMARY KEY(alias,entity_id,origin));
      CREATE TABLE relations(id TEXT PRIMARY KEY,origin TEXT NOT NULL,source TEXT NOT NULL,
        target TEXT NOT NULL,predicate TEXT,direction TEXT,status TEXT,strength REAL,
        rationale TEXT,raw TEXT NOT NULL);
      CREATE TABLE evidence(id TEXT PRIMARY KEY,entity_id TEXT,book_id TEXT,text TEXT,
        location TEXT,raw TEXT NOT NULL);
      CREATE TABLE source_files(path TEXT PRIMARY KEY,sha256 TEXT NOT NULL,bytes INTEGER NOT NULL,entity_id TEXT);
      CREATE TABLE assets(entity_id TEXT PRIMARY KEY,sha256 TEXT NOT NULL,filename TEXT NOT NULL,mime TEXT NOT NULL,bytes INTEGER NOT NULL);
      CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    ''')
    existing = set()
    aliases = collections.defaultdict(set)

    def alias(value, eid, origin='source'):
        if value:
            aliases[normalized(value)].add((eid, origin))

    def entity(eid, title, kind, body='', metadata=None, path=None, published=True, href=None):
        db.execute('INSERT OR REPLACE INTO entities VALUES (?,?,?,?,?,?,?,?)',
            (eid, str(title or eid), kind, body, json_text(metadata or {}), path, int(published), href))
        existing.add(eid)
        alias(title, eid)

    print('Importing Distiller identities and evidence', flush=True)
    for row in source.execute('SELECT node_id,kind,text,origin,source_ref,doc_type,evidence_tier,indexed_at,content_hash FROM nodes'):
        r = dict(row)
        entity('d:' + r['node_id'], r['text'], 'claim' if r['kind'] == 'claim' else 'passage', body=r['text'] or '', metadata=r)
        alias(r['node_id'], 'd:' + r['node_id'], 'distiller-id')
    for row in source.execute('SELECT * FROM books'):
        r = dict(row)
        entity('b:' + r['book_uid'], (r['author'] + ' — ' if r['author'] else '') + r['title'], 'book', metadata=r)
        alias(r['title'], 'b:' + r['book_uid'])
    for row in source.execute('SELECT * FROM passages'):
        r = dict(row)
        db.execute('INSERT INTO evidence VALUES (?,?,?,?,?,?)',
            (r['highlight_url'], 'd:' + r['claim_id'] if r['claim_id'] else None,
             'b:' + r['book_uid'], r['text'], str(r['location'] or ''), json_text(r)))
    claim_paths = collections.defaultdict(list)
    for row in source.execute('SELECT claim_id,note_path FROM claims WHERE note_path IS NOT NULL'):
        p = Path(row['note_path'])
        claim_paths[normalized(p.name)].append('d:' + row['claim_id'])
    source_titles = collections.defaultdict(list)
    for row in source.execute('SELECT book_uid,title,author FROM books'):
        title = (row['author'] + ' — ' if row['author'] else '') + row['title']
        source_titles[normalized(re.sub(r'[:/\\|#^\[\]"]', '', title))].append('b:' + row['book_uid'])
    kind_by_folder = {'01-Claims': 'claim', '02-Sources': 'book', '04-Passages': 'passage',
        '08-New-Knowledge': 'hypothesis', '14-Web-Claims': 'web-claim', '10-Mesh': 'mesh',
        'MOC notes': 'trail', 'Garden of Claims': 'trail', '07-Learn': 'learning',
        '09-Booklab': 'booklab', '13-Theoria-Themes': 'theme', 'Ontology': 'concept', '_Digests': 'digest', '_archive': 'archive',
        '15-The-Algorithm-Raised-Him': 'manuscript', 'Templates': 'template', 'TaskNotes': 'task'}
    # Inventory every file. Configuration and executable tooling are explicitly
    # accounted for locally, not mistaken for reader-facing research.
    inventory = []
    files = []
    for p in sorted(args.vault.rglob('*')):
        if not p.is_file():
            continue
        parts = p.relative_to(args.vault).parts
        reason = None
        if any(part in ('.git', '.obsidian', '.claude', 'node_modules', '__pycache__') for part in parts):
            reason = 'application configuration or dependency'
        elif parts[0] in ('.pandoc', '_scripts') or p.name == '.DS_Store' or p.name.startswith('.env'):
            reason = 'operational tooling or local system file'
        if reason:
            inventory.append({'path': p.relative_to(args.vault).as_posix(), 'status': 'operational', 'reason': reason, 'bytes': p.stat().st_size})
        else:
            files.append(p)
    asset_dir = snapshot / 'assets'
    asset_dir.mkdir()
    print('Archiving and importing', len(files), 'vault files', flush=True)
    linked_paths = set()
    primary_paths = {}
    primary_names = collections.defaultdict(set)
    wiki_links = []
    metadata_links = []
    with tarfile.open(snapshot / 'vault.tar.gz', 'w:gz', compresslevel=3) as archive:
        for i, path in enumerate(files):
            relative = path.relative_to(args.vault).as_posix()
            raw_bytes = path.read_bytes()
            info = archive.gettarinfo(str(path), arcname=relative)
            info.size = len(raw_bytes)
            archive.addfile(info, io.BytesIO(raw_bytes))
            eid = None
            if path.suffix.lower() == '.md':
                raw = raw_bytes.decode('utf-8', errors='replace')
                fm, body = frontmatter(raw)
                folder = relative.split('/')[0]
                kind = kind_by_folder.get(folder, 'note')
                ids = claim_paths.get(normalized(path.name), []) if folder == '01-Claims' else []
                if folder == '02-Sources':
                    ids = source_titles.get(normalized(path.stem), [])
                if not ids:
                    ids = ['v:' + digest(normalized(relative))[:32]]
                eid = ids[0]
                title = fm.get('claim') or fm.get('title') or next((s.lstrip('# ').strip() for s in body.splitlines() if s.startswith('# ')), path.stem)
                # A filename collision must not overwrite the other claim's
                # statement with this note's title. Keep both original IDs.
                if folder == '01-Claims' and len(ids) > 1:
                    exact = [i for i in ids if normalized(db.execute('SELECT title FROM entities WHERE id=?', (i,)).fetchone()[0]) == normalized(title)]
                    if exact:
                        ids = exact
                public = not (fm.get('private') in (True, 'true') or fm.get('draft') in (True, 'true') or fm.get('publish') in (False, 'false'))
                for eid in ids:
                    prior = db.execute('SELECT metadata FROM entities WHERE id=?', (eid,)).fetchone()
                    meta = json.loads(prior[0]) if prior else {}
                    meta['frontmatter'] = fm
                    entity(eid, title, kind, body, meta, relative, public)
                    alias(relative, eid, 'vault')
                    alias(path.stem, eid, 'vault')
                    for value in fm.get('aliases', []) if isinstance(fm.get('aliases'), list) else []:
                        alias(value, eid, 'obsidian-alias')
                    alias(relative.lower().replace(' ', '-'), eid, 'legacy')
                    for field in ('derived_from', 'parent_claims', 'sources', 'source', 'source_books', 'related', 'connections', 'up', 'parents'):
                        values = fm.get(field, [])
                        for value in values if isinstance(values, list) else [values]:
                            if isinstance(value, str) and value.strip():
                                metadata_links.append((eid, re.sub(r'^\[\[|\]\]$', '', value.strip()), field, relative))

                    for target in markdown_targets(raw):
                        wiki_links.append((eid, target.split('#')[0], relative))
                if folder == '01-Claims':
                    linked_paths.add(normalized(path.name))
                primary_paths[normalized(relative)] = eid
                primary_names[normalized(path.stem)].add(eid)
            else:
                suffix = path.suffix.lower()
                kind = {'.canvas': 'canvas', '.base': 'view', '.bib': 'bibliography', '.json': 'data', '.txt': 'document', '.html': 'document'}.get(suffix, 'attachment')
                eid = 'v:' + digest(normalized(relative))[:32]
                sha = hashlib.sha256(raw_bytes).hexdigest()
                metadata = {'filename': path.name, 'sha256': sha, 'bytes': len(raw_bytes)}
                body = ''
                if suffix in ('.canvas', '.base', '.bib', '.json', '.txt', '.html', '.csv'):
                    text = raw_bytes.decode('utf-8', errors='replace')
                    body = '```' + ('json' if suffix in ('.canvas', '.json') else '') + '\n' + text + '\n```'
                if suffix == '.canvas':
                    try:
                        canvas = json.loads(raw_bytes)
                        metadata['canvas'] = canvas
                        body = '\n\n'.join('## ' + str(n.get('label') or n.get('id')) + '\n\n' + str(n.get('text') or ('[[' + n['file'] + ']]' if n.get('file') else n.get('url') or '')) for n in canvas.get('nodes', []))
                    except (ValueError, KeyError):
                        report['warnings'].append('Canvas requires manual reconciliation: ' + relative)
                entity(eid, path.stem, kind, body, metadata, relative)
                # All non-Markdown originals are downloadable byte for byte.
                asset_path = asset_dir / sha
                if not asset_path.exists():
                    asset_path.write_bytes(raw_bytes)
                db.execute('INSERT INTO assets VALUES (?,?,?,?,?)', (eid, sha, path.name, mimetypes.guess_type(path.name)[0] or 'application/octet-stream', len(raw_bytes)))
                primary_paths[normalized(relative)] = eid
                primary_names[normalized(path.name)].add(eid)
                primary_names[normalized(path.stem)].add(eid)
                alias(relative, eid, 'vault')
                alias(path.name, eid, 'vault')
                alias(path.stem, eid, 'vault')
                for target in markdown_targets(body):
                    wiki_links.append((eid, target.split('#')[0], relative))
            published = db.execute('SELECT published FROM entities WHERE id=?', (eid,)).fetchone()[0]
            inventory.append({'path': relative, 'status': 'included' if published else 'private', 'entity_id': eid, 'sha256': hashlib.sha256(raw_bytes).hexdigest(), 'bytes': len(raw_bytes), 'reason': None if published else 'explicit private, draft, or publish:false metadata'})
            db.execute('INSERT INTO source_files VALUES (?,?,?,?)', (relative, hashlib.sha256(raw_bytes).hexdigest(), len(raw_bytes), eid))
            if i and i % 25000 == 0:
                db.commit()
                print('Vault files:', i, flush=True)
    report['vault_files'] = len(files)
    report['coverage'] = dict(collections.Counter(r['status'] for r in inventory))
    report['coverage']['total'] = len(inventory)
    report['coverage']['unaccounted'] = 0
    (snapshot / 'vault-coverage.json').write_text(json.dumps(inventory, ensure_ascii=False, indent=2))
    report['missing_note_paths'] = [r['note_path'] for r in source.execute('SELECT note_path FROM claims WHERE note_path IS NOT NULL')
        if normalized(Path(r['note_path']).name) not in linked_paths]
    # Include existing site content and keep original page URLs.
    site_map = {'essays': 'essay', 'zettel': 'zettel', 'library': 'library', 'ideas': 'ideas',
        'scholars': 'scholars', 'projects': 'projects', 'definitions': 'dictionary', 'topics': 'topic'}
    with tarfile.open(snapshot / 'website-content.tar.gz', 'w:gz', compresslevel=3) as archive:
        for path in sorted((ROOT / 'content').rglob('*.md')):
            relative = path.relative_to(ROOT / 'content').as_posix()
            archive.add(path, arcname=relative, recursive=False)
            raw = path.read_text(errors='replace')
            fm, body = frontmatter(raw)
            folder = relative.split('/')[0]
            slug = fm.get('slug') or path.stem
            eid = 's:' + digest(normalized(relative))[:32]
            kind = 'note' if folder == 'zettel' else folder.rstrip('s')
            href = f'/{site_map[folder]}/{slug}/' if folder in site_map and folder != 'definitions' else None
            if folder == 'definitions':
                href = '/dictionary/#word-' + slug
            entity(eid, fm.get('title') or path.stem, kind, body, {'frontmatter': fm}, 'website/' + relative,
                not (fm.get('private') is True or fm.get('draft') is True or fm.get('publish') is False), href)
            alias(relative, eid, 'website')
            alias(slug, eid, 'website')
            for target in markdown_targets(raw):
                wiki_links.append((eid, target.split('#')[0], relative))
    # These generated reading surfaces exist only in Digitalmind, not the vault.
    # Preserve their text as well as their source-address aliases.
    with tarfile.open(snapshot / 'digitalmind-supplement.tar.gz', 'w:gz', compresslevel=3) as archive:
        for folder, kind in [('05-Glossary', 'glossary'), ('02-Library', 'map'), ('03-Themes', 'theme')]:
            for path in sorted((args.mind / 'content' / folder).glob('*.md')):
                relative = path.relative_to(args.mind / 'content').as_posix()
                raw_bytes = path.read_bytes()
                info = archive.gettarinfo(str(path), arcname=relative)
                info.size = len(raw_bytes)
                archive.addfile(info, io.BytesIO(raw_bytes))
                raw = raw_bytes.decode('utf-8', errors='replace')
                fm, body = frontmatter(raw)
                title = next((s[2:].strip() for s in body.splitlines() if s.startswith('# ')), fm.get('title') or path.stem)
                eid = 'q:' + digest(normalized(relative))[:32]
                entity(eid, title, kind, body, {'frontmatter': fm, 'origin': 'digitalmind'}, 'mind/' + relative)
                alias(relative, eid, 'digitalmind')
                alias(path.stem, eid, 'digitalmind')
                primary_paths[normalized(relative)] = eid
                primary_names[normalized(path.stem)].add(eid)
                db.execute('INSERT INTO source_files VALUES (?,?,?,?)', ('mind/' + relative, hashlib.sha256(raw_bytes).hexdigest(), len(raw_bytes), eid))
                for target in markdown_targets(raw):
                    wiki_links.append((eid, target.split('#')[0], relative))
    # Retain exact legacy slugs and existing graph positions from the publication.
    old_graph = args.mind / 'pipeline/data/graph-nodes.json'
    if old_graph.exists():
        for n in json.loads(old_graph.read_text()):
            eid = 'd:' + n['id']
            if eid in existing:
                alias(n['slug'], eid, 'digitalmind')
                alias(n.get('filename'), eid, 'digitalmind')
        for name in ['graph-nodes.json', 'graph-edges.json', 'glossary-results.json', 'maturity.json']:
            p = args.mind / 'pipeline/data' / name
            if p.exists():
                (snapshot / name).write_bytes(p.read_bytes())

    def resolve(target):
        key = normalized(target)
        if key in primary_paths:
            return primary_paths[key]
        direct_notes = primary_names.get(key, set())
        if len(direct_notes) == 1:
            return next(iter(direct_notes))
        hits = {eid for eid, _ in aliases.get(normalized(target), set())}
        if not hits:
            hits = {eid for eid, _ in aliases.get(normalized(Path(target).name), set())}
        if len(hits) == 1:
            return next(iter(hits))
        # Ambiguous and unresolved source references have their own honest record;
        # exact original text and candidates are retained, never guessed or deleted.
        eid = 'r:' + digest(normalized(target))[:32]
        if eid not in existing:
            entity(eid, target, 'reference', metadata={'reference': target, 'candidates': sorted(hits)})
            alias(target, eid, 'reference')
        return eid

    print('Importing all relationship assessments', flush=True)
    def relation(rid, origin, a, b, predicate, direction, status, strength, why, raw):
        db.execute('INSERT INTO relations VALUES (?,?,?,?,?,?,?,?,?,?)',
            (rid, origin, a, b, predicate, direction, status, strength, why, json_text(raw)))
    for a, target, field, path in metadata_links:
        if re.match(r'^(https?://|mailto:)', target, re.I):
            continue
        b = resolve(target.split('|')[0])
        rid = 'property:' + digest(a + '\0' + field + '\0' + target)
        db.execute('INSERT OR IGNORE INTO relations VALUES (?,?,?,?,?,?,?,?,?,?)',
            (rid, 'note-property', a, b, field.replace('_', '-'), 'a_to_b', 'authored', None, None, json_text({'field': field, 'value': target, 'file': path})))
    import_records(source, db, entity, alias, relation, resolve, existing, report)
    # Each Canvas keeps every node, coordinates, label, and edge. File nodes
    # point to their actual records; text/group nodes get stable reading pages.
    for canvas in list(db.execute("SELECT id,metadata,source_path,published FROM entities WHERE kind='canvas'")):
        eid, metadata, canvas_path, public = canvas
        data = json.loads(metadata).get('canvas', {})
        node_ids = {}
        for n in data.get('nodes', []):
            nid = 'canvas:' + digest(eid + '\0' + n['id'])[:32]
            node_ids[n['id']] = nid
            entity(nid, n.get('label') or (n.get('text') or n.get('file') or n.get('url') or n['id'])[:160], 'canvas-node', n.get('text') or ('[[' + n['file'] + ']]' if n.get('file') else n.get('url') or ''), {'canvas_node': n}, published=bool(public))
            relation('canvas-member:' + nid, 'canvas', eid, nid, 'contains', 'a_to_b', 'authored', None, None, n)
            if n.get('file'):
                relation('canvas-file:' + nid, 'canvas', nid, resolve(n['file']), 'opens', 'a_to_b', 'authored', None, None, n)
        for edge in data.get('edges', []):
            a, b = node_ids.get(edge['fromNode']), node_ids.get(edge['toNode'])
            if a and b:
                direction = 'mutual' if edge.get('fromEnd') == 'arrow' and edge.get('toEnd', 'arrow') == 'arrow' else 'b_to_a' if edge.get('fromEnd') == 'arrow' else 'a_to_b' if edge.get('toEnd', 'arrow') == 'arrow' else 'undirected'
                relation('canvas-edge:' + digest(eid + edge['id']), 'canvas', a, b, edge.get('label') or 'connects', direction, 'authored', None, None, edge)
    for i, row in enumerate(source.execute('SELECT * FROM links')):
        r = dict(row)
        a, b = 'd:' + r['src_node_id'], 'd:' + r['dst_node_id']
        for eid in (a, b):
            if eid not in existing:
                entity(eid, eid[2:], 'reference', metadata={'source': 'distiller-links'})
        relation('link:' + digest(r['src_node_id'] + '\0' + r['dst_node_id']), 'distiller', a, b,
            r['predicate'], 'a_to_b', r['status'], r['strength'], None, r)
        if i % 100000 == 0:
            db.commit()
    for row in source.execute('SELECT * FROM mesh_links'):
        r = dict(row)
        relation('mesh:' + digest(r['claim_a'] + '\0' + r['claim_b']), 'mesh', 'd:' + r['claim_a'], 'd:' + r['claim_b'],
            r['relation'], r['direction'], 'unreviewed', r['strength'], r['why'], r)
    for table, kind, key in [('mesh_book_pairs', 'book-conversation', None), ('mesh_debates', 'debate', 'debate_id'), ('mesh_debates_v1', 'debate-history', 'debate_id')]:
        for row in source.execute('SELECT * FROM ' + table):
            r = dict(row)
            source_key = str(r[key]) if key else r['book_a'] + '\0' + r['book_b']
            eid = table + ':' + digest(source_key)[:32]
            entity(eid, r.get('title') or r.get('label') or 'Book conversation', kind, r.get('note') or '', r)
            if key:
                for cid in json.loads(r.get('claims') or '[]'):
                    target = 'd:' + cid
                    if target in existing:
                        relation('member:' + digest(eid + target), table, eid, target, 'discusses', 'a_to_b', 'unreviewed', None, None, r)
            else:
                for bid in (r['book_a'], r['book_b']):
                    relation('member:' + digest(eid + bid), table, eid, 'b:' + bid, 'discusses', 'a_to_b', 'unreviewed', None, None, r)
    dmce_ids = {}
    for row in dmce.execute('SELECT * FROM notes'):
        r = dict(row)
        eid = resolve(r['note_id'])
        dmce_ids[r['note_id']] = eid
        if r['is_private']:
            db.execute('UPDATE entities SET published=0 WHERE id=?', (eid,))
        alias(r['note_id'], eid, 'dmce')
    for row in dmce.execute('SELECT * FROM edges'):
        r = dict(row)
        relation('dmce:' + r['edge_id'], 'dmce', dmce_ids[r['note_a']], dmce_ids[r['note_b']],
            r['relation_type'] or 'similar', 'mutual', r['status'], r['similarity'], r['rationale'], r)
    # Markdown links are another source of knowledge, independent of machine edges.
    for a, target, path in wiki_links:
        if not target:
            continue
        if re.match(r'^(https?://|mailto:|#)', target, re.I):
            continue
        # Prefer a real path relative to the note, then vault-root aliases.
        local = os.path.normpath(str(Path(path).parent / unquote(target)))
        b = primary_paths.get(normalized(local)) or resolve(target)
        rid = 'wiki:' + digest(a + '\0' + target)
        if db.execute('SELECT 1 FROM relations WHERE id=?', (rid,)).fetchone():
            continue
        relation(rid, 'wikilink', a, b, 'links-to', 'a_to_b', 'authored', None, None, {'target': target, 'file': path})
    # Publication exclusions follow source evidence and DB projections, too.
    db.execute("""UPDATE entities SET published=0 WHERE id IN (
      SELECT r.target FROM relations r JOIN entities e ON e.id=r.source
      WHERE r.origin='source-evidence' AND r.predicate='has-evidence' AND e.published=0)""")
    db.execute("""UPDATE entities SET published=0 WHERE id IN (
      SELECT r.source FROM relations r JOIN entities e ON e.id=r.target
      WHERE r.origin='research-record' AND r.predicate='about-claim' AND e.published=0)""")
    public_by_id = dict(db.execute('SELECT id,published FROM entities'))
    for record in inventory:
        if record.get('entity_id'):
            record['status'] = 'included' if public_by_id[record['entity_id']] else 'private'
            if record['status'] == 'private':
                record['reason'] = 'explicit private, draft, or publish:false metadata'
    report['coverage'] = dict(collections.Counter(r['status'] for r in inventory))
    report['coverage'].update({'total': len(inventory), 'unaccounted': 0})
    (snapshot / 'vault-coverage.json').write_text(json.dumps(inventory, ensure_ascii=False, indent=2))
    print('Indexing aliases and full-text search', flush=True)
    db.executemany('INSERT OR IGNORE INTO aliases VALUES (?,?,?)',
        ((a, eid, origin) for a, entries in aliases.items() for eid, origin in entries))
    db.executescript('''
      CREATE INDEX relations_source ON relations(source,origin,status);
      CREATE INDEX relations_target ON relations(target,origin,status);
      CREATE INDEX entities_kind ON entities(published,kind,title);
      CREATE INDEX entities_id_kind ON entities(id,published,kind);
      CREATE INDEX aliases_entity ON aliases(entity_id);
      CREATE INDEX evidence_entity ON evidence(entity_id);
      CREATE INDEX evidence_book ON evidence(book_id);
      CREATE VIRTUAL TABLE search USING fts5(entity_id UNINDEXED,title,body,tokenize='unicode61 remove_diacritics 2');
      INSERT INTO search(entity_id,title,body)
        SELECT id,title,body || ' ' || coalesce(json_extract(metadata,'$.frontmatter'),'') FROM entities WHERE published=1;
      CREATE VIRTUAL TABLE evidence_search USING fts5(entity_id UNINDEXED,text,tokenize='unicode61 remove_diacritics 2');
      INSERT INTO evidence_search SELECT e.entity_id,e.text FROM evidence e
        JOIN entities n ON n.id=e.entity_id WHERE n.published=1;
    ''')
    report['coverage']['searchable_files'] = db.execute('SELECT count(*) FROM source_files f JOIN entities e ON e.id=f.entity_id WHERE e.published=1 AND f.path NOT LIKE \'mind/%\'').fetchone()[0]
    report['coverage']['downloadable_files'] = db.execute('SELECT count(*) FROM assets').fetchone()[0]
    report['coverage']['attachments_bytes'] = db.execute('SELECT coalesce(sum(bytes),0) FROM assets').fetchone()[0]
    report['entities'] = dict(db.execute('SELECT kind,count(*) FROM entities GROUP BY kind'))
    report['relations'] = dict(db.execute('SELECT origin,count(*) FROM relations GROUP BY origin'))
    report['dangling_relations'] = db.execute('''SELECT count(*) FROM relations r
      LEFT JOIN entities a ON a.id=r.source LEFT JOIN entities b ON b.id=r.target
      WHERE a.id IS NULL OR b.id IS NULL''').fetchone()[0]
    report['invalid_mesh_directions'] = db.execute("SELECT count(*) FROM relations WHERE origin='mesh' AND predicate!='none' AND (direction IS NULL OR direction NOT IN ('a_to_b','b_to_a','mutual'))").fetchone()[0]
    for origin, expected in [('distiller', report['source_tables']['distiller']['links']),
                             ('mesh', report['source_tables']['distiller']['mesh_links']),
                             ('dmce', report['source_tables']['dmce']['edges'])]:
        if report['relations'].get(origin) != expected:
            raise RuntimeError('Incomplete relationship import: ' + origin)
    if report['dangling_relations']:
        raise RuntimeError('Relationship endpoints are missing')
    db.execute('INSERT INTO metadata VALUES (?,?)', ('manifest', json_text(report)))
    db.commit()
    if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
        raise RuntimeError('Serving database integrity check failed')
    db.close()
    source.close()
    dmce.close()
    print('Hashing immutable publication files', flush=True)
    for path in sorted(snapshot.iterdir()):
        if path.is_dir():
            continue
        h = hashlib.sha256()
        with path.open('rb') as handle:
            for block in iter(lambda: handle.read(8 * 1024 * 1024), b''):
                h.update(block)
        report['snapshots'][path.name] = {'bytes': path.stat().st_size, 'sha256': h.hexdigest()}
    (snapshot / 'manifest.json').write_text(json.dumps(report, indent=2, ensure_ascii=False))
    pointer = args.output / 'current.json.tmp'
    pointer.write_text(json.dumps({'database': str(db_path), 'manifest': str(snapshot / 'manifest.json')}))
    os.replace(pointer, args.output / 'current.json')
    print(json.dumps({k: report[k] for k in ['entities', 'relations', 'dangling_relations', 'invalid_mesh_directions']}, indent=2), flush=True)
    print('Snapshot:', snapshot, flush=True)


if __name__ == '__main__':
    main()
