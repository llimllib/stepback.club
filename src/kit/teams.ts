export interface Team {
  abbreviation: string
  name: string
  colors: string[]
  comment?: string

  // if present, represents the abbreviation that bbref uses for the team
  bbrefAbbrev?: string

  // if present, represents the name that cleaning the glass uses for the team
  ctgName?: string

  // if present, the name ESPN uses for the team
  espnName?: string

  // a pair representing the years the team were active, [start, end]
  // Inclusive, and use the end year of a season, so the 2014-15 season would
  // be "2015". If a team is currently active, a single year represents the
  // year they started playing
  years?: [string, string] | [string]
}

export const teams: Map<string, Team> = new Map([
  [
    "ATL",
    {
      abbreviation: "ATL",
      colors: ["#C8102E", "#FDB927", "#000000", "#9EA2A2"],
      ctgName: "Atlanta",
      name: "Atlanta Hawks",
    },
  ],
  [
    "BOS",
    {
      abbreviation: "BOS",
      colors: ["#008348", "#BB9753", "#000000", "#A73832", "#FFFFFF"],
      ctgName: "Boston",
      name: "Boston Celtics",
    },
  ],
  [
    "BKN",
    {
      abbreviation: "BKN",
      bbrefAbbrev: "BRK",
      colors: ["#000000", "#FFFFFF", "#707271"],
      ctgName: "Brooklyn",
      espnName: "BRK",
      name: "Brooklyn Nets",
    },
  ],
  // In the data on nba,
  [
    "CHAB",
    {
      abbreviation: "CHA",
      colors: ["#f26532", "#2f598c", "#959da0"],
      name: "Charlotte Bobcats",
      years: ["2005", "2014"],
    },
  ],
  [
    "CHI",
    {
      abbreviation: "CHI",
      name: "Chicago Bulls",
      colors: ["#CE1141", "#000000"],
      ctgName: "Chicago",
    },
  ],
  [
    "CHA",
    {
      abbreviation: "CHA",
      colors: ["#00788C", "#1D1160", "#A1A1A4", "#FFFFFF"],
      bbrefAbbrev: "CHO",
      ctgName: "Charlotte",
      name: "Charlotte Hornets",
    },
  ],
  [
    "CLE",
    {
      abbreviation: "CLE",
      colors: ["#6F263D", "#FFB81C", "#041E42", "#000000"],
      ctgName: "Cleveland",
      name: "Cleveland Cavaliers",
    },
  ],
  [
    "DAL",
    {
      abbreviation: "DAL",
      // navy first: the royal blue is Orlando's, and their dots matched
      colors: ["#00285E", "#BBC4CA", "#0064B1", "#000000"],
      ctgName: "Dallas",
      name: "Dallas Mavericks",
    },
  ],
  [
    "DEN",
    {
      abbreviation: "DEN",
      colors: ["#0E2240", "#FEC524", "#8B2131", "#244289"],
      ctgName: "Denver",
      name: "Denver Nuggets",
    },
  ],
  [
    "DET",
    {
      abbreviation: "DET",
      colors: ["#1D428A", "#C8102E", "#BEC0C2", "#000000", "#FFFFFF"],
      ctgName: "Detroit",
      name: "Detroit Pistons",
    },
  ],
  [
    "GSW",
    {
      abbreviation: "GSW",
      colors: ["#1D428A", "#FDB927"],
      ctgName: "Golden State",
      name: "Golden State Warriors",
    },
  ],
  [
    "HOU",
    {
      abbreviation: "HOU",
      colors: ["#CE1141", "#9EA2A2", "#000000", "#373A36", "#FFFFFF"],
      ctgName: "Houston",
      name: "Houston Rockets",
    },
  ],
  [
    "IND",
    {
      abbreviation: "IND",
      colors: ["#BEC0C2", "#FDBB30", "#002D62"],
      ctgName: "Indiana",
      name: "Indiana Pacers",
    },
  ],
  [
    "LAC",
    {
      abbreviation: "LAC",
      ctgName: "LA Clippers",
      colors: ["#C8102E", "#1D428A", "#000000", "#BEC0C2", "#FFFFFF"],
      name: "Los Angeles Clippers",
    },
  ],
  [
    "LAL",
    {
      abbreviation: "LAL",
      ctgName: "LA Lakers",
      colors: ["#552583", "#FDB927", "#000000"],
      name: "Los Angeles Lakers",
    },
  ],
  [
    "MEM",
    {
      abbreviation: "MEM",
      ctgName: "Memphis",
      colors: ["#5D76A9", "#12173F", "#707271", "#F5B112"],
      name: "Memphis Grizzlies",
    },
  ],
  [
    "MIA",
    {
      abbreviation: "MIA",
      ctgName: "Miami",
      colors: ["#000000", "#98002E", "#F9A01B"],
      name: "Miami Heat",
    },
  ],
  [
    "MIL",
    {
      abbreviation: "MIL",
      ctgName: "Milwaukee",
      // moved secondary to tertiary bc it matches the bg
      colors: ["#00471B", "#0077C0", "#EEE1C6", "#000000", "#FFFFFF"],
      name: "Milwaukee Bucks",
    },
  ],
  [
    "MIN",
    {
      abbreviation: "MIN",
      ctgName: "Minnesota",
      colors: ["#0C2340", "#78BE20", "#236192", "#9EA2A2", "#FFFFFF"],
      name: "Minnesota Timberwolves",
    },
  ],
  [
    "NJN",
    {
      abbreviation: "NJN",
      colors: ["#000000", "#FFFFFF", "#707271"],
      name: "New Jersey Nets",
    },
  ],
  [
    "NOH",
    {
      abbreviation: "NOH",
      colors: ["#00788C", "#1D1160", "#A1A1A4", "#FFFFFF"],
      name: "New Orleans Hornets",
      years: ["2003", "2014"],
    },
  ],
  [
    "NOP",
    {
      abbreviation: "NOP",
      ctgName: "New Orleans",
      colors: ["#0A2240", "#8C734B", "#CE0E2D"],
      espnName: "NOR",
      name: "New Orleans Pelicans",
      years: ["2014"],
    },
  ],
  [
    "NYK",
    {
      abbreviation: "NYK",
      ctgName: "New York",
      colors: ["#006BB6", "#F58426", "#BEC0C2", "#000000", "#FFFFFF"],
      name: "New York Knicks",
    },
  ],
  [
    "OKC",
    {
      abbreviation: "OKC",
      ctgName: "Oklahoma City",
      colors: ["#007AC1", "#EF3B24", "#FDBB30", "#002D62"],
      name: "Oklahoma City Thunder",
    },
  ],
  [
    "ORL",
    {
      abbreviation: "ORL",
      ctgName: "Orlando",
      colors: ["#0077C0", "#000000", "#C4CED4"],
      name: "Orlando Magic",
    },
  ],
  [
    "PHI",
    {
      abbreviation: "PHI",
      colors: [
        "#006BB6",
        "#C4CED4",
        "#ED174C",
        "#000000",
        "#002B5C",
        "#FFFFFF",
      ],
      ctgName: "Philadelphia",
      name: "Philadelphia 76ers",
    },
  ],
  [
    "PHX",
    {
      abbreviation: "PHX",
      bbrefAbbrev: "PHO",
      colors: ["#1D1160", "#E56020", "#000000", "#63727A", "#F9A01B"],
      ctgName: "Phoenix",
      espnName: "PHO",
      name: "Phoenix Suns",
    },
  ],
  [
    "POR",
    {
      abbreviation: "POR",
      ctgName: "Portland",
      colors: ["#E03A3E", "#FFFFFF", "#000000"],
      name: "Portland Trailblazers",
    },
  ],
  [
    "SAC",
    {
      abbreviation: "SAC",
      ctgName: "Sacramento",
      colors: ["#5A2B81", "#63727A", "#000000"],
      name: "Sacramento Kings",
    },
  ],
  [
    "SAS",
    {
      abbreviation: "SAS",
      ctgName: "San Antonio",
      espnName: "SAN",
      colors: ["#000000", "#C4CED4"],
      name: "San Antonio Spurs",
    },
  ],
  [
    "TOR",
    {
      abbreviation: "TOR",
      ctgName: "Toronto",
      colors: ["#CE1141", "#000000", "#393A96", "#B4975A", "#FFFFFF"],
      name: "Toronto Raptors",
    },
  ],
  [
    "TOT",
    {
      abbreviation: "TOT",
      name: "Season Total",
      comment:
        "bbref uses TOT to indicate a player's season total if they were on more than one team",
      colors: ["#888888", "#888888"],
    },
  ],
  [
    "UTA",
    {
      abbreviation: "UTA",
      ctgName: "Utah",
      colors: ["#F9A01B", "#00471B", "#002B5C"],
      name: "Utah Jazz",
    },
  ],
  [
    "WAS",
    {
      abbreviation: "WAS",
      ctgName: "Washington",
      colors: ["#002B5C", "#E31837", "#C4CED4", "#FFFFFF"],
      name: "Washington Wizards",
    },
  ],
])

function findTeam(abbrev: string): Team {
  const team = [...teams.values()].find(
    t => t.abbreviation === abbrev || t.espnName === abbrev,
  )
  if (!team) {
    throw new Error(`unable to find team ${abbrev}`)
  }
  return team
}

export function espnAbbrev(abbrev: string): string {
  const t = findTeam(abbrev)
  // for some reason, the ESPN utah jazz logo is utah.png not anything related to the team abbreviation, so special case it
  if (t.abbreviation === "UTA") return "utah"
  return t.espnName || t.abbreviation
}

/* normalize an ESPN abbreviation into our abbreviation */
export function normalizeESPN(abbrev: string): string {
  return findTeam(abbrev).abbreviation
}
