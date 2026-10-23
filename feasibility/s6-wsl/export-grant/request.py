"""Bounded synthetic file-selection requests; no paths are opened or copied."""
from dataclasses import dataclass
import hashlib
import json
import re

MAX_BYTES=131072
MAX_FILE_BYTES=65536
MAX_ENTRIES=64
MAX_REQUEST_BYTES=16384
HEX32=re.compile('[0-9a-f]{32}')
HEX64=re.compile('[0-9a-f]{64}')
COMPONENT=re.compile(r'[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*')
RESERVED={'con','prn','aux','nul','conin$','conout$'}|{prefix+str(number) for prefix in ('com','lpt') for number in range(1,10)}


def require(condition,reason):
    if not condition:
        raise ValueError(reason)


def integer(number,minimum,maximum):
    return type(number) is int and minimum<=number<=maximum


def identity(record):
    require(type(record) is dict and set(record)=={'device','inode'},'export-identity-schema')
    require(integer(record['device'],0,2**64-1) and integer(record['inode'],1,2**64-1),'export-identity-range')
    return record['device'],record['inode']


@dataclass(frozen=True)
class Binding:
    session:str
    generation:int
    owner_epoch:str
    source:tuple
    destination:tuple

    def __post_init__(self):
        require(type(self.session) is str and HEX32.fullmatch(self.session) is not None,'export-session')
        require(integer(self.generation,1,2**31-1),'export-generation')
        require(type(self.owner_epoch) is str and HEX32.fullmatch(self.owner_epoch) is not None,'export-owner-epoch')
        for stamp in (self.source,self.destination):
            require(type(stamp) is tuple and len(stamp)==2,'export-binding-identity')
            identity({'device':stamp[0],'inode':stamp[1]})
        require(self.source[0]!=self.destination[0],'export-destination-must-be-on-separate-filesystem')


@dataclass(frozen=True)
class Request:
    binding:Binding
    nonce:str
    valid_for:int
    byte_budget:int
    files:tuple
    total_bytes:int
    sha256:str


def selected_file(entry):
    require(type(entry) is dict and set(entry)=={'path','bytes','sha256'},'export-selected-file-schema')
    path=entry['path']
    require(type(path) is str and 1<=len(path)<=384,'export-relative-path')
    components=path.split('/')
    require(1<=len(components)<=6 and all(1<=len(part)<=64 and COMPONENT.fullmatch(part) is not None
        and part.split('.')[0].lower() not in RESERVED for part in components),'export-portable-file-path')
    require(integer(entry['bytes'],0,MAX_FILE_BYTES),'export-selected-file-size')
    require(type(entry['sha256']) is str and HEX64.fullmatch(entry['sha256']) is not None,'export-selected-file-digest')
    return path,entry['bytes'],entry['sha256']


def selection(entries,budget):
    require(type(entries) is list and 1<=len(entries)<=MAX_ENTRIES,'export-selection-count')
    files=tuple(sorted(selected_file(entry) for entry in entries))
    names=[entry[0].lower() for entry in files]
    require(len(set(names))==len(names),'export-selection-alias-or-duplicate')
    for name in names:
        require(not any(name.startswith(other+'/') for other in names if other!=name),'export-file-parent-collision')
    total=sum(entry[1] for entry in files)
    require(total<=budget,'export-selection-over-budget')
    return files,total


def unique_members(pairs):
    record={}
    for name,entry in pairs:
        require(name not in record,'export-duplicate-json-member')
        record[name]=entry
    return record


def reject_constant(name):
    raise ValueError('export-nonfinite-json-constant')


def parse_request(payload):
    require(type(payload) is bytes and 0<len(payload)<=MAX_REQUEST_BYTES,'export-request-byte-bound')
    try:
        packet=json.loads(payload.decode('utf-8'),object_pairs_hook=unique_members,parse_constant=reject_constant)
    except RecursionError as fault:
        raise ValueError('export-json-nesting') from fault
    fields={'version','scope','session','generation','ownerEpoch','source','destination','nonce','validForSeconds','byteBudget','files'}
    require(type(packet) is dict and set(packet)==fields,'export-request-schema')
    require(type(packet['version']) is int and packet['version']==1 and packet['scope']=='synthetic-export-plan-v1','export-request-scope')
    binding=Binding(packet['session'],packet['generation'],packet['ownerEpoch'],identity(packet['source']),identity(packet['destination']))
    require(type(packet['nonce']) is str and HEX32.fullmatch(packet['nonce']) is not None,'export-request-nonce')
    require(integer(packet['validForSeconds'],1,60) and integer(packet['byteBudget'],1,MAX_BYTES),'export-request-budget-or-lifetime')
    files,total=selection(packet['files'],packet['byteBudget'])
    canonical=packet|{'files':[{'path':path,'bytes':size,'sha256':digest} for path,size,digest in files]}
    digest=hashlib.sha256(json.dumps(canonical,sort_keys=True,separators=(',',':'),ensure_ascii=True).encode()).hexdigest()
    return Request(binding,packet['nonce'],packet['validForSeconds'],packet['byteBudget'],files,total,digest)


def review_request(payload):
    request=parse_request(payload)
    return {'scope':'synthetic-export-review-v1','requestSha256':request.sha256,'fileCount':len(request.files),
        'totalBytes':request.total_bytes,'byteBudget':request.byte_budget,'validForSeconds':request.valid_for,
        'binding':{'session':request.binding.session,'generation':request.binding.generation,
            'ownerEpoch':request.binding.owner_epoch,'source':list(request.binding.source),
            'destination':list(request.binding.destination)},
        'selection':[{'path':path,'bytes':size,'sha256':digest} for path,size,digest in request.files],
        'exportExecutionAllowed':False,'commands':[]}
