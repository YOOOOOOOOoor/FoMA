import { perceivePlayer } from './perception.js'
import { tacticsFor, isFastTransition } from './tactics.js'
import { attackingSupportTarget, formationTarget, maximumPositionalDeviation, playersForTeam, teamContext, teamDirection, teamProgress, teamLabel } from './team.js'
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value))
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const lerp = (a, b, amount) => a + (b - a) * amount

export function attackZone(progress) {
  if (progress >= .84) return 'PENALTY_AREA'
  if (progress >= .68) return 'ATTACKING_THIRD'
  if (progress >= .48) return 'MIDFIELD'
  return 'BUILD_UP'
}

function attackUrgency(match, player) {
  const age = match.attackStartedAt == null ? 0 : Math.max(0, match.elapsed - match.attackStartedAt)
  const direction = teamDirection(match, player.team)
  const recent = (match.recentPasses ?? []).filter(pass => match.elapsed - pass.time < 48 && teamProgress(match, player.team, pass.x) >= .68)
  const exchanges = recent.reduce((count, pass, index) => {
    const previous = recent[index - 1]
    return count + (previous && previous.from === pass.to && previous.to === pass.from ? 1 : 0)
  }, 0)
  const inFinalThird = teamProgress(match, player.team, player.x) >= .68
  const durationPressure = clamp((age - 18) / 45) * (inFinalThird ? 16 : 5)
  const loopPressure = inFinalThird ? Math.min(24, exchanges * 8) : 0
  return { age, scoreBoost: durationPressure + loopPressure, exchanges }
}

function movePlan(state, intent, target, reason, commitment = 0.8, action = null) {
  return { state, intent, target, reason, commitment, action }
}

function targetSpace(match, player, carrier, forward, side) {
  const dx = (forward ? 0.17 : -0.13) * teamDirection(match, player.team)
  const lane = side === 0 ? -1 : 1
  const y = carrier.y + lane * 0.17
  return {
    x: clamp(carrier.x + dx, 0.08, 0.92),
    y: clamp(y, 0.12, 0.88),
  }
}

function passLaneClearance(player, target, predictionTime = 0) {
  const from = { x: player.x, y: player.y }
  const dx = target.x - from.x, dy = target.y - from.y
  return (player.perception?.opponents ?? []).reduce((best, opponent) => {
    const position={x:opponent.position.x+(opponent.velocity?.x??0)*predictionTime,y:opponent.position.y+(opponent.velocity?.y??0)*predictionTime}
    const t = clamp(((position.x - from.x) * dx + (position.y - from.y) * dy) / (dx * dx + dy * dy || 1))
    return Math.min(best, dist(position, { x: from.x + dx * t, y: from.y + dy * t }))
  }, 1)
}

function estimatedPassFlight(passType, player) {
  const baseRange = passType === 'LONG' ? 2.12 : passType === 'THROUGH' ? 1.82 : 1.62
  const quality = clamp(((player.attributes.PAS * .62 + player.attributes.DEC * .2 + player.attributes.VIS * .18) / 68), .74, 1.2)
  const range = 1 + (baseRange - 1) * quality
  const damping = .97
  return -Math.log(1 - 1 / range) / -Math.log(damping) / 60
}

