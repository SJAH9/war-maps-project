/* Local-only, validated flat GraphML reader. No network requests or HTML execution. */
(()=>{
  'use strict';
  function parse(source){
    if(source.length>40*1024*1024)throw Error('GraphML exceeds the 40 MB limit.');
    if(/<!DOCTYPE|<!ENTITY/i.test(source))throw Error('DTD and entity declarations are not supported.');
    const doc=new DOMParser().parseFromString(source,'application/xml');
    if(doc.querySelector('parsererror')||doc.documentElement.localName!=='graphml')throw Error('Invalid GraphML XML.');
    const children=(node,name)=>Array.from(node.children).filter(el=>el.localName===name);
    const graphs=children(doc.documentElement,'graph');
    if(graphs.length!==1)throw Error('Select a GraphML file containing one flat graph.');
    const graph=graphs[0];
    if(graph.getElementsByTagNameNS('*','graph').length||graph.getElementsByTagNameNS('*','hyperedge').length||graph.getElementsByTagNameNS('*','port').length)throw Error('Nested graphs, ports and hyperedges are not supported.');
    const keys=new Map();
    for(const el of children(doc.documentElement,'key')){
      const id=el.getAttribute('id');if(!id||keys.has(id))throw Error('Missing or duplicate key ID.');
      keys.set(id,{name:el.getAttribute('attr.name')||id,type:el.getAttribute('attr.type')||'string',scope:el.getAttribute('for')||'all',fallback:children(el,'default')[0]?.textContent});
    }
    const convert=(value,type)=>{
      if(type==='boolean'){const normalized=value.trim().toLowerCase();if(!['true','false','1','0'].includes(normalized))throw Error('Invalid boolean attribute.');return ['true','1'].includes(normalized);}
      if(['int','long','float','double'].includes(type)){if(!value.trim()||!Number.isFinite(Number(value)))throw Error('Invalid numeric attribute.');return Number(value);}
      return value;
    };
    const attrs=(el,scope)=>{
      const out=Object.create(null);
      keys.forEach(k=>{if((k.scope===scope||k.scope==='all')&&k.fallback!==undefined)out[k.name]=convert(k.fallback,k.type);});
      for(const data of children(el,'data')){
        const k=keys.get(data.getAttribute('key'));if(!k||![scope,'all'].includes(k.scope))throw Error('Unknown or misplaced data key.');
        out[k.name]=convert(data.textContent,k.type);
      }
      return out;
    };
    const ids=new Set(),nodes=children(graph,'node').map(el=>{
      const id=el.getAttribute('id');if(!id||ids.has(id))throw Error('Missing or duplicate node ID.');ids.add(id);
      const metadata=attrs(el,'node');
      return {id,label:String(metadata.label||metadata.name||id),kind:String(metadata.kind||metadata.type||'other'),metadata};
    });
    if(!nodes.length)throw Error('The graph has no nodes.');
    if(nodes.length>15000)throw Error('Maximum 15,000 nodes per imported graph.');
    const links=children(graph,'edge').map((el,i)=>{
      const source=el.getAttribute('source'),target=el.getAttribute('target');
      if(!ids.has(source)||!ids.has(target))throw Error('An edge references an unknown node.');
      const metadata=attrs(el,'edge'),directed=el.hasAttribute('directed')?['true','1'].includes(el.getAttribute('directed')):graph.getAttribute('edgedefault')==='directed';
      return {id:el.getAttribute('id')||`edge-${i}`,source,target,relation:String(metadata.evidence||metadata.relation||'GraphML edge'),metadata:{...metadata,directed}};
    });
    if(links.length>60000)throw Error('Maximum 60,000 edges per imported graph.');
    return {nodes,links,metadata:attrs(graph,'graph')};
  }
  function stringify({nodes,links,metadata={}}){
    const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
    const normalize=v=>typeof v==='object'?JSON.stringify(v):v;
    const sets={graph:[metadata],node:nodes.map(n=>({...n.metadata,label:n.label,kind:n.kind,...Object.fromEntries(['x','y','z'].filter(k=>Number.isFinite(n[k])).map(k=>[k,n[k]]))})),edge:links.map(e=>({...e.metadata,relation:e.relation}))};
    const keys=[];
    for(const [scope,items] of Object.entries(sets)){
      for(const name of new Set(items.flatMap(x=>Object.keys(x)))){
        const values=items.map(x=>normalize(x[name])).filter(v=>v!=null);
        const type=values.every(v=>typeof v==='boolean')?'boolean':values.every(v=>typeof v==='number'&&Number.isFinite(v))?'double':'string';
        keys.push({id:'k'+keys.length,scope,name,type});
      }
    }
    const data=(obj,scope)=>keys.filter(k=>k.scope===scope&&obj[k.name]!=null).map(k=>`<data key="${k.id}">${esc(normalize(obj[k.name]))}</data>`).join('');
    const end=v=>typeof v==='object'?v.id:v;
    return '<?xml version="1.0" encoding="UTF-8"?>\n<graphml xmlns="http://graphml.graphdrawing.org/xmlns">'+keys.map(k=>`<key id="${k.id}" for="${k.scope}" attr.name="${esc(k.name)}" attr.type="${k.type}"/>`).join('')+'<graph id="viewport" edgedefault="undirected">'+data(metadata,'graph')+nodes.map((n,i)=>`<node id="${esc(n.id)}">${data(sets.node[i],'node')}</node>`).join('')+links.map((e,i)=>`<edge id="e${i}" source="${esc(end(e.source))}" target="${esc(end(e.target))}" directed="${e.metadata?.directed?'true':'false'}">${data(sets.edge[i],'edge')}</edge>`).join('')+'</graph></graphml>';
  }
  window.WarGraphML={parse,stringify};
})();
