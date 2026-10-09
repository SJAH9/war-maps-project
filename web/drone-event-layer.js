(()=>{'use strict';let pending;
window.WarDroneLayer={load(){
  if(pending)return pending;
  pending=fetch('assets/drone-event-layer.json').then(r=>{if(!r.ok)throw Error('Drone source unavailable');return r.json();}).then(d=>({...d,events:d.incidents.map(r=>({id:'drone-'+r.id,conflict_id:'ucdp-candidate-16905',date_start:r.date,date_end:r.date,country:r.country,place:r.locationName,network_location:r.country,side_a:'Government of Iran',side_b:'',side_a_states:['Iran'],side_b_states:[],source_id:'iran-attacks-map',source_office:d.sourceName,source_headline:r.title,source_count:1,record_class:'source-attributed drone report',code_status:r.attackType,fatality_estimate_valid:false,fatality_validation_issue:'Not aggregated; source report is inspectable',map_point_eligible:false,alleged_perpetrator:'Government of Iran',attribution_confidence:r.sourceConfidence,target_class:r.targetCategory,drone_report:r}))})).catch(e=>{pending=null;throw e;});
  return pending;
}};
})();
