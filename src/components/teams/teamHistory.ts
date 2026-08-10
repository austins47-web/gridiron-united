// ── Static historical data ────────────────────────────────────
// CFB: Heisman winners and National Championships by ESPN team ID
// NFL: Super Bowl wins and MVP awards by ESPN team ID

export const CFB_HISTORY: Record<string, { heismans: { year: number; name: string }[]; natChamps: number[] }> = {
  '333': { // Alabama
    heismans: [
      { year: 2009, name: 'Mark Ingram' }, { year: 2015, name: 'Derrick Henry' },
      { year: 2018, name: 'Tua Tagovailoa' }, { year: 2020, name: 'DeVonta Smith' },
    ],
    natChamps: [1925,1926,1930,1934,1941,1961,1964,1965,1978,1979,1992,2009,2011,2012,2015,2017,2018,2020],
  },
  '57': { // Florida
    heismans: [
      { year: 1966, name: 'Steve Spurrier' }, { year: 1996, name: 'Danny Wuerffel' },
      { year: 2007, name: 'Tim Tebow' },
    ],
    natChamps: [1996, 2006, 2008],
  },
  '61': { // Georgia
    heismans: [{ year: 1982, name: 'Herschel Walker' }],
    natChamps: [1942,1980,2021,2022],
  },
  '99': { // LSU
    heismans: [
      { year: 1959, name: 'Billy Cannon' }, { year: 2019, name: 'Joe Burrow' },
    ],
    natChamps: [1958,2003,2007,2019],
  },
  '2633': { // Tennessee
    heismans: [{ year: 1998, name: 'Peyton Manning' }],
    natChamps: [1998],
  },
  '245': { // Texas A&M
    heismans: [
      { year: 1957, name: 'John David Crow' },
      { year: 2012, name: 'Johnny Manziel' },
    ],
    natChamps: [1919, 1927, 1939, 1998],
  },
  '194': { // Ohio State
    heismans: [
      { year: 1944, name: 'Les Horvath' }, { year: 1950, name: 'Vic Janowicz' },
      { year: 1954, name: 'Howard Cassady' }, { year: 1974, name: 'Archie Griffin' },
      { year: 1975, name: 'Archie Griffin' }, { year: 1995, name: 'Eddie George' },
      { year: 2006, name: 'Troy Smith' },
    ],
    natChamps: [1942,1954,1957,1961,1968,1970,2002,2014,2024],
  },
  '130': { // Michigan
    heismans: [
      { year: 1940, name: 'Tom Harmon' }, { year: 1991, name: 'Desmond Howard' },
      { year: 1997, name: 'Charles Woodson' },
    ],
    natChamps: [1947,1948,1997,2023],
  },
  '87': { // Notre Dame
    heismans: [
      { year: 1943, name: 'Angelo Bertelli' }, { year: 1944, name: 'Les Horvath' },
      { year: 1947, name: 'Johnny Lujack' }, { year: 1949, name: 'Leon Hart' },
      { year: 1953, name: 'John Lattner' }, { year: 1956, name: 'Paul Hornung' },
      { year: 1964, name: 'John Huarte' }, { year: 1987, name: 'Tim Brown' },
    ],
    natChamps: [1924,1929,1930,1938,1943,1946,1947,1949,1966,1973,1977,1988],
  },
  '30': { // USC
    heismans: [
      { year: 1965, name: 'Mike Garrett' }, { year: 1967, name: 'O.J. Simpson' },
      { year: 1979, name: 'Charles White' }, { year: 1981, name: 'Marcus Allen' },
      { year: 2002, name: 'Carson Palmer' }, { year: 2004, name: 'Matt Leinart' },
      { year: 2005, name: 'Reggie Bush' }, { year: 2023, name: 'Caleb Williams' },
    ],
    natChamps: [1928,1931,1932,1939,1962,1967,1972,1974,2003,2004],
  },
  '251': { // Texas
    heismans: [
      { year: 1977, name: 'Earl Campbell' },
      { year: 1990, name: 'Ty Detmer' },
    ],
    natChamps: [1963,1969,1970,2005],
  },
  '228': { // Clemson
    heismans: [],
    natChamps: [1981,2016,2018],
  },
  '52': { // Florida State
    heismans: [
      { year: 1993, name: 'Charlie Ward' },
    ],
    natChamps: [1993,1999,2013],
  },
  '2483': { // Oregon
    heismans: [
      { year: 2014, name: 'Marcus Mariota' },
    ],
    natChamps: [2024],
  },
  '272': { // Penn State
    heismans: [],
    natChamps: [1982,1986],
  },
  '26': { // Nebraska
    heismans: [
      { year: 1972, name: 'Johnny Rodgers' }, { year: 1983, name: 'Mike Rozier' },
    ],
    natChamps: [1970,1971,1994,1995,1997],
  },
  '2509': { // Oklahoma
    heismans: [
      { year: 1952, name: 'Billy Vessels' }, { year: 1978, name: 'Billy Sims' },
      { year: 2003, name: 'Jason White' }, { year: 2017, name: 'Baker Mayfield' },
      { year: 2018, name: 'Kyler Murray' },
    ],
    natChamps: [1950,1955,1956,1974,1975,1985,2000],
  },
  '2084': { // Miami
    heismans: [
      { year: 1992, name: 'Gino Torretta' },
    ],
    natChamps: [1983,1987,1989,1991,2001],
  },
}

