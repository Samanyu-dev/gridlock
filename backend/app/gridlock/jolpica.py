"""Real calendar/classification backup. Missing telemetry is left unavailable.

Adapts Jolpica's public Ergast-compatible results to our existing normalizer.
No invented laps, weather, pit-stop durations or driver-of-the-day votes.
"""
import json
import time
import urllib.request
from .season import COUNTRY_NAMES

CIRCUITS = {'albert_park':'Melbourne','bahrain':'Sakhir','shanghai':'Shanghai','suzuka':'Suzuka',
 'jeddah':'Jeddah','miami':'Miami','imola':'Imola','monaco':'Monte Carlo','catalunya':'Barcelona',
 'villeneuve':'Montreal','red_bull_ring':'Spielberg','silverstone':'Silverstone','spa':'Spa-Francorchamps',
 'hungaroring':'Hungaroring','zandvoort':'Zandvoort','monza':'Monza','baku':'Baku',
 'marina_bay':'Singapore','americas':'Austin','rodriguez':'Mexico City','interlagos':'Interlagos',
 'vegas':'Las Vegas','losail':'Lusail','yas_marina':'Yas Marina Circuit'}
PHASES = {'FirstPractice':'Practice 1','SecondPractice':'Practice 2','ThirdPractice':'Practice 3',
          'Qualifying':'Qualifying','Sprint':'Sprint','SprintQualifying':'Sprint Qualifying'}


class JolpicaClient:
    def __init__(self, year):
        self.year = year
        self.calendar = self._fetch('')
        self.results = {}
        for path, field, phase in [('results','Results','Race'), ('qualifying','QualifyingResults','Qualifying'), ('sprint','SprintResults','Sprint')]:
            for race in self._fetch(path):
                key = f"{race['round']}:{phase}"
                self.results.setdefault(key, []).extend(race.get(field, []))

    def _fetch(self, path):
        races, offset = [], 0
        while True:
            url = f'https://api.jolpi.ca/ergast/f1/{self.year}/{path + "/" if path else ""}?limit=100&offset={offset}'
            req = urllib.request.Request(url, headers={'User-Agent':'GRIDLOCK/1.0','Accept':'application/json'})
            with urllib.request.urlopen(req, timeout=8) as response:
                data = json.load(response)['MRData']
            races.extend(data['RaceTable']['Races'])
            offset += int(data['limit'])
            if offset >= int(data['total']):
                return races
            time.sleep(.3)

    def meetings(self, **params):
        countries = {name: code for code, name in COUNTRY_NAMES.items()}
        return [{'meeting_key':int(r['round']), 'meeting_name':r['raceName'], 'date_start':r['date'],
                 'country_iso2':countries.get(r['Circuit']['Location']['country'], 'XX')}
                for r in self.calendar]

    def sessions(self, **params):
        rows = []
        for r in self.calendar:
            for phase, when in [('Race', r)] + [(name, r[key]) for key,name in PHASES.items() if key in r]:
                if not when.get('time'): continue
                rows.append({'meeting_key':int(r['round']), 'session_key':f"{r['round']}:{phase}",
                    'session_name':phase, 'date_start':when['date']+'T'+when['time'],
                    'circuit_short_name':CIRCUITS.get(r['Circuit']['circuitId'], r['Circuit']['circuitName']),
                    'location':r['Circuit']['Location']['locality']})
        return rows

    def session_result(self, session_key):
        rows = []
        for r in self.results.get(session_key, []):
            status = r.get('status', 'Finished')
            number = r.get('number') or r.get('Driver', {}).get('permanentNumber')
            if not number: continue
            rows.append({'driver_number':int(number), 'position':int(r['position']),
                         'dnf':status != 'Finished' and not status.startswith('+') and status not in ('Disqualified','Did not start','Withdrew'),
                         'dsq':status == 'Disqualified', 'dns':status in ('Did not start','Withdrew')})
        return rows

    def starting_grid(self, session_key):
        return [{'driver_number':int(r['number']), 'position':int(r['grid']) or None}
                for r in self.results.get(session_key, []) if r.get('number') and r.get('grid')]

    def laps(self, session_key):
        rows = []
        for r in self.results.get(session_key, []):
            lap = r.get('FastestLap', {}).get('Time', {}).get('time')
            if lap:
                mins, secs = lap.split(':')
                rows.append({'driver_number':int(r['number']), 'lap_duration':int(mins)*60+float(secs)})
        return rows

    def pit(self, **params): return []
    def weather(self, **params): return []
