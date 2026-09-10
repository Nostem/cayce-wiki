#!/usr/bin/env python3
"""Read-only source reconstruction; --write updates plugin artifacts only."""
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--builder', type=Path, required=True)
p.add_argument('--enrichment', type=Path, required=True)
p.add_argument('--lexicon', type=Path, required=True)
p.add_argument('--literal-index', type=Path, required=True)
p.add_argument('--content', type=Path, required=True)
p.add_argument('--write', action='store_true')
a = p.parse_args()
sys.dont_write_bytecode = True
sys.path.insert(0, str(a.builder.resolve()))
import merge_enrichment_v2 as m
from entity_canonicalization import EntityCanonicalizer

available = {f.stem for f in (a.content / 'readings').glob('*.md')}
records = m.load_records(a.enrichment, EntityCanonicalizer(json.loads(a.lexicon.read_bytes())), len(available))
plan = m.build_entity_plan(m.semantic_memberships(records), m.load_literal_memberships(a.literal_index), min_semantic_readings=3)
result = {}
for group in plan.values():
    members = group['literal_readings'] | group['semantic_readings']
    if len(members) <= 400:
        continue
    slug = 'entities/' + group['filename']
    raw = (a.content / (slug + '.md')).read_text()
    expected = int(re.search(r'^reading_count: (\d+)', raw, re.M)[1])
    ids = sorted({stem for stem, _ in members})
    prefix = {match.split('|')[0].removeprefix('readings/') for match in re.findall(r'\[\[([^\]]+)\]\]', raw)}
    assert len(ids) == expected and set(ids) <= available and prefix <= set(ids), slug
    result[slug] = ids
# Every capped source entity must have been reconstructed, including collisions.
for f in (a.content / 'entities').glob('*.md'):
    match = re.search(r'^reading_count: (\d+)', f.read_text(), re.M)
    if match and int(match[1]) > 400:
        assert 'entities/' + f.stem in result, f
out = Path(__file__).resolve().parent / 'data'
current = json.loads((out / 'complete-memberships.json').read_bytes())
assert {k: set(v) for k,v in current.items()} == {k: set(v) for k,v in result.items()}, 'Reconstruction differs from checked-in membership'
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
inputs = {'lexicon': sha(a.lexicon), 'literal-index': sha(a.literal_index)}
for label, root, pattern in [('builder',a.builder,'*.py'),('enrichment',a.enrichment,'*.json'),('content-readings',a.content/'readings','*.md'),('content-entities',a.content/'entities','*.md')]:
    for f in sorted(root.glob(pattern)):
        inputs[label + '/' + f.name] = sha(f)
payload = json.dumps(result, sort_keys=True, separators=(',', ':')).encode()
provenance = {'schema':1,'algorithm':'merge_enrichment_v2 canonicalization; min_semantic_readings=3; union literal/semantic; retain entities over 400; sorted source stems; validate all counts, prefix links and targets','entities':len(result),'artifact_sha256':hashlib.sha256(payload).hexdigest(),'inputs_sha256':inputs}
if a.write:
    (out / 'complete-memberships.json').write_bytes(payload)
    (out / 'membership-provenance.json').write_text(json.dumps(provenance, sort_keys=True, indent=2)+'\n')
else:
    saved = json.loads((out / 'membership-provenance.json').read_bytes())
    assert saved == provenance, 'Provenance mismatch'
    assert sha(out / 'complete-memberships.json') == provenance['artifact_sha256']
print(json.dumps({'verified_entities':len(result),'artifact_sha256':provenance['artifact_sha256'],'source_files_hashed':len(inputs),'mode':'write' if a.write else 'check'}))
