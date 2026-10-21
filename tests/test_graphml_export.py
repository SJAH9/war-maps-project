import tempfile
import unittest
from pathlib import Path
import networkx as nx
from src.event_feature_network import export_graphml


class GraphMLExportTests(unittest.TestCase):
    def test_portable_booleans_and_isolates(self):
        audit = dict(title='A & B', weighting='IGF', betweenness_method='weighted',
                     events=[], nodes=[dict(id='a', label='A', fatal=True),
                                       dict(id='b', label='B', fatal=False)], edges=[])
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'test.graphml'
            export_graphml(audit,path)
            text=path.read_text()
            self.assertNotIn('>True<',text)
            self.assertNotIn('>False<',text)
            graph=nx.read_graphml(path)
            self.assertEqual(len(graph),2)
            self.assertEqual(len(graph.edges),0)
            self.assertIs(graph.nodes['a']['fatal'],True)
            self.assertIs(graph.nodes['b']['fatal'],False)
            self.assertEqual(graph.graph['title'],'A & B')
