"""Extend the sealed supervised fixture without changing its evidence cohort."""
import ast
import base64
import importlib.util
import inspect
import json
from pathlib import Path
import zlib

SOURCE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('unknown_sealed_build', SOURCE.parent / 'supervised-broker/build.py')
frozen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(frozen)
COMPONENTS = frozen.COMPONENTS


def replace_once(source, original, replacement):
    if source.count(original) != 1:
        raise ValueError('sealed-extension-hook-drift')
    return source.replace(original, replacement)


def generated():
    parts = {name: path.read_text(encoding='utf-8') for name, path in COMPONENTS.items()}
    broker = (SOURCE.parent / 'retention-broker/broker.py').read_text(encoding='utf-8')
    names = frozen.HELPERS | {'seed'}
    helpers = {node.name: ast.get_source_segment(broker, node) for node in ast.parse(broker).body
               if isinstance(node, ast.FunctionDef) and node.name in names}
    if set(helpers) != names:
        raise ValueError('unknown-keeper-helper-set')
    extension = (SOURCE.parent / 'supervised-broker/extension.py').read_text(encoding='utf-8')
    extension = replace_once(extension, 'retained = view.retain()',
        'retained = retain_or_hold(view, SimpleNamespace(nonce=nonce, observer=observer_identity, '
        'parentfd=parentfd, peer=peer, receiptfd=receiptfd, keeper=own_identity, '
        'startup=startup, properties=properties, lost=lost))')
    extension = replace_once(extension, 'str(child.fileno())], pass_fds=',
        "str(child.fileno()), 'fixed-refusal' if FIXED_REFUSAL else 'ordinary'], pass_fds=")
    parts['extension'] += '\n' + '\n\n'.join(helpers[name] for name in sorted(helpers))
    parts['extension'] += '\n' + extension
    for name in ('holding.py', 'probe.py'):
        parts['extension'] += '\n' + (SOURCE / name).read_text(encoding='utf-8')
    document = json.dumps(parts, sort_keys=True).encode()
    if len(document) > 131072:
        raise ValueError('decompressed-composition-cap')
    packed = base64.b64encode(zlib.compress(document, 9)).decode()
    return ('''"""Generated fixed unknown-state keeper qualification; native disabled."""
import base64,json,zlib,sys
''' + inspect.getsource(frozen.decode_sources) + '''
parts=decode_sources(base64.b64decode(''' + repr(packed) + ''',validate=True))
NS={'__name__':'sealed_runtime_component'}
exec(parts['legacy'],NS)
POLICY={'__name__':'sealed_helper_policy'}
exec(parts['policy'],POLICY)
OBSERVER={'__name__':'sealed_startup_observer','POLICY':POLICY}
exec(parts['observer'],OBSERVER)
NS.update(POLICY=POLICY,STARTUP_OBSERVER=OBSERVER)
for component in ('startup','mount','extension'): exec(parts[component],NS)
if __name__=='__main__':
    NS['os'].umask(0o077)
    if 'BUNDLE' in globals(): NS['run_cases'](BUNDLE)
    else:
        role,directory,nonce=sys.argv[1:4]
        if role not in ('worker','bridge','namespace_worker','keeper','observe','unknown_observe'):
            raise ValueError('fixed-unknown-keeper-role')
        NS[role](NS['Path'](directory),nonce)
''').encode()


if __name__ == '__main__':
    (SOURCE / 'linux_runtime.py').write_bytes(generated())