// Evaluate a receiver's normal, through, and long-ball options from their
// current motion and the opponents visible in the passer's perception.
export function evaluatePassOptions(player, teammate, match = null) {
  if (!teammate) return { type: 'NORMAL', target: { x: player.x, y: player.y }, score: 0 }
  const direction = teamDirection(match, player.team)
  const from = { x: player.x, y: player.y }
  const speed = Math.hypot(teammate.vx, teammate.vy)
  const defenders = player.perception?.opponents ?? []
  const nearest = defenders.length ? Math.min(...defenders.map(o => dist(o.position, teammate))) : 1
  const space = teammate.perception?.availableSpace ?? 1
  const pressure = clamp((.3 - nearest) / .3)
  const distance = dist(from, teammate)
  const passer = (player.attributes.PAS * .4 + player.attributes.VIS * .34 + player.attributes.DEC * .26) / 99
  const receiver = (teammate.attributes.CON * .5 + teammate.attributes.VIS * .25 + teammate.attributes.DEC * .25) / 99
  const passerFreshness = .84 + (player.fitness ?? 100) * .0016
  const receiverFreshness = .88 + (teammate.fitness ?? 100) * .0012
  const options = []
  const tactics = match ? tacticsFor(match, player.team) : null

  const scoreTarget = (type, target, range, bonus = 0) => {
    const targetDistance = dist(from, target)
    const forward = clamp(.5 + (target.x - player.x) * direction * 1.5)
    const targetSpace = defenders.length
      ? clamp(Math.min(...defenders.map(o => dist(o.position, target))) / .3)
      : 1
    const lane = clamp(passLaneClearance(player, target) / .13)
    const rangeFit = clamp(1 - Math.abs(targetDistance - range) / Math.max(.3, range * .9))
    let score = clamp(.12 + forward * .18 + targetSpace * .17 + lane * .18 + rangeFit * .08 + passer * .12 * passerFreshness + receiver * .1 * receiverFreshness + bonus, 0, 1) * 100
    if (tactics?.attackingMentality === 'possession') score += type === 'NORMAL' ? 5 : -4
    if (tactics?.attackingMentality === 'direct' || tactics?.attackingMentality === 'aggressive') score += (forward - .5) * (tactics.attackingMentality === 'direct' ? 12 : 8) + (type === 'THROUGH' || type === 'LONG' ? 3 : 0)
    if (tactics?.transitionStyle === 'slow_build') score += type === 'NORMAL' ? 3 : -2
    if (tactics?.transitionStyle === 'fast_counter' && match && isFastTransition(match, player.team)) score += forward * 8 + (type === 'THROUGH' || type === 'LONG' ? 5 : 0)
    options.push({ type, target, score, distance: targetDistance, space: targetSpace, lane })
  }

  const normalTime = clamp(estimatedPassFlight('NORMAL', player), .16, .65) * (1 - pressure * .12)
  const sideX = -teammate.vy / (speed || 1)
  const sideY = teammate.vx / (speed || 1)
  const receivingOffset = nearest < .19 ? .018 : .008
  const normalTarget = {
    x: clamp(teammate.x + teammate.vx * normalTime + sideX * receivingOffset, .04, .96),
    y: clamp(teammate.y + teammate.vy * normalTime + sideY * receivingOffset, .07, .93),
  }
  scoreTarget('NORMAL', normalTarget, .27, distance < .48 ? .035 : -.03)

  const forwardSpeed = teammate.vx * direction
  const isRunning = teammate.state === 'MAKE_RUN' || forwardSpeed > .055
  if (isRunning && space > .43 && forwardSpeed > .035) {
    // Estimate when the moving pass reaches the receiver's lane. More distance
    // means more travel time; clear space and receiver pace permit a longer lead,
    // while nearby pressure shortens it so the pass is not overhit.
    const flightTime = estimatedPassFlight('THROUGH', player)
    const runQuality = (.7 + teammate.attributes.PAC * .0032 + teammate.attributes.POS * .0008 + teammate.attributes.DEC * .0007) * clamp(forwardSpeed / .16, .35, 1.25)
    const predictionTime = clamp(flightTime * .82 + (space - .5) * .3 - pressure * .18, .12, .8) * runQuality
    const throughTarget = {
      x: clamp(teammate.x + teammate.vx * predictionTime, .04, .96),
      y: clamp(teammate.y + teammate.vy * predictionTime, .07, .93),
    }
    const lead = (throughTarget.x - teammate.x) * direction
    const receiverCanReach = dist(teammate, throughTarget) <= (.13 + teammate.attributes.PAC * .0014) * predictionTime + .075
    const predictedLane=passLaneClearance(player,throughTarget,flightTime*.45)
    const targetClearance=defenders.length?Math.min(...defenders.map(opponent=>dist({x:opponent.position.x+(opponent.velocity?.x??0)*flightTime*.72,y:opponent.position.y+(opponent.velocity?.y??0)*flightTime*.72},throughTarget))):1
    if (lead > .025 && dist(from, throughTarget) < .78 && receiverCanReach && predictedLane>.052 && targetClearance>.065) {
      const defenderGoalSide = defenders.some(opponent => direction * (opponent.position.x - teammate.x) > .015 && dist(opponent.position, teammate) < .21)
      const value = (teammate.state === 'MAKE_RUN' ? .12 : .025) + clamp(lead / .2) * .065 + clamp((space - .43) / .57) * .055 +
        (teammate.attributes.PAC > 78 ? .018 : 0) - (defenderGoalSide ? .075 : 0) - clamp((.09-predictedLane)/.09)*.08
      scoreTarget('THROUGH', throughTarget, .42, value)
    }
  }

  if (distance > .36 && space > .22) {
    const flight = estimatedPassFlight('LONG', player) * (1 - pressure * .1)
    const longTarget = {
      x: clamp(teammate.x + teammate.vx * flight, .04, .96),
      y: clamp(teammate.y + teammate.vy * flight, .07, .93),
    }
    const progress = (longTarget.x - player.x) * direction
    const longSpace = defenders.length ? clamp(Math.min(...defenders.map(opponent => dist(opponent.position, longTarget))) / .3) : 1
    if (progress > .06 && dist(from, longTarget) > .36 && longSpace > .28) {
      const pressureRelease = clamp((.32 - (player.perception?.nearestOpponentDistance ?? 1)) / .32) * .09
      const switchPlay = Math.abs(teammate.y - player.y) > .3 ? .035 : 0
      const runningLead = isRunning && progress > .2 ? .035 : 0
      scoreTarget('LONG', longTarget, .66, .14 + clamp((distance - .28) / .4) * .04 + longSpace * .02 + pressureRelease * .8 + switchPlay + runningLead)
    }
  }
  return options.sort((a, b) => b.score - a.score)[0]
}

