const noop = () => {}
const teamName = (match, player) => match.teamContexts?.[player.team]?.clubName ?? match.teamNames?.[player.team] ?? 'Club'
const names = ['GET_BALL', 'SUPPORT', 'CREATE_SPACE', 'MAKE_RUN', 'RECEIVE', 'CONTROL', 'ADVANCE', 'DRIBBLE', 'PASS', 'SHOOT', 'RECOVER']

// Each state has explicit lifecycle hooks. State-specific movement targets are
// selected by the decision module; this layer owns dwell time and transitions.
export const BEHAVIOR_STATES = Object.fromEntries(names.map(name => [name, {
  enter: noop,
  update: noop,
  exit: noop,
  minDwell: name === 'MAKE_RUN' ? .55 : name === 'CREATE_SPACE' ? .6 : .25,
}]))

BEHAVIOR_STATES.MAKE_RUN.enter = (match, player, _plan, { log, random }) => {
  player.runReadyAt = match.elapsed + 2.8 + random() * 2
  player.runAttempt = match.runWindow
  log(match, 'run', `${teamName(match, player)} #${player.number} makes an attacking run.`)
}
BEHAVIOR_STATES.DRIBBLE.enter = (match, player, _plan, { log }) => {
  if (match.elapsed >= (player.nextDribbleEventAt ?? 0)) {
    player.nextDribbleEventAt = match.elapsed + 9
    log(match, 'dribble', `${teamName(match, player)} #${player.number} dribbles into space.`)
  }
}
BEHAVIOR_STATES.ADVANCE.enter = (match, player, _plan, { log }) => {
  if (match.elapsed >= (player.nextCarryEventAt ?? 0)) {
    player.nextCarryEventAt = match.elapsed + 10
    log(match, 'carry', `${teamName(match, player)} #${player.number} carries the ball toward goal.`)
  }
}

const urgentStates = new Set(['RECEIVE', 'GET_BALL', 'PASS', 'SHOOT', 'CONTROL'])

export function applyBehaviorPlan(match, player, plan, services) {
  const current = BEHAVIOR_STATES[player.state] ?? BEHAVIOR_STATES.RECOVER
  const next = BEHAVIOR_STATES[plan.state] ?? BEHAVIOR_STATES.RECOVER
  const changing = player.state !== plan.state || player.intent !== plan.intent
  if (changing && !urgentStates.has(plan.state) && player.timeInState < current.minDwell) return false

  if (changing) {
    current.exit(match, player, plan, services)
    player.previousState = player.state
    player.previousIntent = player.intent
    player.state = plan.state
    player.intent = plan.intent
    player.timeInState = 0
    player.commitment = plan.commitment ?? 0
    next.enter(match, player, plan, services)
  }

  if (plan.target && (changing || player.commitment <= 0 || urgentStates.has(plan.state) || plan.state === 'MAKE_RUN')) {
    player.target = { ...plan.target }
  }
  player.targetReason = plan.reason
  player.chosenAction = plan.intent
  player.currentResponsibility = plan.responsibility ?? plan.intent
  player.recoveryTarget = plan.recoveryTarget ? { ...plan.recoveryTarget } : player.recoveryTarget
  next.update(match, player, plan, services)
  return changing
}
