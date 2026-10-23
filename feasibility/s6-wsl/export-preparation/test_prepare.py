"""Owned Linux filesystem fixtures; no native user data or export execution."""
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from prepare import DIRECTORY_FLAGS, SelectionRequest, prepare
from request import Binding, parse_request


class PreparationTests(unittest.TestCase):
    def setUp(self):
        self.source_temp = tempfile.TemporaryDirectory(prefix='tiye-prepare-', dir='/dev/shm')
        self.addCleanup(self.source_temp.cleanup)
        self.destination_temp = tempfile.TemporaryDirectory(prefix='tiye-prepare-', dir='/tmp')
        self.addCleanup(self.destination_temp.cleanup)
        self.source = Path(self.source_temp.name)
        self.destination = Path(self.destination_temp.name)
        self.source_fd = os.open(self.source, DIRECTORY_FLAGS)
        self.addCleanup(os.close, self.source_fd)
        self.destination_fd = os.open(self.destination, DIRECTORY_FLAGS)
        self.addCleanup(os.close, self.destination_fd)
        self.binding = self.bind(self.source_fd, self.destination_fd)
        self.write('alpha.txt', b'alpha')

    @staticmethod
    def bind(source, destination):
        first, second = os.fstat(source), os.fstat(destination)
        return Binding('1' * 32, 1, '2' * 32, (first.st_dev, first.st_ino),
                       (second.st_dev, second.st_ino))

    def write(self, name, data):
        path = self.source / name
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        path.write_bytes(data)
        path.chmod(0o600)
        return path

    def run_prepare(self, paths=None, **options):
        specification = SelectionRequest(options.pop('binding', self.binding),
            ['alpha.txt'] if paths is None else paths, '3' * 32, **options)
        return prepare(self.source_fd, self.destination_fd, specification)

    def refused(self, paths=None, **options):
        with self.assertRaises((ValueError, OSError)):
            self.run_prepare(paths, **options)
        self.assertEqual(list(self.destination.iterdir()), [])

    def test_measured_manifest_and_caller_descriptors(self):
        self.write('nested/beta.txt', b'beta' * 1024)
        self.write('empty.txt', b'')
        offsets = [os.lseek(fd, 0, os.SEEK_CUR) for fd in (self.source_fd, self.destination_fd)]
        parsed = parse_request(self.run_prepare(['nested/beta.txt', 'empty.txt', 'alpha.txt']))
        self.assertEqual(parsed.binding, self.binding)
        self.assertEqual(parsed.total_bytes, 4101)
        self.assertEqual(parsed.files, tuple((name, len(data), hashlib.sha256(data).hexdigest())
            for name, data in [('alpha.txt', b'alpha'), ('empty.txt', b''),
                               ('nested/beta.txt', b'beta' * 1024)]))
        self.assertEqual(offsets, [os.lseek(fd, 0, os.SEEK_CUR)
                                  for fd in (self.source_fd, self.destination_fd)])
        self.assertEqual(list(self.destination.iterdir()), [])
        self.assertEqual((self.source / 'alpha.txt').read_bytes(), b'alpha')

    def test_bad_selection_before_opens(self):
        for paths in ([], ['../escape'], ['/absolute'], ['a//b'], ['CON.txt'],
                      ['alpha.txt', 'ALPHA.txt'], ['a', 'a/b'], ['a/x', 'A/y'],
                      ['x'] * 65, ['a/' * 6 + 'b'], ['a' * 65], [True]):
            with self.subTest(paths=paths), patch('prepare.os.open') as opening:
                self.refused(paths)
                opening.assert_not_called()

    def test_serialized_packet_bound(self):
        paths = [('/'.join(['a' * 60] * 5) + '/' + str(i)) for i in range(64)]
        with patch('prepare.os.open') as opening:
            self.refused(paths)
            opening.assert_not_called()

    def test_invalid_metadata_before_opens(self):
        for options in ({'valid_for': True}, {'valid_for': 61}, {'byte_budget': 0},
                        {'byte_budget': True}, {'byte_budget': 131073}, {'binding': None}):
            with self.subTest(options=options), patch('prepare.os.open') as opening:
                self.refused(**options)
                opening.assert_not_called()

    def test_symlink_leaf_and_ancestor(self):
        (self.source / 'link.txt').symlink_to('alpha.txt')
        (self.source / 'directory').symlink_to(self.source, target_is_directory=True)
        self.refused(['link.txt'])
        self.refused(['directory/alpha.txt'])

    def test_hardlink_fifo_and_directory(self):
        os.link(self.source / 'alpha.txt', self.source / 'hard.txt')
        self.refused()
        self.refused(['hard.txt'])
        os.mkfifo(self.source / 'pipe', 0o600)
        (self.source / 'directory').mkdir(mode=0o700)
        self.refused(['pipe'])
        self.refused(['directory'])

    def test_private_modes(self):
        for path, bad, good, paths in ((self.source, 0o750, 0o700, None),
                (self.destination, 0o750, 0o700, None),
                (self.source / 'alpha.txt', 0o640, 0o600, None)):
            path.chmod(bad)
            self.refused(paths)
            path.chmod(good)
        self.write('nested/file', b'x')
        (self.source / 'nested').chmod(0o750)
        self.refused(['nested/file'])

    def test_binding_and_destination_refusals(self):
        wrong = Binding('1' * 32, 1, '2' * 32,
                        (self.binding.source[0], self.binding.source[1] + 1),
                        self.binding.destination)
        self.refused(binding=wrong)
        with self.assertRaises(ValueError):
            self.bind(self.source_fd, self.source_fd)
        (self.destination / 'occupied').write_bytes(b'x')
        with self.assertRaises(ValueError):
            self.run_prepare()
        self.assertEqual((self.destination / 'occupied').read_bytes(), b'x')

    def test_file_and_aggregate_byte_limits(self):
        self.refused(byte_budget=4)
        self.write('large', b'x' * 65537)
        self.refused(['large'])
        self.write('first', b'x' * 65536)
        self.write('second', b'y' * 65536)
        self.assertEqual(parse_request(self.run_prepare(['first', 'second'])).total_bytes, 131072)
        self.refused(['alpha.txt', 'first', 'second'])

    def mutate_on_read(self, action, paths=None):
        real_read = os.read
        changed = False

        def reading(fd, count):
            nonlocal changed
            data = real_read(fd, count)
            if not changed:
                changed = True
                action()
            return data

        with patch('prepare.os.read', side_effect=reading):
            with self.assertRaises((ValueError, OSError)):
                self.run_prepare(paths)
        self.assertTrue(changed)

    def test_file_change_during_read(self):
        self.mutate_on_read(lambda: self.write('alpha.txt', b'changed'))
        self.assertEqual(list(self.destination.iterdir()), [])

    def test_name_and_ancestor_replacement(self):
        def replace_leaf():
            (self.source / 'alpha.txt').rename(self.source / 'old')
            self.write('alpha.txt', b'alpha')
        self.mutate_on_read(replace_leaf)
        self.write('nested/file', b'child')

        def replace_ancestor():
            (self.source / 'nested').rename(self.source / 'previous')
            self.write('nested/file', b'child')
        self.mutate_on_read(replace_ancestor, ['nested/file'])

    def test_earlier_file_change_after_later_read(self):
        self.write('beta.txt', b'beta')
        real_read = os.read
        reads = 0

        def reading(fd, count):
            nonlocal reads
            data = real_read(fd, count)
            reads += 1
            if reads == 2:
                self.write('alpha.txt', b'other')
            return data

        with patch('prepare.os.read', side_effect=reading):
            self.refused(['alpha.txt', 'beta.txt'])
        self.assertEqual(reads, 2)

    def test_destination_change_during_read(self):
        self.mutate_on_read(lambda: (self.destination / 'unexpected').write_bytes(b'x'))
        self.assertEqual((self.destination / 'unexpected').read_bytes(), b'x')

    def test_failure_closes_owned_descriptors_only(self):
        before = len(os.listdir('/proc/self/fd'))
        for _ in range(16):
            self.refused(['missing/file'])
        self.assertEqual(len(os.listdir('/proc/self/fd')), before)
        self.assertEqual(os.fstat(self.source_fd).st_ino, self.binding.source[1])
        self.assertEqual(os.fstat(self.destination_fd).st_ino, self.binding.destination[1])


def run():
    log = io.StringIO()
    result = unittest.TextTestRunner(stream=log, verbosity=2).run(
        unittest.defaultTestLoader.loadTestsFromTestCase(PreparationTests))
    if not result.wasSuccessful() or result.testsRun != 14:
        raise RuntimeError(log.getvalue())
    return {'scope': 'synthetic-descriptor-preparation-tests-v1', 'tests': result.testsRun,
            'successful': True, 'exportExecutionAllowed': False,
            'nativeExecutionAllowed': False, 'commands': []}


if __name__ == '__main__':
    print(json.dumps(run(), sort_keys=True))