export const NFL_HISTORY: Record<string, { superBowls: { year: number; opponent: string; score: string }[]; mvps: { year: number; name: string }[] }> = {
  '1': { // Atlanta Falcons
    superBowls: [], mvps: [],
  },
  '2': { // Buffalo Bills
    superBowls: [], mvps: [],
  },
  '3': { // Chicago Bears
    superBowls: [{ year: 1985, opponent: 'New England Patriots', score: '46-10' }],
    mvps: [{ year: 1985, name: 'Richard Dent' }],
  },
  '4': { // Cincinnati Bengals
    superBowls: [], mvps: [],
  },
  '5': { // Cleveland Browns
    superBowls: [], mvps: [],
  },
  '6': { // Dallas Cowboys
    superBowls: [
      { year: 1971, opponent: 'Miami Dolphins', score: '24-3' },
      { year: 1977, opponent: 'Denver Broncos', score: '27-10' },
      { year: 1992, opponent: 'Buffalo Bills', score: '52-17' },
      { year: 1993, opponent: 'Buffalo Bills', score: '30-13' },
      { year: 1995, opponent: 'Pittsburgh Steelers', score: '27-17' },
    ],
    mvps: [
      { year: 1971, name: 'Roger Staubach' }, { year: 1977, name: 'Harvey Martin/Randy White' },
      { year: 1992, name: 'Troy Aikman' }, { year: 1993, name: 'Emmitt Smith' },
      { year: 1995, name: 'Larry Brown' },
    ],
  },
  '7': { // Denver Broncos
    superBowls: [
      { year: 1997, opponent: 'Green Bay Packers', score: '31-24' },
      { year: 1998, opponent: 'Atlanta Falcons', score: '34-19' },
      { year: 2015, opponent: 'Carolina Panthers', score: '24-10' },
    ],
    mvps: [
      { year: 1997, name: 'Terrell Davis' }, { year: 1998, name: 'John Elway' },
      { year: 2015, name: 'Von Miller' },
    ],
  },
  '8': { // Detroit Lions
    superBowls: [], mvps: [],
  },
  '9': { // Green Bay Packers
    superBowls: [
      { year: 1966, opponent: 'Kansas City Chiefs', score: '35-10' },
      { year: 1967, opponent: 'Oakland Raiders', score: '33-14' },
      { year: 1996, opponent: 'New England Patriots', score: '35-21' },
      { year: 2010, opponent: 'Pittsburgh Steelers', score: '31-25' },
    ],
    mvps: [
      { year: 1966, name: 'Bart Starr' }, { year: 1967, name: 'Bart Starr' },
      { year: 1996, name: 'Desmond Howard' }, { year: 2010, name: 'Aaron Rodgers' },
    ],
  },
  '10': { // Tennessee Titans
    superBowls: [], mvps: [],
  },
  '11': { // Indianapolis Colts
    superBowls: [
      { year: 1970, opponent: 'Dallas Cowboys', score: '16-13' },
      { year: 2006, opponent: 'Chicago Bears', score: '29-17' },
    ],
    mvps: [
      { year: 1970, name: 'Chuck Howley' }, { year: 2006, name: 'Peyton Manning' },
    ],
  },
  '12': { // Kansas City Chiefs
    superBowls: [
      { year: 1969, opponent: 'Minnesota Vikings', score: '23-7' },
      { year: 2019, opponent: 'San Francisco 49ers', score: '31-20' },
      { year: 2022, opponent: 'Philadelphia Eagles', score: '38-35' },
      { year: 2023, opponent: 'San Francisco 49ers', score: '25-22' },
    ],
    mvps: [
      { year: 1969, name: 'Len Dawson' }, { year: 2019, name: 'Patrick Mahomes' },
      { year: 2022, name: 'Patrick Mahomes' }, { year: 2023, name: 'Patrick Mahomes' },
    ],
  },
  '13': { // Las Vegas Raiders
    superBowls: [
      { year: 1976, opponent: 'Minnesota Vikings', score: '32-14' },
      { year: 1980, opponent: 'Philadelphia Eagles', score: '27-10' },
      { year: 1983, opponent: 'Washington Redskins', score: '38-9' },
    ],
    mvps: [
      { year: 1976, name: 'Fred Biletnikoff' }, { year: 1980, name: 'Jim Plunkett' },
      { year: 1983, name: 'Marcus Allen' },
    ],
  },
  '14': { // Los Angeles Rams
    superBowls: [
      { year: 1999, opponent: 'Tennessee Titans', score: '23-16' },
      { year: 2021, opponent: 'Cincinnati Bengals', score: '23-20' },
    ],
    mvps: [
      { year: 1999, name: 'Kurt Warner' }, { year: 2021, name: 'Cooper Kupp' },
    ],
  },
  '15': { // Miami Dolphins
    superBowls: [
      { year: 1972, opponent: 'Washington Redskins', score: '14-7' },
      { year: 1973, opponent: 'Minnesota Vikings', score: '24-7' },
    ],
    mvps: [
      { year: 1972, name: 'Jake Scott' }, { year: 1973, name: 'Larry Csonka' },
    ],
  },
  '16': { // Minnesota Vikings
    superBowls: [], mvps: [],
  },
  '17': { // New England Patriots
    superBowls: [
      { year: 2001, opponent: 'St. Louis Rams', score: '20-17' },
      { year: 2003, opponent: 'Carolina Panthers', score: '32-29' },
      { year: 2004, opponent: 'Philadelphia Eagles', score: '24-21' },
      { year: 2014, opponent: 'Seattle Seahawks', score: '28-24' },
      { year: 2016, opponent: 'Atlanta Falcons', score: '34-28' },
      { year: 2018, opponent: 'Los Angeles Rams', score: '13-3' },
    ],
    mvps: [
      { year: 2001, name: 'Tom Brady' }, { year: 2003, name: 'Tom Brady' },
      { year: 2004, name: 'Deion Branch' }, { year: 2014, name: 'Tom Brady' },
      { year: 2016, name: 'Tom Brady' }, { year: 2018, name: 'Julian Edelman' },
    ],
  },
  '18': { // New Orleans Saints
    superBowls: [{ year: 2009, opponent: 'Indianapolis Colts', score: '31-17' }],
    mvps: [{ year: 2009, name: 'Drew Brees' }],
  },
  '19': { // New York Giants
    superBowls: [
      { year: 1986, opponent: 'Denver Broncos', score: '39-20' },
      { year: 1990, opponent: 'Buffalo Bills', score: '20-19' },
      { year: 2007, opponent: 'New England Patriots', score: '17-14' },
      { year: 2011, opponent: 'New England Patriots', score: '21-17' },
    ],
    mvps: [
      { year: 1986, name: 'Phil Simms' }, { year: 1990, name: 'Ottis Anderson' },
      { year: 2007, name: 'Eli Manning' }, { year: 2011, name: 'Eli Manning' },
    ],
  },
  '20': { // New York Jets
    superBowls: [{ year: 1968, opponent: 'Baltimore Colts', score: '16-7' }],
    mvps: [{ year: 1968, name: 'Joe Namath' }],
  },
  '21': { // Philadelphia Eagles
    superBowls: [
      { year: 2017, opponent: 'New England Patriots', score: '41-33' },
      { year: 2024, opponent: 'Kansas City Chiefs', score: '40-22' },
    ],
    mvps: [
      { year: 2017, name: 'Nick Foles' }, { year: 2024, name: 'Jalen Hurts' },
    ],
  },
  '22': { // Arizona Cardinals
    superBowls: [], mvps: [],
  },
  '23': { // Pittsburgh Steelers
    superBowls: [
      { year: 1974, opponent: 'Minnesota Vikings', score: '16-6' },
      { year: 1975, opponent: 'Dallas Cowboys', score: '21-17' },
      { year: 1978, opponent: 'Dallas Cowboys', score: '35-31' },
      { year: 1979, opponent: 'Los Angeles Rams', score: '31-19' },
      { year: 2005, opponent: 'Seattle Seahawks', score: '21-10' },
      { year: 2008, opponent: 'Arizona Cardinals', score: '27-23' },
    ],
    mvps: [
      { year: 1974, name: 'Franco Harris' }, { year: 1975, name: 'Lynn Swann' },
      { year: 1978, name: 'Terry Bradshaw' }, { year: 1979, name: 'Terry Bradshaw' },
      { year: 2005, name: 'Hines Ward' }, { year: 2008, name: 'Santonio Holmes' },
    ],
  },
  '24': { // Los Angeles Chargers
    superBowls: [], mvps: [],
  },
  '25': { // San Francisco 49ers
    superBowls: [
      { year: 1981, opponent: 'Cincinnati Bengals', score: '26-21' },
      { year: 1984, opponent: 'Miami Dolphins', score: '38-16' },
      { year: 1988, opponent: 'Cincinnati Bengals', score: '20-16' },
      { year: 1989, opponent: 'Denver Broncos', score: '55-10' },
      { year: 1994, opponent: 'San Diego Chargers', score: '49-26' },
    ],
    mvps: [
      { year: 1981, name: 'Joe Montana' }, { year: 1984, name: 'Joe Montana' },
      { year: 1988, name: 'Jerry Rice' }, { year: 1989, name: 'Joe Montana' },
      { year: 1994, name: 'Steve Young' },
    ],
  },
  '26': { // Seattle Seahawks
    superBowls: [{ year: 2013, opponent: 'Denver Broncos', score: '43-8' }],
    mvps: [{ year: 2013, name: 'Malcolm Smith' }],
  },
  '27': { // Tampa Bay Buccaneers
    superBowls: [
      { year: 2002, opponent: 'Oakland Raiders', score: '48-21' },
      { year: 2020, opponent: 'Kansas City Chiefs', score: '31-9' },
    ],
    mvps: [
      { year: 2002, name: 'Dexter Jackson' }, { year: 2020, name: 'Tom Brady' },
    ],
  },
  '28': { // Washington Commanders
    superBowls: [
      { year: 1982, opponent: 'Miami Dolphins', score: '27-17' },
      { year: 1987, opponent: 'Denver Broncos', score: '42-10' },
      { year: 1991, opponent: 'Buffalo Bills', score: '37-24' },
    ],
    mvps: [
      { year: 1982, name: 'John Riggins' }, { year: 1987, name: 'Doug Williams' },
      { year: 1991, name: 'Mark Rypien' },
    ],
  },
  '29': { // Carolina Panthers
    superBowls: [], mvps: [],
  },
  '30': { // Jacksonville Jaguars
    superBowls: [], mvps: [],
  },
  '33': { // Baltimore Ravens
    superBowls: [
      { year: 2000, opponent: 'New York Giants', score: '34-7' },
      { year: 2012, opponent: 'San Francisco 49ers', score: '34-31' },
    ],
    mvps: [
      { year: 2000, name: 'Ray Lewis' }, { year: 2012, name: 'Joe Flacco' },
    ],
  },
  '34': { // Houston Texans
    superBowls: [], mvps: [],
  },
}
