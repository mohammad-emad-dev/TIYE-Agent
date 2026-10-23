"""Bounded seqpacket request decoding with per-message sender credentials."""
import array
import json
import os
import socket
import struct
import time

from prepare import SelectionRequest, validated_names
from request import MAX_REQUEST_BYTES, require, unique_members, reject_constant

OPERATION_SECONDS = 2
EVENT = 'prepare-synthetic-export-v1'
FIELDS = {'event', 'session', 'generation', 'ownerEpoch', 'nonce', 'paths',
          'byteBudget', 'validForSeconds'}


class Deadline:
    def __init__(self):
        self.end = time.monotonic() + OPERATION_SECONDS

    def remaining(self):
        remaining = self.end - time.monotonic()
        if remaining <= 0:
            raise TimeoutError('owner-operation-deadline')
        return remaining


def sender_credentials(controls):
    received = []
    credential = None
    valid = True
    try:
        for level, kind, payload in controls:
            if level == socket.SOL_SOCKET and kind == socket.SCM_RIGHTS:
                descriptors = array.array('i')
                descriptors.frombytes(payload[:len(payload) - len(payload) % descriptors.itemsize])
                received.extend(descriptors)
                valid = False
            elif level == socket.SOL_SOCKET and kind == socket.SCM_CREDENTIALS:
                valid &= len(payload) == 12 and credential is None
                if len(payload) == 12:
                    credential = struct.unpack('3i', payload)
            else:
                valid = False
        require(valid and credential is not None, 'owner-unexpected-controls')
        return credential
    finally:
        for descriptor in received:
            os.close(descriptor)


def receive(peer, requester, deadline):
    require(peer.family == socket.AF_UNIX and peer.type == socket.SOCK_SEQPACKET
            and peer.getsockopt(socket.SOL_SOCKET, socket.SO_PASSCRED) == 1,
            'owner-credential-seqpacket-required')
    peer.settimeout(deadline.remaining())
    payload, controls, flags, _ = peer.recvmsg(MAX_REQUEST_BYTES,
        socket.CMSG_SPACE(12) + socket.CMSG_SPACE(8 * array.array('i').itemsize), socket.MSG_CMSG_CLOEXEC)
    credentials = sender_credentials(controls)
    expected = requester.identity
    require(credentials == (expected.pid, expected.uid, expected.gid), 'owner-wrong-message-sender')
    require(payload and not flags & (socket.MSG_TRUNC | socket.MSG_CTRUNC), 'owner-truncated-request')
    try:
        return json.loads(payload.decode('utf-8'), object_pairs_hook=unique_members,
                          parse_constant=reject_constant)
    except RecursionError as fault:
        raise ValueError('owner-json-nesting') from fault


def selection_request(packet, binding):
    require(type(packet) is dict and set(packet) == FIELDS and packet['event'] == EVENT,
            'owner-request-schema')
    require(packet['session'] == binding.session and type(packet['generation']) is int
            and packet['generation'] == binding.generation and packet['ownerEpoch'] == binding.owner_epoch,
            'owner-request-session-drift')
    specification = SelectionRequest(binding, packet['paths'], packet['nonce'],
                                     packet['validForSeconds'], packet['byteBudget'])
    validated_names(specification)
    return specification
