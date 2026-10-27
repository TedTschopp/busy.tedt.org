import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, readJson } from './catalog-lib.mjs';
import { toReadModel } from './community-lib.mjs';

const site = readJson(path.join(ROOT, 'src/data/site.json'));
const graphql = query => {
  const result = JSON.parse(execFileSync('gh', ['api','graphql','-f',`query=${query}`], { maxBuffer: 32*1024*1024 }));
  if (result.errors) throw new Error(JSON.stringify(result.errors));
  return result.data;
};
const fields = `number title body url createdAt updatedAt author { login } category { id } labels(first:30) { nodes { name } } upvoteCount reactionGroups { content users { totalCount } } comments(first:100) { totalCount nodes { replies { totalCount } } pageInfo { hasNextPage endCursor } }`;
let cursor = null;
const discussions = [];
do {
  const data = graphql(`query { repository(owner:"TedTschopp",name:"busy.tedt.org") { discussions(first:100${cursor ? `,after:${JSON.stringify(cursor)}` : ''}) { nodes { ${fields} } pageInfo { hasNextPage endCursor } } } }`);
  const result = data.repository.discussions;
  discussions.push(...result.nodes);
  cursor = result.pageInfo.hasNextPage ? result.pageInfo.endCursor : null;
} while (cursor);

for (const discussion of discussions) {
  let comments = discussion.comments.totalCount + discussion.comments.nodes.reduce((n,c)=>n+c.replies.totalCount,0);
  let page = discussion.comments.pageInfo;
  while (page.hasNextPage) {
    const next = graphql(`query { repository(owner:"TedTschopp",name:"busy.tedt.org") { discussion(number:${discussion.number}) { comments(first:100,after:${JSON.stringify(page.endCursor)}) { nodes { replies { totalCount } } pageInfo { hasNextPage endCursor } } } }`).repository.discussion.comments;
    comments += next.nodes.reduce((n,c)=>n+c.replies.totalCount,0); page=next.pageInfo;
  }
  discussion.computedComments=comments;
}
const result=toReadModel(discussions,site);
// Fetch every required source before writing either snapshot. An unavailable
// service must not replace yesterday's successful read model with zeroes.
const metrics = await fetch('https://api.busy.tedt.org/v1/downloads', { signal: AbortSignal.timeout(15000) });
if (!metrics.ok) throw new Error(`Download snapshot failed: HTTP ${metrics.status}`);
const counts = (await metrics.json()).downloads;
if (!counts || typeof counts !== 'object' || Array.isArray(counts) || Object.values(counts).some(n=>!Number.isSafeInteger(n)||n<0)) throw new Error('Invalid download snapshot');
writeFileSync(path.join(ROOT,'src/data/community.json'),JSON.stringify(result,null,2)+'\n');
writeFileSync(path.join(ROOT,'src/data/downloads.json'),JSON.stringify(Object.fromEntries(Object.entries(counts).sort()),null,2)+'\n');
console.log(`Refreshed ${Object.keys(result.apps).length} app discussions and ${result.ideas.length} ideas.`);
