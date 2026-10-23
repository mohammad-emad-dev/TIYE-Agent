"""Compose live-only standby inspection without changing release enrollment."""
import ast
import base64
import importlib.util
import json
from pathlib import Path
import zlib

SOURCE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('custody_recovery_sealed_build',SOURCE.parent/'uncertain-shutdown/build.py')
frozen=importlib.util.module_from_spec(spec)
spec.loader.exec_module(frozen)


def generated():
    template=frozen.generated().decode()
    assignment,=[node for node in ast.parse(template).body if isinstance(node,ast.Assign)
        and len(node.targets)==1 and isinstance(node.targets[0],ast.Name) and node.targets[0].id=='parts']
    packed=ast.literal_eval(assignment.value.args[0].args[0])
    parts=json.loads(zlib.decompress(base64.b64decode(packed,validate=True)))
    extension=parts['extension']
    lines=extension.splitlines(keepends=True)
    unused={'custody_status','dispose_evidence_fixture','recover_keeper','recover_bound'}
    definitions=[node for node in ast.parse(extension).body if isinstance(node,ast.FunctionDef) and node.name in unused]
    if {node.name for node in definitions}!=unused:
        raise ValueError('custody-recovery-driver-drift')
    for node in sorted(definitions,key=lambda node:node.lineno,reverse=True):
        del lines[node.lineno-1:node.end_lineno]
    extension=''.join(lines)
    old='custody_status(SimpleNamespace(peer=peer, request=request), view, bound)'
    if extension.count(old)!=1:
        raise ValueError('custody-recovery-status-hook-drift')
    extension=extension.replace(old,old[:-1]+', state)')
    needle="    require(request.get('nonce') == bound.nonce, 'recovery-request-nonce')"
    handlers=[node for node in ast.parse(extension).body if isinstance(node,ast.FunctionDef) and node.name=='recovery_request']
    handler=ast.get_source_segment(extension,handlers[-1])
    if handler.count(needle)!=1:
        raise ValueError('custody-recovery-enrollment-hook-drift')
    handler_new=handler.replace(needle,needle+"\n    if request.get('event') == 'enroll-custody-inspector':\n        document = enroll_custody_inspector(SimpleNamespace(peer=peer, request=request), view, bound, state)\n        send_packet(peer, {'event':'inspector-enrolled','nonce':bound.nonce,'document':document})\n        return False")
    extension=extension.replace(handler,handler_new,1)
    driver=[node for node in ast.parse(extension).body if isinstance(node,ast.FunctionDef) and node.name=='scheduled_unknown_observe'][-1]
    driver_source=ast.get_source_segment(extension,driver)
    cutoff="    recovery_command(b'dispose-supervised-fixture\\n')"
    if driver_source.count(cutoff)!=1:
        raise ValueError('custody-recovery-observer-tail-drift')
    driver_new=driver_source[:driver_source.index(cutoff)]+"    enroll_observed_inspector(witness)"
    extension=extension.replace(driver_source,driver_new,1)
    for name in ('inspector.py','probe.py'):
        extension+='\n'+(SOURCE/name).read_text(encoding='utf-8')
    parts['extension']=extension
    document=json.dumps(parts,sort_keys=True).encode()
    if len(document)>131072 or template.count(repr(packed))!=1:
        raise ValueError('custody-recovery-composition-cap-or-payload-drift')
    template=template.replace("'keeper','observe')","'keeper','observe','inspect_custody')")
    return template.replace(repr(packed),repr(base64.b64encode(zlib.compress(document,9)).decode())).encode()


if __name__=='__main__':
    (SOURCE/'linux_runtime.py').write_bytes(generated())
