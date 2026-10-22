"""Apply sealed lease correction and unknown shutdown custody to Windows supervision."""
import ast
import base64
import importlib.util
import json
from pathlib import Path
import zlib

SOURCE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('shutdown_integrated_sealed_build',SOURCE.parent/'enrollment-interruption/build.py')
frozen=importlib.util.module_from_spec(spec)
spec.loader.exec_module(frozen)


def functions(source,name):
    return [node for node in ast.parse(source).body if isinstance(node,ast.FunctionDef) and node.name==name]


def generated():
    template=frozen.generated().decode('utf-8')
    assignment,=[node for node in ast.parse(template).body if isinstance(node,ast.Assign)
        and len(node.targets)==1 and isinstance(node.targets[0],ast.Name) and node.targets[0].id=='parts']
    packed=ast.literal_eval(assignment.value.args[0].args[0])
    parts=frozen.frozen.frozen.frozen.frozen.decode_sources(base64.b64decode(packed,validate=True))
    unused={'scheduled_unknown_observe','refusal_observation','inspect_enrollment','discard_enrollment_ack',
        'refuse_foreign_inspection','verify_partial_fixture_record','exercise_interruption',
        'dispose_interruption_fixture',
        'recover_unknown','recovery_records','refused_early_release','refuse_foreign_successor'}
    lines=parts['extension'].splitlines(keepends=True)
    definitions=[node for node in ast.parse(parts['extension']).body if isinstance(node,ast.FunctionDef) and node.name in unused]
    if {node.name for node in definitions}!=unused:
        raise ValueError('sealed-shutdown-unused-set-drift')
    for node in sorted(definitions,key=lambda node:node.lineno,reverse=True):
        del lines[node.lineno-1:node.end_lineno]
    extension=''.join(lines)
    namespace,=functions(extension,'namespace_worker')
    replacement=ast.get_source_segment(extension,namespace)
    old='    reason, sequence, last, observed = lease_loop(nonce)\n    try:'
    if replacement.count(old)!=1:
        raise ValueError('sealed-worker-stop-hook-drift')
    replacement=replacement.replace(old,'    try:\n        reason, sequence, last, observed = lease_loop(nonce)')
    keeper,=[node for node in functions(extension,'keeper')
             if 'own_identity = identity(os.getpid())' in ast.get_source_segment(extension,node)]
    keeper_source=ast.get_source_segment(extension,keeper)
    old='        started = _wait_cleanup(witness)\n        reason = terminal_evidence(witness)'
    new=('        started, reason = keeper_shutdown(view, SimpleNamespace(rootfd=rootfd, nonce=nonce, '
         'observer=observer_identity, parentfd=parentfd, peer=peer, receiptfd=receiptfd, keeper=own_identity, '
         'startup=startup, properties=properties, lost=lost), witness)')
    if keeper_source.count(old)!=1:
        raise ValueError('sealed-keeper-shutdown-hook-drift')
    extension=extension.replace(keeper_source,keeper_source.replace(old,new),1)
    lease=(SOURCE.parent/'shutdown-evidence/lease.py').read_text(encoding='utf-8')
    lease_function,=functions(lease,'lease_loop')
    extension+='\n'+ast.get_source_segment(lease,lease_function)+'\n'+replacement
    extension+='\n'+(SOURCE/'shutdown.py').read_text(encoding='utf-8')
    parts['extension']=extension
    document=json.dumps(parts,sort_keys=True).encode()
    if len(document)>131072:
        raise ValueError('decompressed-composition-cap')
    replacement=base64.b64encode(zlib.compress(document,9)).decode()
    if template.count(repr(packed))!=1:
        raise ValueError('sealed-runtime-payload-drift')
    template=template.replace(",'recover_unknown'",'')
    return template.replace(repr(packed),repr(replacement)).encode('utf-8')


if __name__=='__main__':
    (SOURCE/'linux_runtime.py').write_bytes(generated())
