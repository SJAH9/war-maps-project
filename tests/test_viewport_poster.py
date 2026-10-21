import unittest
import networkx as nx
from src.generate_viewport_poster import project


class ViewportProjectionTests(unittest.TestCase):
    def test_scope_distinguishes_start_dates_and_interval_end(self):
        import json
        from src.generate_view_comparison_posters import event_scope
        g=nx.Graph()
        for n,start,end in [('a','2026-01-01','2026-01-01'),('b','2026-08-31','2026-09-01')]:
            g.add_node(n,kind='event',source_record=json.dumps(dict(date_start=start,date_end=end)))
        s=event_scope(g)
        self.assertEqual((s['start'],s['latest_start'],s['end']),('2026-01-01','2026-08-31','2026-09-01'))
        self.assertEqual(s['event_count'],2)

    def test_place_totals_distinguish_full_graph_from_visible_events(self):
        from src.generate_view_comparison_posters import foreground_places
        g=nx.Graph();g.add_node('p',kind='place',label='Ukraine / Test place')
        for n,fatal in [('a',True),('b',True),('c',False)]:
            g.add_node(n,kind='event',fatal=fatal);g.add_edge('p',n)
        rows=foreground_places(g,{'p':(1,2),'a':(2,3),'c':(4,5)})
        self.assertEqual(rows[0]['fatal_events'],2)
        self.assertEqual(rows[0]['visible_fatal_events'],1)
        self.assertEqual(rows[0]['event_ids'],['a','b'])

    def test_orientation_anchors_do_not_invent_offscreen_positions(self):
        from io import BytesIO
        from reportlab.pdfgen.canvas import Canvas
        from src.generate_network_print import fonts
        from src.generate_view_comparison_posters import ANCHORS,draw_anchors
        fonts();g=nx.Graph()
        for letter,node,label in ANCHORS:g.add_node(node,kind='place' if letter=='B' else 'date' if letter=='D' else 'method')
        xy={ANCHORS[0][1]:(330,381),ANCHORS[2][1]:(948,326),ANCHORS[3][1]:(344,147)}
        audit=draw_anchors(Canvas(BytesIO()),g,xy,False)
        self.assertEqual([a['letter'] for a in audit if a['visible']],['A','C','D'])
        self.assertEqual([a['letter'] for a in audit if not a['visible']],['B'])
        self.assertEqual(ANCHORS[3][1],'date:2026-08-12')
        self.assertEqual(len(xy),3)

    def test_camera_projection_and_uniform_fit(self):
        g=nx.Graph()
        g.add_node('left',x=-2,y=0,z=0)
        g.add_node('right',x=2,y=0,z=0)
        g.add_node('up',x=0,y=2,z=0)
        g.add_node('near',x=1,y=0,z=5)
        view={'position':[0,0,10],'quaternion':[0,0,0,1],'fov':50,'zoom':1}
        xy,_=project(g,view,(0,0,400,400))
        self.assertLess(xy['left'][0],xy['right'][0])
        self.assertGreater(xy['up'][1],xy['left'][1])
        self.assertAlmostEqual(xy['near'][0],xy['right'][0])
        self.assertAlmostEqual(xy['right'][0]-xy['left'][0],2*(xy['up'][1]-xy['left'][1]))

    def test_rotated_camera(self):
        g=nx.Graph()
        g.add_node('left',x=-2,y=0,z=0)
        g.add_node('right',x=2,y=0,z=0)
        view={'position':[0,0,-10],'quaternion':[0,1,0,0]}
        xy,_=project(g,view,(0,0,400,400))
        self.assertGreater(xy['left'][0],xy['right'][0])

    def test_reject_node_behind_camera(self):
        g=nx.Graph();g.add_node('bad',x=0,y=0,z=12)
        with self.assertRaisesRegex(ValueError,'No nodes'):
            project(g,{'position':[0,0,10],'quaternion':[0,0,0,1]},(0,0,400,400))

    def test_crop_distant_node_without_relayout(self):
        g=nx.Graph();g.add_node('center',x=0,y=0,z=0);g.add_node('far',x=1000,y=0,z=0)
        xy,_=project(g,{'position':[0,0,10],'quaternion':[0,0,0,1]},(0,0,400,400))
        self.assertEqual(set(xy),{'center'})
