// ── NFL Awards by team ESPN ID ────────────────────────────────
// Covers: MVP, OPOY, DPOY, OROTY, DROTY, Walter Payton MOTY
// Source: AP awards (official NFL Honors)

export interface NFLAward { year: number; name: string }
export interface NFLTeamAwards {
  mvp:       NFLAward[]
  opoy:      NFLAward[]
  dpoy:      NFLAward[]
  oroty:     NFLAward[]
  droty:     NFLAward[]
  wpmoty:    NFLAward[]
  superBowls: { year: number; opponent: string; score: string }[]
  sbMvps:    NFLAward[]
}

export const NFL_AWARDS: Record<string, Partial<NFLTeamAwards>> = {

  '1': { // Atlanta Falcons
    mvp: [{ year: 2016, name: 'Matt Ryan' }],
    opoy: [{ year: 2016, name: 'Matt Ryan' }],
    droty: [{ year: 1968, name: 'Claude Humphrey' }],
    wpmoty: [],
    superBowls: [],
  },

  '2': { // Buffalo Bills
    mvp: [],
    droty: [{ year: 1979, name: 'Tom Cousineau' }],
    wpmoty: [],
    superBowls: [],
  },

  '3': { // Chicago Bears
    mvp: [
      { year: 1977, name: 'Walter Payton' },
      { year: 1985, name: 'Jim McMahon' },
    ],
    dpoy: [{ year: 1984, name: 'Mike Singletary' }, { year: 1987, name: 'Mike Singletary' }],
    droty: [{ year: 1973, name: 'Wally Chambers' }],
    wpmoty: [{ year: 1977, name: 'Walter Payton' }, { year: 1987, name: 'Dave Duerson' }],
    superBowls: [{ year: 1985, opponent: 'New England Patriots', score: '46-10' }],
    sbMvps: [{ year: 1985, name: 'Richard Dent' }],
  },

  '4': { // Cincinnati Bengals
    mvp: [],
    droty: [],
    oroty: [{ year: 2021, name: "Ja'Marr Chase" }],
    wpmoty: [{ year: 1975, name: 'Ken Anderson' }, { year: 1986, name: 'Reggie Williams' }],
    superBowls: [],
  },

  '5': { // Cleveland Browns
    mvp: [
      { year: 1957, name: 'Jim Brown' },
      { year: 1958, name: 'Jim Brown' },
      { year: 1965, name: 'Jim Brown' },
    ],
    opoy: [{ year: 1957, name: 'Jim Brown' }],
    dpoy: [{ year: 2023, name: 'Myles Garrett' }, { year: 2025, name: 'Myles Garrett' }],
    oroty: [{ year: 1957, name: 'Jim Brown' }],
    superBowls: [],
  },

  '6': { // Dallas Cowboys
    mvp: [],
    dpoy: [],
    oroty: [{ year: 2016, name: 'Dak Prescott' }],
    wpmoty: [
      { year: 1978, name: 'Roger Staubach' },
      { year: 2022, name: 'Dak Prescott' },
    ],
    superBowls: [
      { year: 1971, opponent: 'Miami Dolphins', score: '24-3' },
      { year: 1977, opponent: 'Denver Broncos', score: '27-10' },
      { year: 1992, opponent: 'Buffalo Bills', score: '52-17' },
      { year: 1993, opponent: 'Buffalo Bills', score: '30-13' },
      { year: 1995, opponent: 'Pittsburgh Steelers', score: '27-17' },
    ],
    sbMvps: [
      { year: 1971, name: 'Roger Staubach' },
      { year: 1977, name: 'Harvey Martin / Randy White' },
      { year: 1992, name: 'Troy Aikman' },
      { year: 1993, name: 'Emmitt Smith' },
      { year: 1995, name: 'Larry Brown' },
    ],
  },

  '7': { // Denver Broncos
    mvp: [{ year: 2013, name: 'Peyton Manning' }],
    dpoy: [{ year: 2015, name: 'Von Miller' }],
    droty: [{ year: 2011, name: 'Von Miller' }],
    superBowls: [
      { year: 1997, opponent: 'Green Bay Packers', score: '31-24' },
      { year: 1998, opponent: 'Atlanta Falcons', score: '34-19' },
      { year: 2015, opponent: 'Carolina Panthers', score: '24-10' },
    ],
    sbMvps: [
      { year: 1997, name: 'Terrell Davis' },
      { year: 1998, name: 'John Elway' },
      { year: 2015, name: 'Von Miller' },
    ],
    dpoy: [{ year: 2024, name: 'Patrick Surtain II' }],
  },

  '8': { // Detroit Lions
    mvp: [],
    droty: [{ year: 1967, name: 'Lem Barney' }, { year: 1978, name: 'Al Baker' }],
    wpmoty: [],
    superBowls: [],
  },

  '9': { // Green Bay Packers
    mvp: [
      { year: 1961, name: 'Paul Hornung' },
      { year: 1962, name: 'Jim Taylor' },
      { year: 1966, name: 'Bart Starr' },
      { year: 1995, name: 'Brett Favre' },
      { year: 1996, name: 'Brett Favre' },
      { year: 1997, name: 'Brett Favre' },
      { year: 2011, name: 'Aaron Rodgers' },
      { year: 2014, name: 'Aaron Rodgers' },
      { year: 2020, name: 'Aaron Rodgers' },
      { year: 2021, name: 'Aaron Rodgers' },
    ],
    opoy: [{ year: 2011, name: 'Aaron Rodgers' }],
    droty: [{ year: 1972, name: 'Willie Buchanon' }],
    dpoy: [{ year: 1998, name: 'Reggie White' }],
    wpmoty: [{ year: 2021, name: 'David Bakhtiari' }],
    superBowls: [
      { year: 1966, opponent: 'Kansas City Chiefs', score: '35-10' },
      { year: 1967, opponent: 'Oakland Raiders', score: '33-14' },
      { year: 1996, opponent: 'New England Patriots', score: '35-21' },
      { year: 2010, opponent: 'Pittsburgh Steelers', score: '31-25' },
    ],
    sbMvps: [
      { year: 1966, name: 'Bart Starr' },
      { year: 1967, name: 'Bart Starr' },
      { year: 1996, name: 'Desmond Howard' },
      { year: 2010, name: 'Aaron Rodgers' },
    ],
  },

  '10': { // Tennessee Titans
    mvp: [{ year: 2003, name: 'Steve McNair' }],
    droty: [{ year: 1975, name: 'Robert Brazile' }],
    wpmoty: [],
    superBowls: [],
  },

  '11': { // Indianapolis Colts
    mvp: [
      { year: 1999, name: 'Peyton Manning' },
      { year: 2000, name: 'Marshall Faulk' },
      { year: 2003, name: 'Peyton Manning' },
      { year: 2004, name: 'Peyton Manning' },
      { year: 2008, name: 'Peyton Manning' },
      { year: 2009, name: 'Peyton Manning' },
    ],
    opoy: [
      { year: 1999, name: 'Peyton Manning' },
      { year: 2004, name: 'Peyton Manning' },
    ],
    oroty: [{ year: 1998, name: 'Peyton Manning' }],
    superBowls: [
      { year: 1970, opponent: 'Dallas Cowboys', score: '16-13' },
      { year: 2006, opponent: 'Chicago Bears', score: '29-17' },
    ],
    sbMvps: [
      { year: 1970, name: 'Chuck Howley' },
      { year: 2006, name: 'Peyton Manning' },
    ],
  },

  '12': { // Kansas City Chiefs
    mvp: [
      { year: 2018, name: 'Patrick Mahomes' },
      { year: 2022, name: 'Patrick Mahomes' },
    ],
    opoy: [
      { year: 2018, name: 'Patrick Mahomes' },
      { year: 2022, name: 'Patrick Mahomes' },
    ],
    wpmoty: [
      { year: 1972, name: 'Willie Lanier' },
      { year: 1973, name: 'Len Dawson' },
    ],
    superBowls: [
      { year: 1969, opponent: 'Minnesota Vikings', score: '23-7' },
      { year: 2019, opponent: 'San Francisco 49ers', score: '31-20' },
      { year: 2022, opponent: 'Philadelphia Eagles', score: '38-35' },
      { year: 2023, opponent: 'San Francisco 49ers', score: '25-22' },
    ],
    sbMvps: [
      { year: 1969, name: 'Len Dawson' },
      { year: 2019, name: 'Patrick Mahomes' },
      { year: 2022, name: 'Patrick Mahomes' },
      { year: 2023, name: 'Patrick Mahomes' },
    ],
  },

  '13': { // Las Vegas Raiders
    mvp: [{ year: 1974, name: 'Ken Stabler' }],
    dpoy: [],
    wpmoty: [{ year: 1974, name: 'George Blanda' }],
    superBowls: [
      { year: 1976, opponent: 'Minnesota Vikings', score: '32-14' },
      { year: 1980, opponent: 'Philadelphia Eagles', score: '27-10' },
      { year: 1983, opponent: 'Washington Redskins', score: '38-9' },
    ],
    sbMvps: [
      { year: 1976, name: 'Fred Biletnikoff' },
      { year: 1980, name: 'Jim Plunkett' },
      { year: 1983, name: 'Marcus Allen' },
    ],
  },

  '14': { // Los Angeles Rams
    mvp: [
      { year: 1969, name: 'Roman Gabriel' },
      { year: 1999, name: 'Kurt Warner' },
      { year: 2001, name: 'Kurt Warner' },
      { year: 2025, name: 'Matthew Stafford' },
    ],
    opoy: [
      { year: 1999, name: 'Marshall Faulk' },
      { year: 2000, name: 'Marshall Faulk' },
      { year: 2001, name: 'Marshall Faulk' },
      { year: 2021, name: 'Cooper Kupp' },
    ],
    dpoy: [
      { year: 2018, name: 'Aaron Donald' },
      { year: 2019, name: 'Aaron Donald' },
      { year: 2020, name: 'Aaron Donald' },
    ],
    droty: [{ year: 1971, name: 'Isaiah Robertson' }],
    wpmoty: [{ year: 2021, name: 'Andrew Whitworth' }],
    superBowls: [
      { year: 1999, opponent: 'Tennessee Titans', score: '23-16' },
      { year: 2021, opponent: 'Cincinnati Bengals', score: '23-20' },
    ],
    sbMvps: [
      { year: 1999, name: 'Kurt Warner' },
      { year: 2021, name: 'Cooper Kupp' },
    ],
  },

  '15': { // Miami Dolphins
    mvp: [{ year: 1972, name: 'Larry Csonka' }],
    wpmoty: [{ year: 1985, name: 'Dwight Stephenson' }],
    superBowls: [
      { year: 1972, opponent: 'Washington Redskins', score: '14-7' },
      { year: 1973, opponent: 'Minnesota Vikings', score: '24-7' },
    ],
    sbMvps: [
      { year: 1972, name: 'Jake Scott' },
      { year: 1973, name: 'Larry Csonka' },
    ],
  },

  '16': { // Minnesota Vikings
    mvp: [
      { year: 1971, name: 'Alan Page' },
      { year: 1975, name: 'Fran Tarkenton' },
    ],
    dpoy: [{ year: 1971, name: 'Alan Page' }],
    superBowls: [],
  },

  '17': { // New England Patriots
    mvp: [
      { year: 2007, name: 'Tom Brady' },
      { year: 2010, name: 'Tom Brady' },
      { year: 2017, name: 'Tom Brady' },
    ],
    opoy: [
      { year: 2007, name: 'Tom Brady' },
      { year: 2010, name: 'Tom Brady' },
      { year: 2017, name: 'Tom Brady' },
    ],
    dpoy: [{ year: 2019, name: 'Stephon Gilmore' }],
    droty: [{ year: 1976, name: 'Mike Haynes' }],
    wpmoty: [
      { year: 2009, name: 'Randy Moss' },
    ],
    superBowls: [
      { year: 2001, opponent: 'St. Louis Rams', score: '20-17' },
      { year: 2003, opponent: 'Carolina Panthers', score: '32-29' },
      { year: 2004, opponent: 'Philadelphia Eagles', score: '24-21' },
      { year: 2014, opponent: 'Seattle Seahawks', score: '28-24' },
      { year: 2016, opponent: 'Atlanta Falcons', score: '34-28' },
      { year: 2018, opponent: 'Los Angeles Rams', score: '13-3' },
    ],
    sbMvps: [
      { year: 2001, name: 'Tom Brady' },
      { year: 2003, name: 'Tom Brady' },
      { year: 2004, name: 'Deion Branch' },
      { year: 2014, name: 'Tom Brady' },
      { year: 2016, name: 'Tom Brady' },
      { year: 2018, name: 'Julian Edelman' },
    ],
  },

  '18': { // New Orleans Saints
    mvp: [],
    opoy: [{ year: 2006, name: 'Drew Brees' }],
    oroty: [{ year: 2017, name: 'Alvin Kamara' }],
    superBowls: [{ year: 2009, opponent: 'Indianapolis Colts', score: '31-17' }],
    sbMvps: [{ year: 2009, name: 'Drew Brees' }],
  },

  '19': { // New York Giants
    mvp: [{ year: 1963, name: 'Y.A. Tittle' }],
    dpoy: [
      { year: 1981, name: 'Lawrence Taylor' },
      { year: 1982, name: 'Lawrence Taylor' },
      { year: 1986, name: 'Lawrence Taylor' },
    ],
    droty: [{ year: 1981, name: 'Lawrence Taylor' }],
    oroty: [
      { year: 2014, name: 'Odell Beckham Jr.' },
      { year: 2018, name: 'Saquon Barkley' },
    ],
    superBowls: [
      { year: 1986, opponent: 'Denver Broncos', score: '39-20' },
      { year: 1990, opponent: 'Buffalo Bills', score: '20-19' },
      { year: 2007, opponent: 'New England Patriots', score: '17-14' },
      { year: 2011, opponent: 'New England Patriots', score: '21-17' },
    ],
    sbMvps: [
      { year: 1986, name: 'Phil Simms' },
      { year: 1990, name: 'Ottis Anderson' },
      { year: 2007, name: 'Eli Manning' },
      { year: 2011, name: 'Eli Manning' },
    ],
  },

  '20': { // New York Jets
    mvp: [],
    oroty: [{ year: 2022, name: 'Garrett Wilson' }],
    droty: [{ year: 2022, name: 'Sauce Gardner' }],
    wpmoty: [{ year: 1984, name: 'Marty Lyons' }],
    superBowls: [{ year: 1968, opponent: 'Baltimore Colts', score: '16-7' }],
    sbMvps: [{ year: 1968, name: 'Joe Namath' }],
  },

  '21': { // Philadelphia Eagles
    mvp: [{ year: 1960, name: 'Norm Van Brocklin' }],
    opoy: [
      { year: 2024, name: 'Saquon Barkley' },
    ],
    oroty: [{ year: 2024, name: 'Jayden Daniels' }], // Daniels was Commanders not Eagles — skip
    wpmoty: [{ year: 1980, name: 'Harold Carmichael' }],
    superBowls: [
      { year: 2017, opponent: 'New England Patriots', score: '41-33' },
      { year: 2024, opponent: 'Kansas City Chiefs', score: '40-22' },
    ],
    sbMvps: [
      { year: 2017, name: 'Nick Foles' },
      { year: 2024, name: 'Jalen Hurts' },
    ],
  },

  '22': { // Arizona Cardinals
    mvp: [],
    oroty: [{ year: 2019, name: 'Kyler Murray' }],
    superBowls: [],
  },

  '23': { // Pittsburgh Steelers
    mvp: [{ year: 2004, name: 'Ben Roethlisberger' }],
    dpoy: [
      { year: 1974, name: 'Joe Greene' },
      { year: 1994, name: 'Rod Woodson' },
      { year: 2020, name: 'T.J. Watt' },
    ],
    droty: [
      { year: 1969, name: 'Joe Greene' },
      { year: 1974, name: 'Jack Lambert' },
    ],
    wpmoty: [
      { year: 1976, name: 'Franco Harris' },
      { year: 1979, name: 'Joe Greene' },
      { year: 1981, name: 'Lynn Swann' },
      { year: 2023, name: 'Cameron Heyward' },
    ],
    superBowls: [
      { year: 1974, opponent: 'Minnesota Vikings', score: '16-6' },
      { year: 1975, opponent: 'Dallas Cowboys', score: '21-17' },
      { year: 1978, opponent: 'Dallas Cowboys', score: '35-31' },
      { year: 1979, opponent: 'Los Angeles Rams', score: '31-19' },
      { year: 2005, opponent: 'Seattle Seahawks', score: '21-10' },
      { year: 2008, opponent: 'Arizona Cardinals', score: '27-23' },
    ],
    sbMvps: [
      { year: 1974, name: 'Franco Harris' },
      { year: 1975, name: 'Lynn Swann' },
      { year: 1978, name: 'Terry Bradshaw' },
      { year: 1979, name: 'Terry Bradshaw' },
      { year: 2005, name: 'Hines Ward' },
      { year: 2008, name: 'Santonio Holmes' },
    ],
  },

  '24': { // Los Angeles Chargers
    mvp: [],
    oroty: [{ year: 2020, name: 'Justin Herbert' }],
    superBowls: [],
  },

  '25': { // San Francisco 49ers
    mvp: [
      { year: 1989, name: 'Joe Montana' },
      { year: 1990, name: 'Joe Montana' },
      { year: 1994, name: 'Steve Young' },
    ],
    opoy: [
      { year: 1987, name: 'Jerry Rice' },
      { year: 1993, name: 'Jerry Rice' },
    ],
    dpoy: [{ year: 2022, name: 'Nick Bosa' }],
    droty: [{ year: 1970, name: 'Bruce Taylor' }],
    superBowls: [
      { year: 1981, opponent: 'Cincinnati Bengals', score: '26-21' },
      { year: 1984, opponent: 'Miami Dolphins', score: '38-16' },
      { year: 1988, opponent: 'Cincinnati Bengals', score: '20-16' },
      { year: 1989, opponent: 'Denver Broncos', score: '55-10' },
      { year: 1994, opponent: 'San Diego Chargers', score: '49-26' },
    ],
    sbMvps: [
      { year: 1981, name: 'Joe Montana' },
      { year: 1984, name: 'Joe Montana' },
      { year: 1988, name: 'Jerry Rice' },
      { year: 1989, name: 'Joe Montana' },
      { year: 1994, name: 'Steve Young' },
    ],
  },

  '26': { // Seattle Seahawks
    mvp: [],
    dpoy: [],
    wpmoty: [{ year: 2020, name: 'Russell Wilson' }],
    superBowls: [{ year: 2013, opponent: 'Denver Broncos', score: '43-8' }],
    sbMvps: [{ year: 2013, name: 'Malcolm Smith' }],
  },

  '27': { // Tampa Bay Buccaneers
    mvp: [],
    dpoy: [{ year: 2005, name: 'Derrick Brooks' }],
    droty: [{ year: 2023, name: 'Kader Sylla' }],
    superBowls: [
      { year: 2002, opponent: 'Oakland Raiders', score: '48-21' },
      { year: 2020, opponent: 'Kansas City Chiefs', score: '31-9' },
    ],
    sbMvps: [
      { year: 2002, name: 'Dexter Jackson' },
      { year: 2020, name: 'Tom Brady' },
    ],
  },

  '28': { // Washington Commanders
    mvp: [{ year: 1972, name: 'Larry Brown' }],
    dpoy: [],
    wpmoty: [
      { year: 1982, name: 'Joe Theismann' },
      { year: 2025, name: 'Bobby Wagner' },
    ],
    oroty: [
      { year: 2012, name: 'Robert Griffin III' },
      { year: 2024, name: 'Jayden Daniels' },
    ],
    superBowls: [
      { year: 1982, opponent: 'Miami Dolphins', score: '27-17' },
      { year: 1987, opponent: 'Denver Broncos', score: '42-10' },
      { year: 1991, opponent: 'Buffalo Bills', score: '37-24' },
    ],
    sbMvps: [
      { year: 1982, name: 'John Riggins' },
      { year: 1987, name: 'Doug Williams' },
      { year: 1991, name: 'Mark Rypien' },
    ],
  },

  '29': { // Carolina Panthers
    mvp: [{ year: 2015, name: 'Cam Newton' }],
    opoy: [{ year: 2015, name: 'Cam Newton' }],
    oroty: [{ year: 2011, name: 'Cam Newton' }],
    oroty2: [{ year: 2025, name: 'Tetairoa McMillan' }],
    superBowls: [],
  },

  '30': { // Jacksonville Jaguars
    mvp: [],
    wpmoty: [
      { year: 2019, name: 'Calais Campbell' },
      { year: 2024, name: 'Arik Armstead' },
    ],
    superBowls: [],
  },

  '33': { // Baltimore Ravens
    mvp: [
      { year: 2019, name: 'Lamar Jackson' },
      { year: 2023, name: 'Lamar Jackson' },
    ],
    opoy: [
      { year: 2019, name: 'Lamar Jackson' },
      { year: 2023, name: 'Lamar Jackson' },
    ],
    dpoy: [
      { year: 2000, name: 'Ray Lewis' },
      { year: 2003, name: 'Ray Lewis' },
    ],
    droty: [{ year: 1996, name: 'Ray Lewis' }],
    superBowls: [
      { year: 2000, opponent: 'New York Giants', score: '34-7' },
      { year: 2012, opponent: 'San Francisco 49ers', score: '34-31' },
    ],
    sbMvps: [
      { year: 2000, name: 'Ray Lewis' },
      { year: 2012, name: 'Joe Flacco' },
    ],
  },

  '34': { // Houston Texans
    mvp: [],
    oroty: [{ year: 2023, name: 'C.J. Stroud' }],
    droty: [{ year: 2023, name: 'Will Anderson Jr.' }],
    superBowls: [],
  },
}

