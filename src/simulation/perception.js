const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v))
function distanceToSegment(point, start, end) {
  const dx = end.x - start.x, dy = end.y - start.y
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy || 1))
  return distance(point, { x: start.x + dx * t, y: start.y + dy * t })
}

// Build a fresh, explicit view of the world for one player's decision cycle,
// including each opponent as a separate perceived object.
export function perceivePlayer(match, player) {
  const ownTeam = playersForTeam(match, player.team)
  const opposingTeam = playersForTeam(match, opponentTeam(player.team))
  const opposingGoalkeeper = match.goalkeepers?.[opponentTeam(player.team)]
  const perceivedOpponents = opposingGoalkeeper
    ? [...opposingTeam, opposingGoalkeeper]
    : opposingTeam
  const teammate = ownTeam.find(other => other.id !== player.id) ?? null
  const teammates = ownTeam.filter(other => other.id !== player.id)
  const carrier = [...match.players, ...match.opponents].find(other => other.id === match.ball.ownerId) ?? null
  const goal = { x: teamContext(match, player.team).goalX, y: 0.5 }
  const playerToGoal = { x: goal.x - player.x, y: goal.y - player.y }
  const ballToGoal = { x: goal.x - match.ball.x, y: goal.y - match.ball.y }
  const ballSpeed = Math.hypot(match.ball.vx, match.ball.vy)
  const opponentDistances = perceivedOpponents?.map(opponent => distance(player, opponent)) ?? []
  const nearestOpponent = opponentDistances.length ? Math.min(...opponentDistances) : Infinity
  const nearestDefender = opposingTeam.length ? Math.min(...opposingTeam.map(opponent => distance(player, opponent))) : Infinity
  const opponents = (perceivedOpponents ?? []).map(opponent => ({
    id: opponent.id, number: opponent.number, position: { x: opponent.x, y: opponent.y },
    velocity: { x: opponent.vx, y: opponent.vy }, distance: distance(player, opponent),
  }))
  const supportDistance = teammate ? distance(player, teammate) : Infinity
  const ballDistance = distance(player, match.ball)
  const availableSpace = Number.isFinite(nearestOpponent) ? Math.min(1, nearestOpponent * 2.2) : 1
  const angleToGoal = Math.atan2(Math.abs(playerToGoal.y), Math.abs(playerToGoal.x))
  const receiver = match.ball.state === 'pass' && match.ball.targetId === player.id
  return {
    playerId: player.id,
    position: { x: player.x, y: player.y },
    velocity: { x: player.vx, y: player.vy },
    ballPosition: { x: match.ball.x, y: match.ball.y },
    ballVelocity: { x: match.ball.vx, y: match.ball.vy },
    hasBall: match.ball.ownerId === player.id,
    isReceiver: receiver,
    distanceToBall: ballDistance,
    distanceToGoal: Math.abs(playerToGoal.x),
    distanceFromGoal: Math.hypot(playerToGoal.x, playerToGoal.y),
    angleToGoal,
    teammatePosition: teammate ? { x: teammate.x, y: teammate.y } : null,
    teammateVelocity: teammate ? { x: teammate.vx, y: teammate.vy } : null,
    distanceToTeammate: supportDistance,
    teammates: teammates.map(other => ({
      id: other.id, number: other.number, role: other.role,
      position: { x: other.x, y: other.y }, velocity: { x: other.vx, y: other.vy },
      distance: distance(player, other), state: other.state,
    })),
    carrierPosition: carrier ? { x: carrier.x, y: carrier.y } : null,
    availableSpace,
    nearestOpponentDistance: nearestDefender,
    opponents,
    nearbyOpponentCount: opponents.filter(opponent => !opposingGoalkeeper || opponent.id !== opposingGoalkeeper.id).filter(opponent => opponent.distance < .22).length,
    shootingLane: opposingTeam.length ? clamp(Math.min(...opposingTeam.map(opponent => distanceToSegment(opponent, player, goal))) / .14) : 1,
    ballSpeed,
    fitness: player.fitness,
    attributes: { ...player.attributes },
    currentState: player.state,
    previousState: player.previousState,
    timeInState: player.timeInState,
    currentIntent: player.intent,
    target: { ...player.target },
    isBallMovingTowardPlayer: ballSpeed > 0.01 && (match.ball.x - player.x) * match.ball.vx < 0.04,
  }
}
import { opponentTeam, playersForTeam, teamContext } from './team.js'
