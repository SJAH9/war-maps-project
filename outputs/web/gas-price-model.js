/* Pure conversions and tax geometry shared by the map and regression tests. */
(function(root){'use strict';
const GALLON_LITRES=3.785411784;
function usdPerGallon(data,row,raw){
 if(raw==null||!Number.isFinite(raw))return null;
 const rate=data.currency_per_eur[row.currency];if(!rate)return null;
 return raw*data.usd_per_eur/rate*(row.unit==='US gallon'?1:GALLON_LITRES);
}
function tax(data,row,fuel){
 const c=row.tax_components?.[fuel],gross=row[fuel];
 const known=c?.coverage==='full'&&Number.isFinite(c.amount)&&Number.isFinite(c.pre_tax)&&c.amount>=0&&c.pre_tax>=0&&Math.abs(c.amount+c.pre_tax-gross)<.00001;
 return {known:!!known,included:row.tax_included===true,amount:known?usdPerGallon(data,row,c.amount):null,net:known?usdPerGallon(data,row,c.pre_tax):null,share:known?c.amount/gross:null,method:c?.method||null,source:c?.source||null,date:c?.date||null};
}
function heights(price,net,ceiling=10,maxHeight=13){
 const total=Math.max(.08,Math.min(price,ceiling)/ceiling*maxHeight);
 const base=net==null?total:Math.min(total,Math.max(0,Math.min(net,ceiling)/ceiling*maxHeight));
 return {total,base,tax:total-base};
}
const api={usdPerGallon,tax,heights};root.GasPriceModel=api;
if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