function scorePass(match, player, teammate, zone, playerShot, teammateShot) {
  const option = evaluatePassOptions(player, teammate, match)
  const progress = (option.target.x - player.x) * teamDirection(match, player.team)
  if (zone === 'ATTACKING_THIRD' || zone === 'PENALTY_AREA') {
    const advantage = teammateShot - playerShot
    const required = progress < -.015 ? (zone === 'PENALTY_AREA' ? 28 : 20) : (zone === 'PENALTY_AREA' ? 18 : 12)
    if (advantage < required) option.score = Math.min(option.score, playerShot - 8)
    else option.score = Math.min(100, Math.max(option.score, playerShot + advantage * 1.25 + 10))
  }
  return option
}

function scoreShoot(player, perception) {
  const d = perception.distanceToGoal
  // Distance curve: poor from deep, viable from the edge, very attractive close in.
  const range = d < .12 ? 1 : d < .24 ? lerp(.96, .84, (d - .12) / .12)
    : d < .42 ? lerp(.84, .62, (d - .24) / .18)
      : d < .62 ? lerp(.62, .25, (d - .42) / .2)
        : clamp(.25 - (d - .62) * .62, .04, .25)
  const angleQuality = 1 - clamp(perception.angleToGoal / 1.3) * .56
  const pressure = perception.nearestOpponentDistance < .3 ? .42 + perception.nearestOpponentDistance * 1.9 : 1
  const skill = .56 + (player.attributes.SHO * .78 + player.attributes.DEC * .22) * .0044
  const control = .72 + player.attributes.CON * .0026
  const fitness = .74 + perception.fitness / 400
  const laneQuality = .18 + perception.shootingLane * .82
  return clamp(range * angleQuality * laneQuality * pressure * skill * control * fitness) * 100
}

export function buildPerceptionForTeam(match) {
  const players = [...match.players, ...match.opponents]
  for (const player of players) player.perception = perceivePlayer(match, player)
  return players.map(player => player.perception)
}

