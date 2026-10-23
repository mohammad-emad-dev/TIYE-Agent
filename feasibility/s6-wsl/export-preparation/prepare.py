"""Linux descriptor-backed, read-only synthetic manifest preparation."""
from contextlib import ExitStack
from dataclasses import dataclass
import hashlib
import json
import os
import stat

from request import Binding, MAX_BYTES, MAX_ENTRIES, MAX_FILE_BYTES, integer, parse_request, require, selection

DIRECTORY_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
FILE_FLAGS = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC


def stamp(metadata):
    return (metadata.st_dev, metadata.st_ino, metadata.st_mode, metadata.st_uid, metadata.st_gid,
            metadata.st_nlink, metadata.st_size, metadata.st_mtime_ns, metadata.st_ctime_ns)


def private_directory(metadata):
    require(stat.S_ISDIR(metadata.st_mode) and stat.S_IMODE(metadata.st_mode) == 0o700
            and metadata.st_uid == os.geteuid(), 'preparation-private-directory')


def empty_directory(fd):
    # An independent open description prevents caller directory cursor changes.
    scan_fd = os.open('.', DIRECTORY_FLAGS, dir_fd=fd)
    try:
        with os.scandir(scan_fd) as entries:
            require(next(entries, None) is None, 'preparation-destination-not-empty')
    finally:
        os.close(scan_fd)


@dataclass(frozen=True)
class SelectionRequest:
    binding: Binding
    paths: list
    nonce: str
    valid_for: int = 30
    byte_budget: int = MAX_BYTES


def packet(specification, files):
    binding = specification.binding
    return json.dumps({'version': 1, 'scope': 'synthetic-export-plan-v1',
        'session': binding.session, 'generation': binding.generation,
        'ownerEpoch': binding.owner_epoch,
        'source': dict(zip(('device', 'inode'), binding.source)),
        'destination': dict(zip(('device', 'inode'), binding.destination)),
        'nonce': specification.nonce, 'validForSeconds': specification.valid_for,
        'byteBudget': specification.byte_budget,
        'files': files}, sort_keys=True, separators=(',', ':')).encode('ascii')


def selected_names(paths, budget):
    require(type(paths) is list and 1 <= len(paths) <= MAX_ENTRIES, 'preparation-selection-count')
    files, _ = selection([{'path': path, 'bytes': 0, 'sha256': '0' * 64}
                          for path in paths], budget)
    prefixes = {}
    for name, _, _ in files:
        parts = name.split('/')
        for depth in range(1, len(parts) + 1):
            prefix = '/'.join(parts[:depth])
            previous = prefixes.setdefault(prefix.lower(), prefix)
            require(previous == prefix, 'preparation-ancestor-case-alias')
    return files


def validated_names(specification):
    require(type(specification) is SelectionRequest and type(specification.binding) is Binding,
            'preparation-binding')
    require(integer(specification.byte_budget, 1, MAX_BYTES), 'preparation-byte-budget')
    names = selected_names(specification.paths, specification.byte_budget)
    template = [{'path': path, 'bytes': size, 'sha256': digest}
                for path, size, digest in names]
    parse_request(packet(specification, template))
    return [path for path, _, _ in names]


def open_owned(stack, parent, name, flags):
    descriptor = os.open(name, flags, dir_fd=parent)
    stack.callback(os.close, descriptor)
    return descriptor


def pinned_roots(stack, source_fd, destination_fd, binding):
    require(all(type(fd) is int and fd >= 0 for fd in (source_fd, destination_fd)),
            'preparation-directory-descriptors')
    roots = []
    for caller_fd, expected in ((source_fd, binding.source), (destination_fd, binding.destination)):
        before = os.fstat(caller_fd)
        private_directory(before)
        require((before.st_dev, before.st_ino) == expected, 'preparation-root-binding')
        descriptor = open_owned(stack, caller_fd, '.', DIRECTORY_FLAGS)
        require(stamp(os.fstat(descriptor)) == stamp(before), 'preparation-root-open-drift')
        roots.append((descriptor, stamp(before)))
    return roots


@dataclass(frozen=True)
class PinnedNode:
    parent: int
    name: str
    descriptor: int
    original: tuple


class Inventory:
    def __init__(self, stack, source, device):
        self.stack, self.source, self.device = stack, source, device
        self.nodes = {}

    def node(self, parent, components, flags):
        key = tuple(components)
        if key not in self.nodes:
            named = os.stat(components[-1], dir_fd=parent, follow_symlinks=False)
            require(named.st_dev == self.device, 'preparation-cross-device-child')
            if flags == DIRECTORY_FLAGS:
                private_directory(named)
            else:
                require(stat.S_ISREG(named.st_mode), 'preparation-regular-file')
            child = open_owned(self.stack, parent, components[-1], flags)
            require(stamp(os.fstat(child)) == stamp(named), 'preparation-name-open-drift')
            self.nodes[key] = PinnedNode(parent, components[-1], child, stamp(named))
        return self.nodes[key]

    def file(self, path):
        parent = self.source
        parts = path.split('/')
        for depth in range(1, len(parts)):
            parent = self.node(parent, parts[:depth], DIRECTORY_FLAGS).descriptor
        return self.node(parent, parts, FILE_FLAGS)

    def revalidate(self):
        for node in self.nodes.values():
            require(stamp(os.fstat(node.descriptor)) == node.original and
                    stamp(os.stat(node.name, dir_fd=node.parent, follow_symlinks=False)) == node.original,
                    'preparation-final-name-or-content-drift')


def measured_file(node, remaining):
    metadata = os.fstat(node.descriptor)
    require(stat.S_ISREG(metadata.st_mode) and stat.S_IMODE(metadata.st_mode) == 0o600
            and metadata.st_uid == os.geteuid() and metadata.st_nlink == 1,
            'preparation-private-file')
    require(0 <= metadata.st_size <= min(MAX_FILE_BYTES, remaining), 'preparation-content-budget')
    digest = hashlib.sha256()
    unread = metadata.st_size
    while unread:
        chunk = os.read(node.descriptor, min(8192, unread))
        require(bool(chunk), 'preparation-short-read')
        unread -= len(chunk)
        digest.update(chunk)
    require(stamp(os.fstat(node.descriptor)) == node.original, 'preparation-read-drift')
    return metadata.st_size, digest.hexdigest()


def measured_selection(inventory, names, budget):
    measured = []
    for path in names:
        size, digest = measured_file(inventory.file(path), budget)
        budget -= size
        measured.append({'path': path, 'bytes': size, 'sha256': digest})
    return measured


def prepare(source_fd, destination_fd, specification):
    """Return request bytes only; authenticate and revalidate separately.

    Caller handles and their cursors are preserved. OS failures propagate and
    validation raises ValueError; neither yields a partial request or authority.
    """
    names = validated_names(specification)
    with ExitStack() as opened:
        roots = pinned_roots(opened, source_fd, destination_fd, specification.binding)
        source, destination = roots[0][0], roots[1][0]
        empty_directory(destination)
        inventory = Inventory(opened, source, specification.binding.source[0])
        measured = measured_selection(inventory, names, specification.byte_budget)
        payload = packet(specification, measured)
        parse_request(payload)
        inventory.revalidate()
        empty_directory(destination)
        for descriptor, original in roots:
            require(stamp(os.fstat(descriptor)) == original, 'preparation-final-root-drift')
        return payload
