'use strict';
const {DatabaseSync}=require('node:sqlite');
const {createHash}=require('node:crypto');

function searchExpression(query){
  if(typeof query!=='string'||query.length>64)throw Error('invalid-query');
  const trimmed=query.trim();if(!trimmed)return '';
  const terms=trimmed.split(/\s+/u);
  if(terms.length>8||terms.some(term=>!/^\p{L}[\p{L}\p{N}_]*$/u.test(term)))throw Error('invalid-query');
  return terms.map(term=>'"'+term+'"').join(' AND ');
}
function validateEvent(event,expectedId,previousAt){
  if(!event||event.id!==expectedId||!Number.isSafeInteger(event.at)||event.at<=previousAt||!Number.isInteger(event.member)||event.member<0||event.member>4||
    !['message','task','terminal'].includes(event.kind)||typeof event.text!=='string'||!event.text.length||Buffer.byteLength(event.text)>2048)throw Error('invalid-event');
}
class SqliteFeed{
  constructor(filename){
    this.db=new DatabaseSync(filename);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=1000; CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, at INTEGER NOT NULL, member INTEGER NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL); CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(text,content='events',content_rowid='id');");
    const last=this.db.prepare('SELECT id,at FROM events ORDER BY id DESC LIMIT 1').get();this.lastId=last?.id||0;this.lastAt=last?.at||0;
    this.insert=this.db.prepare('INSERT INTO events(id,at,member,kind,text) VALUES(?,?,?,?,?)');
    this.index=this.db.prepare('INSERT INTO search(rowid,text) VALUES(?,?)');
  }
  append(events){
    if(!Array.isArray(events)||!events.length||events.length>1000)throw Error('invalid-batch');
    let nextId=this.lastId,nextAt=this.lastAt;
    for(const event of events){validateEvent(event,++nextId,nextAt);nextAt=event.at;}
    this.db.exec('BEGIN IMMEDIATE');
    try{
      for(const event of events){this.insert.run(event.id,event.at,event.member,event.kind,event.text);this.index.run(event.id,event.text);}
      this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
    this.lastId=nextId;this.lastAt=nextAt;
    return {count:this.lastId};
  }
  page(request){
    if(!request||!Number.isInteger(request.offset)||request.offset<0||request.offset>50000||!Number.isInteger(request.limit)||request.limit<1||request.limit>50)throw Error('invalid-page');
    const expression=searchExpression(request.query),parameters=expression?[expression]:[];
    const from=expression?'events JOIN search ON events.id=search.rowid WHERE search MATCH ?':'events';
    const total=this.db.prepare('SELECT count(*) AS total FROM '+from).get(...parameters).total;
    const rows=this.db.prepare('SELECT events.id,events.at,events.member,events.kind,events.text FROM '+from+' ORDER BY events.id LIMIT ? OFFSET ?').all(...parameters,request.limit,request.offset);
    return {total,rows};
  }
  integrity(){
    const digest=createHash('sha256');let count=0;
    for(const event of this.db.prepare('SELECT id,at,member,kind,text FROM events ORDER BY id').iterate()){digest.update(JSON.stringify(event)+'\n');count++;}
    const sqlite=this.db.prepare('PRAGMA integrity_check').get().integrity_check;
    this.db.exec("INSERT INTO search(search,rank) VALUES('integrity-check',1)");
    return {count,sha256:digest.digest('hex'),sqlite,fts:'ok'};
  }
  close(){this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');this.db.close();}
}
module.exports={SqliteFeed,searchExpression};
