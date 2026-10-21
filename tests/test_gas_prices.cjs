const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),model=require('../web/gas-price-model.js');
const data=JSON.parse(fs.readFileSync(path.join(root,'web/gas-price-data.js'),'utf8').replace(/^window.GAS_PRICE_DATA=/,'').trim().replace(/;$/,''));
let known=0,unknown=0;
assert.equal(data.snapshot,'2026-10-19');assert.equal(data.observations.length,333);
assert.equal(data.fx_date,'2026-10-19');assert.equal(data.taiwan_fx_date,'2026-10-19');
for(const source of ['aaa','india','taiwan'])assert(data.observations.filter(r=>r.source===source).every(r=>r.date==='2026-10-19'));
for(const row of data.observations){
 assert(row.date<=data.snapshot,row.name);assert(row.tax_included);
 for(const fuel of ['gasoline','diesel']){
  if(row[fuel]==null)continue;
  const gross=model.usdPerGallon(data,row,row[fuel]),tax=model.tax(data,row,fuel);assert(gross>0);
  if(tax.known){known++;assert(tax.amount>=0&&tax.net>=0&&tax.share>=0&&tax.share<=1);assert(Math.abs(tax.net+tax.amount-gross)<.0001);const h=model.heights(gross,tax.net);assert(Math.abs(h.total-h.base-h.tax)<1e-10);assert(h.base>=0&&h.tax>=0);assert(h.total<=13);}
  else{unknown++;assert.equal(tax.amount,null);assert.equal(tax.net,null);assert.equal(model.heights(gross,null).tax,0);}
 }
}
assert.equal(known,444);assert.equal(unknown,211);
const dk=data.observations.find(r=>r.name==='Denmark'),dkt=model.tax(data,dk,'diesel');assert(dkt.known);assert(dkt.share>.4&&dkt.share<.5);assert.equal(dkt.date,dk.date);
const us=data.observations.find(r=>r.name==='Texas');assert.equal(model.tax(data,us,'diesel').known,false);
const au=data.observations.find(r=>r.name==='Sydney');assert(Math.abs(au.tax_components.gasoline.amount-(.537+au.gasoline/11))<.000001);
assert.deepEqual(model.heights(12,8),{total:13,base:10.4,tax:2.5999999999999996});assert.equal(model.heights(15,12).tax,0);
const nz=data.observations.find(r=>r.source==='nz');assert.equal(nz.refresh_status,'last_verified');assert.equal(nz.date,'2026-09-27');assert(nz.refresh_note.includes('403'));
assert.equal(model.tax(data,{...dk,tax_components:{diesel:{amount:99,pre_tax:1,coverage:'full'}}},'diesel').known,false);
for(const file of ['gas-map.html','gas-map.js','gas-map-layers.css','gas-price-data.js','gas-price-model.js'])assert(fs.readFileSync(path.join(root,'web',file)).equals(fs.readFileSync(path.join(root,'outputs/web',file))),file+' generated copy');
console.log(JSON.stringify({observations:333,knownTaxComponents:known,unknownTaxAmounts:unknown,denmarkDieselTaxShare:dkt.share,conservation:true,ceilingClipping:true,generatedCopiesMatch:true}));
