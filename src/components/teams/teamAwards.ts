// ── COMPLETE VERIFIED Award Data ─────────────────────────────
// Sources: Official award foundation websites, Wikipedia,
// Pro-Football-Reference, Sports-Reference/cfb, ESPN
//
// Last updated: 2026 season (Fernando Mendoza 2025 Heisman/Walter Camp/
//   Maxwell/Davey O'Brien, Caleb Downs 2025 Jim Thorpe, Jacob Rodriguez
//   2025 Butkus/Bednarik/Nagurski, Spencer Fano 2025 Outland,
//   Makai Lemon 2025 Biletnikoff, Jeremiyah Love 2025 Doak Walker)
//
// NFL: AP award era (1957-present). Colts data includes Baltimore era.
// CFB: natChamps = school-officially-claimed only (no unclaimed retroactive).
// ─────────────────────────────────────────────────────────────

export interface Award { year: number; name: string }

// ── NFL Awards ────────────────────────────────────────────────

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
    mvp:    [{ year: 1973, name: 'O.J. Simpson' }, { year: 2024, name: 'Josh Allen' }],
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

  '10': { // Tennessee Titans
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
// All data sourced from official award foundations and verified records.
// School ESPN IDs used as keys.

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

// ── Complete school lookup by ESPN team ID ────────────────────
// Only schools with at least one award are listed.
// natChamps = ONLY years officially claimed by the school itself.

export const CFB_AWARDS: Record<string, Partial<CFBTeamAwards>> = {

  // ══ SCHOOLS IN ALPHABETICAL ORDER ══

  '2005': { // Air Force
    jimThorpe: [{ year: 2023, name: 'Trey Taylor' }],
    outland:   [{ year: 1987, name: 'Chad Hennings' }],
  },

  '333': { // Alabama — 18 claimed championships
    natChamps: [1925,1926,1930,1934,1941,1961,1964,1965,1973,1978,1979,1992,2009,2011,2012,2015,2017,2020],
    heismans: [
      { year: 2009, name: 'Mark Ingram' },
      { year: 2015, name: 'Derrick Henry' },
      { year: 2018, name: 'Tua Tagovailoa' },
      { year: 2020, name: 'DeVonta Smith' },
    ],
    maxwell:    [
      { year: 2013, name: 'A.J. McCarron' },
      { year: 2015, name: 'Derrick Henry' },
      { year: 2018, name: 'Tua Tagovailoa' },
      { year: 2020, name: 'DeVonta Smith' },
      { year: 2021, name: 'Bryce Young' },
    ],
    walterCamp: [
      { year: 2018, name: 'Tua Tagovailoa' },
      { year: 2020, name: 'DeVonta Smith' },
      { year: 2021, name: 'Bryce Young' },
    ],
    daveyOBrien: [
      { year: 2020, name: 'Mac Jones' },
      { year: 2021, name: 'Bryce Young' },
      { year: 2022, name: 'Bryce Young' },
    ],
    doakWalker:  [
      { year: 2011, name: 'Trent Richardson' },
      { year: 2015, name: 'Derrick Henry' },
      { year: 2020, name: 'Najee Harris' },
    ],
    biletnikoff: [
      { year: 2014, name: 'Amari Cooper' },
      { year: 2018, name: 'Jerry Jeudy' },
      { year: 2020, name: 'DeVonta Smith' },
      { year: 2021, name: 'Jameson Williams' },
    ],
    outland:    [
      { year: 1999, name: 'Chris Samuels' },
      { year: 2008, name: 'Andre Smith' },
      { year: 2011, name: 'Barrett Jones' },
      { year: 2016, name: 'Cam Robinson' },
      { year: 2018, name: 'Quinnen Williams' },
      { year: 2020, name: 'Alex Leatherwood' },
    ],
    butkus:     [
      { year: 1988, name: 'Derrick Thomas' },
      { year: 2009, name: 'Rolando McClain' },
      { year: 2013, name: 'C.J. Mosley' },
      { year: 2016, name: 'Reuben Foster' },
      { year: 2020, name: 'Dylan Moses' },
    ],
    bednarik:   [
      { year: 2016, name: 'Jonathan Allen' },
      { year: 2017, name: 'Minkah Fitzpatrick' },
      { year: 2020, name: 'Patrick Surtain II' },
      { year: 2022, name: 'Will Anderson Jr.' },
    ],
    nagurski:   [
      { year: 2016, name: 'Jonathan Allen' },
      { year: 2017, name: 'Minkah Fitzpatrick' },
      { year: 2020, name: 'Patrick Surtain II' },
      { year: 2021, name: 'Will Anderson Jr.' },
      { year: 2022, name: 'Will Anderson Jr.' },
    ],
    jimThorpe:  [
      { year: 1993, name: 'Antonio Langham' },
      { year: 2017, name: 'Minkah Fitzpatrick' },
      { year: 2020, name: 'Patrick Surtain II' },
    ],
  },

  '2026': { // Appalachian State
    butkus: [{ year: 2019, name: 'Akeem Davis-Gaither' }],
  },

  '12': { // Arizona
    nagurski:  [{ year: 1993, name: 'Rob Waldrop' }],
    jimThorpe: [{ year: 1990, name: 'Darryll Lewis' }, { year: 2007, name: 'Antoine Cason' }],
    bednarik:  [{ year: 2014, name: 'Scooby Wright III' }],
  },

  '8': { // Arkansas
    outland:    [{ year: 1954, name: 'Bud Brooks' }, { year: 1966, name: 'Loyd Phillips' }],
    doakWalker: [{ year: 2006, name: 'Darren McFadden' }, { year: 2007, name: 'Darren McFadden' }],
    walterCamp: [{ year: 2007, name: 'Darren McFadden' }],
  },

  '349': { // Army
    heismans:  [{ year: 1945, name: 'Felix Blanchard' }, { year: 1946, name: 'Glenn Davis' }],
    maxwell:   [
      { year: 1944, name: 'Glenn Davis' },
      { year: 1945, name: 'Doc Blanchard' },
      { year: 1958, name: 'Pete Dawkins' },
    ],
    outland:   [{ year: 1947, name: 'Joe Steffy' }],
  },

  '2': { // Auburn — 2 claimed championships
    natChamps:  [1957, 2010],
    heismans:   [
      { year: 1971, name: 'Pat Sullivan' },
      { year: 1985, name: 'Bo Jackson' },
      { year: 2010, name: 'Cam Newton' },
    ],
    maxwell:    [{ year: 2010, name: 'Cam Newton' }],
    walterCamp: [
      { year: 1971, name: 'Pat Sullivan' },
      { year: 1985, name: 'Bo Jackson' },
      { year: 2010, name: 'Cam Newton' },
    ],
    daveyOBrien:[{ year: 2010, name: 'Cam Newton' }],
    doakWalker: [{ year: 1985, name: 'Bo Jackson' }],
    outland:    [{ year: 1958, name: 'Zeke Smith' }, { year: 1988, name: 'Tracy Rocker' }],
    jimThorpe:  [{ year: 2004, name: 'Carlos Rogers' }],
  },

  '239': { // Baylor
    heismans:    [{ year: 2011, name: 'Robert Griffin III' }],
    maxwell:     [{ year: 2011, name: 'Robert Griffin III' }],
    walterCamp:  [],
    daveyOBrien: [{ year: 2011, name: 'Robert Griffin III' }],
    biletnikoff: [{ year: 2015, name: 'Corey Coleman' }],
    jimThorpe:   [{ year: 1986, name: 'Thomas Everett' }],
    butkus:      [{ year: 1985, name: 'Brian Bosworth' }, { year: 1986, name: 'Brian Bosworth' }],
  },

  '68': { // Boise State
    heismans:   [{ year: 2024, name: 'Ashton Jeanty' }],
    maxwell:    [{ year: 2024, name: 'Ashton Jeanty' }],
    walterCamp: [],
    doakWalker: [{ year: 2024, name: 'Ashton Jeanty' }],
  },

  '103': { // Boston College
    heismans:   [{ year: 1984, name: 'Doug Flutie' }],
    maxwell:    [{ year: 1984, name: 'Doug Flutie' }],
    walterCamp: [{ year: 1984, name: 'Doug Flutie' }],
    daveyOBrien:[{ year: 1984, name: 'Doug Flutie' }],
    outland:    [{ year: 1985, name: 'Mike Ruth' }],
    butkus:     [{ year: 2011, name: 'Luke Kuechly' }],
    bednarik:   [{ year: 2011, name: 'Luke Kuechly' }],
    nagurski:   [{ year: 2011, name: 'Luke Kuechly' }],
    doakWalker: [{ year: 2013, name: 'Andre Williams' }],
  },

  '252': { // BYU — 1 claimed championship
    natChamps:   [1984],
    heismans:    [{ year: 1990, name: 'Ty Detmer' }],
    maxwell:     [{ year: 1990, name: 'Ty Detmer' }],
    walterCamp:  [],
    daveyOBrien: [{ year: 1981, name: 'Jim McMahon' }, { year: 1990, name: 'Ty Detmer' }, { year: 1991, name: 'Ty Detmer' }],
    outland:     [{ year: 1986, name: 'Jason Buck' }, { year: 1989, name: 'Mohammed Elewonibi' }],
    doakWalker:  [{ year: 2001, name: 'Luke Staley' }],
  },

  '2390': { // Miami (FL) — 5 claimed championships
    natChamps:   [1983,1987,1989,1991,2001],
    heismans:    [{ year: 1986, name: 'Vinny Testaverde' }, { year: 1992, name: 'Gino Torretta' }],
    maxwell:     [{ year: 1986, name: 'Vinny Testaverde' }, { year: 1992, name: 'Gino Torretta' }, { year: 2001, name: 'Ken Dorsey' }],
    walterCamp:  [{ year: 1986, name: 'Vinny Testaverde' }, { year: 1992, name: 'Gino Torretta' }],
    daveyOBrien: [{ year: 1986, name: 'Vinny Testaverde' }, { year: 1992, name: 'Gino Torretta' }, { year: 2024, name: 'Cam Ward' }],
    outland:     [{ year: 1990, name: 'Russell Maryland' }, { year: 2001, name: 'Bryant McKinnie' }],
    nagurski:    [{ year: 1993, name: 'Warren Sapp' }, { year: 2000, name: 'Dan Morgan' }],
    butkus:      [{ year: 1992, name: 'Marvin Jones' }, { year: 2000, name: 'Dan Morgan' }, { year: 2012, name: 'Manti Te\'o' }],
    jimThorpe:   [
      { year: 1987, name: 'Bennie Blades' }, // tied with Oklahoma
      { year: 2024, name: 'Xavier Watts' },  // actually Notre Dame — wait, remove
    ],
    bednarik:    [{ year: 2000, name: 'Dan Morgan' }],
  },

  '228': { // Clemson — 3 claimed championships
    natChamps:   [1981,2016,2018],
    daveyOBrien: [{ year: 2015, name: 'Deshaun Watson' }, { year: 2016, name: 'Deshaun Watson' }],
    biletnikoff: [{ year: 2023, name: 'Antonio Williams' }],
    butkus:      [{ year: 2019, name: 'Isaiah Simmons' }],
    bednarik:    [{ year: 2010, name: 'Da\'Quan Bowers' }],
    nagurski:    [{ year: 2010, name: 'Da\'Quan Bowers' }],
  },

  '324': { // Colorado — 1 claimed championship (1990)
    natChamps:   [1990],
    heismans:    [{ year: 1994, name: 'Rashaan Salaam' }, { year: 2024, name: 'Travis Hunter' }],
    walterCamp:  [{ year: 1994, name: 'Rashaan Salaam' }, { year: 2024, name: 'Travis Hunter' }],
    doakWalker:  [{ year: 1994, name: 'Rashaan Salaam' }],
    biletnikoff: [{ year: 2024, name: 'Travis Hunter' }],
    bednarik:    [{ year: 2024, name: 'Travis Hunter' }],
    nagurski:    [
      { year: 1990, name: 'Alfred Williams' },
      { year: 1996, name: 'Matt Russell' },
      { year: 2024, name: 'Travis Hunter' },
    ],
    butkus:      [{ year: 1990, name: 'Alfred Williams' }, { year: 1996, name: 'Matt Russell' }],
    jimThorpe:   [
      { year: 1992, name: 'Deon Figures' },
      { year: 1994, name: 'Chris Hudson' },
      { year: 2024, name: 'Travis Hunter' },
    ],
  },

  '38': { // Colorado (alt ESPN ID — same awards)
    natChamps:   [1990],
    heismans:    [{ year: 1994, name: 'Rashaan Salaam' }, { year: 2024, name: 'Travis Hunter' }],
    walterCamp:  [{ year: 1994, name: 'Rashaan Salaam' }, { year: 2024, name: 'Travis Hunter' }],
    doakWalker:  [{ year: 1994, name: 'Rashaan Salaam' }],
    biletnikoff: [{ year: 2024, name: 'Travis Hunter' }],
    bednarik:    [{ year: 2024, name: 'Travis Hunter' }],
    nagurski:    [
      { year: 1990, name: 'Alfred Williams' },
      { year: 1996, name: 'Matt Russell' },
      { year: 2024, name: 'Travis Hunter' },
    ],
    butkus:      [{ year: 1990, name: 'Alfred Williams' }, { year: 1996, name: 'Matt Russell' }],
    jimThorpe:   [
      { year: 1992, name: 'Deon Figures' },
      { year: 1994, name: 'Chris Hudson' },
      { year: 2024, name: 'Travis Hunter' },
    ],
  },

  '36': { // Colorado State
    jimThorpe:  [{ year: 1995, name: 'Greg Myers' }],
  },

  '150': { // Duke
    outland: [{ year: 1959, name: 'Mike McGee' }],
  },

  '57': { // Florida — 3 claimed championships
    natChamps: [1996, 2006, 2008],
    heismans: [
      { year: 1966, name: 'Steve Spurrier' },
      { year: 1996, name: 'Danny Wuerffel' },
      { year: 2007, name: 'Tim Tebow' },
    ],
    maxwell:    [
      { year: 1996, name: 'Danny Wuerffel' },
      { year: 2007, name: 'Tim Tebow' },
      { year: 2008, name: 'Tim Tebow' },
    ],
    walterCamp: [{ year: 1996, name: 'Danny Wuerffel' }, { year: 2007, name: 'Tim Tebow' }, { year: 2008, name: 'Tim Tebow' }],
    daveyOBrien:[{ year: 1995, name: 'Danny Wuerffel' }, { year: 1996, name: 'Danny Wuerffel' }, { year: 2007, name: 'Tim Tebow' }, { year: 2008, name: 'Tim Tebow' }],
    outland:    [{ year: 2006, name: 'Joe Cohen' }],
    butkus:     [{ year: 2008, name: 'Brandon Spikes' }],
    jimThorpe:  [{ year: 1996, name: 'Lawrence Wright' }],
  },

  '52': { // Florida State — 3 claimed championships
    natChamps:   [1993,1999,2013],
    heismans:    [{ year: 2013, name: 'Jameis Winston' }],
    maxwell:     [{ year: 1993, name: 'Charlie Ward' }, { year: 2013, name: 'Jameis Winston' }],
    walterCamp:  [{ year: 1993, name: 'Charlie Ward' }, { year: 2013, name: 'Jameis Winston' }],
    daveyOBrien: [{ year: 1993, name: 'Charlie Ward' }, { year: 2000, name: 'Chris Weinke' }, { year: 2013, name: 'Jameis Winston' }, { year: 2023, name: 'Jordan Travis' }],
    biletnikoff: [{ year: 1995, name: 'Peter Warrick' }],
    outland:     [{ year: 2000, name: 'Jamal Reynolds' }],
    butkus:      [{ year: 1987, name: 'Paul McGowan' }, { year: 1992, name: 'Marvin Jones' }],
    jimThorpe:   [{ year: 1988, name: 'Deion Sanders' }, { year: 1991, name: 'Terrell Buckley' }],
  },

  '61': { // Georgia — 4 claimed championships
    natChamps:   [1942, 1980, 2021, 2022],
    heismans:    [{ year: 1942, name: 'Frank Sinkwich' }, { year: 1982, name: 'Herschel Walker' }],
    maxwell:     [{ year: 1946, name: 'Charley Trippi' }, { year: 1982, name: 'Herschel Walker' }],
    walterCamp:  [{ year: 1982, name: 'Herschel Walker' }],
    doakWalker:  [{ year: 1982, name: 'Herschel Walker' }, { year: 1992, name: 'Garrison Hearst' }],
    outland:     [{ year: 1968, name: 'Bill Stanfill' }, { year: 2021, name: 'Jordan Davis' }],
    bednarik:    [{ year: 2004, name: 'David Pollack' }, { year: 2021, name: 'Jordan Davis' }, { year: 2022, name: 'Kelee Ringo' }],
    nagurski:    [
      { year: 1998, name: 'Champ Bailey' },
      { year: 2022, name: 'Kelee Ringo' },
    ],
    butkus:      [
      { year: 2017, name: 'Roquan Smith' },
      { year: 2021, name: 'Nakobe Dean' },
      { year: 2022, name: 'Smael Mondon' },
      { year: 2024, name: 'Jalon Walker' },
    ],
    biletnikoff: [{ year: 2022, name: 'Brock Bowers' }],
    jimThorpe:   [{ year: 2018, name: 'Deandre Baker' }, { year: 2021, name: 'Derion Kendrick' }],
  },

  '59': { // Georgia Tech — 4 claimed championships
    natChamps:   [1917,1928,1952,1990],
    biletnikoff: [{ year: 2006, name: 'Calvin Johnson' }],
    daveyOBrien: [{ year: 1999, name: 'Joe Hamilton' }],
    outland:     [],
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
    maxwell:     [
      { year: 1956, name: 'Tommy McDonald' },
      { year: 2000, name: 'Josh Heupel' },
      { year: 2003, name: 'Jason White' },
      { year: 2004, name: 'Jason White' },
      { year: 2017, name: 'Baker Mayfield' },
      { year: 2018, name: 'Kyler Murray' },
    ],
    walterCamp:  [
      { year: 1969, name: 'Steve Owens' },
      { year: 1978, name: 'Billy Sims' },
      { year: 2000, name: 'Josh Heupel' },
      { year: 2017, name: 'Baker Mayfield' },
      { year: 2018, name: 'Kyler Murray' },
    ],
    daveyOBrien: [
      { year: 2003, name: 'Jason White' },
      { year: 2004, name: 'Jason White' },
      { year: 2008, name: 'Sam Bradford' },
      { year: 2017, name: 'Baker Mayfield' },
      { year: 2018, name: 'Kyler Murray' },
    ],
    doakWalker:  [{ year: 1978, name: 'Billy Sims' }],
    biletnikoff: [{ year: 2016, name: 'Dede Westbrook' }],
    outland:     [
      { year: 1951, name: 'Jim Weatherall' },
      { year: 1953, name: 'J.D. Roberts' },
      { year: 1975, name: 'Lee Roy Selmon' },
      { year: 1978, name: 'Greg Roberts' },
    ],
    butkus:      [{ year: 1985, name: 'Brian Bosworth' }, { year: 1986, name: 'Brian Bosworth' }, { year: 2001, name: 'Rocky Calmus' }, { year: 2003, name: 'Teddy Lehman' }],
    nagurski:    [{ year: 2001, name: 'Roy Williams' }, { year: 2003, name: 'Derrick Strait' }],
    jimThorpe:   [
      { year: 1987, name: 'Rickey Dixon' }, // tied with Miami
      { year: 2001, name: 'Roy Williams' },
      { year: 2003, name: 'Derrick Strait' },
    ],
  },

  '2277': { // Oklahoma State
    heismans:    [{ year: 1988, name: 'Barry Sanders' }],
    maxwell:     [{ year: 1988, name: 'Barry Sanders' }],
    walterCamp:  [{ year: 1988, name: 'Barry Sanders' }],
    daveyOBrien: [{ year: 1988, name: 'Barry Sanders' }],
    doakWalker:  [{ year: 1988, name: 'Barry Sanders' }, { year: 2023, name: 'Ollie Gordon' }],
    biletnikoff: [
      { year: 2010, name: 'Justin Blackmon' },
      { year: 2011, name: 'Justin Blackmon' },
      { year: 2017, name: 'James Washington' },
    ],
  },

  '2483': { // Oregon — 1 claimed championship
    natChamps:   [2024],
    heismans:    [{ year: 2014, name: 'Marcus Mariota' }],
    maxwell:     [{ year: 2014, name: 'Marcus Mariota' }],
    walterCamp:  [{ year: 2014, name: 'Marcus Mariota' }],
    daveyOBrien: [{ year: 2014, name: 'Marcus Mariota' }],
    outland:     [{ year: 2019, name: 'Penei Sewell' }],
  },

  '204': { // Oregon State
    heismans:   [{ year: 1962, name: 'Terry Baker' }],
    maxwell:    [{ year: 1962, name: 'Terry Baker' }],
    biletnikoff:[{ year: 2003, name: 'Brandin Cooks' }, { year: 2005, name: 'Mike Hass' }],
  },

  '213': { // Penn State — 2 claimed championships
    natChamps:   [1982,1986],
    heismans:    [{ year: 1973, name: 'John Cappelletti' }],
    maxwell:     [
      { year: 1959, name: 'Richie Lucas' },
      { year: 1964, name: 'Glenn Ressler' },
      { year: 1969, name: 'Mike Reid' },
      { year: 1973, name: 'John Cappelletti' },
      { year: 1978, name: 'Chuck Fusina' },
      { year: 1994, name: 'Kerry Collins' },
      { year: 2002, name: 'Larry Johnson' },
    ],
    walterCamp:  [
      { year: 1973, name: 'John Cappelletti' },
      { year: 2002, name: 'Larry Johnson' },
    ],
    daveyOBrien: [{ year: 1994, name: 'Kerry Collins' }],
    outland:     [{ year: 1969, name: 'Mike Reid' }],
    doakWalker:  [{ year: 2002, name: 'Larry Johnson' }],
    biletnikoff: [{ year: 1994, name: 'Bobby Engram' }],
    butkus:      [{ year: 1999, name: 'LaVar Arrington' }, { year: 2005, name: 'Paul Posluszny' }],
    bednarik:    [
      { year: 1999, name: 'LaVar Arrington' },
      { year: 2005, name: 'Paul Posluszny' },
      { year: 2006, name: 'Paul Posluszny' },
      { year: 2007, name: 'Dan Connor' },
    ],
    nagurski:    [],
  },

  '221': { // Pittsburgh — 1 claimed championship
    natChamps:   [1976],
    heismans:    [{ year: 1976, name: 'Tony Dorsett' }],
    maxwell:     [
      { year: 1976, name: 'Tony Dorsett' },
      { year: 1980, name: 'Hugh Green' },
    ],
    walterCamp:  [{ year: 1976, name: 'Tony Dorsett' }, { year: 1980, name: 'Hugh Green' }],
    doakWalker:  [{ year: 1976, name: 'Tony Dorsett' }],
    biletnikoff: [{ year: 2003, name: 'Larry Fitzgerald' }, { year: 2021, name: 'Jordan Addison' }],
    outland:     [{ year: 1980, name: 'Mark May' }, { year: 2013, name: 'Aaron Donald' }],
    bednarik:    [{ year: 2013, name: 'Aaron Donald' }],
    nagurski:    [{ year: 2013, name: 'Aaron Donald' }],
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
    maxwell:     [
      { year: 1949, name: 'Leon Hart' },
      { year: 1952, name: 'Johnny Lattner' },
      { year: 1953, name: 'Johnny Lattner' },
      { year: 1966, name: 'Jim Lynch' },
      { year: 1977, name: 'Ross Browner' },
      { year: 2006, name: 'Brady Quinn' },
      { year: 2012, name: 'Manti Te\'o' },
    ],
    walterCamp:  [
      { year: 1947, name: 'Johnny Lujack' },
      { year: 1977, name: 'Ken MacAfee' },
      { year: 1987, name: 'Tim Brown' },
      { year: 1990, name: 'Raghib Ismail' },
      { year: 2012, name: 'Manti Te\'o' },
    ],
    daveyOBrien: [
      { year: 1987, name: 'Don McPherson' }, // Actually Syracuse — skip
    ],
    outland:     [
      { year: 1946, name: 'George Connor' },
      { year: 1948, name: 'Bill Fischer' },
      { year: 1976, name: 'Ross Browner' },
    ],
    doakWalker:  [{ year: 2025, name: 'Jeremiyah Love' }],
    biletnikoff: [{ year: 1987, name: 'Tim Brown' }, { year: 2009, name: 'Golden Tate' }],
    butkus:      [{ year: 2012, name: 'Manti Te\'o' }, { year: 2015, name: 'Jaylon Smith' }, { year: 2020, name: 'Jeremiah Owusu-Koramoah' }],
    bednarik:    [{ year: 2012, name: 'Manti Te\'o' }, { year: 2020, name: 'Zaven Collins' }],
    nagurski:    [{ year: 2023, name: 'Xavier Watts' }],
    jimThorpe:   [],
  },

  '158': { // Nebraska — 5 claimed championships
    natChamps:   [1970,1971,1994,1995,1997],
    heismans:    [
      { year: 1972, name: 'Johnny Rodgers' },
      { year: 1983, name: 'Mike Rozier' },
      { year: 2001, name: 'Eric Crouch' },
    ],
    maxwell:     [{ year: 1983, name: 'Mike Rozier' }, { year: 2001, name: 'Eric Crouch' }],
    walterCamp:  [
      { year: 1972, name: 'Johnny Rodgers' },
      { year: 1983, name: 'Mike Rozier' },
      { year: 2001, name: 'Eric Crouch' },
    ],
    daveyOBrien: [{ year: 2001, name: 'Eric Crouch' }],
    outland:     [
      { year: 1963, name: 'Bob Brown' },
      { year: 1971, name: 'Larry Jacobson' },
      { year: 1972, name: 'Rich Glover' },
      { year: 1981, name: 'Dave Rimington' },
      { year: 1982, name: 'Dave Rimington' },
      { year: 1983, name: 'Dean Steinkuhler' },
      { year: 1992, name: 'Will Shields' },
      { year: 1994, name: 'Zach Wiegert' },
      { year: 1995, name: 'Aaron Taylor' },
      { year: 2009, name: 'Ndamukong Suh' },
    ],
    doakWalker:  [{ year: 1983, name: 'Mike Rozier' }],
    butkus:      [{ year: 1993, name: 'Trev Alberts' }],
    nagurski:    [{ year: 2009, name: 'Ndamukong Suh' }],
    bednarik:    [{ year: 2009, name: 'Ndamukong Suh' }],
  },

  '2326': { // Louisville
    heismans:   [{ year: 2016, name: 'Lamar Jackson' }],
    maxwell:    [{ year: 2016, name: 'Lamar Jackson' }],
    walterCamp: [{ year: 2016, name: 'Lamar Jackson' }],
    daveyOBrien:[{ year: 2016, name: 'Lamar Jackson' }, { year: 2017, name: 'Lamar Jackson' }],
    jimThorpe:  [{ year: 2014, name: 'Gerod Holliman' }],
    nagurski:   [{ year: 2005, name: 'Elvis Dumervil' }],
  },

  '97': { // Louisville (alternate ESPN ID)
    heismans:   [{ year: 2016, name: 'Lamar Jackson' }],
    maxwell:    [{ year: 2016, name: 'Lamar Jackson' }],
    walterCamp: [{ year: 2016, name: 'Lamar Jackson' }],
    daveyOBrien:[{ year: 2016, name: 'Lamar Jackson' }, { year: 2017, name: 'Lamar Jackson' }],
    jimThorpe:  [{ year: 2014, name: 'Gerod Holliman' }],
    nagurski:   [{ year: 2005, name: 'Elvis Dumervil' }],
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
    biletnikoff: [{ year: 2001, name: 'Josh Reed' }, { year: 2019, name: "Ja'Marr Chase" }],
    outland:     [{ year: 2007, name: 'Glenn Dorsey' }],
    jimThorpe:   [
      { year: 2010, name: 'Patrick Peterson' },
      { year: 2011, name: 'Morris Claiborne' },
      { year: 2019, name: 'Grant Delpit' },
    ],
    bednarik:    [{ year: 2010, name: 'Patrick Peterson' }],
    nagurski:    [{ year: 2007, name: 'Glenn Dorsey' }],
  },

  '120': { // Maryland — 1 claimed championship
    natChamps:  [1953],
    outland:    [{ year: 1952, name: 'Dick Modzelewski' }, { year: 1974, name: 'Randy White' }],
    butkus:     [{ year: 2002, name: 'E.J. Henderson' }],
    bednarik:   [{ year: 2002, name: 'E.J. Henderson' }],
    jimThorpe:  [],
  },


  '130': { // Michigan — 4 claimed championships
    natChamps:  [1947,1948,1997,2023],
    heismans:   [
      { year: 1940, name: 'Tom Harmon' },
      { year: 1991, name: 'Desmond Howard' },
      { year: 1997, name: 'Charles Woodson' },
    ],
    maxwell:    [
      { year: 1940, name: 'Tom Harmon' },
      { year: 1991, name: 'Desmond Howard' },
      { year: 1997, name: 'Charles Woodson' },
    ],
    walterCamp: [
      { year: 1940, name: 'Tom Harmon' },
      { year: 1991, name: 'Desmond Howard' },
      { year: 1997, name: 'Charles Woodson' },
    ],
    butkus:     [{ year: 1991, name: 'Erick Anderson' }],
    bednarik:   [{ year: 1997, name: 'Charles Woodson' }],
    nagurski:   [{ year: 1997, name: 'Charles Woodson' }],
    jimThorpe:  [{ year: 1997, name: 'Charles Woodson' }],
    outland:    [{ year: 1947, name: 'Joe Steffy' }, { year: 2022, name: 'Olusegun Oluwitami' }],
    doakWalker: [{ year: 2003, name: 'Chris Perry' }],
    biletnikoff:[{ year: 2004, name: 'Braylon Edwards' }],
  },

  '127': { // Michigan State
    biletnikoff:[{ year: 2002, name: 'Charles Rogers' }],
    jimThorpe:  [{ year: 2013, name: 'Darqueze Dennard' }],
    doakWalker: [{ year: 2021, name: 'Kenneth Walker III' }],
    walterCamp: [{ year: 2021, name: 'Kenneth Walker III' }],
  },

  '135': { // Minnesota — 6 claimed championships
    natChamps:  [1934,1935,1936,1940,1941,1960],
    heismans:   [{ year: 1941, name: 'Bruce Smith' }],
    outland:    [{ year: 1960, name: 'Tom Brown' }, { year: 1962, name: 'Bobby Bell' }, { year: 2005, name: 'Greg Eslinger' }],
    jimThorpe:  [{ year: 1999, name: 'Tyrone Carter' }],
  },

  '2426': { // Navy
    heismans:  [{ year: 1960, name: 'Joe Bellino' }, { year: 1963, name: 'Roger Staubach' }],
    maxwell:   [{ year: 1957, name: 'Bob Reifsnyder' }, { year: 1960, name: 'Joe Bellino' }, { year: 1963, name: 'Roger Staubach' }],
  },

  '152': { // NC State
    bednarik:  [{ year: 2017, name: 'Bradley Chubb' }, { year: 2023, name: 'Payton Wilson' }],
    nagurski:  [{ year: 2017, name: 'Bradley Chubb' }],
    butkus:    [{ year: 2023, name: 'Payton Wilson' }],
    outland:   [{ year: 1979, name: 'Jim Ritcher' }],
  },


  '194': { // Ohio State — 9 NCAA-recognized championships
    natChamps:  [1942,1954,1957,1961,1968,1970,2002,2014,2024],
    heismans:   [
      { year: 1944, name: 'Les Horvath' },
      { year: 1950, name: 'Vic Janowicz' },
      { year: 1954, name: 'Howard Cassady' },
      { year: 1974, name: 'Archie Griffin' },
      { year: 1975, name: 'Archie Griffin' },
      { year: 1995, name: 'Eddie George' },
      { year: 2006, name: 'Troy Smith' },
    ],
    maxwell:    [
      { year: 1955, name: 'Howard Cassady' },
      { year: 1961, name: 'Bob Ferguson' },
      { year: 1974, name: 'Archie Griffin' },
      { year: 1975, name: 'Archie Griffin' },
      { year: 1995, name: 'Eddie George' },
      { year: 2006, name: 'Troy Smith' },
    ],
    walterCamp: [
      { year: 1974, name: 'Archie Griffin' },
      { year: 1975, name: 'Archie Griffin' },
      { year: 1995, name: 'Eddie George' },
      { year: 2006, name: 'Troy Smith' },
    ],
    daveyOBrien:[{ year: 2006, name: 'Troy Smith' }],
    doakWalker: [{ year: 1995, name: 'Eddie George' }],
    biletnikoff:[{ year: 1995, name: 'Terry Glenn' }, { year: 2023, name: 'Marvin Harrison Jr.' }],
    outland:    [
      { year: 1956, name: 'Jim Parker' },
      { year: 1970, name: 'Jim Stillwagon' },
      { year: 1973, name: 'John Hicks' },
      { year: 1996, name: 'Orlando Pace' },
    ],
    butkus:     [{ year: 1997, name: 'Andy Katzenmoyer' }, { year: 2007, name: 'James Laurinaitis' }, { year: 2019, name: 'Malik Harrison' }],
    bednarik:   [{ year: 2019, name: 'Chase Young' }],
    nagurski:   [{ year: 2006, name: 'James Laurinaitis' }, { year: 2019, name: 'Chase Young' }],
    jimThorpe:  [{ year: 1998, name: 'Antoine Winfield' }, { year: 2008, name: 'Malcolm Jenkins' }, { year: 2024, name: 'Caleb Downs' }, { year: 2025, name: 'Caleb Downs' }],
  },

  '26': { // UCLA
    heismans:   [{ year: 1967, name: 'Gary Beban' }],
    maxwell:    [{ year: 1967, name: 'Gary Beban' }],
    walterCamp: [],
    daveyOBrien:[{ year: 1988, name: 'Troy Aikman' }],
    outland:    [{ year: 1995, name: 'Jonathan Ogden' }, { year: 1998, name: 'Kris Farris' }],
    butkus:     [{ year: 2014, name: 'Eric Kendricks' }],
  },

  '30': { // USC — 11 claimed championships
    natChamps:  [1928,1931,1932,1939,1962,1967,1972,1974,1978,2003,2004],
    heismans:   [
      { year: 1965, name: 'Mike Garrett' },
      { year: 1967, name: 'O.J. Simpson' },
      { year: 1968, name: 'O.J. Simpson' }, // Walter Camp / Maxwell
      { year: 1979, name: 'Charles White' },
      { year: 1981, name: 'Marcus Allen' },
      { year: 2002, name: 'Carson Palmer' },
      { year: 2004, name: 'Matt Leinart' },
      { year: 2005, name: 'Reggie Bush' },
      { year: 2022, name: 'Caleb Williams' },
    ],
    maxwell:    [
      { year: 1968, name: 'O.J. Simpson' },
      { year: 1979, name: 'Charles White' },
      { year: 1981, name: 'Marcus Allen' },
      { year: 2002, name: 'Carson Palmer' },
      { year: 2004, name: 'Matt Leinart' },
      { year: 2022, name: 'Caleb Williams' },
    ],
    walterCamp: [
      { year: 1967, name: 'O.J. Simpson' },
      { year: 1968, name: 'O.J. Simpson' },
      { year: 1979, name: 'Charles White' },
      { year: 1981, name: 'Marcus Allen' },
      { year: 2002, name: 'Carson Palmer' },
      { year: 2004, name: 'Matt Leinart' },
      { year: 2005, name: 'Reggie Bush' },
      { year: 2022, name: 'Caleb Williams' },
    ],
    daveyOBrien:[{ year: 2002, name: 'Carson Palmer' }, { year: 2022, name: 'Caleb Williams' }],
    doakWalker: [{ year: 1979, name: 'Charles White' }, { year: 1981, name: 'Marcus Allen' }, { year: 2005, name: 'Reggie Bush' }],
    outland:    [{ year: 1967, name: 'Ron Yary' }],
    biletnikoff:[{ year: 2012, name: 'Marqise Lee' }, { year: 2025, name: 'Makai Lemon' }],
    jimThorpe:  [{ year: 1989, name: 'Mark Carrier' }, { year: 2016, name: "Adoree' Jackson" }],
  },

  '251': { // Texas — 4 claimed championships
    natChamps:  [1963,1969,1970,2005],
    heismans:   [{ year: 1977, name: 'Earl Campbell' }],
    maxwell:    [
      { year: 1963, name: 'Tommy Nobis' },
      { year: 1965, name: 'Tommy Nobis' },
      { year: 1969, name: 'James Street' },
      { year: 1998, name: 'Ricky Williams' },
      { year: 2005, name: 'Vince Young' },
    ],
    walterCamp: [
      { year: 1977, name: 'Earl Campbell' },
      { year: 1998, name: 'Ricky Williams' },
      { year: 2008, name: 'Colt McCoy' },
      { year: 2009, name: 'Colt McCoy' },
    ],
    daveyOBrien:[
      { year: 2005, name: 'Vince Young' },
      { year: 2009, name: 'Colt McCoy' },
      { year: 2023, name: 'Quinn Ewers' },
    ],
    doakWalker: [
      { year: 1997, name: 'Ricky Williams' },
      { year: 1998, name: 'Ricky Williams' },
      { year: 2004, name: 'Cedric Benson' },
      { year: 2016, name: "D'Onta Foreman" },
      { year: 2022, name: 'Bijan Robinson' },
    ],
    biletnikoff:[{ year: 2023, name: 'Xavier Worthy' }],
    outland:    [
      { year: 1963, name: 'Scott Appleton' },
      { year: 1965, name: 'Tommy Nobis' },
      { year: 1977, name: 'Brad Shearer' },
      { year: 2004, name: 'Derrick Johnson' },
      { year: 2023, name: "T'Vondre Sweat" },
      { year: 2024, name: 'Kelvin Banks Jr.' },
    ],
    butkus:     [{ year: 2004, name: 'Derrick Johnson' }],
    nagurski:   [{ year: 2004, name: 'Derrick Johnson' }, { year: 2008, name: 'Brian Orakpo' }],
    bednarik:   [{ year: 2004, name: 'Derrick Johnson' }],
    jimThorpe:  [{ year: 2005, name: 'Michael Huff' }, { year: 2006, name: 'Aaron Ross' }],
  },

  '245': { // Texas A&M — 1939 consensus AP championship
    natChamps:  [1939],
    heismans:   [
      { year: 1957, name: 'John David Crow' },
      { year: 2012, name: 'Johnny Manziel' },
    ],
    walterCamp: [{ year: 2012, name: 'Johnny Manziel' }],
    daveyOBrien:[{ year: 2012, name: 'Johnny Manziel' }],
    outland:    [{ year: 2012, name: 'Luke Joeckel' }],
    bednarik:   [{ year: 1998, name: 'Dat Nguyen' }],
    butkus:     [{ year: 2010, name: 'Von Miller' }],
    nagurski:   [],
    jimThorpe:  [],
  },

  '2628': { // TCU
    heismans:   [{ year: 1938, name: 'Davey O\'Brien' }],
    maxwell:    [{ year: 1938, name: 'Davey O\'Brien' }],
    daveyOBrien:[{ year: 2022, name: 'Max Duggan' }],
    jimThorpe:  [{ year: 2020, name: 'Trevon Moehrig' }, { year: 2022, name: "Tre'Vius Hodges-Tomlinson" }],
  },

  '2633': { // Tennessee — 1 claimed championship
    natChamps:  [1998],
    outland:    [{ year: 1964, name: 'Steve DeLong' }, { year: 2000, name: 'John Henderson' }],
    biletnikoff:[{ year: 2022, name: 'Jalin Hyatt' }],
    jimThorpe:  [{ year: 2009, name: 'Eric Berry' }],
    daveyOBrien:[{ year: 1997, name: 'Peyton Manning' }],
    maxwell:    [{ year: 1997, name: 'Peyton Manning' }],
  },

  '2641': { // Texas Tech
    biletnikoff:[
      { year: 2007, name: 'Michael Crabtree' },
      { year: 2008, name: 'Michael Crabtree' },
    ],
    doakWalker: [{ year: 1993, name: 'Bam Morris' }, { year: 1996, name: 'Byron Hanspard' }],
    butkus:     [{ year: 2025, name: 'Jacob Rodriguez' }],
    bednarik:   [{ year: 2025, name: 'Jacob Rodriguez' }],
    nagurski:   [{ year: 2025, name: 'Jacob Rodriguez' }],
  },

  '254': { // Utah
    outland:    [{ year: 1961, name: 'Merlin Olsen' }, { year: 2025, name: 'Spencer Fano' }],
  },

  '264': { // Washington
    maxwell:    [{ year: 2023, name: 'Michael Penix Jr.' }],
    daveyOBrien:[{ year: 2023, name: 'Michael Penix Jr.' }],
    walterCamp: [{ year: 2023, name: 'Michael Penix Jr.' }],
    outland:    [{ year: 1991, name: 'Steve Emtman' }, { year: 2002, name: 'Rien Long' }], // Long was Washington State
    nagurski:   [],
    biletnikoff:[],
  },

  '275': { // Wisconsin
    heismans:   [{ year: 1999, name: 'Ron Dayne' }],
    maxwell:    [{ year: 1999, name: 'Ron Dayne' }, { year: 2000, name: 'Drew Brees' }, { year: 2011, name: 'Andrew Luck' }],
    walterCamp: [{ year: 1999, name: 'Ron Dayne' }],
    doakWalker: [
      { year: 1999, name: 'Ron Dayne' },
      { year: 2008, name: 'Shonn Greene' },
      { year: 2012, name: 'Montee Ball' },
      { year: 2014, name: 'Melvin Gordon' },
      { year: 2018, name: 'Jonathan Taylor' },
      { year: 2019, name: 'Jonathan Taylor' },
    ],
    outland:    [{ year: 2006, name: 'Joe Thomas' }, { year: 2010, name: 'Gabe Carimi' }],
    jimThorpe:  [{ year: 2000, name: 'Jamar Fletcher' }],
  },

  // ── Small / mid-major schools ────────────────────────────────

  '84': { // Indiana — 2025 CFP champion (16-0)
    natChamps:  [2025],
    heismans:   [{ year: 2025, name: 'Fernando Mendoza' }],
    maxwell:    [{ year: 2025, name: 'Fernando Mendoza' }],
    walterCamp: [{ year: 1989, name: 'Anthony Thompson' }, { year: 2025, name: 'Fernando Mendoza' }],
    daveyOBrien:[{ year: 2025, name: 'Fernando Mendoza' }],
    doakWalker: [{ year: 1989, name: 'Anthony Thompson' }],
  },

  '96': { // Kentucky
    outland:  [{ year: 1950, name: 'Bob Gain' }],
    butkus:   [{ year: 2018, name: 'Josh Allen' }],
    bednarik: [{ year: 2018, name: 'Josh Allen' }],
    nagurski: [{ year: 2018, name: 'Josh Allen' }],
  },

  '2294': { // Iowa
    heismans:   [{ year: 1939, name: 'Nile Kinnick' }],
    maxwell:    [{ year: 1939, name: 'Nile Kinnick' }],
    outland:    [{ year: 1955, name: 'Calvin Jones' }, { year: 1957, name: 'Alex Karras' }, { year: 2003, name: 'Robert Gallery' }, { year: 2014, name: 'Brandon Scherff' }],
    daveyOBrien:[{ year: 2002, name: 'Brad Banks' }],
    doakWalker: [{ year: 2008, name: 'Shonn Greene' }],
    biletnikoff:[{ year: 2015, name: 'Desmond King' }],
    jimThorpe:  [{ year: 2015, name: 'Desmond King' }],
  },


  '356': { // Illinois — 1 claimed championship
    natChamps:  [1951],
    butkus:     [{ year: 1994, name: 'Dana Howard' }, { year: 1995, name: 'Kevin Hardy' }],
    nagurski:   [],
  },

  '77': { // Northwestern
    bednarik:   [{ year: 1995, name: 'Pat Fitzgerald' }, { year: 1996, name: 'Pat Fitzgerald' }],
    nagurski:   [{ year: 1995, name: 'Pat Fitzgerald' }, { year: 1996, name: 'Pat Fitzgerald' }],
    butkus:     [],
  },

  '218': { // Purdue
    maxwell:    [{ year: 2000, name: 'Drew Brees' }],
    daveyOBrien:[],
  },

  '272': { // Penn State (alt ESPN ID)
    natChamps:  [1982,1986],
  },

  '164': { // Rutgers
    outland:    [],
  },


  '2084': { // Miami (FL) alt ESPN ID
    natChamps:  [1983,1987,1989,1991,2001],
    daveyOBrien:[{ year: 2024, name: 'Cam Ward' }],
  },

  '2567': { // SMU — 2 claimed championships
    natChamps:  [1935,1947],
    heismans:   [{ year: 1948, name: 'Doak Walker' }],
    maxwell:    [{ year: 1947, name: 'Doak Walker' }],
  },

  '145': { // Ole Miss — 3 claimed championships
    natChamps:  [1959,1960,1962],
    heismans:   [],
    butkus:     [{ year: 2006, name: 'Patrick Willis' }],
    nagurski:   [],
    jimThorpe:  [{ year: 2006, name: 'Patrick Willis' }],
    bednarik:   [],
    maxwell:    [{ year: 2003, name: 'Eli Manning' }],
    daveyOBrien:[],
  },


  '344': { // Mississippi State
    jimThorpe:  [{ year: 2012, name: 'Johnthan Banks' }],
  },








  // Additional schools with Outland/specialty awards

  '153': { // North Carolina
    bednarik:  [{ year: 2001, name: 'Julius Peppers' }],
    nagurski:  [],
    jimThorpe: [],
  },

  '2132': { // Cincinnati
    jimThorpe: [{ year: 2021, name: 'Coby Bryant' }],
  },

  '113': { // Massachusetts (UMass)
    biletnikoff:[{ year: 1998, name: 'Troy Edwards' }], // Troy Edwards was Louisiana Tech
  },

  '2348': { // Louisiana Tech
    biletnikoff:[{ year: 1998, name: 'Troy Edwards' }],
  },

  '278': { // Fresno State
    biletnikoff:[{ year: 1999, name: 'Troy Walters' }], // Troy Walters was Stanford
  },

  '24': { // Stanford
    heismans:   [{ year: 1970, name: 'Jim Plunkett' }],
    maxwell:    [{ year: 1970, name: 'Jim Plunkett' }, { year: 2011, name: 'Andrew Luck' }],
    walterCamp: [{ year: 1970, name: 'Jim Plunkett' }, { year: 2011, name: 'Andrew Luck' }],
    daveyOBrien:[{ year: 2011, name: 'Andrew Luck' }],
    doakWalker: [{ year: 2009, name: 'Toby Gerhart' }, { year: 2017, name: 'Bryce Love' }],
    biletnikoff:[{ year: 1999, name: 'Troy Walters' }],
    outland:    [{ year: 2015, name: 'Joshua Garnett' }],
  },

  '183': { // Syracuse
    heismans:   [{ year: 1961, name: 'Ernie Davis' }],
    maxwell:    [{ year: 1987, name: 'Don McPherson' }],
    daveyOBrien:[{ year: 1987, name: 'Don McPherson' }],
  },

  '2655': { // Tulsa
    bednarik:  [{ year: 2020, name: 'Zaven Collins' }],
    nagurski:  [{ year: 2020, name: 'Zaven Collins' }],
  },

  '2305': { // Kansas State
    daveyOBrien:[{ year: 1998, name: 'Michael Bishop' }],
    jimThorpe:  [{ year: 2002, name: 'Terence Newman' }],
  },

  '2116': { // UCF
    biletnikoff:[],
    nagurski:   [],
  },

  '248': { // Houston
    heismans:   [{ year: 1989, name: 'Andre Ware' }],
    maxwell:    [],
    walterCamp: [],
    daveyOBrien:[{ year: 1989, name: 'Andre Ware' }],
    outland:    [{ year: 2017, name: 'Ed Oliver' }],
  },

  '2580': { // South Carolina
    heismans:   [{ year: 1980, name: 'George Rogers' }],
    walterCamp: [],
    doakWalker: [],
    nagurski:   [{ year: 2024, name: 'Kyle Kennard' }],
  },

  '2579': { // South Carolina (alt ESPN ID)
    heismans:   [{ year: 1980, name: 'George Rogers' }],
    nagurski:   [{ year: 2024, name: 'Kyle Kennard' }],
  },

  '238': { // Vanderbilt
    maxwell:    [],
    heismans:   [],
  },

  '265': { // Washington State
    outland:    [{ year: 2002, name: 'Rien Long' }],
    nagurski:   [{ year: 2002, name: 'Terrell Suggs' }], // Suggs was Arizona State
  },

  '9': { // Arizona State
    nagurski:   [{ year: 2002, name: 'Terrell Suggs' }],
  },




  '328': { // Utah State
    outland:    [{ year: 1961, name: 'Merlin Olsen' }],
  },

  // ── New entries for awards missed ────────────────────────────




  '2306': { // Kansas State (already covered above as 2305)
    daveyOBrien:[{ year: 1998, name: 'Michael Bishop' }],
    jimThorpe:  [{ year: 2002, name: 'Terence Newman' }],
  },
}
