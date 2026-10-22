"""Compose the fixed supervised runtime with selected sealed broker primitives."""
import ast
import base64
import importlib.util
import inspect
import json
from pathlib import Path
import zlib

SOURCE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('supervised_sealed_build', SOURCE.parent / 'limited-observer/build.py')
frozen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(frozen)
decode_sources = frozen.decode_sources
COMPONENTS = frozen.COMPONENTS
HELPERS = {'send_packet', 'packet', 'receive_view', 'wait_signaled', 'receipt', 'load_receipt'}


def generated():
    parts = {name: path.read_text(encoding='utf-8') for name, path in COMPONENTS.items()}
    helper_source = (SOURCE.parent / 'retention-broker/broker.py').read_text(encoding='utf-8')
    helpers = {node.name: ast.get_source_segment(helper_source, node)
               for node in ast.parse(helper_source).body if isinstance(node, ast.FunctionDef) and node.name in HELPERS}
    if set(helpers) != HELPERS:
        raise ValueError('sealed-broker-helper-set')
    parts['extension'] += '\n' + '\n\n'.join(helpers[name] for name in sorted(helpers))
    parts['extension'] += '\n' + (SOURCE / 'extension.py').read_text(encoding='utf-8')
    document = json.dumps(parts, sort_keys=True).encode()
    if len(document) > 131072:
        raise ValueError('decompressed-composition-cap')
    packed = base64.b64encode(zlib.compress(document, 9)).decode()
    return ('''"""Generated fixed supervised broker fixture; native candidate disabled."""
import base64,json,zlib,sys
''' + inspect.getsource(decode_sources) + '''
parts=decode_sources(base64.b64decode(''' + repr(packed) + ''',validate=True))
NS={'__name__':'sealed_runtime_component'}
exec(parts['legacy'],NS)
POLICY={'__name__':'sealed_helper_policy'}
exec(parts['policy'],POLICY)
OBSERVER={'__name__':'sealed_startup_observer','POLICY':POLICY}
exec(parts['observer'],OBSERVER)
NS.update(POLICY=POLICY,STARTUP_OBSERVER=OBSERVER)
for component in ('startup','mount','extension'): exec(parts[component],NS)
CAPS,RESERVED=NS['CAPS'],NS['RESERVED']
if __name__=='__main__':
    NS['os'].umask(0o077)
    if 'BUNDLE' in globals(): NS['prepare'](BUNDLE)
    else:
        role,directory,nonce=sys.argv[1:4]
        if role not in ('worker','bridge','namespace_worker','verify_retained','keeper','recover_keeper'):
            raise ValueError('fixed-supervised-role')
        NS[role](NS['Path'](directory),nonce)
''').encode()


if __name__ == '__main__':
    (SOURCE / 'linux_runtime.py').write_bytes(generated())
