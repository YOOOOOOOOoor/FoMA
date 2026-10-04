import { DEFAULT_TACTICS } from './tactics.js'

export const TEAM_KEYS = Object.freeze(['home', 'away'])

const POSITION_GROUPS = Object.freeze({GK:['GK'],DEF:['LB','LWB','CB','RB','RWB','LCB','RCB'],MID:['CDM','DM','CM','CAM','AM','LM','RM','LCM','RCM','LDM','RDM','LAM','RAM'],ATT:['LW','RW','CF','ST']})
const POSITION_NEIGHBOURS = Object.freeze({RB:['RWB','CB'],RWB:['RB','RM'],LB:['LWB','CB'],LWB:['LB','LM'],CB:['LB','RB','CDM'],CDM:['DM','CM','CB'],DM:['CDM','CM'],CM:['DM','CDM','CAM','LM','RM'],CAM:['AM','CM','CF'],AM:['CAM','CM'],LM:['LW','LWB','CM'],RM:['RW','RWB','CM'],LW:['LM','CF'],RW:['RM','CF'],CF:['ST','CAM','LW','RW'],ST:['CF']})
const normalizePosition=position=>({LCB:'CB',RCB:'CB',LCM:'CM',RCM:'CM',LDM:'DM',RDM:'DM',LAM:'AM',RAM:'AM'})[position]??position
export function positionSuitability(player, targetPosition) {
  const natural=normalizePosition(player?.primaryPosition??player?.position), target=normalizePosition(targetPosition)
  const secondary=player?.secondaryPositions??[]
  if(natural===target)return {level:'GREEN',factor:1,reason:'Natural position'}
  if(secondary.includes(targetPosition)||secondary.includes(target))return {level:'GREEN',factor:.98,reason:'Strong secondary position'}
  if((POSITION_NEIGHBOURS[natural]??[]).includes(target))return {level:'YELLOW',factor:.91,reason:'Playable out of position'}
  const sourceGroup=Object.keys(POSITION_GROUPS).find(group=>POSITION_GROUPS[group].includes(natural))
  const targetGroup=Object.keys(POSITION_GROUPS).find(group=>POSITION_GROUPS[group].includes(target))
  if(sourceGroup===targetGroup)return {level:'YELLOW',factor:.87,reason:'Same positional unit, unfamiliar role'}
  if(sourceGroup==='GK'||targetGroup==='GK')return {level:'RED',factor:.25,reason:'Goalkeeper and outfield roles are not interchangeable'}
  return {level:'RED',factor:.76,reason:'Unsuitable position'}
}
export function attributesForPosition(player, targetPosition) {
  const suitability=positionSuitability(player,targetPosition)
  const multipliers={GREEN:1,YELLOW:suitability.factor,RED:suitability.factor}
  const factor=multipliers[suitability.level]
  return Object.fromEntries(Object.entries(player?.attributes??{}).map(([key,value])=>[key,Math.max(1,Math.round(value*factor))]))
}

// Outfield line counts; each shape plus its goalkeeper totals eleven.
export const FORMATION_SHAPES = Object.freeze({
  '4-4-2': Object.freeze({ defs: 4, mids: 4, atts: 2 }),
  '4-3-3': Object.freeze({ defs: 4, mids: 3, atts: 3 }),
  '4-2-3-1': Object.freeze({ defs: 4, mids: 5, atts: 1 }),
  '3-5-2': Object.freeze({ defs: 3, mids: 5, atts: 2 }),
  '5-3-2': Object.freeze({ defs: 5, mids: 3, atts: 2 }),
})

const FORMATION_ROLES = Object.freeze({
  '4-4-2': { defense: ['LB', 'LCB', 'RCB', 'RB'], midfield: ['LM', 'LCM', 'RCM', 'RM'], attack: ['ST', 'ST'] },
  '4-3-3': { defense: ['LB', 'LCB', 'RCB', 'RB'], midfield: ['LCM', 'CM', 'RCM'], attack: ['LW', 'ST', 'RW'] },
  '4-2-3-1': { defense: ['LB', 'LCB', 'RCB', 'RB'], midfield: ['LDM', 'RDM', 'LAM', 'CAM', 'RAM'], attack: ['ST'] },
  '3-5-2': { defense: ['LCB', 'CB', 'RCB'], midfield: ['LWB', 'LCM', 'CM', 'RCM', 'RWB'], attack: ['ST', 'ST'] },
  '5-3-2': { defense: ['LWB', 'LCB', 'CB', 'RCB', 'RWB'], midfield: ['LCM', 'CM', 'RCM'], attack: ['ST', 'ST'] },
})

const ROLE_LANES = Object.freeze({
  GK: .5, LB: .16, LWB: .13, LW: .12, LAM: .2, LM: .17, LDM: .34, LCB: .3, LCM: .38,
  CB: .5, CM: .5, CAM: .5, ST: .5, RCM: .62, RCB: .7, RDM: .66, RWB: .87, RAM: .8, RW: .88,
  RM: .83, RB: .84,
})
const ROLE_LIMITS = Object.freeze({ GK: .025, CB: .055, LCB: .055, RCB: .055, LB: .12, RB: .12, LWB: .13, RWB: .13, DM: .075, LDM: .075, RDM: .075, CM: .105, LCM: .105, RCM: .105, LM: .13, RM: .13, LW: .14, RW: .14, LAM: .12, CAM: .12, RAM: .12, ST: .12 })

