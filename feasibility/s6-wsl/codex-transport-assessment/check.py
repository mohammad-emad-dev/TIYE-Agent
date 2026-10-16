"""Seal/check a dated assessment. No process, provider or website is accessed."""
import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path

SOURCE = Path(__file__).resolve()
ROOT = SOURCE.parents[3]
OUT = ROOT / 'output/s4-codex-transport-assessment'
ARCHIVE = ROOT / 'output/s4-codex-schema/schemas.zip'


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def rooted(name):
    path = (ROOT / name).resolve()
    assert path.is_relative_to(ROOT), name
    assert path.is_file(), name
    return path


def validate():
    data = read(OUT / 'readiness.json')
    assert data['phase1Construction'] == data['decision'] == 'HOLD'
    assert data['newNativeExperiments'] == 0 and data['operatorAccountDeclarationReceived']
    assert not any(data[k] for k in ['fullS4Qualified', 'fullS6Qualified', 'productionEligible',
                                    'providerRequestRun', 'currentPolicyRecheck', 'providerInquirySent'])
    assert data['waivedRequirements'] == []
    assert [r['step'] for r in data['s6Overlay']] == list(range(1, 10))
    assert all(r['status'] == 'partial' for r in data['s6Overlay'])
    ids = [r['id'] for r in data['requirements']]
    assert len(ids) == len(set(ids))
    refs = set(data['architectureReferences'] + data['historicalRecordsPreserved'])
    for row in data['requirements']:
        assert row['status'] in ['partial', 'unqualified'] and row['acceptance']
        assert all(dep in ids and dep != row['id'] for dep in row['dependsOn'])
        refs.update(row['evidence'])
    # Cyclic prerequisites cannot define a usable qualification sequence.
    dependencies = {r['id']: r['dependsOn'] for r in data['requirements']}
    def visit(ident, trail):
        assert ident not in trail, ('dependency-cycle', ident)
        for dep in dependencies[ident]:
            visit(dep, trail | {ident})
    for ident in ids:
        visit(ident, set())
    for row in data['s6Overlay']:
        refs.update(row['evidence'])
    for cohort in data['cohorts']:
        path = rooted(cohort['evidence'])
        refs.add(cohort['evidence'])
        report = read(path)
        assert report['fullS4Qualified'] is False and report['fullS6Qualified'] is False
        assert report['phase1Construction'] == 'HOLD'
        for name, digest in report.get('sourceSha256', report.get('sourceHashes', {})).items():
            assert sha(rooted(name).read_bytes()) == digest, name
            refs.add(name)
        for name, digest in report.get('artifactSha256', {}).items():
            target = path.parent / name
            assert sha(target.read_bytes()) == digest, target
            refs.add(target.relative_to(ROOT).as_posix())
        for stream in ['stdout', 'stderr']:
            if isinstance(report.get(stream), dict) and 'sha256' in report[stream]:
                target = path.parent / report[stream].get('artifact', stream + '.bin')
                assert sha(target.read_bytes()) == report[stream]['sha256']
                refs.add(target.relative_to(ROOT).as_posix())
        if 'schemaArchiveSha256' in report:
            assert sha(ARCHIVE.read_bytes()) == report['schemaArchiveSha256']
        if 'tests' in cohort:
            assert report['tests']['exitCode'] == 0
            text = (path.parent / 'tests.stderr.bin').read_text(encoding='utf-8')
            assert re.search(r'\bRan ' + str(cohort['tests']) + r' tests\b', text)
            assert '\nOK' in text
        if 'steps' in cohort:
            assert report['walkthroughSteps'] == cohort['steps']
            assert len(read(path.parent / 'transcript.json')) == cohort['steps']
        if 'scenarios' in cohort:
            assert len(report['scenarios']) == cohort['scenarios']
    capabilities = read(ROOT / 'output/s4-codex-schema/capabilities.json')
    assert sha(ARCHIVE.read_bytes()) == capabilities['archiveSha256']
    with zipfile.ZipFile(ARCHIVE) as archive:
        assert len(archive.namelist()) == capabilities['schemaFileCount'] == data['cohorts'][1]['schemaFiles']
    route = read(ROOT / 'output/s4-codex-candidate/route.json')
    assert route['operatorAccountDeclarationReceived'] and not route['integrationEligible']
    assert not route['nativeAuthQualified'] and not route['modelAccessQualified']
    refs.update(['output/s4-codex-schema/capabilities.json', 'output/s4-codex-schema/schemas.zip'])
    refs.update([SOURCE.relative_to(ROOT).as_posix()])
    refs.update(p.relative_to(ROOT).as_posix() for p in OUT.iterdir() if p.name in ['readiness.json', 'README.md', 'NEXT-RUN.md', 'review.json'])
    for name in refs:
        rooted(name)
    return refs


def index_entry(name):
    raw = rooted(name).read_bytes()
    # Architecture/older planning docs are not protected against checkout EOL conversion.
    normalized = name.startswith('architecture/') or name == 'feasibility/s6-wsl/PLAN.md'
    if normalized:
        raw = raw.decode('utf-8').replace('\r\n', '\n').encode('utf-8')
    return {'sha256': sha(raw), 'mode': 'utf8-lf' if normalized else 'raw-bytes'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--seal', action='store_true')
    args = parser.parse_args()
    refs = validate()
    entries = {name: index_entry(name) for name in sorted(refs)}
    if args.seal:
        assert all((OUT / name).is_file() for name in ['README.md', 'NEXT-RUN.md', 'review.json'])
        with (OUT / 'index.json').open('x', encoding='utf-8', newline='\n') as target:
            target.write(json.dumps({'schema': 'tiye-transport-assessment-index-v1',
                'scope': 'Dated local artifact integrity and reference checks; no source authenticity, current policy, native runtime or requirement qualification',
                'inputSha256': entries}, indent=2) + '\n')
    assert read(OUT / 'index.json')['inputSha256'] == entries
    print('Assessment verified: 6 evidence cohorts, 9 partial S6 rows, 8 open requirement groups; Phase1 HOLD')


if __name__ == '__main__':
    main()
