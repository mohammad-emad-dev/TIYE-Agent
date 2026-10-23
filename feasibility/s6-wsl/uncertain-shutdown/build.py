"""Add authenticated custody inspection to the sealed supervised shutdown runtime."""
import ast
import base64
import importlib.util
import json
from pathlib import Path
import zlib

SOURCE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('uncertain_sealed_build',SOURCE.parent/'supervised-shutdown/build.py')
frozen=importlib.util.module_from_spec(spec)
spec.loader.exec_module(frozen)


def generated():
    template=frozen.generated().decode('utf-8')
    assignment,=[node for node in ast.parse(template).body if isinstance(node,ast.Assign)
        and len(node.targets)==1 and isinstance(node.targets[0],ast.Name) and node.targets[0].id=='parts']
    packed=ast.literal_eval(assignment.value.args[0].args[0])
    parts=json.loads(zlib.decompress(base64.b64decode(packed,validate=True)))
    extension=parts['extension']
    lines=extension.splitlines(keepends=True)
    unused={'scheduled_unknown_observe','refusal_observation'}
    definitions=[node for node in ast.parse(extension).body if isinstance(node,ast.FunctionDef) and node.name in unused]
    if {node.name for node in definitions}!=unused:
        raise ValueError('uncertain-sealed-driver-drift')
    for node in sorted(definitions,key=lambda node:node.lineno,reverse=True):
        del lines[node.lineno-1:node.end_lineno]
    extension=''.join(lines)
    handlers=frozen.functions(extension,'recovery_request')
    handler=ast.get_source_segment(extension,handlers[-1])
    needle="    require(request.get('nonce') == bound.nonce, 'recovery-request-nonce')"
    if handler.count(needle)!=1:
        raise ValueError('uncertain-custody-hook-drift')
    patched=handler.replace(needle,needle+"\n    if request.get('event') == 'probe-custody':\n        send_packet(peer, custody_status(SimpleNamespace(peer=peer, request=request), view, bound))\n        return False")
    extension=extension.replace(handler,patched,1)
    for name in ('custody.py','probe.py'):
        extension+='\n'+(SOURCE/name).read_text(encoding='utf-8')
    parts['extension']=extension
    document=json.dumps(parts,sort_keys=True).encode()
    if len(document)>131072 or template.count(repr(packed))!=1:
        raise ValueError('uncertain-composition-cap-or-hook-drift')
    return template.replace(repr(packed),repr(base64.b64encode(zlib.compress(document,9)).decode())).encode()


if __name__=='__main__':
    (SOURCE/'linux_runtime.py').write_bytes(generated())