export function tacticalRoleForSlot(formation, line, index) {
  const role = FORMATION_ROLES[formation]?.[line]?.[index]
  if (role) return role
  if (line === 'defense') return index === 0 ? 'LB' : index === (FORMATION_SHAPES[formation]?.defs ?? 4) - 1 ? 'RB' : 'CB'
  if (line === 'attack') return 'ST'
  return 'CM'
}

export function tacticalZoneForRole(role = 'CM') {
  if (role === 'GK') return 'GOAL_ZONE'
  if (['CB', 'LCB', 'RCB'].includes(role)) return 'CENTRAL_DEFENSE'
  if (['LB', 'RB', 'LWB', 'RWB'].includes(role)) return 'WIDE_DEFENSE'
  if (['DM', 'LDM', 'RDM'].includes(role)) return 'DEFENSIVE_MIDFIELD'
  if (['LW', 'RW', 'LAM', 'RAM'].includes(role)) return 'WIDE_ATTACK'
  if (role === 'CAM' || role === 'ST') return 'CENTRAL_ATTACK'
  if (['LM', 'RM'].includes(role)) return 'WIDE_MIDFIELD'
  return 'CENTRAL_MIDFIELD'
}

export function playersForTeam(match, team) {
  return (team === 'away' ? match.opponents : match.players).filter(player => !player.sentOff && !player.substitutedOff)
}

export function opponentTeam(team) {
  return team === 'away' ? 'home' : 'away'
}

export function teamContext(match, team) {
  const context = match?.teamContexts?.[team] ?? {}
  const direction = context.attackDirection ?? (team === 'home' ? 1 : -1)
  const tactics = { ...DEFAULT_TACTICS, ...(match?.teamTactics?.[team] ?? {}) }
  delete tactics.playerFreedom
  return {
    key: team,
    name: context.clubName ?? match?.teamNames?.[team] ?? (team === 'home' ? 'Home Club' : 'Away Club'),
    clubId: context.clubId ?? match?.teamIds?.[team] ?? team,
    players: playersForTeam(match, team),
    goalkeeper: match?.goalkeepers?.[team] ?? null,
    kit: context.kit ?? null,
    direction: direction < 0 ? -1 : 1,
    goalX: direction < 0 ? 0 : 1,
    ownGoalX: direction < 0 ? 1 : 0,
    formation: context.formation ?? '4-4-2',
    homeAway: context.homeAway ?? (match?.homeTeam === team ? 'HOME' : 'AWAY'),
    tactics,
  }
}

export function teamDirection(match, team) {
  return teamContext(match, team).direction
}

export function teamProgress(match, team, x) {
  return (x - teamContext(match, team).ownGoalX) * teamDirection(match, team)
}

export function teamLabel(match, team) {
  return teamContext(match, team).name
}

export function formationAnchor(match, player) {
  const slot = player.formationSlot
  if (!slot) return null
  const context = teamContext(match, player.team)
  const line = slot.line ?? 'attack'
  const role = player.tacticalRole ?? tacticalRoleForSlot(context.formation, line, slot.index ?? 0)
  let base = line === 'defense' ? 0.27 : line === 'midfield' ? (slot.layer === 'holding' ? 0.39 : slot.layer === 'advanced' ? 0.56 : 0.46) : 0.65
  if (role === 'GK') base = .055
  if (['LWB', 'RWB'].includes(role) && line === 'defense') base = .30
  if (['LW', 'RW', 'LAM', 'RAM'].includes(role) && line === 'midfield') base = .57
  if (role === 'CAM') base = .56
  if (role === 'ST') base = .68
  if (['DM', 'LDM', 'RDM'].includes(role)) base = .39
  const lane = role === 'ST' && (slot.count ?? 1) > 1 ? (slot.index === 0 ? .38 : .62) : ROLE_LANES[role] ?? .5
  return {
    x: context.ownGoalX + context.direction * clamp(base, .055, .79),
    y: clamp(.5 + (lane - .5), 0.08, 0.92),
  }
}

export function formationTarget(match, player, phase = null) {
  const anchor = formationAnchor(match, player)
  if (!anchor) return null
  const context = teamContext(match, player.team), slot = player.formationSlot
  const line = slot.line ?? 'attack', tactics = context.tactics
  const defending = phase ? phase === 'defending' : Boolean(match.possessionTeam && match.possessionTeam !== player.team)
  const block = tactics.defensiveApproach
  const blockDepth = defending ? (block === 'low_block' ? -.075 : block === 'high_press' ? .065 : -.015) : 0
  const lineHeight = tactics.defensiveLine === 'high' ? .045 : tactics.defensiveLine === 'low' ? -.04 : 0
  const mentality = tactics.attackingMentality === 'aggressive' ? .035 : tactics.attackingMentality === 'direct' ? .025 : tactics.attackingMentality === 'possession' ? -.01 : 0
  const progress = clamp(teamProgress(match, player.team, anchor.x) + blockDepth + (line === 'defense' ? lineHeight : 0) + (defending ? 0 : mentality), .055, .79)
  const widthScale = defending && block === 'low_block' ? .88 : defending ? .94 : 1
  return {
    x: context.ownGoalX + context.direction * progress,
    y: clamp(.5 + (anchor.y - .5) * widthScale, .08, .92),
  }
}

