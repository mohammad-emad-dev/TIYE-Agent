"""Compose a bounded shutdown fix and an unchanged parser/worker control."""
import ast
import base64
import importlib.util
import json
from pathlib import Path
import zlib

SOURCE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('shutdown_sealed_build', SOURCE.parent/'retention-broker/build.py')
frozen=importlib.util.module_from_spec(spec)
spec.loader.exec_module(frozen)
COMPONENTS=frozen.COMPONENTS


def function(source, name):
    selected=[ast.get_source_segment(source,node) for node in ast.parse(source).body
              if isinstance(node,ast.FunctionDef) and node.name==name]
    if len(selected)!=1:
        raise ValueError('sealed-function-set-drift')
    return selected[0]


def replace_once(source, original, replacement):
    if source.count(original)!=1:
        raise ValueError('sealed-shutdown-hook-drift')
    return source.replace(original,replacement)


def generated():
    template=frozen.generated().decode('utf-8')
    assignment,=[node for node in ast.parse(template).body if isinstance(node,ast.Assign)
                and len(node.targets)==1 and isinstance(node.targets[0],ast.Name) and node.targets[0].id=='parts']
    packed=ast.literal_eval(assignment.value.args[0].args[0])
    parts=frozen.decode_sources(base64.b64decode(packed,validate=True))
    namespace=function(parts['extension'],'namespace_worker')
    namespace=replace_once(namespace,
        '    reason, sequence, last, observed = lease_loop(nonce)\n    try:',
        '    try:\n        reason, sequence, last, observed = lease_loop(nonce)')
    baseline_worker=function(parts['extension'],'worker').replace('def worker(', 'def baseline_worker(',1)
    baseline_worker=replace_once(baseline_worker, "'namespace_worker'", "'baseline_namespace_worker'")
    baseline_bridge=function(parts['legacy'],'bridge').replace('def bridge(', 'def baseline_bridge(',1)
    baseline_bridge=replace_once(baseline_bridge,"'worker', str(root), nonce]", "'baseline_worker', str(root), nonce]")
    parts['extension']+='\nBASELINE_LEASE=lease_loop\nBASELINE_NAMESPACE=namespace_worker\n'
    parts['extension']+='\n'+(SOURCE/'lease.py').read_text(encoding='utf-8')+'\n'+namespace
    parts['extension']+='\n'+baseline_worker+'\n'+baseline_bridge+'\n'+(SOURCE/'probe.py').read_text(encoding='utf-8')
    document=json.dumps(parts,sort_keys=True).encode()
    if len(document)>131072:
        raise ValueError('decompressed-composition-cap')
    replacement=base64.b64encode(zlib.compress(document,9)).decode()
    template=replace_once(template,repr(packed),repr(replacement))
    template=replace_once(template,"'namespace_worker','broker','relay_observer'",
        "'namespace_worker','broker','relay_observer','baseline_worker','baseline_bridge','baseline_namespace_worker'")
    return template.encode('utf-8')


if __name__=='__main__':
    (SOURCE/'linux_runtime.py').write_bytes(generated())
