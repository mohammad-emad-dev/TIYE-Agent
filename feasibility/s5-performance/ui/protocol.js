'use strict';
function isMember(member) { return Number.isInteger(member)&&member>=0&&member<5; }
function isChunk(packet) { return !!packet&&isMember(packet.member)&&Number.isInteger(packet.ordinal)&&packet.ordinal>=0&&typeof packet.text==='string'&&packet.text.length<=1048576; }
function verifyMember(stored,renderer) {
  if(!isMember(stored.member)||renderer.member!==stored.member||stored.exitCode!==0
    ||renderer.pending!==0||renderer.receivedChunks!==stored.chunks||renderer.bytes!==stored.bytes
    ||renderer.sha256!==stored.sha256||renderer.recordsFound!==40) throw new Error('member-integrity-mismatch');
}
module.exports={isMember,isChunk,verifyMember};