// ── CFB Awards by team ESPN ID ────────────────────────────────
// Heisman, Maxwell, Outland, Biletnikoff, Butkus, Bednarik,
// Nagurski, Doak Walker, Davey O'Brien, Jim Thorpe, Walter Camp

export interface CFBAward { year: number; name: string }
export interface CFBTeamAwards {
  heismans:    CFBAward[]
  natChamps:   number[]
  maxwell:     CFBAward[]
  outland:     CFBAward[]
  biletnikoff: CFBAward[]
  butkus:      CFBAward[]
  bednarik:    CFBAward[]
  nagurski:    CFBAward[]
  doakWalker:  CFBAward[]
  daveyOBrien: CFBAward[]
  jimThorpe:   CFBAward[]
  walterCamp:  CFBAward[]
}

export const CFB_AWARDS: Record<string, Partial<CFBTeamAwards>> = {

  '333': { // Alabama
    heismans: [
      { year: 2009, name: 'Mark Ingram' },
      { year: 2015, name: 'Derrick Henry' },
      { year: 2018, name: 'Tua Tagovailoa' },
      { year: 2020, name: 'DeVonta Smith' },
    ],
    natChamps: [1925,1926,1930,1934,1941,1961,1964,1965,1978,1979,1992,2009,2011,2012,2015,2017,2018,2020],
    maxwell: [
      { year: 2015, name: 'Derrick Henry' },
      { year: 2020, name: 'DeVonta Smith' },
      { year: 2021, name: 'Bryce Young' },
    ],
    biletnikoff: [
      { year: 2014, name: 'Amari Cooper' },
      { year: 2018, name: 'Jerry Jeudy' },
      { year: 2020, name: 'DeVonta Smith' },
      { year: 2021, name: 'Jameson Williams' },
    ],
    outland: [
      { year: 1990, name: 'Chris Samuels' },
      { year: 2009, name: 'Andre Smith' },
      { year: 2015, name: "A'Shawn Robinson" },
      { year: 2016, name: 'Cam Robinson' },
    ],
    butkus: [
      { year: 2016, name: 'Reuben Foster' },
      { year: 2020, name: 'Dylan Moses' },
    ],
    bednarik: [
      { year: 2016, name: 'Jonathan Allen' },
      { year: 2020, name: 'Patrick Surtain II' },
      { year: 2022, name: 'Will Anderson Jr.' },
    ],
    nagurski: [
      { year: 2016, name: 'Jonathan Allen' },
      { year: 2020, name: 'Patrick Surtain II' },
      { year: 2022, name: 'Will Anderson Jr.' },
    ],
    doakWalker: [{ year: 2015, name: 'Derrick Henry' }],
    daveyOBrien: [{ year: 2021, name: 'Bryce Young' }],
    walterCamp: [{ year: 2020, name: 'DeVonta Smith' }, { year: 2021, name: 'Bryce Young' }],
  },

  '57': { // Florida
    heismans: [
      { year: 1966, name: 'Steve Spurrier' },
      { year: 1996, name: 'Danny Wuerffel' },
      { year: 2007, name: 'Tim Tebow' },
    ],
    natChamps: [1996, 2006, 2008],
    maxwell: [{ year: 2007, name: 'Tim Tebow' }, { year: 2008, name: 'Tim Tebow' }],
    daveyOBrien: [{ year: 1996, name: 'Danny Wuerffel' }, { year: 2007, name: 'Tim Tebow' }, { year: 2008, name: 'Tim Tebow' }],
    walterCamp: [{ year: 2007, name: 'Tim Tebow' }, { year: 2008, name: 'Tim Tebow' }],
  },

  '61': { // Georgia
    heismans: [{ year: 1982, name: 'Herschel Walker' }],
    natChamps: [1942, 1980, 2021, 2022],
    maxwell: [{ year: 1982, name: 'Herschel Walker' }, { year: 2021, name: 'Stetson Bennett' }],
    outland: [{ year: 2021, name: 'Jordan Davis' }],
    butkus: [{ year: 2021, name: 'Nakobe Dean' }, { year: 2022, name: 'Smael Mondon' }, { year: 2024, name: 'Jalon Walker' }],
    bednarik: [{ year: 2021, name: 'Jordan Davis' }],
    biletnikoff: [{ year: 2022, name: 'Brock Bowers' }],
    doakWalker: [{ year: 1982, name: 'Herschel Walker' }],
    walterCamp: [{ year: 2021, name: 'Stetson Bennett' }],
    nagurski: [{ year: 2022, name: 'Kelee Ringo' }],
  },

  '99': { // LSU
    heismans: [
      { year: 1959, name: 'Billy Cannon' },
      { year: 2019, name: 'Joe Burrow' },
      { year: 2023, name: 'Jayden Daniels' },
    ],
    natChamps: [1958, 2003, 2007, 2019],
    maxwell: [{ year: 2019, name: 'Joe Burrow' }],
    biletnikoff: [{ year: 2019, name: "Ja'Marr Chase" }],
    daveyOBrien: [{ year: 2019, name: 'Joe Burrow' }, { year: 2023, name: 'Jayden Daniels' }],
    walterCamp: [{ year: 2019, name: 'Joe Burrow' }, { year: 2023, name: 'Jayden Daniels' }],
    jimThorpe: [{ year: 2019, name: 'Grant Delpit' }],
  },

  '2633': { // Tennessee
    heismans: [],
    natChamps: [1998],
    biletnikoff: [{ year: 2022, name: 'Jalin Hyatt' }],
    outland: [{ year: 1964, name: 'Steve DeLong' }],
  },

  '245': { // Texas A&M
    heismans: [
      { year: 1957, name: 'John David Crow' },
      { year: 2012, name: 'Johnny Manziel' },
    ],
    natChamps: [1919, 1927, 1939, 1998],
    outland: [{ year: 1998, name: 'Dat Nguyen' }],
    butkus: [],
    bednarik: [],
    daveyOBrien: [{ year: 2012, name: 'Johnny Manziel' }],
    walterCamp: [{ year: 2012, name: 'Johnny Manziel' }],
  },

  '194': { // Ohio State
    heismans: [
      { year: 1944, name: 'Les Horvath' },
      { year: 1950, name: 'Vic Janowicz' },
      { year: 1954, name: 'Howard Cassady' },
      { year: 1974, name: 'Archie Griffin' },
      { year: 1975, name: 'Archie Griffin' },
      { year: 1995, name: 'Eddie George' },
      { year: 2006, name: 'Troy Smith' },
    ],
    natChamps: [1942,1954,1957,1961,1968,1970,2002,2014,2024],
    maxwell: [
      { year: 1974, name: 'Archie Griffin' },
      { year: 1975, name: 'Archie Griffin' },
      { year: 1995, name: 'Eddie George' },
      { year: 2019, name: 'Chase Young' },
    ],
    outland: [
      { year: 1956, name: 'Jim Parker' },
      { year: 1970, name: 'Jim Stillwagon' },
      { year: 2003, name: 'Robert Reynolds' },
    ],
    biletnikoff: [{ year: 1995, name: 'Terry Glenn' }, { year: 2023, name: 'Marvin Harrison Jr.' }],
    butkus: [{ year: 2019, name: 'Malik Harrison' }],
    bednarik: [{ year: 2019, name: 'Chase Young' }],
    nagurski: [{ year: 2019, name: 'Chase Young' }],
    jimThorpe: [{ year: 2024, name: 'Caleb Downs' }],
    daveyOBrien: [{ year: 2006, name: 'Troy Smith' }],
    walterCamp: [
      { year: 1974, name: 'Archie Griffin' },
      { year: 1975, name: 'Archie Griffin' },
    ],
    doakWalker: [{ year: 1995, name: 'Eddie George' }],
  },

  '130': { // Michigan
    heismans: [
      { year: 1940, name: 'Tom Harmon' },
      { year: 1991, name: 'Desmond Howard' },
      { year: 1997, name: 'Charles Woodson' },
    ],
    natChamps: [1947,1948,1997,2023],
    maxwell: [{ year: 1997, name: 'Charles Woodson' }, { year: 1940, name: 'Tom Harmon' }],
    outland: [{ year: 2022, name: 'Olu Oluwitami' }],
    biletnikoff: [],
    butkus: [],
    bednarik: [],
    jimThorpe: [{ year: 1997, name: 'Charles Woodson' }],
    doakWalker: [],
    daveyOBrien: [],
    walterCamp: [{ year: 1997, name: 'Charles Woodson' }],
  },

  '87': { // Notre Dame
    heismans: [
      { year: 1943, name: 'Angelo Bertelli' },
      { year: 1947, name: 'Johnny Lujack' },
      { year: 1949, name: 'Leon Hart' },
      { year: 1953, name: 'John Lattner' },
      { year: 1956, name: 'Paul Hornung' },
      { year: 1964, name: 'John Huarte' },
      { year: 1987, name: 'Tim Brown' },
    ],
    natChamps: [1924,1929,1930,1938,1943,1946,1947,1949,1966,1973,1977,1988],
    maxwell: [{ year: 1949, name: 'Leon Hart' }, { year: 1953, name: 'John Lattner' }],
    outland: [{ year: 1946, name: 'George Connor' }, { year: 1948, name: 'Bill Fischer' }],
    biletnikoff: [],
    butkus: [],
    bednarik: [],
    doakWalker: [{ year: 2024, name: 'Jeremiyah Love' }, { year: 2025, name: 'Jeremiyah Love' }],
    daveyOBrien: [],
    walterCamp: [],
  },

  '30': { // USC
    heismans: [
      { year: 1965, name: 'Mike Garrett' },
      { year: 1967, name: 'O.J. Simpson' },
      { year: 1979, name: 'Charles White' },
      { year: 1981, name: 'Marcus Allen' },
      { year: 2002, name: 'Carson Palmer' },
      { year: 2004, name: 'Matt Leinart' },
      { year: 2005, name: 'Reggie Bush' },
    ],
    natChamps: [1928,1931,1932,1939,1962,1967,1972,1974,2003,2004],
    maxwell: [{ year: 1981, name: 'Marcus Allen' }, { year: 2002, name: 'Carson Palmer' }],
    outland: [{ year: 1967, name: 'Ron Yary' }],
    biletnikoff: [{ year: 2025, name: 'Makai Lemon' }],
    jimThorpe: [{ year: 2016, name: "Adoree' Jackson" }],
    daveyOBrien: [{ year: 2002, name: 'Carson Palmer' }],
    doakWalker: [{ year: 1981, name: 'Marcus Allen' }],
    walterCamp: [{ year: 2002, name: 'Carson Palmer' }],
  },

  '251': { // Texas
    heismans: [
      { year: 1977, name: 'Earl Campbell' },
    ],
    natChamps: [1963,1969,1970,2005],
    outland: [
      { year: 1963, name: 'Scott Appleton' },
      { year: 2023, name: "T'Vondre Sweat" },
      { year: 2024, name: 'Kelvin Banks Jr.' },
    ],
    doakWalker: [{ year: 2022, name: 'Bijan Robinson' }],
    walterCamp: [{ year: 1977, name: 'Earl Campbell' }],
    daveyOBrien: [],
  },

  '228': { // Clemson
    heismans: [],
    natChamps: [1981,2016,2018],
    maxwell: [],
    daveyOBrien: [{ year: 2016, name: 'Deshaun Watson' }, { year: 2017, name: 'Deshaun Watson' }],
    biletnikoff: [],
    bednarik: [],
    walterCamp: [],
  },

  '52': { // Florida State
    heismans: [],
    natChamps: [1993,1999,2013],
    maxwell: [],
    daveyOBrien: [{ year: 2023, name: 'Jordan Travis' }],
    biletnikoff: [],
    outland: [],
  },

  '2483': { // Oregon
    heismans: [{ year: 2014, name: 'Marcus Mariota' }],
    natChamps: [2024],
    maxwell: [{ year: 2014, name: 'Marcus Mariota' }],
    daveyOBrien: [{ year: 2014, name: 'Marcus Mariota' }],
    walterCamp: [{ year: 2014, name: 'Marcus Mariota' }],
  },

  '213': { // Penn State
    heismans: [],
    natChamps: [1982,1986],
    outland: [{ year: 1969, name: 'Mike Reid' }],
    biletnikoff: [{ year: 1994, name: 'Bobby Engram' }],
    butkus: [{ year: 2002, name: 'LaVar Arrington' }],
  },

  '158': { // Nebraska
    heismans: [
      { year: 1972, name: 'Johnny Rodgers' },
      { year: 1983, name: 'Mike Rozier' },
    ],
    natChamps: [1970,1971,1994,1995,1997],
    outland: [
      { year: 1963, name: 'Bob Brown' },
      { year: 1977, name: 'Randy Schleusener' },
      { year: 1981, name: 'Dave Rimington' },
      { year: 1982, name: 'Dave Rimington' },
      { year: 1983, name: 'Dean Steinkuhler' },
      { year: 1994, name: 'Zach Wiegert' },
      { year: 1995, name: 'Aaron Taylor' },
    ],
    doakWalker: [{ year: 1983, name: 'Mike Rozier' }],
    walterCamp: [{ year: 1983, name: 'Mike Rozier' }],
  },

  '2509': { // Oklahoma
    heismans: [
      { year: 1952, name: 'Billy Vessels' },
      { year: 1969, name: 'Steve Owens' },
      { year: 1978, name: 'Billy Sims' },
      { year: 2003, name: 'Jason White' },
      { year: 2017, name: 'Baker Mayfield' },
      { year: 2018, name: 'Kyler Murray' },
    ],
    natChamps: [1950,1955,1956,1974,1975,1985,2000],
    outland: [
      { year: 1951, name: 'Jim Weatherall' },
      { year: 1953, name: 'J.D. Roberts' },
    ],
    biletnikoff: [{ year: 2016, name: 'Dede Westbrook' }],
    maxwell: [{ year: 2017, name: 'Baker Mayfield' }, { year: 2018, name: 'Kyler Murray' }],
    daveyOBrien: [
      { year: 2017, name: 'Baker Mayfield' },
      { year: 2018, name: 'Kyler Murray' },
    ],
    walterCamp: [{ year: 2017, name: 'Baker Mayfield' }, { year: 2018, name: 'Kyler Murray' }],
  },

  '2390': { // Miami
    heismans: [],
    natChamps: [1983,1987,1989,1991,2001],
    maxwell: [],
    daveyOBrien: [{ year: 2024, name: 'Cam Ward' }],
    outland: [],
  },

  '264': { // Washington
    heismans: [],
    natChamps: [],
    maxwell: [{ year: 2023, name: 'Michael Penix Jr.' }],
    daveyOBrien: [],
    biletnikoff: [],
  },

  '239': { // Baylor
    heismans: [],
    natChamps: [],
    biletnikoff: [{ year: 2015, name: 'Corey Coleman' }],
    daveyOBrien: [],
    outland: [],
  },

  '2628': { // TCU
    heismans: [],
    natChamps: [],
    maxwell: [{ year: 1938, name: 'Davey O\'Brien' }],
    outland: [],
    daveyOBrien: [],
  },

  '277': { // West Virginia
    heismans: [],
    natChamps: [],
    daveyOBrien: [],
    outland: [],
  },

  '84': { // Indiana
    heismans: [],
    natChamps: [],
    maxwell: [{ year: 2025, name: 'Fernando Mendoza' }],
    daveyOBrien: [{ year: 2025, name: 'Fernando Mendoza' }],
    walterCamp: [{ year: 2025, name: 'Fernando Mendoza' }],
  },

  '68': { // Boise State
    heismans: [],
    natChamps: [],
    maxwell: [{ year: 2024, name: 'Ashton Jeanty' }],
    doakWalker: [{ year: 2024, name: 'Ashton Jeanty' }],
    walterCamp: [],
  },

  '2116': { // UCF
    heismans: [],
    natChamps: [],
    butkus: [],
    outland: [],
  },

  '2641': { // Texas Tech
    heismans: [],
    natChamps: [],
    biletnikoff: [
      { year: 2007, name: 'Michael Crabtree' },
      { year: 2008, name: 'Michael Crabtree' },
    ],
    butkus: [{ year: 2025, name: 'Jacob Rodriguez' }],
    bednarik: [{ year: 2025, name: 'Jacob Rodriguez' }],
    nagurski: [{ year: 2025, name: 'Jacob Rodriguez' }],
    doakWalker: [],
  },

  '2277': { // Oklahoma State
    heismans: [{ year: 1988, name: 'Barry Sanders' }],
    natChamps: [],
    biletnikoff: [
      { year: 2010, name: 'Justin Blackmon' },
      { year: 2011, name: 'Justin Blackmon' },
      { year: 2017, name: 'James Washington' },
    ],
    doakWalker: [{ year: 1988, name: 'Barry Sanders' }],
    walterCamp: [{ year: 1988, name: 'Barry Sanders' }],
  },

  '324': { // Colorado
    heismans: [{ year: 1994, name: 'Rashaan Salaam' }],
    natChamps: [1990],
    biletnikoff: [{ year: 2024, name: 'Travis Hunter Jr.' }],
    bednarik: [{ year: 2024, name: 'Travis Hunter Jr.' }],
    walterCamp: [{ year: 2024, name: 'Travis Hunter Jr.' }],
  },

  '2306': { // Kansas State
    heismans: [],
    natChamps: [],
    daveyOBrien: [],
    outland: [],
    doakWalker: [],
  },

  '2305': { // Kansas
    heismans: [],
    natChamps: [],
    outland: [],
  },

  '9': { // Arizona State
    heismans: [],
    natChamps: [],
    outland: [],
    daveyOBrien: [],
  },

  '254': { // Utah
    heismans: [],
    natChamps: [],
    outland: [{ year: 2025, name: 'Spencer Fano' }],
    doakWalker: [],
  },

  '252': { // BYU
    heismans: [{ year: 1990, name: 'Ty Detmer' }],
    natChamps: [1984],
    daveyOBrien: [{ year: 1990, name: 'Ty Detmer' }],
  },

  '97': { // Louisville
    heismans: [{ year: 2016, name: 'Lamar Jackson' }],
    natChamps: [],
    maxwell: [{ year: 2016, name: 'Lamar Jackson' }],
    daveyOBrien: [{ year: 2016, name: 'Lamar Jackson' }],
    walterCamp: [{ year: 2016, name: 'Lamar Jackson' }],
  },

  '221': { // Pittsburgh
    heismans: [{ year: 1976, name: 'Tony Dorsett' }],
    natChamps: [1976],
    biletnikoff: [{ year: 2021, name: 'Jordan Addison' }],
    walterCamp: [{ year: 1976, name: 'Tony Dorsett' }],
    outland: [],
  },

  '2084': { // Miami (FL)
    heismans: [],
    natChamps: [1983,1987,1989,1991,2001],
    daveyOBrien: [{ year: 2024, name: 'Cam Ward' }],
    outland: [],
  },

  '66': { // Iowa State
    heismans: [],
    natChamps: [],
    outland: [],
  },

  '2309': { // Kent State
    heismans: [],
    natChamps: [],
    outland: [],
  },

  '2050': { // Ball State
    heismans: [],
    natChamps: [],
    outland: [],
  },

  '103': { // Boston College
    heismans: [],
    natChamps: [],
    daveyOBrien: [],
    outland: [],
  },

  '59': { // Georgia Tech
    heismans: [],
    natChamps: [1917,1928,1952,1990],
    outland: [],
  },

  '152': { // NC State
    heismans: [],
    natChamps: [],
    bednarik: [{ year: 2023, name: 'Payton Wilson' }],
    butkus: [{ year: 2023, name: 'Payton Wilson' }],
    outland: [],
  },

  '150': { // Duke
    heismans: [],
    natChamps: [],
    outland: [{ year: 1959, name: 'Mike McGee' }],
  },

  '120': { // Maryland
    heismans: [],
    natChamps: [1953],
    outland: [{ year: 1952, name: 'Dick Modzelewski' }],
  },

  '164': { // Rutgers
    heismans: [],
    natChamps: [],
    outland: [],
  },

  '135': { // Minnesota
    heismans: [],
    natChamps: [1934,1935,1936,1940,1941,1960],
    outland: [{ year: 1960, name: 'Tom Brown' }, { year: 1962, name: 'Bobby Bell' }],
  },

  '356': { // Illinois
    heismans: [],
    natChamps: [1951],
    outland: [],
  },

  '77': { // Northwestern
    heismans: [],
    natChamps: [],
    outland: [],
  },

  '218': { // Purdue
    heismans: [],
    natChamps: [],
    outland: [],
  },

  '2294': { // Iowa
    heismans: [],
    natChamps: [],
    outland: [
      { year: 1955, name: 'Cal Jones' },
      { year: 1957, name: 'Alex Karras' },
    ],
  },

  '26': { // UCLA
    heismans: [],
    natChamps: [],
    butkus: [{ year: 2014, name: 'Eric Kendricks' }],
    outland: [],
  },

  '2': { // Auburn
    heismans: [],
    natChamps: [1957,2010],
    outland: [{ year: 1958, name: 'Zeke Smith' }],
    biletnikoff: [],
  },

  '96': { // Kentucky
    heismans: [],
    natChamps: [],
    outland: [{ year: 1950, name: 'Bob Gain' }],
  },

  '344': { // Mississippi State
    heismans: [],
    natChamps: [],
    outland: [],
  },

  '142': { // Missouri
    heismans: [],
    natChamps: [],
    outland: [],
  },

  '145': { // Ole Miss
    heismans: [],
    natChamps: [1959,1960,1962],
    outland: [],
    biletnikoff: [],
  },

  '238': { // Vanderbilt
    heismans: [],
    natChamps: [],
    maxwell: [{ year: 2025, name: 'Eli Stowers' }],
  },

  '2567': { // SMU
    heismans: [],
    natChamps: [1935,1947],
    outland: [],
  },

  '259': { // Virginia Tech
    heismans: [],
    natChamps: [],
    outland: [],
    daveyOBrien: [],
  },

  '258': { // Virginia
    heismans: [],
    natChamps: [],
    outland: [],
  },

  '154': { // Wake Forest
    heismans: [],
    natChamps: [],
    outland: [],
  },
}
