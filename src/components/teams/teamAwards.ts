// ── VERIFIED NFL & CFB Award Data ────────────────────────────
// All data cross-referenced against Wikipedia, Pro-Football-Reference,
// ESPN, and official school records as of 2025 season.
//
// CFB nat champs = school-claimed championships only
// NFL MVP = AP award only (official since 1957)
// ─────────────────────────────────────────────────────────────

export interface Award { year: number; name: string }

// ── NFL ───────────────────────────────────────────────────────

export interface NFLTeamAwards {
  superBowls: { year: number; opponent: string; score: string }[]
  sbMvps:     Award[]
  mvp:        Award[]
  opoy:       Award[]
  dpoy:       Award[]
  oroty:      Award[]
  droty:      Award[]
  wpmoty:     Award[]
}

export const NFL_AWARDS: Record<string, Partial<NFLTeamAwards>> = {

  '1': { // Atlanta Falcons
    superBowls: [],
    mvp:    [{ year: 2016, name: 'Matt Ryan' }],
    opoy:   [{ year: 2016, name: 'Matt Ryan' }],
    droty:  [{ year: 1987, name: 'Aundray Bruce' }],
    wpmoty: [{ year: 2015, name: 'Devonta Freeman' }],
  },

  '2': { // Buffalo Bills
    superBowls: [],
    mvp:    [{ year: 1973, name: 'O.J. Simpson' }],
    droty:  [{ year: 1979, name: 'Tom Cousineau' }],
    wpmoty: [],
  },

  '3': { // Chicago Bears
    superBowls: [{ year: 1985, opponent: 'New England Patriots', score: '46-10' }],
    sbMvps: [{ year: 1985, name: 'Richard Dent' }],
    mvp:    [{ year: 1977, name: 'Walter Payton' }],
    dpoy:   [{ year: 1984, name: 'Mike Singletary' }, { year: 1987, name: 'Mike Singletary' }],
    droty:  [{ year: 1965, name: 'Dick Butkus' }],
    wpmoty: [{ year: 1977, name: 'Walter Payton' }, { year: 1987, name: 'Dave Duerson' }],
  },

  '4': { // Cincinnati Bengals
    superBowls: [],
    mvp:    [{ year: 1981, name: 'Ken Anderson' }],
    oroty:  [{ year: 2021, name: "Ja'Marr Chase" }],
    wpmoty: [{ year: 1975, name: 'Ken Anderson' }],
  },

  '5': { // Cleveland Browns
    superBowls: [],
    mvp:    [
      { year: 1957, name: 'Jim Brown' },
      { year: 1958, name: 'Jim Brown' },
      { year: 1965, name: 'Jim Brown' },
      { year: 1980, name: 'Brian Sipe' },
    ],
    dpoy:   [{ year: 2023, name: 'Myles Garrett' }, { year: 2025, name: 'Myles Garrett' }],
    oroty:  [{ year: 1957, name: 'Jim Brown' }],
    wpmoty: [{ year: 2016, name: 'Joe Thomas' }],
  },

  '6': { // Dallas Cowboys
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
    mvp:    [{ year: 1993, name: 'Emmitt Smith' }],
    opoy:   [{ year: 1993, name: 'Emmitt Smith' }, { year: 1995, name: 'Emmitt Smith' }],
    oroty:  [{ year: 2016, name: 'Dak Prescott' }],
    droty:  [{ year: 1977, name: 'Harvey Martin' }],
    wpmoty: [{ year: 1977, name: 'Roger Staubach' }, { year: 2022, name: 'Dak Prescott' }],
  },

  '7': { // Denver Broncos
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
    mvp:    [
      { year: 1987, name: 'John Elway' },
      { year: 1998, name: 'Terrell Davis' },
      { year: 2013, name: 'Peyton Manning' },
    ],
    opoy:   [{ year: 1998, name: 'Terrell Davis' }],
    dpoy:   [{ year: 2015, name: 'Von Miller' }, { year: 2024, name: 'Patrick Surtain II' }],
    droty:  [{ year: 2011, name: 'Von Miller' }],
    wpmoty: [{ year: 1988, name: 'Steve Sewell' }],
  },

  '8': { // Detroit Lions
    superBowls: [],
    mvp:    [{ year: 1997, name: 'Barry Sanders' }],
    opoy:   [{ year: 1997, name: 'Barry Sanders' }],
    droty:  [{ year: 1967, name: 'Lem Barney' }, { year: 1978, name: 'Al Baker' }],
  },

  '9': { // Green Bay Packers
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
    mvp:    [
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
    opoy:   [
      { year: 2011, name: 'Aaron Rodgers' },
      { year: 2014, name: 'Aaron Rodgers' },
      { year: 2020, name: 'Aaron Rodgers' },
    ],
    dpoy:   [{ year: 1998, name: 'Reggie White' }],
    droty:  [{ year: 1972, name: 'Willie Buchanon' }],
    wpmoty: [{ year: 2021, name: 'David Bakhtiari' }],
  },

  '10': { // Tennessee Titans (Houston Oilers eras included)
    superBowls: [],
    mvp:    [{ year: 2003, name: 'Steve McNair' }],
    droty:  [{ year: 1975, name: 'Robert Brazile' }],
  },

  '11': { // Indianapolis Colts (Baltimore Colts era included)
    superBowls: [
      { year: 1970, opponent: 'Dallas Cowboys', score: '16-13' },
      { year: 2006, opponent: 'Chicago Bears', score: '29-17' },
    ],
    sbMvps: [
      { year: 1970, name: 'Chuck Howley' },
      { year: 2006, name: 'Peyton Manning' },
    ],
    mvp:    [
      { year: 1959, name: 'Johnny Unitas' },
      { year: 1964, name: 'Johnny Unitas' },
      { year: 1967, name: 'Johnny Unitas' },
      { year: 1968, name: 'Earl Morrall' },
      { year: 1976, name: 'Bert Jones' },
      { year: 1999, name: 'Peyton Manning' },
      { year: 2003, name: 'Peyton Manning' },
      { year: 2004, name: 'Peyton Manning' },
      { year: 2008, name: 'Peyton Manning' },
      { year: 2009, name: 'Peyton Manning' },
    ],
    opoy:   [
      { year: 1999, name: 'Peyton Manning' },
      { year: 2004, name: 'Peyton Manning' },
    ],
    oroty:  [{ year: 1998, name: 'Peyton Manning' }],
    wpmoty: [{ year: 1970, name: 'Johnny Unitas' }],
  },

  '12': { // Kansas City Chiefs
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
    mvp:    [
      { year: 2018, name: 'Patrick Mahomes' },
      { year: 2022, name: 'Patrick Mahomes' },
    ],
    opoy:   [
      { year: 2018, name: 'Patrick Mahomes' },
      { year: 2022, name: 'Patrick Mahomes' },
    ],
    wpmoty: [{ year: 1973, name: 'Len Dawson' }],
  },

  '13': { // Las Vegas Raiders (Oakland/LA eras)
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
    mvp:    [
      { year: 1974, name: 'Ken Stabler' },
      { year: 1985, name: 'Marcus Allen' },
      { year: 2002, name: 'Rich Gannon' },
    ],
    opoy:   [{ year: 2002, name: 'Rich Gannon' }],
    wpmoty: [{ year: 1974, name: 'George Blanda' }],
  },

  '14': { // Los Angeles Rams (St. Louis/LA eras)
    superBowls: [
      { year: 1999, opponent: 'Tennessee Titans', score: '23-16' },
      { year: 2021, opponent: 'Cincinnati Bengals', score: '23-20' },
    ],
    sbMvps: [
      { year: 1999, name: 'Kurt Warner' },
      { year: 2021, name: 'Cooper Kupp' },
    ],
    mvp:    [
      { year: 1969, name: 'Roman Gabriel' },
      { year: 1999, name: 'Kurt Warner' },
      { year: 2001, name: 'Kurt Warner' },
      { year: 2025, name: 'Matthew Stafford' },
    ],
    opoy:   [
      { year: 1999, name: 'Marshall Faulk' },
      { year: 2000, name: 'Marshall Faulk' },
      { year: 2001, name: 'Marshall Faulk' },
      { year: 2021, name: 'Cooper Kupp' },
    ],
    dpoy:   [
      { year: 2017, name: 'Aaron Donald' },
      { year: 2018, name: 'Aaron Donald' },
      { year: 2020, name: 'Aaron Donald' },
    ],
    droty:  [{ year: 1971, name: 'Isaiah Robertson' }],
    wpmoty: [{ year: 2021, name: 'Andrew Whitworth' }],
  },

  '15': { // Miami Dolphins
    superBowls: [
      { year: 1972, opponent: 'Washington Redskins', score: '14-7' },
      { year: 1973, opponent: 'Minnesota Vikings', score: '24-7' },
    ],
    sbMvps: [
      { year: 1972, name: 'Jake Scott' },
      { year: 1973, name: 'Larry Csonka' },
    ],
    mvp:    [{ year: 1984, name: 'Dan Marino' }],
    wpmoty: [{ year: 1985, name: 'Dwight Stephenson' }],
  },

  '16': { // Minnesota Vikings
    superBowls: [],
    mvp:    [
      { year: 1971, name: 'Alan Page' },
      { year: 1975, name: 'Fran Tarkenton' },
      { year: 2012, name: 'Adrian Peterson' },
    ],
    opoy:   [{ year: 2012, name: 'Adrian Peterson' }],
    dpoy:   [{ year: 1971, name: 'Alan Page' }],
    droty:  [{ year: 1967, name: 'Clinton Jones' }],
    wpmoty: [{ year: 1988, name: 'Steve Jordan' }],
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
    sbMvps: [
      { year: 2001, name: 'Tom Brady' },
      { year: 2003, name: 'Tom Brady' },
      { year: 2004, name: 'Deion Branch' },
      { year: 2014, name: 'Tom Brady' },
      { year: 2016, name: 'Tom Brady' },
      { year: 2018, name: 'Julian Edelman' },
    ],
    mvp:    [
      { year: 2007, name: 'Tom Brady' },
      { year: 2010, name: 'Tom Brady' },
      { year: 2017, name: 'Tom Brady' },
    ],
    opoy:   [
      { year: 2007, name: 'Tom Brady' },
      { year: 2010, name: 'Tom Brady' },
      { year: 2017, name: 'Tom Brady' },
    ],
    dpoy:   [{ year: 2019, name: 'Stephon Gilmore' }],
    droty:  [{ year: 1976, name: 'Mike Haynes' }],
    wpmoty: [{ year: 1992, name: 'Andre Tippett' }],
  },

  '18': { // New Orleans Saints
    superBowls: [{ year: 2009, opponent: 'Indianapolis Colts', score: '31-17' }],
    sbMvps: [{ year: 2009, name: 'Drew Brees' }],
    opoy:   [{ year: 2006, name: 'Drew Brees' }],
    oroty:  [{ year: 2017, name: 'Alvin Kamara' }],
    droty:  [{ year: 2017, name: 'Marshon Lattimore' }],
    wpmoty: [{ year: 2011, name: 'Drew Brees' }],
  },

  '19': { // New York Giants
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
    mvp:    [
      { year: 1963, name: 'Y.A. Tittle' },
      { year: 1986, name: 'Lawrence Taylor' },
    ],
    dpoy:   [
      { year: 1981, name: 'Lawrence Taylor' },
      { year: 1982, name: 'Lawrence Taylor' },
      { year: 1986, name: 'Lawrence Taylor' },
    ],
    droty:  [{ year: 1981, name: 'Lawrence Taylor' }],
    oroty:  [
      { year: 2014, name: 'Odell Beckham Jr.' },
      { year: 2018, name: 'Saquon Barkley' },
    ],
    wpmoty: [{ year: 1991, name: 'Everson Walls' }],
  },

  '20': { // New York Jets
    superBowls: [{ year: 1968, opponent: 'Baltimore Colts', score: '16-7' }],
    sbMvps: [{ year: 1968, name: 'Joe Namath' }],
    oroty:  [{ year: 2022, name: 'Garrett Wilson' }],
    droty:  [{ year: 2022, name: 'Sauce Gardner' }],
    wpmoty: [{ year: 1996, name: 'Curtis Martin' }],
  },

  '21': { // Philadelphia Eagles
    superBowls: [
      { year: 2017, opponent: 'New England Patriots', score: '41-33' },
      { year: 2024, opponent: 'Kansas City Chiefs', score: '40-22' },
    ],
    sbMvps: [
      { year: 2017, name: 'Nick Foles' },
      { year: 2024, name: 'Jalen Hurts' },
    ],
    mvp:    [{ year: 1960, name: 'Norm Van Brocklin' }],
    opoy:   [{ year: 2024, name: 'Saquon Barkley' }],
    wpmoty: [{ year: 1980, name: 'Harold Carmichael' }],
  },

  '22': { // Arizona Cardinals
    superBowls: [],
    oroty:  [{ year: 2019, name: 'Kyler Murray' }],
    wpmoty: [{ year: 2015, name: 'Larry Fitzgerald' }],
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
    sbMvps: [
      { year: 1974, name: 'Franco Harris' },
      { year: 1975, name: 'Lynn Swann' },
      { year: 1978, name: 'Terry Bradshaw' },
      { year: 1979, name: 'Terry Bradshaw' },
      { year: 2005, name: 'Hines Ward' },
      { year: 2008, name: 'Santonio Holmes' },
    ],
    mvp:    [{ year: 1978, name: 'Terry Bradshaw' }],
    dpoy:   [
      { year: 1974, name: 'Joe Greene' },
      { year: 1994, name: 'Rod Woodson' },
      { year: 2020, name: 'T.J. Watt' },
    ],
    droty:  [{ year: 1969, name: 'Joe Greene' }, { year: 1974, name: 'Jack Lambert' }],
    wpmoty: [
      { year: 1976, name: 'Franco Harris' },
      { year: 1979, name: 'Joe Greene' },
      { year: 2023, name: 'Cameron Heyward' },
    ],
  },

  '24': { // Los Angeles Chargers
    superBowls: [],
    mvp:    [{ year: 2006, name: 'LaDainian Tomlinson' }],
    opoy:   [{ year: 2006, name: 'LaDainian Tomlinson' }],
    oroty:  [{ year: 2020, name: 'Justin Herbert' }],
    wpmoty: [{ year: 1994, name: 'Junior Seau' }],
  },

  '25': { // San Francisco 49ers
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
    mvp:    [
      { year: 1970, name: 'John Brodie' },
      { year: 1989, name: 'Joe Montana' },
      { year: 1990, name: 'Joe Montana' },
      { year: 1992, name: 'Steve Young' },
      { year: 1994, name: 'Steve Young' },
    ],
    opoy:   [
      { year: 1987, name: 'Jerry Rice' },
      { year: 1990, name: 'Jerry Rice' },
      { year: 1993, name: 'Jerry Rice' },
    ],
    dpoy:   [{ year: 2022, name: 'Nick Bosa' }],
    droty:  [{ year: 1970, name: 'Bruce Taylor' }],
    wpmoty: [{ year: 1987, name: 'Roger Craig' }],
  },

  '26': { // Seattle Seahawks
    superBowls: [{ year: 2013, opponent: 'Denver Broncos', score: '43-8' }],
    sbMvps: [{ year: 2013, name: 'Malcolm Smith' }],
    mvp:    [{ year: 2005, name: 'Shaun Alexander' }],
    opoy:   [{ year: 2005, name: 'Shaun Alexander' }],
    dpoy:   [{ year: 2015, name: 'Richard Sherman' }],
    droty:  [{ year: 2012, name: 'Bobby Wagner' }],
    wpmoty: [{ year: 2020, name: 'Russell Wilson' }],
  },

  '27': { // Tampa Bay Buccaneers
    superBowls: [
      { year: 2002, opponent: 'Oakland Raiders', score: '48-21' },
      { year: 2020, opponent: 'Kansas City Chiefs', score: '31-9' },
    ],
    sbMvps: [
      { year: 2002, name: 'Dexter Jackson' },
      { year: 2020, name: 'Tom Brady' },
    ],
    dpoy:   [{ year: 2002, name: 'Derrick Brooks' }],
    droty:  [{ year: 1977, name: 'Ricky Bell' }],
    wpmoty: [{ year: 2020, name: 'Rob Gronkowski' }],
  },

  '28': { // Washington Commanders (Redskins/Football Team eras)
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
    mvp:    [
      { year: 1972, name: 'Larry Brown' },
      { year: 1982, name: 'Mark Moseley' },
      { year: 1983, name: 'Joe Theismann' },
    ],
    oroty:  [
      { year: 2012, name: 'Robert Griffin III' },
      { year: 2024, name: 'Jayden Daniels' },
    ],
    droty:  [{ year: 1982, name: 'Darrell Green' }],
    wpmoty: [{ year: 1982, name: 'Joe Theismann' }],
  },

  '29': { // Carolina Panthers
    superBowls: [],
    mvp:    [{ year: 2015, name: 'Cam Newton' }],
    opoy:   [{ year: 2015, name: 'Cam Newton' }],
    oroty:  [{ year: 2011, name: 'Cam Newton' }],
    droty:  [{ year: 1995, name: 'Hugh Douglas' }],
    wpmoty: [{ year: 2018, name: 'Thomas Davis' }],
  },

  '30': { // Jacksonville Jaguars
    superBowls: [],
    wpmoty: [{ year: 2019, name: 'Calais Campbell' }, { year: 2024, name: 'Arik Armstead' }],
  },

  '33': { // Baltimore Ravens
    superBowls: [
      { year: 2000, opponent: 'New York Giants', score: '34-7' },
      { year: 2012, opponent: 'San Francisco 49ers', score: '34-31' },
    ],
    sbMvps: [
      { year: 2000, name: 'Ray Lewis' },
      { year: 2012, name: 'Joe Flacco' },
    ],
    mvp:    [
      { year: 2019, name: 'Lamar Jackson' },
      { year: 2023, name: 'Lamar Jackson' },
    ],
    opoy:   [
      { year: 2019, name: 'Lamar Jackson' },
      { year: 2023, name: 'Lamar Jackson' },
    ],
    dpoy:   [
      { year: 2000, name: 'Ray Lewis' },
      { year: 2003, name: 'Ray Lewis' },
    ],
    droty:  [{ year: 1996, name: 'Ray Lewis' }],
    oroty:  [{ year: 2019, name: 'Lamar Jackson' }],
    wpmoty: [{ year: 2006, name: 'Shannon Sharpe' }],
  },

  '34': { // Houston Texans
    superBowls: [],
    oroty:  [{ year: 2023, name: 'C.J. Stroud' }],
    droty:  [{ year: 2023, name: 'Will Anderson Jr.' }],
    dpoy:   [
      { year: 2012, name: 'J.J. Watt' },
      { year: 2014, name: 'J.J. Watt' },
      { year: 2015, name: 'J.J. Watt' },
    ],
    wpmoty: [{ year: 2015, name: 'J.J. Watt' }],
  },
}

// ── CFB Awards ────────────────────────────────────────────────
// natChamps = school-officially-claimed championships only
// Sources: school athletic departments, NCAA, Winsipedia, Wikipedia

export interface CFBTeamAwards {
  natChamps:   number[]
  heismans:    Award[]
  maxwell:     Award[]
  walterCamp:  Award[]
  daveyOBrien: Award[]
  doakWalker:  Award[]
  biletnikoff: Award[]
  outland:     Award[]
  butkus:      Award[]
  bednarik:    Award[]
  nagurski:    Award[]
  jimThorpe:   Award[]
}

export const CFB_AWARDS: Record<string, Partial<CFBTeamAwards>> = {

  '333': { // Alabama — 18 claimed championships
    natChamps: [1925,1926,1930,1934,1941,1961,1964,1965,1973,1978,1979,1992,2009,2011,2012,2015,2017,2020],
    heismans: [
      { year: 2009, name: 'Mark Ingram' },
      { year: 2015, name: 'Derrick Henry' },
      { year: 2018, name: 'Tua Tagovailoa' },
      { year: 2020, name: 'DeVonta Smith' },
    ],
    maxwell: [
      { year: 2015, name: 'Derrick Henry' },
      { year: 2020, name: 'DeVonta Smith' },
      { year: 2021, name: 'Bryce Young' },
    ],
    walterCamp: [
      { year: 2020, name: 'DeVonta Smith' },
      { year: 2021, name: 'Bryce Young' },
    ],
    daveyOBrien: [
      { year: 2021, name: 'Bryce Young' },
      { year: 2022, name: 'Bryce Young' },
    ],
    doakWalker:  [{ year: 2015, name: 'Derrick Henry' }],
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
    jimThorpe: [{ year: 2020, name: 'Patrick Surtain II' }],
  },

  '57': { // Florida — 3 claimed championships
    natChamps: [1996, 2006, 2008],
    heismans: [
      { year: 1966, name: 'Steve Spurrier' },
      { year: 1996, name: 'Danny Wuerffel' },
      { year: 2007, name: 'Tim Tebow' },
    ],
    maxwell:     [{ year: 1997, name: 'Danny Wuerffel' }, { year: 2007, name: 'Tim Tebow' }, { year: 2008, name: 'Tim Tebow' }],
    walterCamp:  [{ year: 2007, name: 'Tim Tebow' }, { year: 2008, name: 'Tim Tebow' }],
    daveyOBrien: [{ year: 1996, name: 'Danny Wuerffel' }, { year: 2007, name: 'Tim Tebow' }, { year: 2008, name: 'Tim Tebow' }],
    outland:     [{ year: 2006, name: 'Joe Cohen' }],
    butkus:      [{ year: 2008, name: 'Brandon Spikes' }],
  },

  '61': { // Georgia — 4 claimed championships
    natChamps:   [1942, 1980, 2021, 2022],
    heismans:    [{ year: 1982, name: 'Herschel Walker' }],
    maxwell:     [{ year: 1982, name: 'Herschel Walker' }],
    walterCamp:  [{ year: 1982, name: 'Herschel Walker' }],
    doakWalker:  [{ year: 1982, name: 'Herschel Walker' }],
    outland:     [{ year: 2021, name: 'Jordan Davis' }],
    bednarik:    [{ year: 2021, name: 'Jordan Davis' }, { year: 2022, name: 'Kelee Ringo' }],
    nagurski:    [{ year: 2022, name: 'Kelee Ringo' }],
    butkus:      [{ year: 2021, name: 'Nakobe Dean' }, { year: 2022, name: 'Smael Mondon' }, { year: 2024, name: 'Jalon Walker' }],
    biletnikoff: [{ year: 2022, name: 'Brock Bowers' }],
    jimThorpe:   [{ year: 2021, name: 'Derion Kendrick' }],
  },

  '99': { // LSU — 4 claimed championships
    natChamps:   [1958, 2003, 2007, 2019],
    heismans:    [
      { year: 1959, name: 'Billy Cannon' },
      { year: 2019, name: 'Joe Burrow' },
      { year: 2023, name: 'Jayden Daniels' },
    ],
    maxwell:     [{ year: 2019, name: 'Joe Burrow' }],
    walterCamp:  [{ year: 2019, name: 'Joe Burrow' }, { year: 2023, name: 'Jayden Daniels' }],
    daveyOBrien: [{ year: 2019, name: 'Joe Burrow' }, { year: 2023, name: 'Jayden Daniels' }],
    biletnikoff: [{ year: 2019, name: "Ja'Marr Chase" }],
    jimThorpe:   [{ year: 2019, name: 'Grant Delpit' }],
  },

  '2633': { // Tennessee — 1 claimed championship (1998 BCS)
    natChamps:   [1998],
    outland:     [{ year: 1964, name: 'Steve DeLong' }],
    biletnikoff: [{ year: 2022, name: 'Jalin Hyatt' }],
  },

  '245': { // Texas A&M — 1939 consensus AP championship
    // School also asserts 1919 and 1927 via retroactive minor selectors,
    // but 1939 is the only year with a major-selector consensus.
    natChamps:   [1939],
    heismans:    [
      { year: 1957, name: 'John David Crow' },
      { year: 2012, name: 'Johnny Manziel' },
    ],
    walterCamp:  [{ year: 2012, name: 'Johnny Manziel' }],
    daveyOBrien: [{ year: 2012, name: 'Johnny Manziel' }],
  },

  '194': { // Ohio State — 9 NCAA-recognized championships
    natChamps:   [1942,1954,1957,1961,1968,1970,2002,2014,2024],
    heismans:    [
      { year: 1944, name: 'Les Horvath' },
      { year: 1950, name: 'Vic Janowicz' },
      { year: 1954, name: 'Howard Cassady' },
      { year: 1974, name: 'Archie Griffin' },
      { year: 1975, name: 'Archie Griffin' },
      { year: 1995, name: 'Eddie George' },
      { year: 2006, name: 'Troy Smith' },
    ],
    maxwell:     [
      { year: 1974, name: 'Archie Griffin' },
      { year: 1975, name: 'Archie Griffin' },
      { year: 1995, name: 'Eddie George' },
    ],
    walterCamp:  [{ year: 1974, name: 'Archie Griffin' }, { year: 1975, name: 'Archie Griffin' }],
    daveyOBrien: [{ year: 2006, name: 'Troy Smith' }],
    doakWalker:  [{ year: 1995, name: 'Eddie George' }],
    biletnikoff: [{ year: 1995, name: 'Terry Glenn' }, { year: 2023, name: 'Marvin Harrison Jr.' }],
    outland:     [{ year: 1956, name: 'Jim Parker' }, { year: 1970, name: 'Jim Stillwagon' }],
    butkus:      [{ year: 2019, name: 'Malik Harrison' }],
    bednarik:    [{ year: 2019, name: 'Chase Young' }],
    nagurski:    [{ year: 2019, name: 'Chase Young' }],
    jimThorpe:   [{ year: 2024, name: 'Caleb Downs' }],
  },

  '130': { // Michigan — 4 claimed championships
    natChamps:  [1947,1948,1997,2023],
    heismans:   [
      { year: 1940, name: 'Tom Harmon' },
      { year: 1991, name: 'Desmond Howard' },
      { year: 1997, name: 'Charles Woodson' },
    ],
    maxwell:    [{ year: 1940, name: 'Tom Harmon' }, { year: 1997, name: 'Charles Woodson' }],
    walterCamp: [{ year: 1940, name: 'Tom Harmon' }, { year: 1997, name: 'Charles Woodson' }],
    jimThorpe:  [{ year: 1997, name: 'Charles Woodson' }],
    bednarik:   [{ year: 1997, name: 'Charles Woodson' }],
    nagurski:   [{ year: 1997, name: 'Charles Woodson' }],
    outland:    [{ year: 1947, name: 'Joe Steffy' }],
  },

  '87': { // Notre Dame — 11 claimed championships
    natChamps:   [1924,1929,1930,1943,1946,1947,1949,1966,1973,1977,1988],
    heismans:    [
      { year: 1943, name: 'Angelo Bertelli' },
      { year: 1947, name: 'Johnny Lujack' },
      { year: 1949, name: 'Leon Hart' },
      { year: 1953, name: 'John Lattner' },
      { year: 1956, name: 'Paul Hornung' },
      { year: 1964, name: 'John Huarte' },
      { year: 1987, name: 'Tim Brown' },
    ],
    maxwell:     [{ year: 1949, name: 'Leon Hart' }, { year: 1953, name: 'John Lattner' }],
    walterCamp:  [{ year: 1947, name: 'Johnny Lujack' }],
    outland:     [{ year: 1946, name: 'George Connor' }, { year: 1948, name: 'Bill Fischer' }],
    doakWalker:  [{ year: 2024, name: 'Jeremiyah Love' }],
    biletnikoff: [{ year: 1987, name: 'Tim Brown' }],
  },

  '30': { // USC — 11 claimed championships
    natChamps:   [1928,1931,1932,1939,1962,1967,1972,1974,1978,2003,2004],
    heismans:    [
      { year: 1965, name: 'Mike Garrett' },
      { year: 1967, name: 'O.J. Simpson' },
      { year: 1979, name: 'Charles White' },
      { year: 1981, name: 'Marcus Allen' },
      { year: 2002, name: 'Carson Palmer' },
      { year: 2004, name: 'Matt Leinart' },
      { year: 2005, name: 'Reggie Bush' },
      { year: 2022, name: 'Caleb Williams' },
    ],
    maxwell:     [{ year: 1981, name: 'Marcus Allen' }, { year: 2002, name: 'Carson Palmer' }],
    walterCamp:  [{ year: 1967, name: 'O.J. Simpson' }, { year: 2002, name: 'Carson Palmer' }],
    daveyOBrien: [{ year: 2002, name: 'Carson Palmer' }, { year: 2022, name: 'Caleb Williams' }],
    doakWalker:  [{ year: 1979, name: 'Charles White' }, { year: 1981, name: 'Marcus Allen' }],
    outland:     [{ year: 1967, name: 'Ron Yary' }],
    jimThorpe:   [{ year: 2016, name: "Adoree' Jackson" }],
  },

  '251': { // Texas — 4 claimed championships
    natChamps:   [1963,1969,1970,2005],
    heismans:    [{ year: 1977, name: 'Earl Campbell' }],
    walterCamp:  [{ year: 1977, name: 'Earl Campbell' }],
    outland:     [
      { year: 1963, name: 'Scott Appleton' },
      { year: 2023, name: "T'Vondre Sweat" },
      { year: 2024, name: 'Kelvin Banks Jr.' },
    ],
    doakWalker:  [{ year: 2022, name: 'Bijan Robinson' }],
    biletnikoff: [{ year: 2023, name: 'Xavier Worthy' }],
    daveyOBrien: [{ year: 2023, name: 'Quinn Ewers' }],
  },

  '228': { // Clemson — 3 claimed championships
    natChamps:   [1981,2016,2018],
    daveyOBrien: [{ year: 2016, name: 'Deshaun Watson' }, { year: 2017, name: 'Deshaun Watson' }],
    biletnikoff: [{ year: 2023, name: 'Antonio Williams' }],
  },

  '52': { // Florida State — 3 claimed championships
    natChamps:   [1993,1999,2013],
    daveyOBrien: [{ year: 1993, name: 'Charlie Ward' }, { year: 2023, name: 'Jordan Travis' }],
    biletnikoff: [{ year: 1995, name: 'Peter Warrick' }],
    outland:     [{ year: 2000, name: 'Jamal Reynolds' }],
    jimThorpe:   [{ year: 1992, name: 'Terrell Buckley' }],
  },

  '2483': { // Oregon — 1 claimed championship (2024 CFP)
    natChamps:   [2024],
    heismans:    [{ year: 2014, name: 'Marcus Mariota' }],
    maxwell:     [{ year: 2014, name: 'Marcus Mariota' }],
    walterCamp:  [{ year: 2014, name: 'Marcus Mariota' }],
    daveyOBrien: [{ year: 2014, name: 'Marcus Mariota' }],
  },

  '84': { // Indiana — 2025 CFP champion (16-0)
    natChamps:   [2025],
    maxwell:     [{ year: 2025, name: 'Fernando Mendoza' }],
    walterCamp:  [{ year: 2025, name: 'Fernando Mendoza' }],
    daveyOBrien: [{ year: 2025, name: 'Fernando Mendoza' }],
  },

  '213': { // Penn State — 2 claimed championships
    natChamps:   [1982,1986],
    outland:     [{ year: 1969, name: 'Mike Reid' }],
    biletnikoff: [{ year: 1994, name: 'Bobby Engram' }],
    butkus:      [{ year: 2002, name: 'LaVar Arrington' }],
  },

  '158': { // Nebraska — 5 claimed championships
    natChamps:   [1970,1971,1994,1995,1997],
    heismans:    [
      { year: 1972, name: 'Johnny Rodgers' },
      { year: 1983, name: 'Mike Rozier' },
    ],
    outland:     [
      { year: 1963, name: 'Bob Brown' },
      { year: 1981, name: 'Dave Rimington' },
      { year: 1982, name: 'Dave Rimington' },
      { year: 1983, name: 'Dean Steinkuhler' },
      { year: 1994, name: 'Zach Wiegert' },
      { year: 1995, name: 'Aaron Taylor' },
    ],
    doakWalker:  [{ year: 1983, name: 'Mike Rozier' }],
    walterCamp:  [{ year: 1983, name: 'Mike Rozier' }],
  },

  '2509': { // Oklahoma — 7 claimed championships
    natChamps:   [1950,1955,1956,1974,1975,1985,2000],
    heismans:    [
      { year: 1952, name: 'Billy Vessels' },
      { year: 1969, name: 'Steve Owens' },
      { year: 1978, name: 'Billy Sims' },
      { year: 2003, name: 'Jason White' },
      { year: 2008, name: 'Sam Bradford' },
      { year: 2017, name: 'Baker Mayfield' },
      { year: 2018, name: 'Kyler Murray' },
    ],
    maxwell:     [{ year: 2017, name: 'Baker Mayfield' }, { year: 2018, name: 'Kyler Murray' }],
    walterCamp:  [{ year: 2017, name: 'Baker Mayfield' }, { year: 2018, name: 'Kyler Murray' }],
    daveyOBrien: [
      { year: 2008, name: 'Sam Bradford' },
      { year: 2017, name: 'Baker Mayfield' },
      { year: 2018, name: 'Kyler Murray' },
    ],
    doakWalker:  [{ year: 1978, name: 'Billy Sims' }],
    biletnikoff: [{ year: 2016, name: 'Dede Westbrook' }],
    outland:     [
      { year: 1951, name: 'Jim Weatherall' },
      { year: 1953, name: 'J.D. Roberts' },
    ],
  },

  '2390': { // Miami (FL) — 5 claimed championships
    natChamps:   [1983,1987,1989,1991,2001],
    daveyOBrien: [{ year: 1992, name: 'Gino Torretta' }, { year: 2024, name: 'Cam Ward' }],
    outland:     [{ year: 2001, name: 'Bryant McKinnie' }],
    jimThorpe:   [{ year: 1992, name: 'Kevin Williams' }],
  },

  '97': { // Louisville
    heismans:    [{ year: 2016, name: 'Lamar Jackson' }],
    maxwell:     [{ year: 2016, name: 'Lamar Jackson' }],
    walterCamp:  [{ year: 2016, name: 'Lamar Jackson' }],
    daveyOBrien: [{ year: 2016, name: 'Lamar Jackson' }, { year: 2017, name: 'Lamar Jackson' }],
  },

  '221': { // Pittsburgh — 1 claimed championship
    natChamps:   [1976],
    heismans:    [{ year: 1976, name: 'Tony Dorsett' }],
    walterCamp:  [{ year: 1976, name: 'Tony Dorsett' }],
    doakWalker:  [{ year: 1976, name: 'Tony Dorsett' }],
    biletnikoff: [{ year: 2021, name: 'Jordan Addison' }],
    outland:     [{ year: 1980, name: 'Mark May' }],
  },

  '252': { // BYU — 1 claimed championship (1984)
    natChamps:   [1984],
    heismans:    [{ year: 1990, name: 'Ty Detmer' }],
    daveyOBrien: [{ year: 1990, name: 'Ty Detmer' }],
    walterCamp:  [{ year: 1990, name: 'Ty Detmer' }],
  },

  '2': { // Auburn — 2 claimed championships
    natChamps:   [1957, 2010],
    heismans:    [{ year: 1985, name: 'Bo Jackson' }],
    doakWalker:  [{ year: 1985, name: 'Bo Jackson' }],
    walterCamp:  [{ year: 1985, name: 'Bo Jackson' }],
    outland:     [{ year: 1958, name: 'Zeke Smith' }],
  },

  '264': { // Washington
    maxwell:     [{ year: 2023, name: 'Michael Penix Jr.' }],
    daveyOBrien: [{ year: 2023, name: 'Michael Penix Jr.' }],
    walterCamp:  [{ year: 2023, name: 'Michael Penix Jr.' }],
  },

  '2277': { // Oklahoma State
    heismans:    [{ year: 1988, name: 'Barry Sanders' }],
    doakWalker:  [{ year: 1988, name: 'Barry Sanders' }],
    walterCamp:  [{ year: 1988, name: 'Barry Sanders' }],
    daveyOBrien: [{ year: 1988, name: 'Barry Sanders' }],
    biletnikoff: [
      { year: 2010, name: 'Justin Blackmon' },
      { year: 2011, name: 'Justin Blackmon' },
      { year: 2017, name: 'James Washington' },
    ],
  },

  '324': { // Colorado — 1 claimed championship (1990, split with Georgia Tech)
    natChamps:   [1990],
    heismans:    [{ year: 1994, name: 'Rashaan Salaam' }],
    biletnikoff: [{ year: 2024, name: 'Travis Hunter Jr.' }],
    bednarik:    [{ year: 2024, name: 'Travis Hunter Jr.' }],
    nagurski:    [{ year: 2024, name: 'Travis Hunter Jr.' }],
    jimThorpe:   [{ year: 2024, name: 'Travis Hunter Jr.' }],
    walterCamp:  [{ year: 2024, name: 'Travis Hunter Jr.' }],
    daveyOBrien: [{ year: 2024, name: 'Shedeur Sanders' }],
  },

  '38': { // Colorado (alternate ESPN ID — duplicate entry for safety)
    natChamps:   [1990],
    heismans:    [{ year: 1994, name: 'Rashaan Salaam' }],
    biletnikoff: [{ year: 2024, name: 'Travis Hunter Jr.' }],
    bednarik:    [{ year: 2024, name: 'Travis Hunter Jr.' }],
    nagurski:    [{ year: 2024, name: 'Travis Hunter Jr.' }],
    jimThorpe:   [{ year: 2024, name: 'Travis Hunter Jr.' }],
    walterCamp:  [{ year: 2024, name: 'Travis Hunter Jr.' }],
    daveyOBrien: [{ year: 2024, name: 'Shedeur Sanders' }],
  },

  '59': { // Georgia Tech — 4 claimed championships (1917, 1928, 1952, 1990 split)
    natChamps:   [1917,1928,1952,1990],
  },

  '239': { // Baylor
    biletnikoff: [{ year: 2015, name: 'Corey Coleman' }],
  },

  '2641': { // Texas Tech
    biletnikoff: [
      { year: 2007, name: 'Michael Crabtree' },
      { year: 2008, name: 'Michael Crabtree' },
    ],
    butkus:   [{ year: 2025, name: 'Jacob Rodriguez' }],
    bednarik: [{ year: 2025, name: 'Jacob Rodriguez' }],
    nagurski: [{ year: 2025, name: 'Jacob Rodriguez' }],
  },

  '68': { // Boise State
    maxwell:    [{ year: 2024, name: 'Ashton Jeanty' }],
    doakWalker: [{ year: 2024, name: 'Ashton Jeanty' }],
    walterCamp: [{ year: 2024, name: 'Ashton Jeanty' }],
  },

  '26': { // UCLA
    butkus:  [{ year: 2014, name: 'Eric Kendricks' }],
  },

  '150': { // Duke
    outland: [{ year: 1959, name: 'Mike McGee' }],
  },

  '120': { // Maryland — 1 claimed championship
    natChamps: [1953],
    outland:   [{ year: 1952, name: 'Dick Modzelewski' }],
  },

  '135': { // Minnesota — 6 claimed championships
    natChamps: [1934,1935,1936,1940,1941,1960],
    outland:   [{ year: 1960, name: 'Tom Brown' }, { year: 1962, name: 'Bobby Bell' }],
  },

  '356': { // Illinois — 1 claimed championship
    natChamps: [1951],
  },

  '2294': { // Iowa
    outland: [{ year: 1955, name: 'Calvin Jones' }, { year: 1958, name: 'Alex Karras' }],
  },

  '96': { // Kentucky
    outland: [{ year: 1950, name: 'Bob Gain' }],
  },

  '152': { // NC State
    bednarik: [{ year: 2023, name: 'Payton Wilson' }],
    butkus:   [{ year: 2023, name: 'Payton Wilson' }],
  },

  '254': { // Utah
    outland: [{ year: 2025, name: 'Spencer Fano' }],
  },

  '2567': { // SMU — 2 claimed championships
    natChamps: [1935,1947],
  },

  '145': { // Ole Miss — 3 claimed championships
    natChamps: [1959,1960,1962],
  },

  '2084': { // Miami (FL) alternate ESPN ID
    natChamps:   [1983,1987,1989,1991,2001],
    daveyOBrien: [{ year: 2024, name: 'Cam Ward' }],
  },
}