function offBallDecision(match, player, teammate, p) {
  const b = match.ball
  const teammates = playersForTeam(match, player.team).filter(other => other.id !== player.id)
  const direction = teamDirection(match, player.team)
  if (p.isReceiver) {
    return movePlan('RECEIVE', 'RECEIVE_PASS', { x: b.targetX, y: b.targetY }, 'Meet the pass at its target', 0.25)
  }

  if (!b.ownerId) {
    const ownDistance = p.distanceToBall
    const teammateDistance = Math.min(...teammates.map(other => dist(other, b)), Infinity)
    const isNearest = ownDistance <= teammateDistance
    if (b.state === 'loose' || b.state === 'shot' || b.state === 'pass') {
      if (isNearest || (p.isBallMovingTowardPlayer && ownDistance < teammateDistance + .08)) {
        const interceptTime = Math.min(1.1, ownDistance / Math.max(.16, p.ballSpeed + .12))
        return movePlan('GET_BALL', 'GET_BALL', {
          x: clamp(b.x + b.vx * interceptTime, .04, .96),
          y: clamp(b.y + b.vy * interceptTime, .07, .93),
        }, 'Closest player to the loose ball', 0.35)
      }
      if (player.formationSlot) {
        const anchor = formationTarget(match, player)
        return movePlan('SUPPORT', 'SUPPORT', anchor ?? { x: player.x, y: player.y }, 'Hold the assigned formation lane while the ball is loose', 0.85)
      }
      const support = { x: clamp(b.x - direction * .08, .08, .92), y: clamp(b.y + (player.y < b.y ? -.16 : .16), .12, .88) }
      return movePlan('SUPPORT', 'SUPPORT', support, 'Offer a nearby outlet', 0.65)
    }
  }

  const carrier = [...match.players, ...match.opponents].find(other => other.id === b.ownerId) ?? teammate
  const separation = dist(player, carrier)
  const side = player.laneSide
  const runTarget = targetSpace(match, player, carrier, true, side)
  const supportTarget = targetSpace(match, player, carrier, false, side)
  const progressToGoal = 1 - teamProgress(match, player.team, carrier.x)
  const spaceAhead = clamp((1 - teamProgress(match, player.team, runTarget.x)) * 2.8)
  const runAbility = player.attributes.POS * .42 + player.attributes.PAC * .34 + player.attributes.DEC * .24
  const tacticalRole = player.tacticalRole
  const centralDefender = tacticalRole ? ['CB', 'LCB', 'RCB'].includes(tacticalRole) : player.role.startsWith('DEFENDER')
  const canMakeRun = !centralDefender && (!tacticalRole || ['LB', 'RB', 'LWB', 'RWB', 'CM', 'LCM', 'RCM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'LAM', 'RAM', 'ST'].includes(tacticalRole))
  const runWindow = canMakeRun && progressToGoal > .17 && spaceAhead > .18 && match.elapsed >= (player.runReadyAt ?? 0) && runAbility > 59
  if (player.formationSlot && player.tacticalRole) {
    const positionalTarget = attackingSupportTarget(match, player, carrier) ?? formationTarget(match, player)
    if (centralDefender) return movePlan('SUPPORT', 'SUPPORT', positionalTarget, 'Hold the defensive line as a safe outlet', .9)
    if (runWindow && player.runAttempt !== match.runWindow) {
      const anchor = formationTarget(match, player) ?? positionalTarget
      const deviation = maximumPositionalDeviation(player)
      const target = {
        x: clamp(runTarget.x, anchor.x - deviation, anchor.x + deviation),
        y: clamp(runTarget.y, Math.max(.08, anchor.y - deviation), Math.min(.92, anchor.y + deviation)),
      }
      return movePlan('MAKE_RUN', 'MAKE_RUN', target, `Run from the ${tacticalRole} lane into nearby forward space`, 1.15)
    }
    const closeEnough = separation < .19
    return movePlan(closeEnough ? 'CREATE_SPACE' : 'SUPPORT', closeEnough ? 'CREATE_SPACE' : 'SUPPORT', positionalTarget,
      closeEnough ? 'Keep the assigned lane open instead of crowding the carrier' : `Hold the ${tacticalRole} zone as a passing option`, .9)
  }
  if (centralDefender) {
    const supportProgress = Math.min(.49, teamProgress(match, player.team, carrier.x) - .035)
    const defenderTarget = { x: teamContext(match, player.team).ownGoalX + direction * supportProgress, y: clamp(carrier.y + (side ? .2 : -.2), .14, .86) }
    return movePlan('SUPPORT', 'SUPPORT', defenderTarget, 'Support behind the attack and hold the halfway line', .9)
  }

  if (separation < .19) {
    const away = { x: clamp(carrier.x + direction * .03, .08, .92), y: clamp(carrier.y + (side ? .26 : -.26), .12, .88) }
    return movePlan('CREATE_SPACE', 'CREATE_SPACE', away, 'Move away to open a passing lane', 1.1)
  }
  if (runWindow && player.runAttempt !== match.runWindow) {
    return movePlan('MAKE_RUN', 'MAKE_RUN', runTarget, 'Attack the space ahead of the carrier', 1.35)
  }
  if (separation > .5) {
    return movePlan('SUPPORT', 'SUPPORT', supportTarget, 'Stay available as a short outlet', 0.9)
  }
  const forwardSupport = { x: clamp(carrier.x + direction * .04, .08, .92), y: clamp(carrier.y + (side ? .22 : -.22), .12, .88) }
  return movePlan('SUPPORT', 'SUPPORT', forwardSupport, 'Hold a clear passing angle', 1.0)
}

function onBallDecision(match, player, teammate, p) {
  const b = match.ball
  const direction = teamDirection(match, player.team)
  const progress = teamProgress(match, player.team, player.x)
  const goalDistance = 1 - progress
  const zone = attackZone(progress)
  const urgency = attackUrgency(match, player)
  const defenderRole = player.tacticalRole ? ['CB', 'LCB', 'RCB', 'DM', 'LDM', 'RDM'].includes(player.tacticalRole) : player.role.startsWith('DEFENDER')
  const ownGoal = teamContext(match, player.team).ownGoalX
  const dirX = ownGoal + direction * (defenderRole ? .48 : .94)
  const goalY = lerp(player.y, .5, .58)
  const advanceTarget = { x: dirX, y: goalY }
  const dribbleTarget = {
    x: clamp(player.x + direction * (.11 + player.attributes.DRI * .0009), .06, .94),
    y: clamp(player.y + (0.5 - player.y) * .22, .12, .88),
  }
  const playerShot = scoreShoot(player, p)
  const teammates = playersForTeam(match, player.team).filter(other => other.id !== player.id)
  const passes = teammates.map(candidate => {
    const candidateShot = scoreShoot(candidate, candidate.perception ?? p)
    const option = scorePass(match, player, candidate, zone, playerShot, candidateShot)
    if (candidate.role.startsWith('ATTACKER')) option.score += 6
    if (player.role.startsWith('DEFENDER') && candidate.role.startsWith('ATTACKER')) option.score += 8
    return { ...option, teammate: candidate }
  }).sort((a, b) => b.score - a.score)
  const passOption = passes[0] ?? { score: 0, type: 'NORMAL', target: { x: player.x, y: player.y }, teammate }
  teammate = passOption.teammate ?? teammate
  const teammateShot = teammate ? scoreShoot(teammate, teammate.perception ?? p) : 0
  const scores = {
    SHOOT: playerShot,
    PASS: passOption.score,
    ADVANCE: clamp(.46 + p.availableSpace * .16 + (progress < .76 ? .18 : -.04) + player.attributes.PAC * .001 - (zone === 'PENALTY_AREA' ? .32 : zone === 'ATTACKING_THIRD' ? .17 : 0)) * 100,
    DRIBBLE: clamp(.3 + p.availableSpace * .15 + player.attributes.DRI * .0013 + player.attributes.CON * .0009 + player.attributes.DEC * .0007 + (p.nearbyOpponentCount > 1 ? -.18 : p.nearestOpponentDistance > .22 ? .08 : 0) + (zone === 'ATTACKING_THIRD' ? .07 : zone === 'PENALTY_AREA' ? .03 : 0)) * 100,
    HOLD: 14 + (goalDistance < .15 ? 7 : 0),
  }
  const tactics = tacticsFor(match, player.team)
  const fatigue = 1 - clamp((player.fitness ?? 100) / 100)
  scores.DRIBBLE -= fatigue * 8
  scores.ADVANCE -= fatigue * 3
  scores.PASS += fatigue * 1.5
  scores.HOLD += fatigue * 2
  if (tactics.attackingMentality === 'possession') { scores.PASS += 5; scores.HOLD += 4; scores.SHOOT -= 3 }
  if (tactics.attackingMentality === 'direct') { scores.ADVANCE += 5; scores.DRIBBLE += 3 }
  if (tactics.attackingMentality === 'aggressive') { scores.SHOOT += 5; scores.ADVANCE += 4; scores.DRIBBLE += 3 }
  if (tactics.transitionStyle === 'slow_build') { scores.PASS += 3; scores.HOLD += 2 }
  if (tactics.transitionStyle === 'fast_counter' && isFastTransition(match, player.team)) { scores.ADVANCE += 8; scores.DRIBBLE += 5 }
  if (player.role === 'ATTACKER') {
    scores.SHOOT += player.attributes.SHO * .035 + player.attributes.DEC * .015
    scores.DRIBBLE += player.attributes.DRI * .025
    scores.ADVANCE += player.attributes.PAC * .018
  } else if (player.role === 'SUPPORT' || player.role === 'ATTACKER_SUPPORT') {
    scores.PASS += player.attributes.PAS * .025 + player.attributes.VIS * .02
    scores.HOLD += player.attributes.POS * .025
  }
  // Carrying into a clear lane is a different choice from beating the first
  // defender. Give a capable ball carrier a real dribble option when there is
  // room ahead and no second defender closing the trap.
  if (p.nearestOpponentDistance > .1 && p.nearestOpponentDistance < .32 && p.nearbyOpponentCount <= 1 && p.availableSpace > .14)
    scores.DRIBBLE += 14 + player.attributes.DRI * .025 + player.attributes.DEC * .015
  if (defenderRole) {
    scores.PASS += player.attributes.PAS * .025 + player.attributes.VIS * .018
    scores.DRIBBLE -= 13
    scores.ADVANCE -= progress > .4 ? 18 : 4
    scores.SHOOT -= 38
  }
  const minimumPassEdge = zone === 'PENALTY_AREA' ? 18 : 12
  if (match.elapsed < (player.receiveCommitUntil ?? 0) && teammateShot - playerShot < minimumPassEdge) scores.PASS = 0
  // Move from build-up choices to a direct, imperfect-but-reasonable finish as
  // the player enters dangerous zones. Repeated final-third exchanges add urgency.
  if (zone === 'ATTACKING_THIRD') scores.SHOOT = Math.min(100, scores.SHOOT + 14 + urgency.scoreBoost)
  if (zone === 'PENALTY_AREA') scores.SHOOT = Math.min(100, scores.SHOOT + 26 + urgency.scoreBoost)
  if (zone === 'ATTACKING_THIRD' || zone === 'PENALTY_AREA') {
    scores.DRIBBLE = Math.min(100, scores.DRIBBLE + urgency.scoreBoost * .35)
    const receiverX = teammate && (teammate.state === 'MAKE_RUN' ? teammate.target.x : teammate.x)
    if (receiverX == null || teamProgress(match, player.team, receiverX) <= progress + .015) {
      scores.PASS = Math.max(0, scores.PASS - urgency.exchanges * 5 - clamp((urgency.age - 24) / 45) * 8)
    }
  }
  if (teammate && (player.x - teammate.x) * direction > .08 && goalDistance > .2) scores.PASS += 5
  if (player.state === 'DRIBBLE' && player.commitment > 0) scores.DRIBBLE += 5
  player.zone = zone
  player.attackDuration = urgency.age
  player.attackExchanges = urgency.exchanges
  player.actionScores = scores
  const choices = Object.entries(scores).sort((a, b) => b[1] - a[1])
  let [action, value] = choices[0]
  const currentAction = player.intent === 'ADVANCE' ? 'ADVANCE' : player.intent
  const currentValue = scores[currentAction]
  if (currentAction && player.commitment > 0 && currentValue != null && action !== currentAction && value < currentValue + 13) {
    action = currentAction
    value = currentValue
  }

  if (action === 'SHOOT' && value >= 39) return movePlan('SHOOT', 'SHOOT', { x: teamContext(match, player.team).goalX + direction * .035, y: .5 }, `${zone.replace('_', ' ')} · shot ${Math.round(value)} · attack ${Math.round(urgency.age)}s`, 0, 'SHOOT')
  if (action === 'PASS' && teammate && value >= 35 && dist(player, teammate) > .12) return { ...movePlan('PASS', 'PASS', passOption.target, `${teamLabel(match, player.team)} #${teammate.number} · ${passOption.type.toLowerCase()} pass`, 0, 'PASS'), passType: passOption.type, receiverId: teammate.id }
  if (action === 'DRIBBLE' && goalDistance > .08) {
    const defenderLimit = player.role.startsWith('DEFENDER') ? .49 : .925
    const maxProgress = player.role.startsWith('DEFENDER') ? defenderLimit : .94
    const finalThirdTarget = { x: clamp(player.x + direction * .075, .06, .94), y: clamp(player.y + (0.5 - player.y) * .35, .12, .88) }
    const target = zone === 'ATTACKING_THIRD' || zone === 'PENALTY_AREA' ? finalThirdTarget : { ...dribbleTarget, x: ownGoal + direction * Math.min(teamProgress(match, player.team, dribbleTarget.x), maxProgress) }
    return movePlan('DRIBBLE', 'DRIBBLE', target, zone === 'ATTACKING_THIRD' || zone === 'PENALTY_AREA' ? 'Dribble toward a shooting position' : `Drive into open space (${Math.round(value)})`, zone === 'ATTACKING_THIRD' || zone === 'PENALTY_AREA' ? .85 : 1.65, 'DRIBBLE')
  }
  if (action === 'ADVANCE' && goalDistance > .08) return movePlan('ADVANCE', 'ADVANCE', advanceTarget, defenderRole ? 'Carry forward while holding the defensive half' : 'Carry forward toward the goal', zone === 'ATTACKING_THIRD' ? .9 : 1.75, 'CARRY')
  if (action === 'HOLD') return movePlan('CONTROL', 'CONTROL', { x: player.x, y: player.y }, 'Settle and retain possession', .45)
  return movePlan('ADVANCE', 'ADVANCE', advanceTarget, 'Carry forward toward the goal', .8, 'CARRY')
}

export function chooseIntent(match, player) {
  const teammate = playersForTeam(match, player.team).find(other => other.id !== player.id)
  const perception = player.perception ?? perceivePlayer(match, player)
  const progress = teamProgress(match, player.team, player.x)
  player.zone = player.role.startsWith('DEFENDER')
    ? (progress < .5 ? 'OWN_HALF' : 'OPPONENT_HALF')
    : attackZone(progress)
  player.attackDuration = match.attackStartedAt == null ? 0 : Math.max(0, match.elapsed - match.attackStartedAt)
  if (!perception.hasBall) player.actionScores = { SHOOT: 0, PASS: 0, DRIBBLE: 0, HOLD: 0 }
  const plan = perception.hasBall
    ? onBallDecision(match, player, teammate, perception)
    : offBallDecision(match, player, teammate, perception)
  plan.responsibility ??= perception.hasBall ? plan.intent : ({ GET_BALL: 'PRESS_BALL', MAKE_RUN: 'ATTACK_SPACE', RECEIVE: 'SUPPORT', RECOVER: 'RECOVER', SUPPORT: 'SUPPORT', CREATE_SPACE: 'SUPPORT' }[plan.state] ?? plan.state)
  plan.recoveryTarget = formationTarget(match, player, 'defending') ?? player.baseFormationPosition ?? null
  plan.scores = player.actionScores ?? {}
  return plan
}

