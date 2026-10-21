import unittest
import networkx as nx
from src.generate_war_networks import metrics,similarity,temporal_links,temporal_stats,country_networks
from src.import_health_dashboard import health_graphs


def event(i,start,end,country='Iran'):
    return {'id':str(i),'start':start,'end':end,'country':country,'sides':['Iran','joint side']}


class WarNetworkTests(unittest.TestCase):
    def test_star_centralization(self):
        m=metrics(nx.star_graph(4))
        self.assertEqual(m['centralization'],1)
        self.assertEqual(m['clustering'],0)
        self.assertEqual(m['core_share'],0)

    def test_similarity(self):
        m=metrics(nx.cycle_graph(5))
        self.assertEqual(similarity(m,m),0)
        self.assertEqual(m['core_share'],1)

    def test_no_motive_needed(self):
        events=[event(1,'2026-01-01','2026-01-01'),event(2,'2026-01-03','2026-01-03')]
        self.assertEqual(len(temporal_links(events,3)),1)
        events[1]['denies_retaliation']=True
        self.assertEqual(len(temporal_links(events,3)),1)
        self.assertEqual(temporal_links(events,1),[])

    def test_overlap_has_no_invented_order(self):
        self.assertEqual(temporal_links([event(1,'2026-01-01','2026-01-05'),event(2,'2026-01-03','2026-01-04')]),[])
        self.assertEqual(temporal_links([event(1,'2026-01-01','2026-01-01'),event(2,'2026-01-01','2026-01-01')]),[])

    def test_isolates_retained_and_null_reproducible(self):
        events=[event(1,'2026-01-01','2026-01-01'),event(2,'2026-01-03','2026-01-03'),event(3,'2026-02-03','2026-02-03')]
        edges=temporal_links(events);s=temporal_stats(events,edges)
        self.assertEqual(s['nodes'],3);self.assertEqual(s['isolates'],1)
        self.assertEqual(s,temporal_stats(events,edges))

    def test_coded_joint_side_is_not_split(self):
        rows=[{'id':'1','country':'Iran','region':'Middle East','side_a':'Iran','side_b':'Israel, United States'}]
        g=country_networks(rows)['Iran']['graph']
        self.assertEqual(len(g),2)
        self.assertIn('Israel, United States',g)

    def test_injuries_and_nulls_retained(self):
        tables={'oPt Casualties':[], 'Fact_Attack':[{'AttackKey':1,'AttackID':'A','AttackDate':'2026-01-01',
                'Country':'area','Governorate':'place','TotalDeaths':None,'TotalInjuries':7}]}
        graph=health_graphs(tables)
        e=next(n for n in graph['nodes'] if n['kind']=='health-attack')
        self.assertIsNone(e['deaths']);self.assertEqual(e['injuries'],7)
        self.assertEqual(len(graph['edges']),1)