export function formationPositions(match, player) {
  const role = player.tacticalRole ?? tacticalRoleForSlot(teamContext(match, player.team).formation, player.formationSlot?.line, player.formationSlot?.index ?? 0)
  const base = formationAnchor(match, player)
  const attacking = formationTarget(match, player, 'attacking')
  const defending = formationTarget(match, player, 'defending')
  return { role, zone: tacticalZoneForRole(role), base, attacking, defending, recovery: defending ?? base }
}

export function maximumPositionalDeviation(player) {
  return ROLE_LIMITS[player.tacticalRole] ?? (player.role?.startsWith('DEFENDER') ? .075 : .12)
}

export function attackingSupportTarget(match, player, carrier) {
  const anchor = formationTarget(match, player)
  if (!anchor || !carrier || !player.formationSlot) return null
  const direction = teamDirection(match, player.team)
  const role = player.tacticalRole ?? tacticalRoleForSlot(teamContext(match, player.team).formation, player.formationSlot.line, player.formationSlot.index ?? 0)
  const limit = maximumPositionalDeviation(player)
  const carrierDistance = distance(player, carrier)
  const lateralDistance = Math.abs(anchor.y - carrier.y)
  const ballSide = lateralDistance < .31
  let x = anchor.x, y = anchor.y
  const ahead = (carrier.x - anchor.x) * direction

  if (role === 'CB' || role === 'LCB' || role === 'RCB') {
    if (carrierDistance < .48) {
      x = carrier.x - direction * .13
      y += clamp((carrier.y - anchor.y) * .12, -.025, .025)
    }
  } else if (['LB', 'RB', 'LWB', 'RWB'].includes(role)) {
    const overlapping = ballSide && (carrier.x - player.x) * direction > -.04
    if (carrierDistance < .52 && overlapping) {
      x = carrier.x + direction * .10
      y += clamp((carrier.y - anchor.y) * .12, -.035, .035)
    } else {
      x += direction * .018
      y += ballSide ? clamp((carrier.y - anchor.y) * .08, -.025, .025) : (0.5 - anchor.y) * .045
    }
  } else if (['DM', 'LDM', 'RDM'].includes(role)) {
    if (carrierDistance < .5) {
      x = carrier.x - direction * .12
      y += clamp((.5 - anchor.y) * .08, -.025, .025)
    }
  } else if (['CM', 'LCM', 'RCM'].includes(role)) {
    if (carrierDistance < .56 && (ballSide || lateralDistance < .48)) {
      x = carrier.x - direction * .055
      y = carrier.y + (anchor.y < carrier.y ? -.12 : .12)
    } else y += clamp((.5 - anchor.y) * .06, -.025, .025)
  } else if (['LM', 'RM', 'LW', 'RW'].includes(role)) {
    if (ballSide && carrierDistance < .58) {
      x = carrier.x - direction * .025
      y = carrier.y + (anchor.y < carrier.y ? -.14 : .14)
    } else {
      x += direction * .025
      y += (0.5 - anchor.y) * .035
    }
  } else if (role === 'LAM' || role === 'RAM') {
    if (carrierDistance < .5) {
      x = carrier.x - direction * .045
      y = carrier.y + (anchor.y < carrier.y ? -.1 : .1)
    }
  } else if (role === 'CAM') {
    if (carrierDistance < .56) {
      x = carrier.x - direction * .06
      y = carrier.y + (anchor.y < carrier.y ? -.105 : .105)
    }
  } else if (role === 'ST') {
    if (carrierDistance < .5) {
      const ownGoal = teamContext(match, player.team).ownGoalX
      const anchorProgress = teamProgress(match, player.team, anchor.x)
      const carrierProgress = teamProgress(match, player.team, carrier.x)
      x = ownGoal + direction * Math.max(anchorProgress, carrierProgress + .12)
      y += clamp((carrier.y - anchor.y) * .08, -.025, .025)
    }
  }

  const maxX = limit * (['CB', 'LCB', 'RCB', 'DM', 'LDM', 'RDM'].includes(role) ? .55 : 1)
  return {
    x: clamp(x, anchor.x - maxX, anchor.x + maxX),
    y: clamp(y, Math.max(.08, anchor.y - limit), Math.min(.92, anchor.y + limit)),
  }
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

export function goalkeeperHomeX(match, team, inset = 0.055) {
  const context = teamContext(match, team)
  return context.ownGoalX + context.direction * inset
}
