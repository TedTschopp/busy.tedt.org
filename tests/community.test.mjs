import test from 'node:test';
import assert from 'node:assert/strict';
import {toReadModel} from '../scripts/community-lib.mjs';
const site={appCategoryId:'apps',ideasCategoryId:'ideas'};
const discussion=(overrides={})=>({number:2,title:'A useful display',body:'Show the next task.',url:'https://github.com/example/repo/discussions/2',createdAt:'2026-10-26T00:00:00Z',updatedAt:'2026-10-26T00:00:00Z',author:{login:'example'},category:{id:'ideas'},labels:{nodes:[]},upvoteCount:3,reactionGroups:[],comments:{totalCount:1,nodes:[{replies:{totalCount:2}}]},...overrides});
test('ideas reflect creation, edits, status labels, and deletion without fabricated entries',()=>{
  const created=toReadModel([discussion()],site);assert.equal(created.ideas[0].status,'Proposed');assert.equal(created.ideas[0].comments,3);
  const changed=toReadModel([discussion({title:'Updated title',body:'Updated behavior.',labels:{nodes:[{name:'idea:building'}]}})],site);
  assert.equal(changed.ideas[0].title,'Updated title');assert.equal(changed.ideas[0].status,'Building');assert.equal(changed.ideas[0].body,'Updated behavior.');
  assert.deepEqual(toReadModel([],site),{apps:{},ideas:[]});
});
test('app identity keeps its thread and positive ratings separate from idea votes',()=>{
  const d=discussion({number:8,title:'app:community/clock',category:{id:'apps'},reactionGroups:[{content:'THUMBS_UP',users:{totalCount:4}},{content:'HEART',users:{totalCount:2}},{content:'THUMBS_DOWN',users:{totalCount:8}}]});
  const first=toReadModel([d,discussion()],site);assert.deepEqual(first.apps['community/clock'],{number:8,rating:6,comments:3});assert.equal(first.ideas[0].support,3);
  assert.deepEqual(toReadModel([d],site).apps,first.apps);
});
test('active idea content is rejected before publication',()=>{assert.throws(()=>toReadModel([discussion({body:'<script>bad()</script>'})],site),/Active HTML/);});
