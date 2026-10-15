'use strict';
function diffRecord(expected,actual){
  const sharedLength=Math.min(expected.length,actual.length);let firstDiffOffset=-1;
  for(let index=0;index<sharedLength;index++)if(expected.charCodeAt(index)!==actual.charCodeAt(index)){firstDiffOffset=index;break;}
  if(firstDiffOffset===-1&&expected.length!==actual.length)firstDiffOffset=sharedLength;
  function trailingSpaces(text){let count=0;for(let index=text.length-1;index>=0&&text.charCodeAt(index)===32;index--)count++;return count;}
  return {firstDiffOffset,expectedLength:expected.length,actualLength:actual.length,expectedTrailingSpaces:trailingSpaces(expected),actualTrailingSpaces:trailingSpaces(actual),equal:firstDiffOffset===-1};
}
module.exports={diffRecord};
