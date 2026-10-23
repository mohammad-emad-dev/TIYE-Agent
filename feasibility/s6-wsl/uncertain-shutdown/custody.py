"""Read-only original-observer custody checks independent of receipt publication."""


def custody_status(query,view,bound):
    require(query.request=={'event':'probe-custody','nonce':bound.nonce},'custody-request-schema')
    release_authority(query.peer,bound)
    manifest=view.inventory()
    require(SESSION in manifest and view.inventory()==manifest,'custody-inventory-unsettled')
    release_authority(query.peer,bound)
    return {'event':'custody','nonce':bound.nonce,'keeperIdentity':bound.keeper,
        'mountIdentity':list(view.identity),'manifestSha256':hashlib.sha256(encode(manifest)).hexdigest(),
        'outcome':'unknown','copyVerified':False,'automaticReleaseAllowed':False,'nativeExecutionAllowed':False}
