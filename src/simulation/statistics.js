import { updateMatchRating } from './matchRatings.js'

export const STAT_FIELDS = [
  'appearances', 'minutes', 'goals', 'assists', 'shots', 'shotsOnTarget', 'passesAttempted', 'passesCompleted',
  'throughBalls', 'successfulThroughBalls', 'longBalls', 'successfulLongBalls',
  'tackles', 'successfulTackles', 'interceptions', 'dribbles', 'successfulDribbles',
  'saves', 'goalsConceded', 'claims', 'distributionPasses', 'distributionCompletions', 'fouls', 'foulsSuffered', 'yellowCards', 'redCards',
  'keyPasses', 'blocks', 'possessionLosses', 'recoveries',
]

const emptyLine = () => Object.fromEntries([...STAT_FIELDS, 'possessionSeconds'].map(field => [field, 0]))

export function createStatistics(match) {
  const players = [...match.players, ...match.opponents, ...Object.values(match.substitutes ?? {}).flat(), ...Object.values(match.goalkeepers)]
  const active = new Set([...match.players, ...match.opponents, ...Object.values(match.goalkeepers)].filter(player => !player.substitutedOff && !player.sentOff).map(player => player.id))
  return {
    teams: { home: emptyLine(), away: emptyLine() },
    players: Object.fromEntries(players.map(player => [player.id, { ...emptyLine(), appearances: active.has(player.id) ? 1 : 0, rating: 6.2 }])),
  }
}

export function addStat(match, playerOrTeam, field, amount = 1) {
  const team = typeof playerOrTeam === 'string' ? playerOrTeam : playerOrTeam?.team
  const playerId = typeof playerOrTeam === 'object' ? playerOrTeam?.id : null
  if (!team || team === 'none' || !match.statistics?.teams[team]) return
  match.statistics.teams[team][field] = (match.statistics.teams[team][field] ?? 0) + amount
  if (playerId && match.statistics.players[playerId]) {
    match.statistics.players[playerId][field] = (match.statistics.players[playerId][field] ?? 0) + amount
    if (typeof playerOrTeam === 'object') updateMatchRating(match, playerOrTeam)
  }
}

export function passAccuracy(line) {
  return line.passesAttempted ? Math.round(line.passesCompleted / line.passesAttempted * 100) : 0
}
