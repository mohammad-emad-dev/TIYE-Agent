"""Compose the sealed refusal keeper with the shared-schedule observer."""
import ast
import base64
import importlib.util
import json
from pathlib import Path
import zlib

SOURCE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('scheduled_unknown_sealed_build', SOURCE.parent / 'scheduled-unknown/build.py')
frozen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(frozen)


def generated():
    template = frozen.generated().decode('utf-8')
    assignments = [node for node in ast.parse(template).body if isinstance(node, ast.Assign)
                   and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name)
                   and node.targets[0].id == 'parts']
    if len(assignments) != 1:
        raise ValueError('sealed-runtime-parts-drift')
    packed = ast.literal_eval(assignments[0].value.args[0].args[0])
    parts = frozen.frozen.frozen.decode_sources(base64.b64decode(packed, validate=True))
    parts['extension'] += '\n' + (SOURCE / 'observer.py').read_text(encoding='utf-8')
    document = json.dumps(parts, sort_keys=True).encode()
    if len(document) > 131072:
        raise ValueError('decompressed-composition-cap')
    replacement = base64.b64encode(zlib.compress(document, 9)).decode()
    template = frozen.frozen.replace_once(template, repr(packed), repr(replacement))
    template = frozen.frozen.replace_once(template,
        "'keeper','observe','unknown_observe'", "'keeper','observe','unknown_observe','recover_unknown'")
    return template.encode('utf-8')


if __name__ == '__main__':
    (SOURCE / 'linux_runtime.py').write_bytes(generated())
