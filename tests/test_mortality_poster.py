import unittest
from unittest.mock import Mock

from src.generate_mortality_poster import summarize, draw_dots


def row(**changes):
    return dict(id="1",date_start="2026-01-01",date_end="2026-01-02",
                best="10",deaths_civilians="3",deaths_a="2",deaths_b="1",
                deaths_unknown="4",_source="candidate",**changes)


class MortalityPosterTests(unittest.TestCase):
    def test_counts(self):
        result=summarize([row()])
        self.assertEqual([result[k] for k in ("total","civilian","warfighter","unknown")],[10,3,3,4])
        self.assertEqual(result["through"],"2026-01-02")

    def test_invalid_or_unattributable_inputs_fail(self):
        for changes in ({"best":"11"},{"deaths_unknown":""},{"deaths_unknown":"-1"},
                        {"date_start":"2025-12-31"}):
            r=row();r.update(changes)
            with self.assertRaises((ValueError,KeyError)):summarize([r])
        with self.assertRaises(ValueError):summarize([row(),row()])

    def test_exact_vector_mark_count(self):
        c=Mock()
        count=draw_dots(c,{"civilian":3,"warfighter":3,"unknown":4})
        self.assertEqual(count,10)
        path=c.beginPath.return_value
        self.assertEqual(path.circle.call_count,10)
        for call in c.drawPath.call_args_list:
            self.assertEqual(call.kwargs,{"fill":1,"stroke":0})

    def test_context_posters_share_mark_scale(self):
        a,b=Mock(),Mock()
        draw_dots(a,{"civilian":3,"warfighter":3,"unknown":4},capacity=100)
        draw_dots(b,{"civilian":5,"warfighter":10,"unknown":20},capacity=100)
        self.assertEqual(a.beginPath.return_value.circle.call_args_list[0],
                         b.beginPath.return_value.circle.call_args_list[0])
        points=a.beginPath.return_value.circle.call_args_list
        x1,_,radius=points[0].args
        x2,_,_=points[1].args
        self.assertAlmostEqual(2*radius/(x2-x1),.32)
