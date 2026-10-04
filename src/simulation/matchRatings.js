const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

/** Match performance rating, calculated only when an actual match stat changes. */
export function calculateMatchRating(line, player) {
  const role = player.isGoalkeeper ? 'GOALKEEPER' : player.role
  const passes = line.passesAttempted ?? 0
  const passAccuracy = passes ? (line.passesCompleted ?? 0) / passes : 0.72
  const shots = line.shots ?? 0
  const shotAccuracy = shots ? (line.shotsOnTarget ?? 0) / shots : 0
  const dribbles = line.dribbles ?? 0
  const dribbleSuccess = dribbles ? (line.successfulDribbles ?? 0) / dribbles : 0
  const tackles = line.tackles ?? 0
  const outfieldBase = role.startsWith('DEFENDER') ? 6.25 : role === 'ATTACKER' ? 6.2 : 6.25
  const root = value => Math.sqrt(Math.max(0, value))

  let rating
  if (player.isGoalkeeper) {
    rating = 6.2 + root(line.saves ?? 0) * 0.34 + root(line.claims ?? 0) * 0.12 + root(line.distributionCompletions ?? 0) * 0.04
      - (line.goalsConceded ?? 0) * 0.32
      + ((line.distributionPasses ?? 0) ? ((line.distributionCompletions ?? 0) / line.distributionPasses - 0.7) * 0.5 : 0)
  } else {
    const defensive = role.startsWith('DEFENDER')
    rating = outfieldBase
      + (line.goals ?? 0) * (defensive ? 0.5 : 0.62)
      + root(line.assists ?? 0) * 0.5
      + root(line.keyPasses ?? 0) * (defensive ? 0.14 : 0.19)
      + root(line.successfulThroughBalls ?? 0) * 0.1
      + root(line.successfulLongBalls ?? 0) * 0.07
      + root(line.successfulDribbles ?? 0) * (defensive ? 0.055 : 0.1)
      + root(line.successfulTackles ?? 0) * (defensive ? 0.11 : 0.055)
      + root(line.interceptions ?? 0) * (defensive ? 0.1 : 0.045)
      + root(line.blocks ?? 0) * (defensive ? 0.17 : 0.07)
      + root(line.recoveries ?? 0) * (defensive ? 0.07 : 0.035)
      + root(line.shotsOnTarget ?? 0) * 0.09
      + root(Math.min(passes, 40)) * 0.045
      + (passAccuracy - 0.7) * 0.8
      + (shotAccuracy - 0.32) * root(Math.min(shots, 5)) * 0.12
      - root(line.possessionLosses ?? 0) * 0.12
      - root(dribbles - (line.successfulDribbles ?? 0)) * 0.08
      - root(tackles - (line.successfulTackles ?? 0)) * (defensive ? 0.045 : 0.025)
      - (line.goalsConceded ?? 0) * (defensive ? 0.04 : 0.01)
  }
  return Math.round(clamp(rating, 1, 10) * 10) / 10
}

export function updateMatchRating(match, player) {
  const line = match.statistics?.players?.[player.id]
  if (line) line.rating = calculateMatchRating(line, player)
}

export function playerOfTheMatch(match) {
  const players = [...match.players, ...(match.opponents ?? []), ...Object.values(match.goalkeepers ?? {})]
  return players.map(player => ({ player, stats: match.statistics.players[player.id] }))
    .sort((a, b) => (b.stats?.rating ?? 6.2) - (a.stats?.rating ?? 6.2)
      || (b.stats?.goals ?? 0) - (a.stats?.goals ?? 0)
      || (b.stats?.assists ?? 0) - (a.stats?.assists ?? 0)
      || ((b.stats?.successfulTackles ?? 0) + (b.stats?.interceptions ?? 0) + (b.stats?.keyPasses ?? 0))
        - ((a.stats?.successfulTackles ?? 0) + (a.stats?.interceptions ?? 0) + (a.stats?.keyPasses ?? 0)))[0]?.player ?? null
}
