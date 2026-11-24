"""War Room rendering seams. Native aggregation, controls and inspectors stay upstream.

Fail closed if a named function boundary moves; output scripts are independent
of the main atlas. No source-data arithmetic is reimplemented here.
"""
import re

def replace_function(text, name, body):
    pattern = r'^  (?:async )?function ' + re.escape(name) + r'\([^\n]*?(?=^  (?:async )?function |^  if\(document.readyState|^  init\(\);|^\}\)\(\);)'
    # Function starts/ends are at two spaces in the native modules. Match until
    # the next top-level declaration, including const declarations after functions.
    start = re.search(r'^  (?:async )?function ' + re.escape(name) + r'\(', text, re.M)
    if not start:
        raise ValueError('Native rendering seam missing: ' + name)
    tail = text[start.start():]
    end = re.search(r'^  (?:async )?function |^  (?:const|let) |^  if\(document.readyState|^  init\(\);|^\}\)\(\);', tail[3:], re.M)
    if not end:
        raise ValueError('Native rendering seam has no boundary: ' + name)
    stop = start.start() + 3 + end.start()
    return text[:start.start()] + '  function ' + name + body + '\n' + text[stop:]


def adapt(text, kind):
    if kind in ('human', 'fuel'):
        target = '#civ-map' if kind == 'human' else '#gas-map'
        text = replace_function(text, 'initScene', "() { window.WarRoomMap.init('" + target + "',geometry); }")
        text = replace_function(text, 'flipToWorld', "() { state.nation=null;state.selected=null;filterRows();window.WarRoomMap.reset(); }")
        # Native country/row inspection stays active, without the plate-flip branch.
        text = replace_function(text, 'flipToNation', "(country,selected=null) { if(selected)selectRow(selected); }")
        if kind == 'fuel':
            body = '''() {
    const series=activeFuels().map(fuel=>({name:fuelLabel(fuel),color:fuel==='gasoline'?'#f2c76c':'#7ecdd1',unit:'USD / US gallon',points:state.worldVisible.map(row=>({lon:row.lon,lat:row.lat,value:usdPerGallon(row,fuel),row,label:row.name+' · '+row.date+' · '+taxSummary(row,fuel)}))}));
    window.WarRoomMap.draw(series,selectRow,state.selected);
  }'''
        else:
            body = '''() {
    const external=(data.external||[]).filter(row=>externalInRange(row)&&(!state.search||`${row.place} ${row.source_short}`.toLocaleLowerCase().includes(state.search)));
    const points=rows=>rows.map(row=>({lon:row.lon,lat:row.lat,value:deathsInRange(row),row,label:(row.name||row.place)+' · '+rangeLabel()+(row.in_ucdp===false?' · NOT IN UCDP · '+row.source_short+' · '+row.as_of:' · UCDP GED')}));
    const series=[{name:'UCDP civilian deaths',color:'#db8051',unit:'deaths',points:points(state.worldVisible)},{name:'Separate external accounts (not added to UCDP)',color:'#7ec8e3',unit:'reported deaths',points:points(external)}];
    for(const metric of state.activeHealth){
      const rows=[...new Set([...mortalityByAdmin.keys(),...lifeByAdmin.keys()])].filter(admin=>!state.search||admin.toLocaleLowerCase().includes(state.search)).map(admin=>{const p=featureByAdmin.get(admin)?.properties,observation=healthObservation(admin,metric);return p&&observation?{lon:Number(p.LABEL_X),lat:Number(p.LABEL_Y),value:observation.value,row:{admin,name:admin,healthOnly:true},label:admin+' · '+observation.year}:null;}).filter(Boolean);
      series.push({name:healthLabel(metric),color:metric==='mortality'?'#aa92d4':'#33c8c7',unit:healthUnit(metric),points:rows});
    }
    window.WarRoomMap.draw(series,row=>{if(!row.healthOnly)selectRow(row);},state.selected);
  }'''
        text = replace_function(text, 'drawTowers', body)
    elif kind == 'living':
        text = replace_function(text, 'buildScene', "() {window.WarRoomMap.init('#mortality-map',state.geometry);}")
        text = replace_function(text, 'updateColumns', "() {aggregate();renderInspector(state.selected);}")
        text = replace_function(text, 'updateSelection', '''() {
    const colors={conflict:'#db8051',population:'#dfbc54',mortality:'#aa92d4',fertility:'#33c8c7',birth:'#a6c656'};
    const units={conflict:'candidate observations',population:'people',mortality:'deaths per 100,000',fertility:'births per woman',birth:'live births per 1,000'};
    const series=activeMetrics().map(metric=>({name:metric,unit:units[metric],color:colors[metric],points:[...state.observations.values()].filter(item=>metric==='conflict'||item[metric]).map(item=>{const p=state.geometry.features.find(f=>f.properties.ADMIN===item.country)?.properties;return p?{lon:Number(p.LABEL_X),lat:Number(p.LABEL_Y),value:valueFor(item,metric),row:item,label:item.country+' · '+(metric==='conflict'?state.start+' – '+state.end:state.healthYear)}:null;}).filter(Boolean)}));
    window.WarRoomMap.draw(series,item=>selectCountry(item.country),state.observations.get(state.selected));
  }''')
        text = replace_function(text, 'selectCountry', "(country,focus=false) {state.selected=country;renderInspector(country);}")
        text = replace_function(text, 'resetView', "() {state.selected='';renderInspector();window.WarRoomMap.reset();}")
        needle='state.renderer.render(state.scene,state.camera)'
        if text.count(needle)!=1:
            raise ValueError('Native living init rendering contract changed')
        text=text.replace(needle,'/* Plotly renders through updateSelection */')
    else:
        raise ValueError('Unknown War Room adapter: ' + kind)
    return text
