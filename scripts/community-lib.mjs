import {renderDocumentation} from './catalog-lib.mjs';
const positive=new Set(['THUMBS_UP','HEART','HOORAY','ROCKET','LAUGH']);
export function toReadModel(discussions,site){
  const result={apps:{},ideas:[]};
  for(const d of [...discussions].sort((a,b)=>a.number-b.number)){
    const comments=d.computedComments??d.comments.totalCount+d.comments.nodes.reduce((n,c)=>n+c.replies.totalCount,0);
    const rating=d.reactionGroups.filter(g=>positive.has(g.content)).reduce((n,g)=>n+g.users.totalCount,0);
    if(d.category.id===site.appCategoryId&&/^app:(?:community|tedt)\/[a-z0-9][a-z0-9_-]*$/.test(d.title)){
      const id=d.title.slice(4);if(!result.apps[id])result.apps[id]={number:d.number,rating:0,comments:0};
      result.apps[id].rating+=rating;result.apps[id].comments+=comments;
    }
    if(d.category.id===site.ideasCategoryId){
      renderDocumentation(d.body);
      const labels=d.labels.nodes.map(l=>l.name.toLowerCase());
      const status=['Closed','Shipped','Building','Planned'].find(s=>labels.includes(`idea:${s.toLowerCase()}`))??'Proposed';
      const excerpt=d.body.replace(/```[\s\S]*?```/g,'').replace(/<[^>]*>/g,'').replace(/[#*_`>\[\]]/g,'').replace(/\s+/g,' ').trim().slice(0,200);
      result.ideas.push({number:d.number,title:d.title,body:d.body,url:d.url,author:d.author?.login??'Former contributor',createdAt:d.createdAt,updatedAt:d.updatedAt,status,support:d.upvoteCount,comments,excerpt});
    }
  }
  result.ideas.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.number-b.number);
  return result;
}
