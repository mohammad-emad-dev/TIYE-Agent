"""A reviewed plan is immutable, replay-bounded, and never an export capability."""
from concurrent.futures import ThreadPoolExecutor
import copy
import json
import pickle
import threading
import unittest

from grants import GrantRegistry,Ticket
from request import Binding,MAX_REQUEST_BYTES,parse_request,review_request

REQUEST={'version':1,'scope':'synthetic-export-plan-v1','session':'a'*32,'generation':1,'ownerEpoch':'b'*32,
    'source':{'device':101,'inode':1},'destination':{'device':7,'inode':42},'nonce':'c'*32,
    'validForSeconds':30,'byteBudget':1024,'files':[{'path':'notes/result.txt','bytes':12,'sha256':'d'*64}]}
BINDING=Binding('a'*32,1,'b'*32,(101,1),(7,42))


def encode(packet):
    return json.dumps(packet).encode()


def issue(registry,packet=None):
    payload=encode(REQUEST if packet is None else packet)
    return registry.issue_reviewed(payload,BINDING,review_request(payload)['requestSha256'])


class GrantTests(unittest.TestCase):
    def test_exact_reviewed_request_consumes_once_without_execution_rights(self):
        registry=GrantRegistry()
        ticket=issue(registry)
        plan=registry.consume(ticket,encode(REQUEST),BINDING)
        self.assertTrue(plan['grantConsumed'])
        self.assertEqual(plan['commands'],[])
        self.assertEqual(plan['outcome'],'unknown')
        for permission in ('exportExecutionAllowed','cleanupVerified','automaticRetryAllowed',
                'automaticDeletionAllowed','automaticReleaseAllowed','nativeExecutionAllowed'):
            self.assertIs(plan[permission],False)
        with self.assertRaises(ValueError):
            registry.consume(ticket,encode(REQUEST),BINDING)
        self.assertNotIn(ticket.secret,repr(ticket))
        self.assertNotIn(ticket.secret,json.dumps(plan))

    def test_review_hash_is_canonical_but_selected_content_changes_it(self):
        reordered=dict(reversed(list(REQUEST.items())))
        self.assertEqual(parse_request(encode(REQUEST)).sha256,parse_request(encode(reordered)).sha256)
        changed=copy.deepcopy(REQUEST)
        changed['files'][0]['sha256']='e'*64
        self.assertNotEqual(parse_request(encode(REQUEST)).sha256,parse_request(encode(changed)).sha256)
        registry=GrantRegistry()
        with self.assertRaises(ValueError):
            registry.issue_reviewed(encode(changed),BINDING,review_request(encode(REQUEST))['requestSha256'])
        with self.assertRaises(ValueError):
            registry.issue_reviewed(encode(REQUEST),BINDING,'é'*64)

    def test_wrong_secret_does_not_burn_another_grant(self):
        registry=GrantRegistry()
        ticket=issue(registry)
        wrong=Ticket(ticket.identity,'0'*64 if ticket.secret!='0'*64 else '1'*64)
        with self.assertRaises(ValueError):
            registry.consume(wrong,b'invalid',BINDING)
        self.assertTrue(registry.consume(ticket,encode(REQUEST),BINDING)['grantConsumed'])

    def test_recognized_grant_burns_on_malformed_payload_and_cannot_be_reissued(self):
        for malformed in (b'{',b'',b'x'*(MAX_REQUEST_BYTES+1),b'\xff',b'{"version":1,"version":1}'):
            with self.subTest(payloadKind=malformed[:20]):
                registry=GrantRegistry()
                ticket=issue(registry)
                with self.assertRaises(ValueError):
                    registry.consume(ticket,malformed,BINDING)
                with self.assertRaises(ValueError):
                    registry.consume(ticket,encode(REQUEST),BINDING)
                with self.assertRaises(ValueError):
                    issue(registry)

    def test_changed_manifest_fields_burn_the_recognized_grant(self):
        mutations=[('session','e'*32),('generation',2),('ownerEpoch','f'*32),('nonce','1'*32),
            ('source',{'device':102,'inode':1}),('destination',{'device':7,'inode':43}),
            ('byteBudget',1000),('validForSeconds',29),
            ('files',[{'path':'notes/other.txt','bytes':12,'sha256':'d'*64}])]
        for field,replacement in mutations:
            with self.subTest(field=field):
                registry=GrantRegistry()
                ticket=issue(registry)
                with self.assertRaises(ValueError):
                    registry.consume(ticket,encode(REQUEST|{field:replacement}),BINDING)
                with self.assertRaises(ValueError):
                    registry.consume(ticket,encode(REQUEST),BINDING)

    def test_independent_current_binding_drift_burns_grant(self):
        variants=[Binding('e'*32,1,'b'*32,(101,1),(7,42)),Binding('a'*32,2,'b'*32,(101,1),(7,42)),
            Binding('a'*32,1,'e'*32,(101,1),(7,42)),Binding('a'*32,1,'b'*32,(101,2),(7,42)),
            Binding('a'*32,1,'b'*32,(101,1),(7,43)),{'live':True}]
        for changed in variants:
            with self.subTest(binding=changed):
                registry=GrantRegistry()
                ticket=issue(registry)
                with self.assertRaises(ValueError):
                    registry.consume(ticket,encode(REQUEST),changed)
                with self.assertRaises(ValueError):
                    registry.consume(ticket,encode(REQUEST),BINDING)

    def test_expiry_clock_regression_and_invalid_clock_burn_grant(self):
        for after in (130.0,99.0,float('nan'),True):
            with self.subTest(clock=after):
                clock=[100.0]
                registry=GrantRegistry(clock=lambda:clock[0])
                ticket=issue(registry)
                clock[0]=after
                with self.assertRaises(ValueError):
                    registry.consume(ticket,encode(REQUEST),BINDING)
                clock[0]=101.0
                with self.assertRaises(ValueError):
                    registry.consume(ticket,encode(REQUEST),BINDING)

    def test_concurrent_consumers_get_exactly_one_plan(self):
        registry=GrantRegistry()
        ticket=issue(registry)
        barrier=threading.Barrier(8)
        def attempt():
            barrier.wait(timeout=5)
            try:
                return registry.consume(ticket,encode(REQUEST),BINDING)['grantConsumed']
            except ValueError:
                return False
        with ThreadPoolExecutor(max_workers=8) as workers:
            self.assertEqual(sum(workers.map(lambda _:attempt(),range(8))),1)

    def test_serialization_restart_and_lifetime_limits_do_not_restore_grants(self):
        registry=GrantRegistry()
        ticket=issue(registry)
        with self.assertRaises(ValueError):
            issue(registry)
        for value in (registry,ticket):
            with self.assertRaises(TypeError):
                pickle.dumps(value)
        with self.assertRaises(ValueError):
            GrantRegistry().consume(ticket,encode(REQUEST),BINDING)
        for index in range(63):
            issue(registry,REQUEST|{'nonce':f'{index:032x}'})
        with self.assertRaises(ValueError):
            issue(registry,REQUEST|{'nonce':'f'*32})


