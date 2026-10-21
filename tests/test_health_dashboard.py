import copy
import json
import unittest
from src.import_health_dashboard import RAW, TABLES, decode, normalize, context_records


class DashboardTests(unittest.TestCase):
    def test_frozen_source_decodes_completely(self):
        data = normalize(json.loads(RAW.read_text()))
        self.assertEqual(set(data['tables']), set(TABLES))
        self.assertFalse(data['add_to_ucdp'])
        self.assertGreater(len(data['tables']['oPt Casualties']), 1000)
        self.assertGreater(len(data['tables']['Fact_Attack']), 2000)
        self.assertIn('Gaza Injuries', data['latest'])

    def test_truncation_rejected(self):
        raw = json.loads(RAW.read_text())['responses']['oPt Casualties']
        raw['results'][0]['result']['data']['dsr']['DS'][0]['IC'] = False
        with self.assertRaises(ValueError):
            decode(raw, TABLES['oPt Casualties'])

    def test_repeat_null_dictionary_and_literal(self):
        response = {'results':[{'result':{'data':{
            'descriptor':{'Select':[{'Name':'t.a'},{'Name':'t.b'}]},
            'dsr':{'DS':[{'IC':True,'ValueDicts':{'D0':['alpha']},'PH':[{'DM0':[
                {'S':[{'N':'G0','T':1,'DN':'D0'},{'N':'G1','T':4}], 'C':[0,9]},
                {'R':1,'Ø':2,'C':[]}, {'C':['literal',2]}
            ]}]}]}}}}]}
        self.assertEqual(decode(response,['a','b']),[{'a':'alpha','b':9},{'a':'alpha','b':None},{'a':'literal','b':2}])

    def test_context_is_replacement_not_duplicate(self):
        old={'id':'gaza-ocha-moh','civilians':73470,'as_of':'2026-09-02'}
        rows=context_records([old,{'id':'gaza-aoav'}])
        self.assertEqual(len(rows),3)
        new=next(r for r in rows if r['id']==old['id'])
        self.assertEqual(new['previous_context_snapshot'],old)
        self.assertFalse(new['in_ucdp'])
        self.assertGreater(new['reported_injuries'],0)

    def test_old_capture_does_not_replace_newer_context(self):
        old={'id':'gaza-ocha-moh','civilians':99999,'as_of':'2099-01-01'}
        self.assertIn(old,context_records([old]))

    def test_no_personal_or_contact_tables_requested(self):
        self.assertEqual(set(TABLES),{'oPt Casualties','GAd Gaza','GAd_by_Years','Fact_Attack'})
