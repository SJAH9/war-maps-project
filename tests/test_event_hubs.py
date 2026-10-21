import unittest
from src.generate_event_hubs import model


class HubTests(unittest.TestCase):
    def test_feature_graph_preserves_events_without_governments(self):
        from src.event_feature_network import build
        rows=[self.row(i,f'2026-01-{i+1:02}') for i in range(5)]
        for i,r in enumerate(rows):
            r['side_a']='Government of Russia (Soviet Union)';r['side_b']='Government of Ukraine'
            r['where_coordinates']=f'Town {i}';r['source_headline']=''
        rows[0]['source_headline']=rows[1]['source_headline']='Drone strike'
        g,records,removed=build(rows)
        self.assertEqual(len(records),5)
        self.assertFalse(any(v.startswith('side:') for v in g))
        self.assertEqual(sum(d['kind']=='event' for _,d in g.nodes(data=True)),5)
        self.assertEqual(g.degree('event:4'),0)
        self.assertEqual(g.degree('method:Drone'),2)

    def test_ubiquitous_feature_suppression_and_inverse_frequency(self):
        from src.event_feature_network import build
        rows=[self.row(i,f'2026-01-{i+1:02}') for i in range(10)]
        for i,r in enumerate(rows):
            r['where_coordinates']='Common place';r['source_headline']='drone' if i<6 else ''
        rows[0]['source_headline']+=' missile';rows[1]['source_headline']+=' missile'
        g,_,removed=build(rows)
        self.assertTrue(any(d['id'].startswith('place:') for d in removed))
        self.assertGreater(g.nodes['method:Missile']['igf'],g.nodes['method:Drone']['igf'])
        self.assertTrue(all(g.degree(v)/max(1,len(g)-1)<=.7 for v in g))

    def row(self,i,day='2026-01-01',side='B'):
        return dict(id=str(i),date_start=day,date_end=day,country='X',adm_1='Y',
                    where_coordinates='Town',where_prec='1',date_prec='1',side_a='A',side_b=side,
                    best='1',source_headline='Drone strike reported')

    def test_incidence_aggregation_and_metrics(self):
        m=model([self.row(1),self.row(2),self.row(3,'2026-01-02')]);g=m['graph']
        self.assertEqual(len(m['records']),3)
        intervals=[n for n,d in g.nodes(data=True) if d['kind']=='interval']
        self.assertEqual(len(intervals),2)
        self.assertEqual(g.degree('side:A'),2)
        self.assertEqual(m['methods']['Drone'],3)
        self.assertTrue(all(0<=d['betweenness']<=1 for _,d in g.nodes(data=True)))
        self.assertEqual(sum(g.nodes[n]['events'] for n in intervals),3)

    def test_precision_not_silently_merged(self):
        a=self.row(1);b=self.row(2);b['where_prec']='2'
        m=model([a,b])
        self.assertEqual(len(m['places']),2)

    def test_joint_sides_not_split(self):
        m=model([self.row(1,side='B, C')])
        self.assertIn('side:B, C',m['graph'])
        self.assertNotIn('side:B',m['graph'])
