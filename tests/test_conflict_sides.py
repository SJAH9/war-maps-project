import unittest
from src.conflict_sides import compile_rows,counts,overview_segments
from src.generate_conflict_sides import spiral_points, page_plan, printable_years, print_spiral_colors, detail_colors


def row(id,year=2026,conflict='1',a=3,b=2,civilian=1,unknown=1):
    return dict(id=id,year=str(year),type_of_violence='1',conflict_new_id=conflict,conflict_name='Test '+conflict,
                side_a='Recorded A',side_b='Recorded B',deaths_a=str(a),deaths_b=str(b),deaths_civilians=str(civilian),deaths_unknown=str(unknown),best=str(a+b+civilian+unknown),_source='fixture')


class ConflictSidesTests(unittest.TestCase):
    def test_print_scope_and_zero_pages(self):
        self.assertEqual(printable_years({'years':{
            '1999':{'total':8},'2000':{'total':8},'2001':{'total':0},
            '2002':{'total':4},'2026':{'total':1}}}),['2026','2002'])

    def test_print_promotes_civilians_caps_dots_and_does_not_duplicate(self):
        for a,b,civ,unknown in [(1,0,0,0),(0,0,100,0),(2,3,30,20)]:
            c=dict(a=a,b=b,c=0,d=0,civilian=civ,unknown=unknown)
            plan=page_plan(dict(counts=c,total=sum(c.values())),title_size=24)
            self.assertLessEqual(plan['pitch']*.62,24)
            self.assertEqual(plan['named']+plan['outside'],sum(c.values()))
            if civ==100:self.assertTrue(plan['promoted'])
            if civ==30:
                self.assertTrue(plan['second'])
                self.assertEqual(plan['population'],55)
                self.assertEqual(plan['population']-plan['named'],50)

    def test_current_scope_and_all_years(self):
        m=compile_rows([row('1',2025),row('2'),row('3',2024,conflict='old')],2026)
        self.assertEqual(len(m),1);self.assertEqual(m[0]['all']['total'],14)
        self.assertEqual(set(m[0]['years']),{'2025','2026'})
        self.assertEqual(m[0]['all']['counts']['c'],0)

    def test_reconciliation_and_duplicates(self):
        bad=row('1');bad['best']='100'
        with self.assertRaises(ValueError):counts(bad)
        with self.assertRaises(ValueError):compile_rows([row('1'),row('1')],2026)

    def test_spiral_contiguous_ranges_and_order(self):
        m=compile_rows([row('1',conflict='small'),row('2',conflict='large',b=12)],2026)
        seg=overview_segments(m,2026)
        self.assertEqual(seg[0]['conflict'],'1:large');self.assertEqual(seg[0]['side'],'b')
        self.assertEqual(seg[0]['start'],0)
        self.assertTrue(all(s['side'] in 'abcd' for s in seg))
        self.assertTrue(all(a['end']==b['start'] for a,b in zip(seg,seg[1:])))
        self.assertEqual(seg[-1]['end'],sum(x['all']['counts'][s] for x in m for s in 'abcd'))

    def test_print_spiral_keeps_greatest_loss_first_and_black(self):
        for a,b in [(100,5),(5,100)]:
            models=compile_rows([row('1',a=a,b=b),row('2',conflict='small')],2026)
            segments=overview_segments(models,2026)
            original=[dict(s) for s in segments]
            palette=print_spiral_colors(segments)
            self.assertEqual(segments,original)
            self.assertEqual(segments[0]['end'],100)
            self.assertEqual(palette[segments[0]['side']],'#080808')
            self.assertEqual(segments[0]['conflict'],segments[1]['conflict'])
            self.assertEqual(palette[segments[1]['side']],'#ffffff')

    def test_detail_colors_follow_counts_not_side_identity(self):
        for a,b in [(1330,5293),(302593,87913),(0,10),(10,0),(5,5)]:
            palette=detail_colors(dict(a=a,b=b))
            smaller='a' if a<=b else 'b'
            self.assertEqual(palette[smaller],'#000000')
            self.assertEqual(palette['b' if smaller=='a' else 'a'],'#ac2529')
            self.assertEqual(palette['c'],'#999999')

    def test_geometry_one_position_per_death(self):
        pts=list(spiral_points(10000));self.assertEqual(len(pts),10000)
        self.assertEqual(len(set((x,y) for x,y,_ in pts)),10000)
        self.assertEqual(pts[0][0],0);self.assertLess(pts[0][1],0)
        self.assertGreater(pts[1][0],0)
        self.assertLess(pts[-1][0]**2+pts[-1][1]**2,pts[0][1]**2)
