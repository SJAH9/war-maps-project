"""Guard the native data/interaction contract when changing the War Room renderer."""
from pathlib import Path
import re,unittest
from src.war_room_adapters import adapt
ROOT=Path(__file__).resolve().parents[1]
def section(text,name):
 start=re.search(r'^  (?:async )?function '+name+r'\(',text,re.M).start()
 next_=re.search(r'^  (?:async )?function |^  (?:const|let) |^  if\(document.readyState|^  init\(\);|^\}\)\(\);',text[start+3:],re.M)
 return text[start:start+3+next_.start()]
class WarRoomAdapters(unittest.TestCase):
 def test_native_calculations_filters_and_inspectors_are_preserved(self):
  for kind,name,functions in [('human','civilian-casualties.js',['filterRows','healthFacts','renderInspector','renderList']),('fuel','gas-map.js',['filterRows','taxSummary','renderInspector','renderList']),('living','life-death.js',['aggregate','valueFor','ranked','valueLabel','bindControls'])]:
   native=(ROOT/'outputs/web'/name).read_text();adapted=adapt(native,kind)
   for function in functions:
    with self.subTest(kind=kind,function=function):self.assertEqual(section(native,function),section(adapted,function))
   self.assertNotIn('new THREE.WebGLRenderer',adapted)
   self.assertIn('WarRoomMap',adapted)
 def test_missing_native_render_seam_stops_build(self):
  text=(ROOT/'outputs/web/gas-map.js').read_text().replace('function initScene(', 'function renamedScene(')
  with self.assertRaisesRegex(ValueError,'rendering seam missing'):adapt(text,'fuel')
 def test_generated_scripts_stay_within_derivative(self):
  for page in ['map','civilian-casualties','life-death','gas-map']:
   text=(ROOT/'outputs/war-room/views'/(page+'.html')).read_text()
   self.assertIn('../war-room/adapted-',text);self.assertIn('<base href="../../web/">',text)
 def test_news_transport_budget_and_contract(self):
  from src.generate_war_room import adapt_news_transport
  native=(ROOT/'outputs/web/newsmedia-player/player.js').read_text()
  adapted=adapt_news_transport(native)
  self.assertIn('el.previews.classList.remove("on");return;',adapted)
  self.assertIn('wallSlot*1200',adapted)
  self.assertIn('manifestLoadingMaxRetry: 2',adapted)
  self.assertIn('wallCooldownUntil=Date.now()+60000',adapted)
  self.assertIn('if(Date.now()<wallCooldownUntil)throw',adapted)
  self.assertNotIn('hls.nextLevel = best;',adapted)
  self.assertEqual(native[native.index('const STATIONS'):native.index('function face')],adapted[adapted.index('const STATIONS'):adapted.index('function face')])
  with self.assertRaisesRegex(RuntimeError,'transport contract changed'):
   adapt_news_transport(native.replace('function syncPreviews()', 'function renamedPreviews()'))
if __name__=='__main__':unittest.main()
