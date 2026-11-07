"""Meaningful importer checks against a small, isolated source fixture."""
import importlib.util
import json
from pathlib import Path
import sqlite3
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from research_completeness import import_records, markdown_targets


class ResearchImportTests(unittest.TestCase):
    def test_inline_reference_and_embedded_destinations(self):
        text = '[[Claim|label]] ![[media/recording.mp3]] [PDF](../06-PDFs/My%20Book.pdf)\n[ref]: <Data.json>'
        self.assertEqual(markdown_targets(text), ['Claim', 'media/recording.mp3', '../06-PDFs/My Book.pdf', 'Data.json'])

    def test_unassigned_passage_and_orphaned_concept_are_not_dropped(self):
        source = sqlite3.connect(':memory:')
        source.row_factory = sqlite3.Row
        source.executescript("""
          CREATE TABLE passages(highlight_url TEXT,book_uid TEXT,text TEXT,claim_id TEXT,
            location TEXT,category TEXT,annotations TEXT,category_reason TEXT,criterion TEXT,
            claim TEXT,corrected_claim TEXT,verdict TEXT,verified INTEGER,score REAL);
          CREATE TABLE entities(entity TEXT,node_id TEXT);
          CREATE TABLE claims(claim_id TEXT);
          CREATE TABLE books(book_uid TEXT);
          CREATE TABLE nodes(node_id TEXT,text TEXT);
          CREATE TABLE fiction_passages(node_id TEXT);
        """)
        for table in ['chapters','papers','web_sources','syntheses','story_frameworks','further_reading',
                      'essay_architectures','bestseller_projects','bestseller_chapters','bestseller_claim_links',
                      'bestseller_characters','bestseller_claim_sources','nk_bridges','nk_claims','pc_suggestions',
                      'bl_projects','bl_sources','bl_readings','bl_analyses','bl_lineage','bl_factchecks']:
            source.execute('CREATE TABLE ' + table + '(id TEXT)')
        source.execute("INSERT INTO passages(highlight_url,book_uid,text,claim_id) VALUES('source://highlight','book-one','An unassigned exact quotation.',NULL)")
        source.execute("INSERT INTO entities(entity,node_id) VALUES('A preserved concept','absent-node')")
        db = sqlite3.connect(':memory:')
        db.executescript('CREATE TABLE entities(id TEXT PRIMARY KEY,body TEXT,metadata TEXT,published INTEGER);')
        records, relations, aliases, existing = {}, [], [], set()
        def entity(eid, title, kind, body='', metadata=None, **kwargs):
            records[eid] = {'title': title, 'kind': kind, 'body': body, 'metadata': metadata}
            existing.add(eid)
            db.execute('INSERT INTO entities VALUES(?,?,?,1)', (eid, body, json.dumps(metadata or {})))
        def relation(*args):
            relations.append(args)
        report = {}
        import_records(source, db, entity, lambda *a: aliases.append(a), relation, lambda t: t, existing, report)
        passages = [r for r in records.values() if r['kind'] == 'source-passage']
        self.assertEqual(len(passages), 1)
        self.assertIn('An unassigned exact quotation.', passages[0]['body'])
        self.assertIn('missing-node:absent-node', records)
        self.assertEqual(report['missing_named_entity_nodes'], ['absent-node'])
        self.assertEqual(len([r for r in relations if r[1] == 'entity-mention']), 1)
        source.close(); db.close()


if __name__ == '__main__':
    unittest.main()