class RequestTests(unittest.TestCase):
    def test_ambiguous_or_escaping_selection_paths_are_refused(self):
        for path in ('../secret','/root/file','a/./b','a//b','a\\b','C:file','file:stream','.env',
                'CON','aux.txt','a/COM1.json','trailing.','space name','unicodé','a\x00b','a/'*6+'file'):
            with self.subTest(path=path):
                packet=REQUEST|{'files':[{'path':path,'bytes':0,'sha256':'d'*64}]}
                with self.assertRaises(ValueError):
                    parse_request(encode(packet))
        for paths in (['A.txt','a.txt'],['same','same'],['a','a/b']):
            with self.subTest(paths=paths):
                with self.assertRaises(ValueError):
                    parse_request(encode(REQUEST|{'files':[{'path':p,'bytes':0,'sha256':'d'*64} for p in paths]}))

    def test_schema_boolean_sizes_scope_and_budget_promotions_are_refused(self):
        mutations=[('version',True),('scope','native-export'),('generation',True),('byteBudget',True),
            ('byteBudget',11),('byteBudget',131073),('validForSeconds',61),('validForSeconds',0),
            ('files',[]),('destination',REQUEST['source']),('source',{'device':True,'inode':1})]
        for field,replacement in mutations:
            with self.subTest(field=field):
                with self.assertRaises(ValueError):
                    parse_request(encode(REQUEST|{field:replacement}))
        for entry in ({'path':'file','bytes':True,'sha256':'d'*64},
                {'path':'file','bytes':65537,'sha256':'d'*64},
                {'path':'file','bytes':0,'sha256':'x'*64},
                {'path':'file','bytes':0,'sha256':'d'*64,'type':'symlink'}):
            with self.subTest(entry=entry):
                with self.assertRaises(ValueError):
                    parse_request(encode(REQUEST|{'files':[entry]}))
        with self.assertRaises(ValueError):
            parse_request(encode(REQUEST|{'exportExecutionAllowed':True}))
        for entries in ([{'path':f'file-{i}','bytes':0,'sha256':'d'*64} for i in range(65)],
                [{'path':f'file-{i}','bytes':65536,'sha256':'d'*64} for i in range(3)]):
            with self.assertRaises(ValueError):
                parse_request(encode(REQUEST|{'byteBudget':131072,'files':entries}))


if __name__=='__main__':
    unittest.main()
