import json
import unittest
import networkx as nx
from src.generate_network_art import edge_counts


class ArtEdgeTests(unittest.TestCase):
    def test_cloud_echoes_are_disjoint_recorded_side_subsets(self):
        from src.generate_network_art import cloud_echoes
        g=nx.Graph()
        g.add_node('event',source_record=json.dumps(dict(
            side_a='Government of Ukraine',side_b='Government of Russia (Soviet Union)',
            deaths_a=2,deaths_b=3,deaths_civilians=1,deaths_unknown=1,best=7)))
        memorial=dict(points=[(i*.48,400) for i in range(7)],
                      records=[dict(node='event',point_range=[0,7])])
        red,black=cloud_echoes(g,memorial)
        self.assertEqual((red['count'],black['count']),(3,2))
        self.assertEqual(red['source_point_indices'],[0,1,2])
        self.assertEqual(black['source_point_indices'],[3,4])
        self.assertLess(red['offset_pt'][1],0)
        self.assertGreater(black['offset_pt'][1],0)

    def test_restored_divider_and_capped_top_run(self):
        from src.generate_network_art import needle_cells
        black,shaft,red=needle_cells()
        self.assertEqual((len(black),len(red)),(5345,27))
        self.assertEqual(len(set(black+shaft+red)),len(black+shaft+red))
        self.assertEqual(shaft,[(x,458) for x in range(258,5142)])
        self.assertEqual(black,[(x,4) for x in range(27,5372)])
        self.assertEqual(len([x for x,y in red if y==4 and x<27]),13)
        self.assertEqual(len([x for x,y in red if y==4 and x>5371]),13)
        from src.generate_network_art import border_cells
        borders,_,cap=border_cells(50355,5345)
        combined=borders[:-cap]+red+black
        self.assertEqual(len(set(combined)),50355+5345)
        adjacency=nx.Graph()
        adjacency.add_nodes_from(black)
        for x,y in black:
            for neighbor in ((x+1,y),(x,y+1)):
                if neighbor in adjacency:
                    adjacency.add_edge((x,y),neighbor)
        self.assertTrue(nx.is_connected(adjacency))
        self.assertEqual(sorted(n for n,d in adjacency.degree() if d==1),[(27,4),(5371,4)])

    def test_two_borders_and_black_gap_with_red_cap(self):
        from src.generate_network_art import border_cells
        red,black,cap=border_cells(50355,5345)
        self.assertEqual((len(red),len(black),cap),(50355,5345,27))
        self.assertEqual(len(set(red+black)),55700)
        self.assertEqual(black[0],(4,4))
        self.assertEqual(black[-1],(4,5348))
        self.assertEqual(red[-27],(4,5349))
        self.assertEqual(red[-1],(4,5375))

    def test_requested_edge_units(self):
        g=nx.Graph()
        for i,(a,b) in enumerate([(5,2),(0,3)]):
            g.add_node(str(i),kind='event',source_record=json.dumps(dict(
                side_a='Government of Russia (Soviet Union)',side_b='Government of Ukraine',
                deaths_a=a,deaths_b=b,best=a+b)))
        self.assertEqual(edge_counts(g),dict(ukrainian_side_deaths=5,russian_side_deaths=5))
