import {
  buildPerceptionForTeam,
  chooseIntent,
} from "./decision.js";
import {
  chooseDefensiveIntents,
} from "./defense.js";
import { perceivePlayer } from "./perception.js";
import { applyBehaviorPlan } from "./stateMachine.js";
import { evaluatePassOptions } from "./decision.js";
import { FIELD_DIMENSIONS } from "./field.js";
import { addStat, createStatistics } from "./statistics.js";
import { createTeamTactics, tacticsFor } from "./tactics.js";
import { FORMATION_SHAPES, formationAnchor, formationPositions, formationTarget, goalkeeperHomeX, opponentTeam, playersForTeam, teamContext, teamDirection, teamLabel, teamProgress, tacticalRoleForSlot } from "./team.js";
import { kitsForFixture } from "./kits.js";

export const FIXED_TIMESTEP = 1 / 60;
export { FIELD_DIMENSIONS } from "./field.js";
export const ATTRIBUTE_DEFINITIONS = Object.freeze({
  PAC: "Movement speed and acceleration potential",
  PAS: "Passing accuracy and execution",
  SHO: "Shot accuracy and execution",
  DRI: "Ball carrying, turning, and evasion",
  CON: "Receiving and ball control",
  FIT: "Permanent stamina/endurance ability; current match fitness is tracked separately",
  TAC: "Challenge strength and ball winning",
  DEC: "Choice quality for actions and defensive reactions",
  POS: "Off-ball attacking position and defensive shape",
  VIS: "Awareness of teammates, space, passing options, and threats",
  DEF: "Marking, covering, pressing, and goal protection",
});
export const GOALKEEPER_ATTRIBUTE_DEFINITIONS = Object.freeze({
  REF: "Reaction speed for shots, deflections, and close-range attempts",
  POS_GK: "Position relative to the goal, ball, shooter, and shot angle",
  HAN: "Ability to catch, hold, and claim the ball safely",
});
const AI_INTERVAL = 1 / 7;
const MATCH_LENGTH = 480;
const HALF_LENGTH = MATCH_LENGTH / 2;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const fitnessFactor = (player) => 0.78 + clamp((player.fitness ?? 100) / 100, 0, 1) * 0.22;

function random(match) {
  // Match-local, seeded LCG. Variation is repeatable for a given seed and never
  // coupled to the rendering frame rate.
  match.rng = (Math.imul(match.rng, 1664525) + 1013904223) >>> 0;
  return match.rng / 4294967296;
}
const between = (match, min, max) => min + random(match) * (max - min);

function makePlayer(number, x, y, profile, attributes, laneSide, roleOverride = null) {
  return {
    id: `home-${number}`,
    name: `Player ${number}`,
    team: "home",
    number,
    x,
    y,
    vx: 0,
    vy: 0,
    heading: 0,
    target: { x, y },
    targetReason: "Starting position",
    state: number === 2 ? "CONTROL" : "SUPPORT",
    previousState: null,
    intent: number === 2 ? "CONTROL" : "SUPPORT",
    previousIntent: null,
    timeInState: 0,
    commitment: 0,
    profile,
    role: roleOverride ?? (
      profile === "attacking"
        ? "ATTACKER"
        : profile === "support"
          ? "SUPPORT"
          : "DEFENDER"),
    attributes,
    fitness: 100,
    stuckTimer: 0,
    fallbackReadyAt: 0,
    repeatedDecisionTime: 0,
    lastDecisionKey: null,
    laneSide,
    runAttempt: -1,
    runReadyAt: 0,
    actionScores: {},
    chosenAction: "CONTROL",
    perception: null,
  };
}

function makeGoalkeeper(team, x, attributes) {
  return {
    id: `${team}-gk`,
    name: team === "home" ? "Elliot Ward" : "Niko Petrov",
    team,
    number: "GK",
    role: "GOALKEEPER",
    isGoalkeeper: true,
    x,
    y: 0.5,
    vx: 0,
    vy: 0,
    heading: 0,
    target: { x, y: 0.5 },
    targetReason: "Guard the goal and track the ball",
    state: "GK_POSITION",
    intent: "GK_POSITION",
    previousState: null,
    previousIntent: null,
    timeInState: 0,
    commitment: 0,
    attributes,
    fitness: 100,
    stuckTimer: 0,
    fallbackReadyAt: 0,
    repeatedDecisionTime: 0,
    lastDecisionKey: null,
    actionScores: {},
    perception: null,
    distributionReadyAt: 0,
    saveAttemptedAt: -1,
    challengeReadyAt: 0,
  };
}

function createLegacyMatch(seed = Date.now() >>> 0) {
  const players = [
    makePlayer(
      2,
      0.31,
      0.5,
      "attacking",
      {
        PAC: 78,
        PAS: 68,
        SHO: 99,
        DRI: 79,
        CON: 76,
        FIT: 92,
        TAC: 40,
        DEC: 88,
        POS: 92,
        VIS: 75,
        DEF: 35,
      },
      0,
    ),
    makePlayer(
      4,
      0.46,
      0.65,
      "support",
      {
        PAC: 68,
        PAS: 82,
        SHO: 64,
        DRI: 69,
        CON: 81,
        FIT: 96,
        TAC: 45,
        DEC: 90,
        POS: 86,
        VIS: 94,
        DEF: 45,
      },
      1,
    ),
  ];
  const makeAway = (number, y, role, attributes) => {
    const defender = makePlayer(
      number,
      number === 5 ? 0.8 : 0.82,
      y,
      "defender",
      attributes,
      number === 5 ? 0 : 1,
    );
    defender.id = `away-${number}`;
    defender.team = "away";
    defender.role = role;
    defender.state = "DEFEND_SHAPE";
    defender.intent = "DEFEND_SHAPE";
    defender.targetReason = "Protect the away goal";
    defender.targetPlayerId = null;
    defender.challengeReadyAt = 0;
    defender.defensiveScores = { DEFEND_SHAPE: 70 };
    return defender;
  };
  const awayPlayers = [
    makeAway(5, 0.42, "DEFENDER", {
      PAC: 76,
      PAS: 38,
      SHO: 24,
      DRI: 42,
      CON: 65,
      FIT: 90,
      TAC: 78,
      DEC: 82,
      POS: 88,
      VIS: 72,
      DEF: 92,
    }),
    makeAway(6, 0.6, "DEFENDER_SUPPORT", {
      PAC: 72,
      PAS: 55,
      SHO: 30,
      DRI: 48,
      CON: 70,
      FIT: 88,
      TAC: 72,
      DEC: 78,
      POS: 80,
      VIS: 78,
      DEF: 84,
    }),
  ];
  const attributes = { PAC: 70, PAS: 70, SHO: 60, DRI: 68, CON: 70, FIT: 78, TAC: 66, DEC: 70, POS: 70, VIS: 70, DEF: 66 }
  const addFieldPlayer = (team, number, line, index, count, role) => {
    const player = makePlayer(number, team === 'home' ? .31 : .69, .5, role === 'DEFENDER' ? 'defender' : 'support', { ...attributes }, index % 2, role)
    player.id = `${team}-${number}`; player.team = team; player.state = role.startsWith('DEFENDER') ? 'DEFEND_SHAPE' : 'SUPPORT'; player.intent = player.state
    player.formationSlot = { line, index, count }; player.targetPlayerId = null; player.challengeReadyAt = 0
    player.defensiveScores = role.startsWith('DEFENDER') ? { DEFEND_SHAPE: 70 } : {}
    return player
  }
  players[0].formationSlot = { line: 'attack', index: 0, count: 2 }
  players[1].formationSlot = { line: 'midfield', index: 0, count: 4 }
  players[1].role = 'ATTACKER_SUPPORT'
  players.push(addFieldPlayer('home', 9, 'midfield', 1, 4, 'ATTACKER_SUPPORT'), addFieldPlayer('home', 10, 'midfield', 2, 4, 'ATTACKER_SUPPORT'), addFieldPlayer('home', 11, 'midfield', 3, 4, 'ATTACKER_SUPPORT'), addFieldPlayer('home', 12, 'attack', 1, 2, 'ATTACKER'), addFieldPlayer('home', 13, 'defense', 2, 4, 'DEFENDER'), addFieldPlayer('home', 14, 'defense', 3, 4, 'DEFENDER_SUPPORT'))
  awayPlayers[0].formationSlot = { line: 'defense', index: 0, count: 4 }
  awayPlayers[1].formationSlot = { line: 'defense', index: 1, count: 4 }
  awayPlayers.push(addFieldPlayer('away', 9, 'defense', 2, 4, 'DEFENDER'), addFieldPlayer('away', 10, 'defense', 3, 4, 'DEFENDER_SUPPORT'), addFieldPlayer('away', 11, 'midfield', 0, 4, 'ATTACKER_SUPPORT'), addFieldPlayer('away', 12, 'midfield', 1, 4, 'ATTACKER_SUPPORT'), addFieldPlayer('away', 13, 'midfield', 2, 4, 'ATTACKER_SUPPORT'), addFieldPlayer('away', 14, 'midfield', 3, 4, 'ATTACKER_SUPPORT'))
  const goalkeepers = {
    home: makeGoalkeeper("home", 0.055, {
      PAC: 61, PAS: 73, SHO: 15, DRI: 42, CON: 85, FIT: 91,
      TAC: 35, DEC: 86, POS: 82, VIS: 80, DEF: 88,
      REF: 89, POS_GK: 91, HAN: 86,
    }),
    away: makeGoalkeeper("away", 0.945, {
      PAC: 58, PAS: 70, SHO: 14, DRI: 40, CON: 88, FIT: 90,
      TAC: 38, DEC: 84, POS: 85, VIS: 82, DEF: 86,
      REF: 87, POS_GK: 89, HAN: 89,
    }),
  };
  const match = {
    players,
    opponents: awayPlayers,
    substitutes: { home: [], away: [] },
    substitutionCounts: { home: 0, away: 0 },
    goalkeepers,
    ball: {
      x: 0.33,
      y: 0.5,
      vx: 0,
      vy: 0,
      state: "controlled",
      ownerId: "home-2",
      team: "home",
      targetId: null,
    },
    elapsed: 0,
    minute: 0,
    phase: "playing",
    half: 1,
    events: [],
    eventId: 0,
    aiAccumulator: 0,
    restartTimer: 0,
    runWindow: 0,
    seed: seed >>> 0,
    rng: seed >>> 0,
    homeScore: 0,
    awayScore: 0,
    goals: [],
    shotSequence: 0,
    firstHalfStatistics: null,
    shots: 0,
    awayShots: 0,
    attackStartedAt: 0,
    recentPasses: [],
    pendingKickoffTeam: null,
    primaryDefenderId: null,
    defensiveAssignments: {},
    primaryHomeDefenderId: null,
    possessionTeam: "home",
    possessionPlayerId: "home-2",
    managedTeam: null,
    teamTactics: createTeamTactics(),
    teamContexts: {
      home: { key: "home", clubId: "harbor-athletic", clubName: "Harbor Athletic", attackDirection: 1, formation: "4-4-2", homeAway: "HOME" },
      away: { key: "away", clubId: "redvale-fc", clubName: "Redvale FC", attackDirection: -1, formation: "4-4-2", homeAway: "AWAY" },
    },
    teamIds: { home: "harbor-athletic", away: "redvale-fc" },
    teamNames: { home: "Harbor Athletic", away: "Redvale FC" },
    kits: kitsForFixture("harbor-athletic", "redvale-fc"),
    homeTeam: "home",
    awayTeam: "away",
    transitionTeam: null,
    transitionUntil: 0,
    noProgressSeconds: 0,
    progressSnapshot: null,
    deadlockReevaluationCount: 0,
    attackProgressWatch: { team: null, startedAt: 0, bestProgress: 0, lastMeaningfulActionAt: 0, recoveryCount: 0 },
    invalidStateCount: 0,
  };
  for (const team of ["home", "away"]) {
    match.teamContexts[team].kit = match.kits[team];
    for (const player of playersForTeam(match, team)) {
      player.clubId = match.teamContexts[team].clubId;
      player.clubName = match.teamContexts[team].clubName;
    }
    match.goalkeepers[team].clubId = match.teamContexts[team].clubId;
    match.goalkeepers[team].clubName = match.teamContexts[team].clubName;
  }
  return match;
}

export function createMatch(seed = Date.now() >>> 0, setup = null) {
  const match = createLegacyMatch(seed);
  const [homeAttacker, homeSupport] = match.players;
  homeAttacker.x = 0.58; homeAttacker.y = 0.41;
  homeSupport.x = 0.58; homeSupport.y = 0.61;
  homeSupport.role = "ATTACKER_SUPPORT";
  homeAttacker.target = { x: homeAttacker.x, y: homeAttacker.y };
  homeSupport.target = { x: homeSupport.x, y: homeSupport.y };
  const homeDefenders = [
    makePlayer(3, 0.3, 0.4, "defender", { PAC: 74, PAS: 70, SHO: 42, DRI: 55, CON: 70, FIT: 91, TAC: 80, DEC: 84, POS: 88, VIS: 78, DEF: 86 }, 0),
    makePlayer(6, 0.3, 0.6, "defender", { PAC: 70, PAS: 76, SHO: 38, DRI: 57, CON: 75, FIT: 93, TAC: 76, DEC: 86, POS: 87, VIS: 84, DEF: 82 }, 1, "DEFENDER_SUPPORT"),
  ];
  match.players.push(...homeDefenders);
  const setLine = (players, numbers, line) => numbers.forEach((number, index) => {
    const player = players.find(candidate => candidate.number === number)
    if (player) player.formationSlot = { line, index, count: numbers.length }
  })
  setLine(match.players, [3, 6, 13, 14], 'defense')
  setLine(match.players, [4, 9, 10, 11], 'midfield')
  setLine(match.players, [2, 12], 'attack')
  const makeAway = (number, x, y, role, attributes) => {
    const player = makePlayer(number, x, y, role === "ATTACKER" || role === "ATTACKER_SUPPORT" ? "attacking" : "defender", attributes, number % 2, role);
    player.id = `away-${number}`;
    player.team = "away";
    player.state = role.startsWith("DEFENDER") ? "DEFEND_SHAPE" : "SUPPORT";
    player.intent = player.state;
    player.targetReason = role.startsWith("DEFENDER") ? "Protect the away goal" : "Stay available in attack";
    player.targetPlayerId = null;
    player.challengeReadyAt = 0;
    player.defensiveScores = role.startsWith("DEFENDER") ? { DEFEND_SHAPE: 70 } : {};
    return player;
  };
  const awayPlayers = match.opponents;
  awayPlayers[0].x = awayPlayers[1].x = 0.7;
  awayPlayers[0].role = "DEFENDER";
  awayPlayers[1].role = "DEFENDER_SUPPORT";
  awayPlayers[0].y = 0.4;
  awayPlayers[1].y = 0.6;
  awayPlayers.push(
    makeAway(7, 0.42, 0.4, "ATTACKER", { PAC: 78, PAS: 62, SHO: 72, DRI: 74, CON: 70, FIT: 91, TAC: 44, DEC: 80, POS: 84, VIS: 72, DEF: 42 }),
    makeAway(8, 0.42, 0.6, "ATTACKER_SUPPORT", { PAC: 72, PAS: 76, SHO: 66, DRI: 70, CON: 78, FIT: 92, TAC: 48, DEC: 86, POS: 88, VIS: 86, DEF: 46 }),
  );
  setLine(awayPlayers, [5, 6, 9, 10], 'defense')
  setLine(awayPlayers, [11, 12, 13, 14], 'midfield')
  setLine(awayPlayers, [7, 8], 'attack')
  for (const player of [...match.players, ...awayPlayers]) {
    player.target = { x: player.x, y: player.y };
    player.team === "away" && (player.targetReason = player.role.startsWith("DEFENDER") ? "Protect the away goal" : "Hold an advanced attacking position");
  }
  match.ball.x = homeAttacker.x;
  match.ball.ownerId = homeAttacker.id;
  match.ball.team = "home";
  match.possessionTeam = "home";
  match.possessionPlayerId = homeAttacker.id;
  const names = {
    "home-2": "Mateo Silva", "home-4": "Jonah Reed", "home-3": "Luca Hayes", "home-6": "Ethan Cole",
    "away-5": "Anton Varga", "away-6": "Milan Kovac", "away-7": "Dario Moretti", "away-8": "Tomas Novak",
  };
  for (const player of [...match.players, ...match.opponents]) player.name = names[player.id] ?? player.name;
  match.statistics = createStatistics(match);
  if (setup) {
    match.homeTeam = "home";
    match.awayTeam = "away";
    const homeClubId = setup.home?.clubId ?? setup.teamIds?.home ?? "home-club";
    const awayClubId = setup.away?.clubId ?? setup.teamIds?.away ?? "away-club";
    match.teamIds = { home: homeClubId, away: awayClubId };
    match.kits = kitsForFixture(homeClubId, awayClubId);
    match.managedTeam = setup.managedTeam ?? null;
    for (const team of ["home", "away"]) {
      const context = match.teamContexts[team];
      const data = setup[team];
      match.teamContexts[team] = { ...context, key: team, clubId: data?.clubId ?? match.teamIds[team],
        clubName: data?.name ?? (team === "home" ? "Home Club" : "Away Club"),
        attackDirection: team === "home" ? 1 : -1,
        homeAway: team === "home" ? "HOME" : "AWAY", kit: match.kits[team] };
      match.teamNames[team] = match.teamContexts[team].clubName;
    }
    const configureSide = (team, data) => {
      if (!data) return;
      // The legacy bootstrap match is only a source of initialized player
      // objects. Career setups own the real lineup size and must replace it.
      const slots = playersForTeam(match, team).slice(0, data.players?.length ?? 0);
      if (team === 'home') match.players = slots; else match.opponents = slots;
      match.teamContexts[team].formation = data.formation ?? "4-4-2";
      match.teamTactics[team] = { ...match.teamTactics[team], ...(data.tactics ?? {}) };
      delete match.teamTactics[team].playerFreedom;
      match.substitutes[team] = (data.substitutes ?? []).filter(Boolean).map(source => ({ ...source, team, clubId: match.teamContexts[team].clubId, clubName: match.teamContexts[team].clubName, isGoalkeeper: source.position === 'GK' || source.positionGroup === 'GK', substitutedOff: false, sentOff: false, vx: 0, vy: 0, target: { x: .5, y: .5 }, fitness: source.fitness ?? 100, attributes: { ...source.attributes } }));
      data.players.forEach((source, index) => {
        if (!source || !slots[index]) return;
        const role = source.matchRole ?? source.role ?? ["ATTACKER", "ATTACKER_SUPPORT", "DEFENDER", "DEFENDER_SUPPORT"][index] ?? "ATTACKER_SUPPORT";
        const formationSlot = source.formationSlot ?? null;
        const tacticalRole = source.tacticalRole ?? tacticalRoleForSlot(match.teamContexts[team].formation, formationSlot?.line, formationSlot?.index ?? 0);
        const positionalProfile = formationPositions(match, { ...source, team, tacticalRole, formationSlot });
        Object.assign(slots[index], source, {
          team, clubId: match.teamContexts[team].clubId, clubName: match.teamContexts[team].clubName, role, profile: role.startsWith("DEFENDER") ? "defender" : "attacking", formationSlot,
          tacticalRole, tacticalZone: positionalProfile.zone, positionalProfile,
          laneSide: source.laneSide ?? (formationSlot?.index ?? index) % 2,
          attributes: { ...source.attributes }, fitness: source.fitness ?? 100,
          vx: 0, vy: 0, timeInState: 0, commitment: 0,
          state: role.startsWith("DEFENDER") ? "DEFEND_SHAPE" : "SUPPORT",
          intent: role.startsWith("DEFENDER") ? "DEFEND_SHAPE" : "SUPPORT",
          defensiveScores: role.startsWith("DEFENDER") ? { DEFEND_SHAPE: 70 } : {},
          challengeReadyAt: 0, targetPlayerId: null, perception: null, actionScores: {},
        });
        const shapeTarget = formationTarget(match, slots[index]);
        const anchor = formationAnchor(match, slots[index]);
        if (shapeTarget) Object.assign(slots[index], { baseFormationPosition: anchor, x: shapeTarget.x, y: shapeTarget.y, target: { ...shapeTarget }, targetReason: "Start in the selected formation slot" });
      });
      for (const slotPlayer of slots) {
        const target = formationTarget(match, slotPlayer)
        if (target) { slotPlayer.x = target.x; slotPlayer.y = target.y; slotPlayer.target = { ...target }; slotPlayer.baseFormationPosition = formationAnchor(match, slotPlayer) }
      }
      const keeper = match.goalkeepers[team];
      if (data.goalkeeper) Object.assign(keeper, data.goalkeeper, { team, clubId: match.teamContexts[team].clubId, clubName: match.teamContexts[team].clubName, isGoalkeeper: true, role: "GOALKEEPER", attributes: { ...data.goalkeeper.attributes }, fitness: data.goalkeeper.fitness ?? 100 });
      const keeperX = goalkeeperHomeX(match, team);
      const keeperHome = { x: keeperX, y: .5 };
      Object.assign(keeper, { tacticalRole: "GK", tacticalZone: "GOAL_ZONE", baseFormationPosition: keeperHome, positionalProfile: { role: "GK", zone: "GOAL_ZONE", base: keeperHome, attacking: keeperHome, defending: keeperHome, recovery: keeperHome }, x: keeperX, y: .5, target: { x: keeperX, y: .5 }, vx: 0, vy: 0 });
      match.teamNames[team] = data.name ?? match.teamNames[team];
    };
    configureSide("home", setup.home);
    configureSide("away", setup.away);
    for (const team of ["home", "away"]) {
      for (const player of playersForTeam(match, team)) {
        player.clubId = match.teamContexts[team].clubId;
        player.clubName = match.teamContexts[team].clubName;
      }
      match.goalkeepers[team].clubId = match.teamContexts[team].clubId;
      match.goalkeepers[team].clubName = match.teamContexts[team].clubName;
    }
    const kickoffTeam = setup.kickoffTeam ?? match.homeTeam;
    const kickingPlayers = playersForTeam(match, kickoffTeam);
    const taker = kickingPlayers.find(player => player.role === "ATTACKER") ?? kickingPlayers[0];
    match.ball.ownerId = taker.id; match.ball.team = kickoffTeam; match.ball.state = "controlled";
    match.ball.x = taker.x; match.ball.y = taker.y; match.ball.vx = match.ball.vy = 0;
    match.possessionTeam = kickoffTeam; match.possessionPlayerId = taker.id;
    match.statistics = createStatistics(match);
  } else {
    for (const team of ['home', 'away']) for (const player of teamPlayers(match, team)) {
      const target = formationTarget(match, player)
      if (target) { player.x = target.x; player.y = target.y; player.target = { ...target } }
    }
    match.ball.x = homeAttacker.x; match.ball.y = homeAttacker.y
    match.goalkeepers.home.x = goalkeeperHomeX(match, 'home'); match.goalkeepers.away.x = goalkeeperHomeX(match, 'away')
  }

  return match;
}

function log(match, type, text) {
  const prior = match.events[0];
  if (
    prior?.type === type &&
    prior.text === text &&
    match.minute - prior.minute < 3
  )
    return;
  match.events.unshift({
    id: ++match.eventId,
    minute: match.minute,
    type,
    text,
  });
  match.events = match.events.slice(0, 80);
}

function teamPlayers(match, team) {
  return playersForTeam(match, team);
}

function playerPositionGroup(player) {
  return player?.positionGroup ?? ({ GK: 'GK', RB: 'DEF', LB: 'DEF', CB: 'DEF', DM: 'MID', CM: 'MID', AM: 'MID', RW: 'ATT', LW: 'ATT', ST: 'ATT' })[player?.position] ?? player?.position;
}

export function substitutePlayer(match, team, outgoingId, incomingId) {
  if (!match || !['home', 'away'].includes(team) || !['playing', 'halftime'].includes(match.phase)) return { ok: false, message: 'Substitutions are only available during the match.' };
  match.substitutionCounts ??= { home: 0, away: 0 };
  match.substitutes ??= { home: [], away: [] };
  if (match.substitutionCounts[team] >= 5) return { ok: false, message: 'This team has used all five substitutions.' };
  const active = teamPlayers(match, team);
  const outgoing = active.find(player => player.id === outgoingId);
  const incoming = match.substitutes[team].find(player => player.id === incomingId && !player.substitutedOff && !player.sentOff);
  if (!outgoing || outgoing.sentOff || outgoing.substitutedOff) return { ok: false, message: 'The player coming off is not currently eligible.' };
  if (!incoming) return { ok: false, message: 'The replacement is not available on the bench.' };
  if (playerPositionGroup(outgoing) !== playerPositionGroup(incoming)) return { ok: false, message: 'Choose a replacement for the same position group.' };
  const isKeeperSwap = Boolean(outgoing.isGoalkeeper);
  if (isKeeperSwap !== Boolean(incoming.isGoalkeeper)) return { ok: false, message: 'A goalkeeper must be replaced by the reserve goalkeeper.' };
  const activePlayers = team === 'home' ? match.players : match.opponents;
  const outgoingVelocity = { x: outgoing.vx ?? 0, y: outgoing.vy ?? 0 };
  outgoing.substitutedOff = true;
  invalidateActorCache(match);
  outgoing.state = 'SUBBED_OFF'; outgoing.intent = 'SUBBED_OFF'; outgoing.vx = 0; outgoing.vy = 0;
  Object.assign(incoming, {
    team, clubId: outgoing.clubId, clubName: outgoing.clubName,
    role: outgoing.role, tacticalRole: outgoing.tacticalRole, tacticalZone: outgoing.tacticalZone,
    positionalProfile: outgoing.positionalProfile ? { ...outgoing.positionalProfile } : outgoing.positionalProfile,
    baseFormationPosition: outgoing.baseFormationPosition ? { ...outgoing.baseFormationPosition } : outgoing.baseFormationPosition,
    profile: outgoing.profile,
    formationSlot: outgoing.formationSlot ? { ...outgoing.formationSlot } : outgoing.formationSlot,
    laneSide: outgoing.laneSide, x: outgoing.x, y: outgoing.y,
    target: { ...(outgoing.target ?? { x: outgoing.x, y: outgoing.y }) },
    state: isKeeperSwap ? 'GOALKEEPER' : outgoing.role.startsWith('DEFENDER') ? 'DEFEND_SHAPE' : 'SUPPORT',
    intent: isKeeperSwap ? 'GOALKEEPER' : outgoing.role.startsWith('DEFENDER') ? 'DEFEND_SHAPE' : 'SUPPORT',
    timeInState: 0, commitment: 0, substitutedOff: false, sentOff: false, vx: 0, vy: 0,
  });
  if (isKeeperSwap) match.goalkeepers[team] = incoming;
  else activePlayers.push(incoming);
  match.substitutes[team] = match.substitutes[team].filter(player => player.id !== incoming.id);
  match.substitutionCounts[team]++;
  if (match.statistics?.players?.[incoming.id]) match.statistics.players[incoming.id].appearances = 1;
  if (match.ball.ownerId === outgoing.id) {
    match.ball.ownerId = null; match.ball.targetId = null; match.ball.team = null; match.ball.state = 'loose';
    match.ball.vx = outgoingVelocity.x * .2; match.ball.vy = outgoingVelocity.y * .2;
  } else if (match.ball.targetId === outgoing.id) {
    match.ball.targetId = null; match.ball.team = null; match.ball.state = 'loose';
  }
  for (const player of teamPlayers(match, team)) {
    player.positionalProfile = formationPositions(match, player);
    player.tacticalZone = player.positionalProfile.zone;
    player.baseFormationPosition = player.positionalProfile.base ?? formationAnchor(match, player);
    const target = formationTarget(match, player);
    if (target) player.target = { ...target };
    player.commitment = 0;
  }
  const target = formationTarget(match, match.goalkeepers[team]);
  if (target && isKeeperSwap) incoming.target = { ...target };
  syncPossession(match);
  log(match, 'substitution', `${teamName(match, team)} substitution: ${outgoing.name} OFF, ${incoming.name} ON.`);
  return { ok: true, outgoing, incoming, substitutionsUsed: match.substitutionCounts[team] };
}

export function changeLiveFormation(match, team, formation) {
  const shape=FORMATION_SHAPES[formation]
  if(!match||!['home','away'].includes(team)||!shape)return {ok:false,message:'Choose a supported formation.'}
  const active=playersForTeam(match,team).filter(player=>!player.isGoalkeeper)
  if(active.length!==10)return {ok:false,message:'A formation change needs ten active outfield players.'}
  const originalRole=player=>player.formationSlot?.line==='defense'?0:player.formationSlot?.line==='midfield'?1:2
  const ordered=[...active].sort((a,b)=>originalRole(a)-originalRole(b)||(a.formationSlot?.index??0)-(b.formationSlot?.index??0))
  const lines=[['defense',shape.defs],['midfield',shape.mids],['attack',shape.atts]]
  let cursor=0
  match.teamContexts[team].formation=formation
  for(const [line,count] of lines){
    for(let index=0;index<count;index++){
      const player=ordered[cursor++]
      const layer=line==='midfield'?'central':null
      const formationSlot={line,index,count,...(layer?{layer}:{})}
      const tacticalRole=tacticalRoleForSlot(formation,line,index)
      const role=line==='defense'?(index===0?'DEFENDER':'DEFENDER_SUPPORT'):line==='attack'?(index===0?'ATTACKER':'ATTACKER_SUPPORT'):'ATTACKER_SUPPORT'
      Object.assign(player,{formationSlot,tacticalRole,tacticalZone:formationPositions(match,{...player,formationSlot,tacticalRole}).zone,role,profile:line==='defense'?'defender':'attacking',state:line==='defense'?'DEFEND_SHAPE':'SUPPORT',intent:line==='defense'?'DEFEND_SHAPE':'SUPPORT',commitment:0,timeInState:0})
      player.positionalProfile=formationPositions(match,player)
      player.baseFormationPosition=formationAnchor(match,player)
      const target=formationTarget(match,player)
      if(target)player.target={...target}
    }
  }
  return {ok:true,formation}
}

function opponentPlayers(match, team) { return playersForTeam(match, opponentTeam(team)); }
function attackGoal(match, team) { return { x: teamContext(match, team).goalX, y: 0.5 }; }
function teamName(match, team) { return teamLabel(match, team); }

const actorCache = new WeakMap();
function actorsForMatch(match) {
  const version = match.actorRosterVersion ?? 0;
  let cached = actorCache.get(match);
  if (!cached || cached.version !== version) {
    const ordered = [...match.players, ...match.opponents, ...Object.values(match.goalkeepers ?? {})]
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const active = ordered.filter(player => !player.sentOff && !player.substitutedOff);
    cached = { version, active, byId: new Map(active.map(player => [player.id, player])) };
    actorCache.set(match, cached);
  }
  return cached;
}
function allActors(match) { return actorsForMatch(match).active; }
function invalidateActorCache(match) { match.actorRosterVersion = (match.actorRosterVersion ?? 0) + 1; }

function getPlayer(match, id) { return actorsForMatch(match).byId.get(id) ?? null; }

function syncPossession(match) {
  const owner = getPlayer(match, match.ball.ownerId);
  if (owner) {
    match.possessionTeam = owner.team;
    match.possessionPlayerId = owner.id;
  } else if (match.ball.team && ["pass", "shot"].includes(match.ball.state)) {
    match.possessionTeam = match.ball.team;
    match.possessionPlayerId = null;
  } else {
    match.possessionTeam = "none";
    match.possessionPlayerId = null;
  }
}

function steer(player, dt, match) {
  if (!player.target || !Number.isFinite(player.target.x) || !Number.isFinite(player.target.y)) {
    player.target = { x: player.x, y: player.y };
    player.stuckTimer = Math.max(player.stuckTimer ?? 0, 3);
    player.lastDecisionKey = null;
    player.invalidTargetDetected = true;
    if (match.elapsed - (player.lastInvalidTargetLogAt ?? -10) > 5) {
      player.lastInvalidTargetLogAt = match.elapsed;
      match.invalidStateCount = (match.invalidStateCount ?? 0) + 1;
      log(match, "simulation_recovery", `Reset an invalid movement target for ${teamName(match, player.team)} ${player.isGoalkeeper ? "goalkeeper" : `#${player.number}`}.`);
    }
  }
  const dx = player.target.x - player.x;
  const dy = player.target.y - player.y;
  const remaining = Math.hypot(dx, dy);
  const containSpeed = player.state === "CONTAIN" ? 0.48 : 1;
  const speedLimit =
    (0.075 + player.attributes.PAC * 0.00062) *
    fitnessFactor(player) *
    containSpeed;
  const wantedSpeed = Math.min(speedLimit, Math.sqrt(remaining * 1.65));
  const desiredX = remaining > 0.004 ? (dx / remaining) * wantedSpeed : 0;
  const desiredY = remaining > 0.004 ? (dy / remaining) * wantedSpeed : 0;
  let separationX = 0,
    separationY = 0;
  {
    for (const other of allActors(match)) {
      if (other === player) continue;
      const sx = player.x - other.x,
        sy = player.y - other.y;
      const d = Math.hypot(sx, sy);
      const separationRadius = 0.022;
      if (d > 0 && d < separationRadius) {
        const strength = (separationRadius - d) * 5;
        separationX += (sx / d) * strength;
        separationY += (sy / d) * strength;
      }
    }
  }
  const acceleration = 0.55 * fitnessFactor(player);
  player.vx += clamp(
    desiredX + separationX - player.vx,
    -acceleration * dt,
    acceleration * dt,
  );
  player.vy += clamp(
    desiredY + separationY - player.vy,
    -acceleration * dt,
    acceleration * dt,
  );
  const speed = Math.hypot(player.vx, player.vy);
  if (speed > 0.003) {
    const angle = Math.atan2(player.vy, player.vx);
    const turn = Math.atan2(
      Math.sin(angle - player.heading),
      Math.cos(angle - player.heading),
    );
    player.heading += turn * Math.min(1, dt * 5);
  }
  if (player.state === "CONTAIN" && player.targetPlayerId) {
    const tracked = opponentPlayers(match, player.team).find(
      (candidate) => candidate.id === player.targetPlayerId,
    );
    if (tracked) {
      const facing = Math.atan2(tracked.y - player.y, tracked.x - player.x);
      const turn = Math.atan2(
        Math.sin(facing - player.heading),
        Math.cos(facing - player.heading),
      );
      player.heading += turn * Math.min(1, dt * 4);
    }
  }
  const previousX = player.x, previousY = player.y;
  player.x = clamp(player.x + player.vx * dt * FIELD_DIMENSIONS.scaleX, 0.035, 0.965);
  player.y = clamp(player.y + player.vy * dt * FIELD_DIMENSIONS.scaleY, 0.06, 0.94);
  player.timeInState += dt;
  player.commitment = Math.max(0, player.commitment - dt);
  const speedRatio = clamp(speed / Math.max(0.08, 0.075 + player.attributes.PAC * 0.00062), 0, 1);
  const highEffortState = ["PRESS", "CHALLENGE", "INTERCEPT", "RECOVER", "MAKE_RUN", "ADVANCE", "DRIBBLE"].includes(player.state);
  const tactics = tacticsFor(match, player.team);
  const pressingStyle = tactics.defensiveApproach === "high_press" && ["PRESS", "CHALLENGE", "INTERCEPT", "RECOVER"].includes(player.state) ? 0.22 : 0;
  const workload = clamp(0.28 + speedRatio * 0.62 + (highEffortState ? 0.28 : 0) + (player.id === match.ball.ownerId && ["DRIBBLE"].includes(player.state) ? 0.12 : 0) + pressingStyle, 0.2, 1.6);
  const enduranceFactor = 1.35 - clamp(player.attributes.FIT ?? 70, 1, 99) * 0.006;
  player.fitness = clamp((player.fitness ?? 100) - dt * workload * 0.035 * enduranceFactor, 0, 100);

  const movingTowardTarget = dist(player, player.target) > 0.055;
  const movementThisStep = dist({ x: previousX, y: previousY }, player);
  const isHoldingBall = player.id === match.ball.ownerId;
  if ((movingTowardTarget || isHoldingBall) && movementThisStep < 0.00028) player.stuckTimer = (player.stuckTimer ?? 0) + dt;
  else player.stuckTimer = Math.max(0, (player.stuckTimer ?? 0) - dt * 2);
}

function aimAndKick(match, player, teammate, kind, receiverTarget = null, passType = "NORMAL") {
  const ball = match.ball;
  const intendedDistance = kind === "PASS" && teammate ? dist(ball, receiverTarget ?? teammate) : 0;
  const error =
    kind === "PASS"
      ? (0.012 +
        (100 - player.attributes.PAS) * 0.00072 +
        (100 - player.attributes.VIS) * 0.00024 +
        (100 - player.attributes.DEC) * 0.0002 +
        (100 - player.attributes.CON) * 0.00013 +
        (100 - (player.fitness ?? 100)) * 0.00016) *
        (passType === "LONG" ? 1.7 : passType === "THROUGH" ? 1.25 : 1) *
        (1 + Math.max(0, intendedDistance - 0.35) * 0.55)
      : shotAimSpread(match, player);
  let target;
  if (kind === "PASS") {
    match.lastCompletedPass = null;
    const lead = receiverTarget ?? {
      x: teammate.x + teammate.vx * 0.25,
      y: teammate.y + teammate.vy * 0.25,
    };
    target = {
      x: clamp(lead.x + between(match, -error, error), 0.05, 0.98),
      y: clamp(lead.y + between(match, -error, error), 0.08, 0.92),
    };
  } else {
    // The goal plane sits beyond the pitch edge. Giving the ball real space to
    // travel past the shot point makes shot angle and aim error matter.
    target = {
      x: teamContext(match, player.team).goalX + teamDirection(match, player.team) * 0.045,
      y: clamp(
        0.5 + (player.y - 0.5) * -0.15 + between(match, -error, error),
        0.34,
        0.66,
      ),
    };
  }
  const dx = target.x - ball.x, dy = target.y - ball.y;
  const passDistance = dist(ball, target);
  if (kind === "PASS") {
    const velocity = calculatePassVelocity(ball, target, passType, player.attributes);
    ball.vx = velocity.velocityX;
    ball.vy = velocity.velocityY;
  } else {
    const vx = dx, vy = dy;
    const length = Math.hypot(vx, vy) || 1;
    const power = 1.5 + player.attributes.SHO * 0.006;
    ball.vx = (vx / length) * power;
    ball.vy = (vy / length) * power;
  }
  ball.state = kind === "PASS" ? "pass" : "shot";
  if (kind === "SHOOT") ball.gkAttemptedId = null;
  ball.ownerId = null;
  ball.team = player.team;
  ball.targetId = kind === "PASS" ? teammate.id : null;
  ball.passType = kind === "PASS" ? passType : null;
  ball.interceptionAttemptedIds = [];
  ball.targetX = target.x;
  ball.targetY = target.y;
  ball.shotOnTargetCounted = false;
  if (kind === "SHOOT") {
    ball.shotId = ++match.shotSequence;
    ball.goalCounted = false;
  }
  ball.lastPasserId = kind === "PASS" ? player.id : null;
  player.state = player.isGoalkeeper ? "GK_DISTRIBUTE" : kind;
  player.intent = kind;
  player.timeInState = 0;
  player.commitment = 0;
  player.target = { ...target };
  match.possessionTeam = player.team;
  match.possessionPlayerId = null;
  if (kind === "PASS") {
    addStat(match, player, "passesAttempted");
    if (player.isGoalkeeper) addStat(match, player, "distributionPasses");
    if (passType === "THROUGH") addStat(match, player, "throughBalls");
    if (passType === "LONG") addStat(match, player, "longBalls");
    match.recentPasses.push({
      time: match.elapsed,
      team: player.team,
      from: player.id,
      to: teammate.id,
      x: player.x,
    });
    match.recentPasses = match.recentPasses
      .filter((pass) => match.elapsed - pass.time < 60)
      .slice(-10);
    const intoRun = passType === "THROUGH";
    log(
      match,
      "pass",
      intoRun
        ? `${teamName(match, player.team)} ${player.isGoalkeeper ? "GK" : `#${player.number}`} threads a pass into #${teammate.number}'s run.`
        : `${teamName(match, player.team)} ${player.isGoalkeeper ? "GK" : `#${player.number}`} plays a ${passType.toLowerCase()} pass to #${teammate.number}.`,
    );
  } else {
    const chancePass = match.lastCompletedPass;
    if (chancePass?.receiverId === player.id && chancePass.team === player.team && match.elapsed - chancePass.time <= 8) {
      const passer = getPlayer(match, chancePass.passerId);
      if (passer) {
        addStat(match, passer, "keyPasses");
        log(match, "key_pass", `${teamName(match, passer.team)} #${passer.number} creates a shooting chance.`);
      }
    }
    match.lastShooter = player.number;
    match.lastShooterTeam = player.team;
    match.lastShooterId = player.id;
    match.lastShotDistance = dist(player, { x: teamContext(match, player.team).goalX, y: 0.5 });
    addStat(match, player, "shots");
    log(
      match,
      "shot",
      `${teamName(match, player.team)} #${player.number} shoots toward the ${teamName(match, opponentTeam(player.team))} goal.`,
    );
  }
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const t = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) /
      (dx * dx + dy * dy || 1),
    0,
    1,
  );
  return dist(point, { x: start.x + dx * t, y: start.y + dy * t });
}

// Aim error reflects the actual shot: close, central, unpressured chances are
// reliably on target, while range, angle, pressure, and shooting skill still
// create believable misses. Defenders physically blocking the trajectory are
// handled by updateBall rather than by this accuracy estimate.
function shotAimSpread(match, player) {
  const goal = { x: teamContext(match, player.team).goalX, y: 0.5 };
  const distance = dist(player, goal);
  const angle = Math.atan2(
    Math.abs(player.y - goal.y),
    Math.abs(player.x - goal.x),
  );
  const defenders = teamPlayers(match, opponentTeam(player.team));
  const nearest = defenders.length
    ? Math.min(...defenders.map((defender) => dist(player, defender)))
    : 1;
  const laneClearance = defenders.length
    ? Math.min(
        ...defenders.map((defender) =>
          distanceToSegment(defender, player, goal),
        ),
      )
    : 1;
  return Math.min(
    0.38,
    0.085 +
      (100 - player.attributes.SHO) * 0.00043 +
      (100 - player.fitness) * 0.00045 +
      clamp((distance - 0.2) / 0.8, 0, 1) * 0.09 +
      clamp(angle / 1.25, 0, 1) * 0.045 +
      clamp((0.25 - nearest) / 0.25, 0, 1) * 0.025 +
      clamp((0.06 - laneClearance) / 0.06, 0, 1) * 0.015,
  );
}

function executeDecision(match, player, plan) {
  const teammate =
    getPlayer(match, plan.receiverId) ??
    teamPlayers(match, player.team).find((other) => other.id !== player.id);
  applyBehaviorPlan(match, player, plan, {
      log,
      random: () => random(match),
    });
  player.actionScores = plan.scores;

  const isDribble = player.state === "DRIBBLE";
  if (isDribble && player.id === match.ball.ownerId && !player.dribbleAttemptActive) {
    const direction = teamDirection(match, player.team);
    const candidates = opponentPlayers(match, player.team)
      .filter(opponent => !opponent.isGoalkeeper && dist(opponent, player) < 0.25 && Math.abs(opponent.y - player.y) < 0.2)
      .sort((a, b) => dist(a, player) - dist(b, player))
      .slice(0, 1);
    player.dribbleAttemptActive = true;
    player.dribblePassedIds = candidates.map(opponent => opponent.id);
    player.dribbleStartedAt = match.elapsed;
    player.dribbleStart = { x: player.x, y: player.y };
    player.dribbleOpponentDistances = Object.fromEntries(candidates.map(opponent => [opponent.id, dist(opponent, player)]));
    addStat(match, player, "dribbles");
  } else if (!isDribble) {
    player.dribbleAttemptActive = false;
    player.dribblePassedIds = [];
  }

  if (plan.action === "PASS") {
    aimAndKick(
      match,
      player,
      teammate,
      "PASS",
      plan.target,
      plan.passType ?? "NORMAL",
    );
    return;
  }
  if (plan.action === "SHOOT") {
    aimAndKick(match, player, teammate, "SHOOT");
    return;
  }
}

export function calculatePassVelocity(start, target, passType, attributes = {}) {
  const dx = target.x - start.x, dy = target.y - start.y
  const distance = Math.hypot(dx, dy)
  // The older ranges put normal passes in the air for roughly 0.8s at a
  // typical short distance. This keeps the same friction model but gives all
  // pass types useful initial pace and distinct, shorter target flight times.
  const baseRange = passType === "LONG" ? 2.12 : passType === "THROUGH" ? 1.82 : 1.62
  const quality = clamp(((attributes.PAS ?? 65) * 0.62 + (attributes.DEC ?? 65) * 0.2 + (attributes.VIS ?? 65) * 0.18) / 68, 0.74, 1.2)
  const rangeMultiplier = 1 + (baseRange - 1) * quality
  const damping = 0.97
  const frames = Math.max(1, Math.round(-Math.log(1 - 1 / rangeMultiplier) / -Math.log(damping)))
  const flightTime = frames / 60
  const travelFactor = rangeMultiplier * 60 * (1 - damping)
  return {
    velocityX: dx * travelFactor / FIELD_DIMENSIONS.scaleX,
    velocityY: dy * travelFactor / FIELD_DIMENSIONS.scaleY,
    flightTime,
  }
}

function updateControlledBall(match) {
  const owner = allActors(match).find(
    (player) => player.id === match.ball.ownerId,
  );
  if (!owner) return;
  const velocity = Math.hypot(owner.vx, owner.vy);
  const facing =
    velocity > 0.025 ? Math.atan2(owner.vy, owner.vx) : owner.heading;
  const offset = (owner.state === "DRIBBLE"
    ? 0.037
    : owner.state === "ADVANCE"
      ? 0.032
      : 0.022) * FIELD_DIMENSIONS.scaleX;
  match.ball.x = owner.x + Math.cos(facing) * offset;
  match.ball.y = owner.y + Math.sin(facing) * offset * (FIELD_DIMENSIONS.scaleY / FIELD_DIMENSIONS.scaleX);
  match.ball.vx = owner.vx;
  match.ball.vy = owner.vy;
}

function startRestart(match) {
  const kickoffTeam = match.pendingKickoffTeam ?? "home";
  const kickingPlayers = teamPlayers(match, kickoffTeam);
  const taker = kickingPlayers.find((player) => player.role.startsWith("ATTACKER")) ?? kickingPlayers[0];
  const teammate = kickingPlayers.find((player) => player !== taker);
  const kickoffX = 0.5;
  if (taker) {
    taker.target = { x: kickoffX, y: 0.5 };
    if (dist(taker, taker.target) > 0.035) {
      taker.state = "SUPPORT";
      taker.intent = "MOVE_TO_KICKOFF";
      taker.targetReason = "Move into position for the restart";
      match.restartTimer = 0.25;
      return;
    }
    taker.heading = teamDirection(match, kickoffTeam) > 0 ? 0 : Math.PI;
    taker.state = "CONTROL";
    taker.intent = "CONTROL";
    taker.target = { x: kickoffX, y: 0.5 };
    taker.targetReason = "Restart from the halfway line";
    taker.timeInState = 0;
    taker.commitment = 0;
    taker.runAttempt = -1;
  }
  if (teammate) {
    teammate.target = formationTarget(match, teammate) ?? { x: 0.5 + teamDirection(match, kickoffTeam) * 0.08, y: 0.64 };
    teammate.targetReason = "Support the kickoff";
    teammate.state = "SUPPORT";
    teammate.intent = "SUPPORT";
    teammate.timeInState = 0;
    teammate.commitment = 0;
  }
  for (const team of ["home", "away"]) {
    for (const [index, player] of teamPlayers(match, team).entries()) {
      const defender = player.role.startsWith("DEFENDER");
      const shape = formationTarget(match, player);
      player.target = player === taker ? { x: kickoffX, y: .5 } : shape ?? { x: .5 - teamDirection(match, team) * .1, y: index % 2 === 0 ? .39 : .61 };
      player.targetReason = defender ? "Hold the defensive line for kickoff" : "Start in the advanced line";
      player.targetPlayerId = null;
    }
  }
  for (const goalkeeper of Object.values(match.goalkeepers ?? {}).sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    goalkeeper.state = "GK_POSITION";
    goalkeeper.intent = "GK_POSITION";
    goalkeeper.target = { x: goalkeeperHomeX(match, goalkeeper.team), y: 0.5 };
    goalkeeper.targetReason = "Reset in the goal area";
    goalkeeper.vx = 0;
    goalkeeper.vy = 0;
    goalkeeper.targetPlayerId = null;
    goalkeeper.distributionReadyAt = 0;
  }
  match.runWindow += 1;
  match.attackStartedAt = null;
  match.transitionTeam = null;
  match.transitionUntil = 0;
  match.lastCompletedPass = null;
  match.recentPasses = [];
  match.restartTimer = 0;
  match.pendingKickoffTeam = null;
  if (taker) {
    match.ball = { x: taker.x, y: taker.y, vx: 0, vy: 0, state: "controlled", ownerId: taker.id, team: kickoffTeam, targetId: null };
    match.possessionTeam = kickoffTeam;
    match.possessionPlayerId = taker.id;
    log(match, "kickoff", `${teamName(match, kickoffTeam)} restarts from halfway.`);
  } else {
    match.ball = { x: 0.5, y: 0.5, vx: 0, vy: 0, state: "loose", ownerId: null, team: null, targetId: null };
    match.possessionTeam = "none";
    match.possessionPlayerId = null;
  }
}

function startGoalKick(match, defendingTeam) {
  const taker = match.goalkeepers?.[defendingTeam];
  if (!taker) return;
  const spot = { x: teamContext(match, defendingTeam).ownGoalX + teamDirection(match, defendingTeam) * 0.065, y: 0.5 };

  // A goal kick is a real restart, so place its taker and ball at the spot.
  // All subsequent movement and the kick itself use the normal simulation.
  taker.x = spot.x;
  taker.y = spot.y;
  taker.vx = 0;
  taker.vy = 0;
  taker.heading = teamDirection(match, defendingTeam) > 0 ? 0 : Math.PI;
  taker.state = "GK_DISTRIBUTE";
  taker.intent = "DISTRIBUTE";
  taker.previousState = null;
  taker.timeInState = 0;
  taker.commitment = 0;
  taker.target = { ...spot };
  taker.targetReason = "Take the goal kick and begin possession";
  taker.targetPlayerId = null;
  taker.distributionReadyAt = match.elapsed + 0.45;

  match.ball = {
    ...spot,
    vx: 0,
    vy: 0,
    state: "controlled",
    ownerId: taker.id,
    team: defendingTeam,
    targetId: null,
  };
  match.possessionTeam = defendingTeam;
  match.possessionPlayerId = taker.id;
  match.attackStartedAt = null;
  match.recentPasses = [];
  match.restartTimer = 0;
  log(
    match,
    "goal_kick",
    `${teamName(match, defendingTeam)} goalkeeper takes the goal kick.`,
  );
}

function awardPossession(match, winner, action) {
  const previousOwner = getPlayer(match, match.ball.ownerId) ?? getPlayer(match, match.ball.lastPasserId);
  if (previousOwner && previousOwner.team !== winner.team)
    addStat(match, previousOwner, "possessionLosses");
  if (action === "recover") addStat(match, winner, "recoveries");
  match.lastCompletedPass = null;
  match.ball.ownerId = winner.id;
  match.ball.team = winner.team;
  match.ball.targetId = null;
  match.ball.state = "controlled";
  match.ball.vx = 0;
  match.ball.vy = 0;
  winner.state = "CONTROL";
  winner.intent = "CONTROL";
  winner.target = { x: winner.x, y: winner.y };
  winner.targetReason = "Settle the ball and begin the transition";
  winner.targetPlayerId = null;
  winner.timeInState = 0;
  winner.commitment = 0;
  winner.challengeReadyAt = match.elapsed + 1.1;
  match.possessionTeam = winner.team;
  match.possessionPlayerId = winner.id;
  match.attackStartedAt = null;
  match.transitionTeam = winner.team;
  match.transitionUntil = match.elapsed + 7;
  match.restartTimer = 0;
  const winnerName = teamName(match, winner.team);
  const opponentName = teamName(match, opponentTeam(winner.team));
  const eventType =
    action === "tackle"
      ? "tackle"
      : action === "recover"
        ? "recover"
        : "intercept";
  const eventText =
    action === "intercept"
      ? `${winnerName} #${winner.number} intercepts the ${opponentName} pass.`
      : action === "recover"
        ? `${winnerName} #${winner.number} gathers the loose ball.`
        : `${winnerName} #${winner.number} wins the ball from ${opponentName}.`;
  log(match, eventType, eventText);
  log(match, "possession", `${winnerName} #${winner.number} wins possession.`);
  if (action === "tackle") addStat(match, winner, "successfulTackles");
  if (action === "intercept") addStat(match, winner, "interceptions");
  winner.dribbleAttemptActive = false;
}

function applyDefensivePlan(match, defender, plan) {
  if (defender.state !== plan.state) {
    defender.previousState = defender.state;
    defender.previousIntent = defender.intent;
    defender.state = plan.state;
    defender.intent = plan.intent;
    defender.timeInState = 0;
    const marked = getPlayer(match, plan.targetPlayerId);
    const markedName = marked ? `${teamName(match, marked.team)} #${marked.number}` : "the passing lane";
    const event = {
      DEFEND_SHAPE: ["defend", "holds a goal-protecting position"],
      PRESS: ["press", `closes down ${markedName}`],
      CONTAIN: ["contain", `contains ${markedName}`],
      RECOVER: ["recover", defender.role.startsWith("DEFENDER") ? "recovers toward its own goal" : "recovers into the advanced line"],
      INTERCEPT: ["intercept", "moves to intercept a reachable pass"],
      CHALLENGE: ["challenge", `challenges ${markedName}`],
      COVER: ["cover", `covers ${markedName}`],
      GET_BALL: ["recover", "contests the loose ball"],
    }[plan.state];
    if (event && match.minute - (defender.lastStateEventMinute ?? -3) >= 2) {
      log(match, event[0], `${teamName(match, defender.team)} #${defender.number} ${event[1]}.`);
      defender.lastStateEventMinute = match.minute;
    }
  }
  defender.target = { ...plan.target };
  defender.targetReason = plan.reason;
  defender.targetPlayerId = plan.targetPlayerId;
  defender.currentResponsibility = plan.responsibility ?? plan.state;
  defender.recoveryTarget = plan.recoveryTarget ? { ...plan.recoveryTarget } : formationTarget(match, defender, 'defending');
  defender.defensiveScores = plan.scores;
  defender.zone = defender.role.startsWith("DEFENDER")
    ? defender.perception?.zone ?? "PRESSING_AREA"
    : "ATTACKER_RECOVERY_LINE";
}

function goalkeeperTarget(match, goalkeeper) {
  const context = teamContext(match, goalkeeper.team);
  const ownGoalX = goalkeeperHomeX(match, goalkeeper.team);
  const attackDirection = context.direction;
  const depth = teamProgress(match, goalkeeper.team, match.ball.x);
  const danger = 1 - clamp(depth / 0.78, 0, 1);
  const x = clamp(
    ownGoalX + attackDirection * (0.025 + danger * 0.075),
    Math.min(ownGoalX, ownGoalX + attackDirection * 0.105),
    Math.max(ownGoalX, ownGoalX + attackDirection * 0.105),
  );
  const ratio = clamp(Math.abs(x - ownGoalX) / Math.max(0.08, Math.abs(match.ball.x - ownGoalX)), 0.08, 0.58);
  const idealY = 0.5 + (match.ball.y - 0.5) * ratio;
  const positioning = goalkeeper.attributes.POS_GK / 99;
  return {
    x,
    y: clamp(idealY + (match.ball.y - idealY) * (1 - positioning) * 0.12, 0.22, 0.78),
  };
}

function goalkeeperIntent(match, goalkeeper) {
  const ownGoalX = teamContext(match, goalkeeper.team).ownGoalX;
  const attackDirection = teamDirection(match, goalkeeper.team);
  const opponents = opponentPlayers(match, goalkeeper.team);
  const carrier = opponents.find(player => player.id === match.ball.ownerId);
  const towardGoal = match.ball.state === "shot" && match.ball.team !== goalkeeper.team &&
    match.ball.vx * attackDirection < -0.03;

  if (match.ball.ownerId === goalkeeper.id) {
    if (match.elapsed < goalkeeper.distributionReadyAt)
      return { state: "GK_DISTRIBUTE", intent: "DISTRIBUTE", target: { x: goalkeeper.x, y: goalkeeper.y }, reason: "Secure the ball before distribution" };
    goalkeeper.perception = perceivePlayer(match, goalkeeper);
    const outlets = teamPlayers(match, goalkeeper.team).map(teammate => ({
      teammate,
      ...evaluatePassOptions(goalkeeper, teammate, match),
    })).sort((a, b) => b.score - a.score);
    const outlet = outlets[0];
    if (!outlet) return { state: "GK_DISTRIBUTE", intent: "HOLD", target: { x: goalkeeper.x, y: goalkeeper.y }, reason: "Hold possession safely" };
    goalkeeper.actionScores = { DISTRIBUTE: outlet.score };
    return {
      state: "GK_DISTRIBUTE",
      intent: "DISTRIBUTE",
      target: outlet.target,
      receiverId: outlet.teammate.id,
      passType: outlet.type,
      action: "PASS",
      reason: `Distribute to ${teamName(match, goalkeeper.team)} #${outlet.teammate.number}`,
      scores: goalkeeper.actionScores,
    };
  }

  const target = goalkeeperTarget(match, goalkeeper);
  if (towardGoal) {
    const planeX = goalkeeperHomeX(match, goalkeeper.team);
    const time = Math.max(0, (planeX - match.ball.x) / (match.ball.vx || attackDirection));
    return {
      state: "GK_SAVE", intent: "SAVE",
      target: { x: target.x, y: clamp(match.ball.y + match.ball.vy * Math.min(time, 0.8), 0.22, 0.78) },
      reason: "Track the shot and cover its line",
    };
  }

  const ballNearGoal = Math.abs(match.ball.x - ownGoalX) < 0.2;
  if (match.ball.state === "loose" && ballNearGoal && dist(goalkeeper, match.ball) < 0.15)
    return { state: "GK_CLAIM", intent: "CLAIM", target: { x: match.ball.x, y: match.ball.y }, reason: "Claim a reachable loose ball" };

  if (carrier && Math.abs(carrier.x - ownGoalX) < 0.34 && dist(carrier, goalkeeper) < 0.17) {
    return {
      state: "GK_RUSH", intent: "RUSH",
      target: {
        x: clamp(target.x + attackDirection * 0.035, Math.min(ownGoalX, ownGoalX + attackDirection * 0.13), Math.max(ownGoalX, ownGoalX + attackDirection * 0.13)),
        y: clamp(carrier.y, 0.22, 0.78),
      },
      reason: "Narrow the angle while staying goal-side",
    };
  }

  const danger = Math.abs(match.ball.x - ownGoalX) < 0.42;
  return {
    state: danger ? "GK_COVER" : (Math.abs(match.ball.y - goalkeeper.y) > 0.035 ? "GK_TRACK" : "GK_POSITION"),
    intent: danger ? "COVER" : "TRACK",
    target,
    reason: danger ? "Cover the shooting angle" : "Track play from the goal area",
  };
}

function updateGoalkeeper(match, goalkeeper) {
  const plan = goalkeeperIntent(match, goalkeeper);
  const changed = goalkeeper.state !== plan.state;
  if (changed) {
    goalkeeper.previousState = goalkeeper.state;
    goalkeeper.previousIntent = goalkeeper.intent;
    goalkeeper.state = plan.state;
    goalkeeper.timeInState = 0;
  }
  goalkeeper.intent = plan.intent;
  goalkeeper.target = { ...plan.target };
  goalkeeper.targetReason = plan.reason;
  goalkeeper.chosenAction = plan.intent;
  if (plan.scores) goalkeeper.actionScores = plan.scores;
  if (plan.action === "PASS") {
    const receiver = getPlayer(match, plan.receiverId);
    if (receiver) aimAndKick(match, goalkeeper, receiver, "PASS", plan.target, plan.passType);
  }
}

function attemptGoalkeeperChallenge(match, goalkeeper) {
  const carrier = getPlayer(match, match.ball.ownerId);
  if (!carrier || carrier.team === goalkeeper.team || goalkeeper.state !== "GK_RUSH") return;
  if (dist(goalkeeper, carrier) > 0.045 || dist(goalkeeper, match.ball) > 0.05) return;
  if (match.elapsed < (goalkeeper.challengeReadyAt ?? 0)) return;
  goalkeeper.challengeReadyAt = match.elapsed + 1.05;

  const attacker = (carrier.attributes.DRI * 0.34 + carrier.attributes.CON * 0.28 + carrier.attributes.DEC * 0.24 + carrier.attributes.PAC * 0.14) * fitnessFactor(carrier);
  const keeper = (goalkeeper.attributes.DEF * 0.34 + goalkeeper.attributes.DEC * 0.26 + goalkeeper.attributes.PAC * 0.18 + goalkeeper.attributes.POS_GK * 0.22) * fitnessFactor(goalkeeper);
  const closingSpeed = Math.hypot(goalkeeper.vx, goalkeeper.vy);
  const rushTiming = clamp((0.07 - dist(goalkeeper, carrier)) / 0.07, 0, 1);
  const advantage = keeper - attacker;
  const successChance = clamp(0.43 + advantage * 0.003 + closingSpeed * 0.12 + rushTiming * 0.1, 0.18, 0.78);
  const challengeRoll = random(match);
  if (challengeRoll < successChance) {
    awardGoalkeeperPossession(match, goalkeeper, "gk_challenge", `${teamName(match, goalkeeper.team)} goalkeeper wins the one-on-one challenge on ${teamName(match, carrier.team)} #${carrier.number}.`);
  } else {
    log(match, "gk_challenge", `${teamName(match, goalkeeper.team)} goalkeeper rushes ${teamName(match, carrier.team)} #${carrier.number}, forcing a difficult finish.`);
  }
}

function attemptChallenge(match, defender, plan) {
  const carrier = getPlayer(match, plan.targetPlayerId);
  if (!carrier || match.elapsed < (defender.challengeReadyAt ?? 0)) return;
  const challengeDistance = dist(defender, carrier);
  if (challengeDistance > 0.062 || dist(defender, match.ball) > 0.073) return;
  defender.challengeReadyAt = match.elapsed + 2.1;
  addStat(match, defender, "tackles");
  const approachSpeed = Math.hypot(defender.vx, defender.vy)
  const fatigueRisk = clamp((72 - (defender.fitness ?? 100)) / 72, 0, 1)
  const mistiming = clamp((approachSpeed - 0.16) / 0.4, 0, 1) * 0.045 + fatigueRisk * 0.055 + (100 - defender.attributes.DEC) * 0.00018 + (100 - defender.attributes.TAC) * 0.0001
  const foulChance = clamp(0.075 + mistiming * 0.8, 0.06, 0.24)
  if (random(match) < foulChance) {
    addStat(match, defender, 'fouls')
    addStat(match, carrier, 'foulsSuffered')
    const severe = random(match) < clamp(0.012 + mistiming * 0.12, 0.008, 0.045)
    const caution = severe || random(match) < clamp(0.08 + mistiming * 0.42 + ((defender.yellowCards ?? 0) ? 0.2 : 0), 0.06, 0.42)
    if (severe) {
      defender.sentOff = true; invalidateActorCache(match); defender.card = 'RED'; defender.state = 'SENT_OFF'; defender.intent = 'SENT_OFF'
      addStat(match, defender, 'redCards'); match.teamRedCards ??= { home: 0, away: 0 }; match.teamRedCards[defender.team]++
      log(match, 'red_card', `${defender.name} (${teamName(match, defender.team)}) is sent off for a dangerous challenge.`)
    } else if (caution) {
      defender.yellowCards = (defender.yellowCards ?? 0) + 1; addStat(match, defender, 'yellowCards')
      if (defender.yellowCards >= 2) {
        defender.sentOff = true; invalidateActorCache(match); defender.card = 'SECOND_YELLOW'; defender.state = 'SENT_OFF'; defender.intent = 'SENT_OFF'
        addStat(match, defender, 'redCards'); match.teamRedCards ??= { home: 0, away: 0 }; match.teamRedCards[defender.team]++
        log(match, 'red_card', `${defender.name} (${teamName(match, defender.team)}) is sent off after a second yellow card.`)
      } else { defender.card = 'YELLOW'; log(match, 'yellow_card', `${defender.name} (${teamName(match, defender.team)}) is booked for the foul.`) }
    }
    match.ball.ownerId = carrier.id; match.ball.team = carrier.team; match.ball.targetId = null; match.ball.state = 'controlled'
    match.ball.x = carrier.x; match.ball.y = carrier.y; match.ball.vx = match.ball.vy = 0
    match.possessionTeam = carrier.team; match.possessionPlayerId = carrier.id
    carrier.state = 'CONTROL'; carrier.intent = 'CONTROL'; carrier.timeInState = 0; carrier.commitment = 0
    for (const opponent of teamPlayers(match, defender.team)) opponent.challengeReadyAt = match.elapsed + 2.2
    log(match, 'foul', `${teamName(match, defender.team)} #${defender.number} fouls ${teamName(match, carrier.team)} #${carrier.number}.`)
    return
  }
  const tackleSkill = fitnessFactor(defender) * (
    defender.attributes.TAC * 0.43 +
    defender.attributes.DEF * 0.23 +
    defender.attributes.DEC * 0.19 +
    defender.attributes.PAC * 0.15);
  const carrierControl = fitnessFactor(carrier) * (
    carrier.attributes.CON * 0.34 +
    carrier.attributes.DRI * 0.3 +
    carrier.attributes.DEC * 0.2 +
    carrier.attributes.PAC * 0.16);
  const advantage = tackleSkill - carrierControl;
  const direction = teamDirection(match, carrier.team);
  const goalSide = direction * (defender.x - carrier.x) > 0;
  const defenderSpeedToward = (defender.vx * (carrier.x - defender.x) + defender.vy * (carrier.y - defender.y)) / (challengeDistance || 1);
  const carrierSpeedToward = Math.max(0, carrier.vx * direction);
  const coverCount = teamPlayers(match, defender.team).filter(other => other.id !== defender.id && dist(other, carrier) < 0.2).length;
  const geometry = (goalSide ? 0.055 : -0.065) +
    clamp(defenderSpeedToward / 0.24, -1, 1) * 0.035 -
    clamp(carrierSpeedToward / 0.3, 0, 1) * 0.035 +
    Math.min(coverCount, 2) * 0.018;
  const attackProgress = teamProgress(match, carrier.team, carrier.x);
  const goalPressure = attackProgress >= 0.78 ? 0.08 : attackProgress >= 0.58 ? 0.04 : 0;
  const successChance = clamp(
    0.49 + advantage * 0.003 + goalPressure + geometry,
    0.2,
    0.78,
  );
  if (random(match) < successChance) {
    awardPossession(match, defender, "tackle");
    return;
  }

  const dx = defender.x - match.ball.x;
  const dy = defender.y - match.ball.y;
  const length = Math.hypot(dx, dy) || 1;
  match.ball.ownerId = null;
  match.ball.targetId = null;
  match.ball.state = "loose";
  match.ball.team = null;
  match.possessionTeam = "none";
  match.possessionPlayerId = null;
  match.ball.vx = (dx / length) * 0.24 + carrier.vx * 0.15;
  match.ball.vy = (dy / length) * 0.24 + carrier.vy * 0.15;
  defender.state = "RECOVER";
  defender.intent = "RECOVER";
  defender.challengeReadyAt = match.elapsed + 1.35;
  defender.targetReason = "Recover after a missed challenge";
  log(
    match,
    "challenge",
    `${teamName(match, defender.team)} #${defender.number} misses a challenge on ${teamName(match, carrier.team)} #${carrier.number}; the ball is loose.`,
  );
}

function awardGoalkeeperPossession(match, goalkeeper, eventType, eventText) {
  match.lastCompletedPass = null;
  match.ball.ownerId = goalkeeper.id;
  match.ball.team = goalkeeper.team;
  match.ball.targetId = null;
  match.ball.state = "controlled";
  match.ball.x = goalkeeper.x;
  match.ball.y = goalkeeper.y;
  match.ball.vx = 0;
  match.ball.vy = 0;
  match.possessionTeam = goalkeeper.team;
  match.possessionPlayerId = goalkeeper.id;
  match.transitionTeam = goalkeeper.team;
  match.transitionUntil = match.elapsed + 7;
  goalkeeper.state = eventType === "gk_claim" ? "GK_CLAIM" : "GK_DISTRIBUTE";
  goalkeeper.intent = eventType === "gk_claim" ? "CLAIM" : "DISTRIBUTE";
  goalkeeper.timeInState = 0;
  goalkeeper.target = { x: goalkeeper.x, y: goalkeeper.y };
  goalkeeper.targetReason = "Secure possession and prepare distribution";
  goalkeeper.distributionReadyAt = match.elapsed + 0.4;
  if (eventType === "gk_claim") addStat(match, goalkeeper, "claims");
  log(match, eventType, eventText);
}

function recordShotOnTarget(match, team) {
  if (match.ball.state !== "shot" || match.ball.shotOnTargetCounted) return;
  match.ball.shotOnTargetCounted = true;
  const shooter = getPlayer(match, match.lastShooterId);
  addStat(match, shooter ?? team, "shotsOnTarget");
}

function goalkeeperSave(match, ball, start) {
  if (ball.state !== "shot") return false;
  const defendingTeam = opponentTeam(ball.team);
  const goalkeeper = match.goalkeepers?.[defendingTeam];
  if (!goalkeeper || ball.gkAttemptedId === goalkeeper.id) return false;
  const goalPlane = teamContext(match, ball.team).goalX + teamDirection(match, ball.team) * 0.035;
  if ((goalPlane - ball.x) / (ball.vx || 1) < 0) return false;
  // A keeper cannot save a shot that has already passed across his goal line.
  // Only evaluate the shot as it crosses the keeper's lateral reach zone.
  if ((start.x - goalkeeper.x) * teamDirection(match, ball.team) > 0.012) return false;
  const goalY = ball.y + ball.vy * ((goalPlane - ball.x) / (ball.vx || 1));
  if (Math.abs(goalY - 0.5) > 0.078) return false;
  const pathDistance = distanceToSegment(goalkeeper, start, ball);
  const reach = 0.06 + goalkeeper.attributes.REF * 0.0002 + goalkeeper.attributes.POS_GK * 0.00018;
  if (pathDistance > reach) return false;

  ball.gkAttemptedId = goalkeeper.id;
  goalkeeper.saveAttemptedAt = match.elapsed;
  const shooter = getPlayer(match, match.lastShooterId);
  const shooterSkill = shooter?.attributes.SHO ?? 65;
  const skill = (
    goalkeeper.attributes.REF * 0.3 +
    goalkeeper.attributes.POS_GK * 0.27 +
    goalkeeper.attributes.DEF * 0.19 +
    goalkeeper.attributes.DEC * 0.16 +
    goalkeeper.attributes.PAC * 0.08
  ) / 99;
  const alignment = clamp(1 - pathDistance / reach, 0, 1);
  const speed = Math.hypot(ball.vx, ball.vy);
  const closeRange = clamp((0.36 - (match.lastShotDistance ?? 0.5)) / 0.36, 0, 1);
  const saveChance = clamp(
    0.42 + skill * 0.56 + alignment * 0.2 + goalkeeper.attributes.REF / 99 * 0.1 -
      shooterSkill * 0.0011 - speed * 0.04 - closeRange * 0.05,
    0.1,
    0.84,
  );
  if (random(match) >= saveChance) return false;

  recordShotOnTarget(match, ball.team);
  addStat(match, goalkeeper, "saves");

  const keeperName = teamName(match, defendingTeam);
  const shooterName = teamName(match, ball.team);
  const secureChance = clamp(
    0.24 + goalkeeper.attributes.HAN * 0.005 + goalkeeper.attributes.CON * 0.0018 + goalkeeper.attributes.DEC * 0.0012 - speed * 0.07,
    0.28,
    0.94,
  );
  if (random(match) < secureChance) {
    awardGoalkeeperPossession(
      match,
      goalkeeper,
      "gk_save",
      `${keeperName} goalkeeper saves ${shooterName} #${match.lastShooter ?? ""}'s shot.`,
    );
  } else {
    ball.state = "loose";
    ball.ownerId = null;
    ball.targetId = null;
    ball.team = null;
    ball.vx = -teamDirection(match, match.lastShooterTeam) * Math.max(0.16, speed * 0.3);
    ball.vy += (ball.y - goalkeeper.y) * 0.45;
    match.possessionTeam = "none";
    match.possessionPlayerId = null;
    log(match, "gk_save", `${keeperName} goalkeeper parries ${shooterName} #${match.lastShooter ?? ""}'s shot loose.`);
  }
  return true;
}

function updateBall(match, dt) {
  const ball = match.ball;
  if (ball.state === "goal") return;
  if (ball.state === "controlled" && ball.ownerId) {
    updateControlledBall(match);
    return;
  }

  const previousBallPosition = { x: ball.x, y: ball.y };
  ball.x += ball.vx * dt * FIELD_DIMENSIONS.scaleX;
  ball.y += ball.vy * dt * FIELD_DIMENSIONS.scaleY;
  const damping =
    ball.state === "shot" ? 0.998 : ball.state === "pass" ? 0.97 : 0.994;
  ball.vx *= Math.pow(damping, dt * 60);
  ball.vy *= Math.pow(damping, dt * 60);
  if (ball.y < 0.055 || ball.y > 0.945) {
    ball.y = clamp(ball.y, 0.055, 0.945);
    ball.vy *= -0.62;
  }

  if (ball.state === "shot") {
    const dx = ball.x - previousBallPosition.x,
      dy = ball.y - previousBallPosition.y;
    const tFor = (point) =>
      clamp(
        ((point.x - previousBallPosition.x) * dx +
          (point.y - previousBallPosition.y) * dy) /
          (dx * dx + dy * dy || 1),
        0,
        1,
      );
    const blockingTeam = teamPlayers(match, opponentTeam(ball.team));
    const blocker = blockingTeam.find((defender) => {
      const t = tFor(defender);
      const ballPathPoint={
          x: previousBallPosition.x + dx * t,
          y: previousBallPosition.y + dy * t,
      };
      const blockingReach=.03+defender.attributes.DEF*.000035+defender.attributes.POS*.000025;
      return dist(defender,ballPathPoint)<blockingReach;
    });
    if (blocker) {
      // A defender stopped this attempt before it reached the goal or keeper;
      // record the shot and block, but do not classify the blocked attempt as
      // a shot on target.
      ball.state = "loose";
      ball.ownerId = null;
      ball.targetId = null;
      ball.team = null;
      match.possessionTeam = "none";
      match.possessionPlayerId = null;
      ball.vx = -teamDirection(match, match.lastShooterTeam) * Math.abs(ball.vx) * 0.42;
      ball.vy = (ball.y - blocker.y) * 0.8 + ball.vy * 0.18;
      addStat(match, blocker, "blocks");
      log(
        match,
        "block",
        `${teamName(match, blocker.team)} #${blocker.number} blocks ${teamName(match, match.lastShooterTeam)} #${match.lastShooter ?? 2}'s shot.`,
      );
      return;
    }
    if (goalkeeperSave(match, ball, previousBallPosition)) return;
  }

  const crossedGoalLine =
    ball.state === "shot" &&
    (teamDirection(match, ball.team) * (ball.x - teamContext(match, ball.team).goalX) >= 0.035);
  if (crossedGoalLine) {
    const scoringTeam = ball.team;
    if (Math.abs(ball.y - 0.5) <= 0.078) {
      if (ball.goalCounted) return;
      ball.goalCounted = true;
      if (scoringTeam === "away") match.awayScore += 1;
      else match.homeScore += 1;
        recordShotOnTarget(match, scoringTeam);
        const scorer = getPlayer(match, match.lastShooterId);
        addStat(match, scorer ?? scoringTeam, "goals");
        const assister = getPlayer(match, match.lastCompletedPass?.passerId);
        if (assister && match.lastCompletedPass?.receiverId === scorer?.id && assister.team === scoringTeam && assister.id !== scorer?.id) addStat(match, assister, "assists");
        const concedingKeeper = match.goalkeepers?.[opponentTeam(scoringTeam)];
        if (concedingKeeper) addStat(match, concedingKeeper, "goalsConceded");
      match.goals.push({
        minute: match.minute,
        team: scoringTeam,
        scorerId: scorer?.id ?? null,
        scorer: scorer?.name ?? `#${match.lastShooter ?? "?"}`,
        assister: assister && assister.team === scoringTeam && assister.id !== scorer?.id && match.lastCompletedPass?.receiverId === scorer?.id ? assister.name : null,
      });
      log(
        match,
        "goal",
        `GOAL! ${scorer?.name ?? `${teamName(match, scoringTeam)} #${match.lastShooter ?? 2}`} scores. ${teamName(match, "home")} ${match.homeScore}–${match.awayScore} ${teamName(match, "away")}.`,
      );
      match.attackStartedAt = null;
      match.restartTimer = 2.4;
      match.pendingKickoffTeam = opponentTeam(scoringTeam);
      ball.vx = ball.vy = 0;
      ball.state = "goal";
      ball.x = teamContext(match, scoringTeam).goalX - teamDirection(match, scoringTeam) * 0.005;
      match.lastGoalTeam = scoringTeam;
      match.lastGoalX = teamContext(match, scoringTeam).goalX;
      ball.ownerId = null;
      ball.team = null;
      match.possessionTeam = "none";
      match.possessionPlayerId = null;
      const kickoffTeam = match.pendingKickoffTeam;
      const takerId = teamPlayers(match, kickoffTeam).find(player => player.role === "ATTACKER")?.id;
      for (const team of ["home", "away"]) {
        for (const player of teamPlayers(match, team)) {
          const shape = formationTarget(match, player);
          player.target = player.id === takerId ? { x: .5, y: .5 } : shape ?? { x: .5 - teamDirection(match, team) * .1, y: player.y };
          player.targetReason = player.id === takerId ? "Move to the kickoff spot" : "Recover into the selected formation";
          player.state = player.id === takerId ? "SUPPORT" : player.role.startsWith("DEFENDER") ? "DEFEND_SHAPE" : "RECOVER";
          player.intent = player.state;
          player.timeInState = 0;
          player.targetPlayerId = null;
        }
      }
      return;
    } else {
      log(match, "off_target", `${teamName(match, scoringTeam)} #${match.lastShooter ?? 2}'s shot goes off target.`);
      startGoalKick(match, opponentTeam(scoringTeam));
      return;
    }
  }
  if (ball.x > 0.96 && ball.state !== "shot") {
    ball.x = 0.96;
    ball.vx *= -0.65;
  }
  if (ball.x < 0.035 && ball.state !== "shot") {
    ball.x = 0.035;
    ball.vx *= -0.65;
  }

  if (ball.state === "pass" && ball.targetId) {
    const defendingTeam = teamPlayers(match, opponentTeam(ball.team));
    const ballSegmentDistance = (player) => distanceToSegment(player, previousBallPosition, ball);
    const interceptor = [...defendingTeam].sort(
      (a, b) => ballSegmentDistance(a) - ballSegmentDistance(b),
    ).find(player => !ball.interceptionAttemptedIds?.includes(player.id) && ballSegmentDistance(player) < 0.031);
    if (interceptor) {
      ball.interceptionAttemptedIds ??= [];
      ball.interceptionAttemptedIds.push(interceptor.id);
      const passer = getPlayer(match, ball.lastPasserId);
      const receiver = getPlayer(match, ball.targetId);
      const defendingSkill = interceptor.attributes.DEF * 0.32 + interceptor.attributes.POS * 0.25 +
        interceptor.attributes.VIS * 0.17 + interceptor.attributes.PAC * 0.14 + interceptor.attributes.DEC * 0.12;
      const deliverySkill = (passer?.attributes.PAS ?? 65) * 0.32 + (passer?.attributes.VIS ?? 65) * 0.26 +
        (passer?.attributes.DEC ?? 65) * 0.17 + (receiver?.attributes.PAC ?? 65) * 0.1 + (receiver?.attributes.POS ?? 65) * 0.15;
      const interceptionChance = clamp(0.24 + (defendingSkill - deliverySkill) * 0.0045 +
        clamp((0.031 - ballSegmentDistance(interceptor)) / 0.031, 0, 1) * 0.16 +
        (ball.passType === "LONG" ? 0.06 : ball.passType === "THROUGH" ? 0.025 : 0), 0.08, 0.68);
      if (random(match) < interceptionChance) {
        awardPossession(match, interceptor, "intercept");
        return;
      }
    }
    const receiver = getPlayer(match, ball.targetId);
    const receiverHasType = ball.passType === "THROUGH" || ball.passType === "LONG";
    const reception = receiver
      ? receiverHasType
        ? (receiver.attributes.CON * 0.42 + receiver.attributes.DEC * 0.2 + receiver.attributes.VIS * 0.13 + receiver.attributes.PAC * 0.14 + receiver.attributes.POS * 0.11) / 99 * fitnessFactor(receiver)
        : (receiver.attributes.CON * 0.66 + receiver.attributes.DEC * 0.22 + receiver.attributes.VIS * 0.12) / 99 * fitnessFactor(receiver)
      : 0;
    const passSpeed = Math.hypot(ball.vx, ball.vy);
    const receiveReach = receiver ? 0.018 + receiver.attributes.CON * 0.00016 + (receiverHasType ? receiver.attributes.PAC * 0.00006 + receiver.attributes.POS * 0.00003 : 0) : 0;
    // Test the ball's whole per-step path so a faster pass cannot skip over a
    // receiver between fixed updates.
    if (receiver && ballSegmentDistance(receiver) < receiveReach + passSpeed * dt * 0.35) {
      const typePenalty = ball.passType === "LONG" ? 0.2 : ball.passType === "THROUGH" ? 0.1 : 0;
      const pressure = teamPlayers(match, opponentTeam(receiver.team))
        .reduce((nearest, opponent) => Math.min(nearest, dist(receiver, opponent)), 1);
      const pressurePenalty = clamp((0.18 - pressure) / 0.18, 0, 1) * 0.12;
      const speedPenalty = clamp((passSpeed - 0.42) / 1.1, 0, 1) * 0.16;
      const controlChance = clamp(0.28 + reception * 0.67 - typePenalty - pressurePenalty - speedPenalty, 0.16, 0.95);
      const controlRoll = random(match);
      if (controlRoll >= controlChance) {
        ball.state = "loose";
        ball.team = null;
        ball.targetId = null;
        ball.vx *= 0.72;
        ball.vy += between(match, -0.1, 0.1);
        match.possessionTeam = "none";
        match.possessionPlayerId = null;
        log(match, "miscontrol", `${teamName(match, receiver.team)} #${receiver.number} cannot settle the difficult pass.`);
        return;
      }
      ball.ownerId = receiver.id;
      ball.team = receiver.team;
      ball.state = "controlled";
      ball.vx = ball.vy = 0;
      receiver.state = "CONTROL";
      receiver.intent = "CONTROL";
      receiver.timeInState = 0;
      receiver.commitment = 0.25 + reception * 0.25;
      receiver.target = { x: receiver.x, y: receiver.y };
      receiver.receiveCommitUntil = match.elapsed + 0.55 + reception * 0.4;
      const passer = getPlayer(match, ball.lastPasserId);
      if (passer) {
        addStat(match, passer, "passesCompleted");
        if (ball.passType === "THROUGH") addStat(match, passer, "successfulThroughBalls");
        if (ball.passType === "LONG") addStat(match, passer, "successfulLongBalls");
        if (passer.isGoalkeeper) addStat(match, passer, "distributionCompletions");
        match.lastCompletedPass = { passerId: passer.id, receiverId: receiver.id, team: passer.team, time: match.elapsed };
      }
      match.attackStartedAt ??= match.elapsed;
      match.possessionTeam = receiver.team;
      match.possessionPlayerId = receiver.id;
      log(
        match,
        "receive",
        `${teamName(match, receiver.team)} #${receiver.number} controls the pass.`,
      );
      match.runWindow += 1;
    } else if (Math.hypot(ball.vx, ball.vy) < 0.035) {
      ball.state = "loose";
      ball.team = null;
      ball.targetId = null;
      match.possessionTeam = "none";
      match.possessionPlayerId = null;
    }
  } else if (ball.state === "shot" && Math.hypot(ball.vx, ball.vy) < 0.16) {
    ball.state = "loose";
    ball.team = null;
    match.possessionTeam = "none";
    match.possessionPlayerId = null;
  }

  if (ball.state === "loose") {
    ball.team = null;
    for (const goalkeeper of Object.values(match.goalkeepers ?? {}).sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
      const ownGoalX = teamContext(match, goalkeeper.team).ownGoalX;
      const nearGoal = Math.abs(ball.x - ownGoalX) < 0.2;
      const reachable = dist(goalkeeper, ball) < 0.095;
      if (nearGoal && reachable && ball.gkClaimAttemptedId !== goalkeeper.id) {
        ball.gkClaimAttemptedId = goalkeeper.id;
        const claimQuality = (
          goalkeeper.attributes.HAN * 0.48 +
          goalkeeper.attributes.CON * 0.32 +
          goalkeeper.attributes.DEC * 0.2
        ) / 99;
        if (random(match) < clamp(0.48 + claimQuality * 0.48, 0.55, 0.96)) {
          awardGoalkeeperPossession(
            match,
            goalkeeper,
            "gk_claim",
            `${teamName(match, goalkeeper.team)} goalkeeper claims the loose ball.`,
          );
          return;
        }
      }
    }
    const looseBallScore = (player) => {
      const attributes = player.attributes;
      const skill = attributes.PAC * 0.42 + attributes.CON * 0.34 + attributes.DEC * 0.24;
      const speed = (0.15 + attributes.PAC * 0.0011) * (0.76 + player.fitness * 0.0024);
      return dist(player, ball) / Math.max(0.18, speed) - skill * 0.00065 - attributes.POS * 0.00006;
    };
    const nearest = [...playersForTeam(match, 'home'), ...playersForTeam(match, 'away')].sort(
      (a, b) => looseBallScore(a) - looseBallScore(b) || String(a.id).localeCompare(String(b.id)),
    )[0];
    nearest.target = { x: ball.x, y: ball.y };
    const reception = (nearest.attributes.CON * 0.64 + nearest.attributes.DEC * 0.2 + nearest.attributes.VIS * 0.16) / 99;
    if (dist(nearest, ball) < 0.03 + reception * 0.02) {
      awardPossession(match, nearest, "recover");
    }
  }

}

function trackDribbleOutcome(match) {
  const ball = match.ball;
  if (ball.state !== "controlled" || !ball.ownerId) return;
  const carrier = getPlayer(match, ball.ownerId);
  if (!carrier?.dribbleAttemptActive) return;
  const defenders = teamPlayers(match, opponentTeam(carrier.team));
  const beaten = (carrier.dribblePassedIds ?? []).some(id => {
    const defender = defenders.find(other => other.id === id);
    if (!defender || Math.abs(defender.y - carrier.y) > 0.15) return false;
    const direction = teamDirection(match, carrier.team);
    const crossed = direction * (carrier.x - defender.x) > 0.018;
    const startDistance = carrier.dribbleOpponentDistances?.[id] ?? dist(defender, carrier);
    const evadedIntoSpace = match.elapsed - (carrier.dribbleStartedAt ?? match.elapsed) >= 0.28 &&
      direction * (carrier.x - (carrier.dribbleStart?.x ?? carrier.x)) > 0.025 && dist(defender, carrier) > startDistance + 0.012;
    if (!crossed && !evadedIntoSpace) return false;
    const attackerSkill = carrier.attributes.DRI * 0.34 + carrier.attributes.CON * 0.22 + carrier.attributes.DEC * 0.2 + carrier.attributes.PAC * 0.24;
    const defenderSkill = defender.attributes.TAC * 0.34 + defender.attributes.DEF * 0.24 + defender.attributes.DEC * 0.2 + defender.attributes.PAC * 0.22;
    const laneDistance = Math.abs(carrier.y - defender.y);
    const spaceAhead = carrier.perception?.availableSpace ?? 0.5;
    const carrierForwardSpeed = Math.max(0, carrier.vx * direction);
    const defenderClosingSpeed = Math.max(0, (defender.vx * (carrier.x - defender.x) + defender.vy * (carrier.y - defender.y)) / (dist(defender, carrier) || 1));
    const supportPressure = defenders.filter(other => other.id !== defender.id && dist(other, carrier) < 0.16).length;
    const chance = clamp(0.5 + (attackerSkill - defenderSkill) * 0.0032 +
      clamp(laneDistance / 0.16, 0, 1) * 0.1 + clamp(spaceAhead - 0.45, -0.45, 0.55) * 0.12 +
      clamp((carrierForwardSpeed - defenderClosingSpeed) / 0.3, -1, 1) * 0.08 - supportPressure * 0.055, 0.18, 0.82);
    return random(match) < chance;
  });
  if (beaten) {
    addStat(match, carrier, "successfulDribbles");
    carrier.dribbleAttemptActive = false;
    carrier.dribblePassedIds = [];
  } else if (match.elapsed - (carrier.dribbleStartedAt ?? match.elapsed) > 0.95) {
    carrier.dribbleAttemptActive = false;
    carrier.dribblePassedIds = [];
  }
}

function fallbackBallAction(match, player, plan) {
  const direction = teamDirection(match, player.team);
  const teammates = teamPlayers(match, player.team).filter(candidate => candidate.id !== player.id && !candidate.isGoalkeeper);
  const bestPass = teammates.map(teammate => ({ teammate, ...evaluatePassOptions(player, teammate, match) }))
    .filter(option => option.distance > 0.1 && option.distance < 0.72).sort((a, b) => b.score - a.score)[0];
  const scores = plan.scores ?? player.actionScores ?? {};
  const shooting = scores.SHOOT ?? 0, passing = Math.max(scores.PASS ?? 0, bestPass?.score ?? 0);
  const dribbling = scores.DRIBBLE ?? 0, space = player.perception?.availableSpace ?? 0;
  const goalDistance = 1 - teamProgress(match, player.team, player.x);
  if (shooting >= 60 && goalDistance < 0.3)
    return { ...plan, state: "SHOOT", intent: "SHOOT", target: { x: teamContext(match, player.team).goalX, y: 0.5 }, action: "SHOOT", reason: "Reassessment near goal ? take a reasonable shot" };
  if (bestPass && passing >= 44 && (passing >= shooting - 8 || shooting < 54))
    return { ...plan, state: "PASS", intent: "PASS", target: bestPass.target, targetPlayerId: bestPass.teammate.id, receiverId: bestPass.teammate.id, passType: bestPass.type, action: "PASS", reason: "Reassessment ? play the best available pass" };
  if (dribbling >= 40 && space > 0.12 && goalDistance > 0.08) {
    const target = { x: clamp(player.x + direction * 0.085, 0.06, 0.94), y: clamp(player.y + (0.5 - player.y) * 0.22, 0.1, 0.9) };
    return { ...plan, state: "DRIBBLE", intent: "DRIBBLE", target, action: null, reason: "Reassessment ? advance into the open lane" };
  }
  if (bestPass && passing >= 36)
    return { ...plan, state: "PASS", intent: "PASS", target: bestPass.target, targetPlayerId: bestPass.teammate.id, receiverId: bestPass.teammate.id, passType: bestPass.type, action: "PASS", reason: "Reassessment ? retain the ball with a safe pass" };
  if (goalDistance > 0.1 && space > 0.07) {
    const target = { x: clamp(player.x + direction * 0.06, 0.06, 0.94), y: clamp(player.y + (0.5 - player.y) * 0.16, 0.1, 0.9) };
    return { ...plan, state: "ADVANCE", intent: "ADVANCE", target, action: null, reason: "Reassessment ? progress safely into space" };
  }
  return null;
}

function fallbackPosition(match, player, plan) {
  const direction = teamDirection(match, player.team);
  const base = plan.target && Number.isFinite(plan.target.x) && Number.isFinite(plan.target.y)
    ? plan.target
    : { x: player.x - direction * 0.08, y: player.y };
  const candidates = [base,
    { x: base.x, y: base.y - 0.13 }, { x: base.x, y: base.y + 0.13 },
    { x: base.x + direction * 0.07, y: base.y }, { x: base.x - direction * 0.05, y: base.y },
  ].map(point => ({ x: clamp(point.x, 0.07, 0.93), y: clamp(point.y, 0.1, 0.9) }));
  const opponents = teamPlayers(match, opponentTeam(player.team));
  const teammates = teamPlayers(match, player.team).filter(other => other.id !== player.id && !other.isGoalkeeper);
  const target = candidates.map(point => {
    const opponentSpace = opponents.length ? Math.min(...opponents.map(other => dist(point, other))) : 0.5;
    const teammateSpace = teammates.length ? Math.min(...teammates.map(other => dist(point, other))) : 0.3;
    const progress = teamProgress(match, player.team, point.x);
    const travelCost = dist(player, point);
    return { point, score: opponentSpace * 1.5 + Math.min(teammateSpace, 0.3) * 0.32 + progress * 0.12 - travelCost * 0.18 };
  }).sort((a, b) => b.score - a.score)[0].point;
  return { ...plan, target, reason: `${plan.reason || "Movement"} · fallback repositions into useful space` };
}

function reassessStalledPlan(match, player, plan) {
  if (!plan || player.isGoalkeeper) return plan;
  const key = `${plan.state}:${plan.intent}`;
  if (player.lastDecisionKey === key) player.repeatedDecisionTime = (player.repeatedDecisionTime ?? 0) + AI_INTERVAL;
  else { player.lastDecisionKey = key; player.repeatedDecisionTime = 0; }
  const stationary = player.stuckTimer ?? 0;
  const persistentNoChoice = player.repeatedDecisionTime > 5.5 && stationary > 1.5;
  if ((stationary < 3 && !persistentNoChoice && !player.invalidTargetDetected) || match.elapsed < (player.fallbackReadyAt ?? 0)) return plan;

  const isCarrier = match.ball.ownerId === player.id;
  const fallback = isCarrier ? fallbackBallAction(match, player, plan) : fallbackPosition(match, player, plan);
  player.stuckTimer = 0;
  player.invalidTargetDetected = false;
  player.repeatedDecisionTime = 0;
  player.fallbackReadyAt = match.elapsed + 2.8;
  player.lastMeaningfulActionAt = match.elapsed;
  return fallback ?? plan;
}

function decideFrame(match) {
  const actors = [...teamPlayers(match, 'home'), ...teamPlayers(match, 'away')].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  buildPerceptionForTeam(match);
  for (const goalkeeper of Object.values(match.goalkeepers ?? {}).sort((a, b) => String(a.id).localeCompare(String(b.id)))) goalkeeper.perception = perceivePlayer(match, goalkeeper);

  // Build every outfield plan from the same pre-action snapshot. Possession
  // determines which team attacks; every other player uses the same defending AI.
  const carrier = getPlayer(match, match.ball.ownerId);
  const activeTeam = carrier?.team ?? (match.ball.team && ["pass", "shot"].includes(match.ball.state) ? match.ball.team : null);
  const plans = new Map();
  for (const team of ["home", "away"]) {
    const teamActors = teamPlayers(match, team).filter(player => !player.isGoalkeeper);
    if (!activeTeam || activeTeam === team) {
      for (const player of teamActors) plans.set(player.id, chooseIntent(match, player));
    } else {
      const defensivePlans = chooseDefensiveIntents(match, team);
      for (const player of teamActors) plans.set(player.id, defensivePlans[player.id]);
    }
  }

  // Apply plans in stable ID order, then resolve their actions. No team gets
  // to inspect state changes made by the other team's decision pass.
  match.decisionFrameCount = (match.decisionFrameCount ?? 0) + 1;
  const ordered = [...actors].filter(player => plans.has(player.id)).sort((a, b) =>
    (Number(a.number) || 0) - (Number(b.number) || 0) ||
    String(a.id).localeCompare(String(b.id)));
  const resolved = [];
  for (const player of ordered) {
    const plan = reassessStalledPlan(match, player, plans.get(player.id));
    if (!plan) continue;
    const defensive = ["DEFEND_SHAPE", "PRESS", "CONTAIN", "RECOVER", "INTERCEPT", "CHALLENGE", "COVER", "GET_BALL"].includes(plan.state) && player.id !== match.ball.ownerId;
    if (defensive) applyDefensivePlan(match, player, plan);
    else executeDecision(match, player, plan);
    resolved.push({ player, plan, defensive });
  }
  for (const { player, plan } of resolved) if (plan.state === "CHALLENGE") attemptChallenge(match, player, plan);
  for (const goalkeeper of Object.values(match.goalkeepers ?? {}).sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    updateGoalkeeper(match, goalkeeper);
    attemptGoalkeeperChallenge(match, goalkeeper);
  }
  if (!activeTeam && match.ball.state !== "loose") syncPossession(match);
}

function validateSimulationState(match) {
  const finite = value => Number.isFinite(value);
  for (const player of allActors(match)) {
    const invalidPosition = !finite(player.x) || !finite(player.y);
    const invalidVelocity = !finite(player.vx) || !finite(player.vy);
    if (invalidPosition) {
      const fallback = player.lastValidPosition ?? formationTarget(match, player) ?? { x: 0.5, y: 0.5 };
      player.x = clamp(fallback.x, 0.035, 0.965);
      player.y = clamp(fallback.y, 0.06, 0.94);
      player.target = { x: player.x, y: player.y };
    } else {
      player.x = clamp(player.x, 0.035, 0.965);
      player.y = clamp(player.y, 0.06, 0.94);
      player.lastValidPosition = { x: player.x, y: player.y };
    }
    if (invalidVelocity) player.vx = player.vy = 0;
    if (!player.target || !finite(player.target.x) || !finite(player.target.y)) {
      player.target = formationTarget(match, player) ?? { x: player.x, y: player.y };
      player.invalidTargetDetected = true;
    }
    if ((invalidPosition || invalidVelocity) && match.elapsed - (player.lastInvalidLogAt ?? -10) > 5) {
      match.invalidStateCount = (match.invalidStateCount ?? 0) + 1;
      player.lastInvalidLogAt = match.elapsed;
      log(match, "simulation_recovery", `Recovered invalid position or velocity for ${teamName(match, player.team)} ${player.isGoalkeeper ? "goalkeeper" : `#${player.number}`}.`);
    }
  }
  const owner = match.ball.ownerId ? getPlayer(match, match.ball.ownerId) : null;
  if (match.ball.ownerId && !owner) {
    match.ball.ownerId = null;
    match.ball.targetId = null;
    match.ball.team = null;
    match.ball.state = "loose";
    match.possessionTeam = "none";
    match.possessionPlayerId = null;
    match.invalidStateCount = (match.invalidStateCount ?? 0) + 1;
    log(match, "simulation_recovery", "Cleared a ball owner reference that no longer exists.");
  }
  if (match.ball.state === "pass" && match.ball.targetId && !getPlayer(match, match.ball.targetId)) {
    match.ball.state = "loose";
    match.ball.ownerId = null;
    match.ball.targetId = null;
    match.ball.team = null;
    match.possessionTeam = "none";
    match.possessionPlayerId = null;
    match.invalidStateCount = (match.invalidStateCount ?? 0) + 1;
    log(match, "simulation_recovery", "Released a pass whose receiver reference no longer exists.");
  }
  const ballInvalid = !finite(match.ball.x) || !finite(match.ball.y) || !finite(match.ball.vx) || !finite(match.ball.vy);
  if (ballInvalid) {
    if (owner) {
      match.ball.x = owner.x;
      match.ball.y = owner.y;
      match.ball.vx = owner.vx;
      match.ball.vy = owner.vy;
      match.ball.state = "controlled";
      match.ball.team = owner.team;
    } else {
      match.ball.x = finite(match.ball.x) ? clamp(match.ball.x, -0.05, 1.05) : 0.5;
      match.ball.y = finite(match.ball.y) ? clamp(match.ball.y, 0.055, 0.945) : 0.5;
      match.ball.vx = match.ball.vy = 0;
      match.ball.state = "loose";
      match.ball.team = null;
    }
    match.invalidStateCount = (match.invalidStateCount ?? 0) + 1;
    log(match, "simulation_recovery", "Recovered an invalid ball position or velocity.");
  }
  match.lastValidationAt = match.elapsed;
}

function reevaluateUnproductivePossession(match, dt) {
  const team = match.ball.ownerId ? getPlayer(match, match.ball.ownerId)?.team :
    (["pass", "shot"].includes(match.ball.state) ? match.ball.team : null);
  const watch = match.attackProgressWatch ??= { team: null, startedAt: match.elapsed, bestProgress: 0, lastProgressAt: match.elapsed, lastRecoveryAt: -Infinity, recoveryCount: 0 };
  if (!team) { watch.team = null; return; }
  const progress = teamProgress(match, team, match.ball.x);
  if (watch.team !== team) Object.assign(watch, { team, startedAt: match.elapsed, bestProgress: progress, lastProgressAt: match.elapsed, lastRecoveryAt: -Infinity, recoveryCount: 0 });
  if (progress > watch.bestProgress + 0.035) {
    watch.bestProgress = progress;
    watch.lastProgressAt = match.elapsed;
    return;
  }
  if (match.elapsed - watch.lastProgressAt < 24 || match.elapsed - watch.lastRecoveryAt < 12) return;
  for (const player of teamPlayers(match, team)) {
    player.commitment = 0;
    player.fallbackReadyAt = 0;
    player.lastDecisionKey = null;
    player.repeatedDecisionTime = 0;
    if (player.id === match.ball.ownerId) player.stuckTimer = Math.max(player.stuckTimer ?? 0, 3);
    else player.runReadyAt = Math.min(player.runReadyAt ?? 0, match.elapsed);
  }
  watch.lastRecoveryAt = match.elapsed;
  watch.lastProgressAt = match.elapsed;
  watch.recoveryCount += 1;
  match.deadlockReevaluationCount = (match.deadlockReevaluationCount ?? 0) + 1;
  log(match, "attack_reassessment", `${teamName(match, team)} reassesses its attack after 24 seconds without meaningful forward progress.`);
}

export function advanceMatch(match, dt) {
  if (match.phase !== "playing") return;
  const boundary = match.half === 1 ? HALF_LENGTH : MATCH_LENGTH;
  const step = Math.min(dt, Math.max(0, boundary - match.elapsed));
  if (step <= 0) {
    match.phase = match.half === 1 ? "halftime" : "fulltime";
    match.minute = match.half === 1 ? 45 : 90;
    completeHalf(match);
    return;
  }
  if (match.possessionTeam === "home" || match.possessionTeam === "away")
    addStat(match, match.possessionTeam, "possessionSeconds", step);
  match.elapsed += step;
  for (const player of allActors(match)) {
    const line = match.statistics?.players?.[player.id]
    if (line?.appearances) line.minutes += step * 90 / MATCH_LENGTH
  }
  if (match.elapsed - (match.lastValidationAt ?? -1) >= 0.1) validateSimulationState(match);
  match.minute = Math.min(90, Math.floor((match.elapsed / MATCH_LENGTH) * 90));
  if (match.restartTimer > 0) {
    match.restartTimer -= step;
    if (match.restartTimer <= 0) startRestart(match);
  }

  match.aiAccumulator += step;
  while (match.aiAccumulator >= AI_INTERVAL) {
    match.aiAccumulator -= AI_INTERVAL;
    if (match.restartTimer <= 0) decideFrame(match);
  }

  for (const player of allActors(match))
    steer(player, step, match);
  updateBall(match, step);
  trackDribbleOutcome(match);
  syncPossession(match);
  reevaluateUnproductivePossession(match, step);
  reevaluateIfSimulationIsStalled(match, step);
  if (match.elapsed >= boundary - 1e-8) {
    match.elapsed = boundary;
    match.phase = match.half === 1 ? "halftime" : "fulltime";
    match.minute = match.half === 1 ? 45 : 90;
    completeHalf(match);
  }
}

function copyStatistics(statistics) {
  return {
    teams: Object.fromEntries(Object.entries(statistics.teams).map(([team, line]) => [team, { ...line }])),
    players: Object.fromEntries(Object.entries(statistics.players).map(([id, line]) => [id, { ...line }])),
  };
}

function completeHalf(match) {
  if (match.phase === "halftime" && !match.firstHalfStatistics) {
    match.firstHalfStatistics = copyStatistics(match.statistics);
    log(match, "halftime", "The referee signals half time.");
  } else if (match.phase === "fulltime" && !match.fullTimeLogged) {
    match.fullTimeLogged = true;
    log(match, "fulltime", "The referee signals full time.");
  }
}

function makeHalftimeSubstitutions(match) {
  match.substitutionCounts ??= { home: 0, away: 0 };
  match.substitutes ??= { home: [], away: [] };
  for (const team of ['home', 'away']) {
    while (match.substitutionCounts[team] < 5) {
      const active = team === 'home' ? match.players : match.opponents;
      const tired = teamPlayers(match, team).filter(player => !player.isGoalkeeper && player.id !== match.ball.ownerId && player.id !== match.ball.targetId && (player.fitness ?? 100) <= 91).sort((a, b) => a.fitness - b.fitness)[0];
      if (!tired) break;
      const groupOf = player => player.positionGroup ?? ({ GK: 'GK', RB: 'DEF', LB: 'DEF', CB: 'DEF', DM: 'MID', CM: 'MID', AM: 'MID', RW: 'ATT', LW: 'ATT', ST: 'ATT' })[player.position] ?? player.position;
      const benchPool = match.substitutes[team].filter(player => !player.substitutedOff && !player.sentOff && !player.isGoalkeeper && (player.fitness ?? 100) >= (tired.fitness ?? 100) + 4);
      const bench = benchPool.filter(player => player.position === tired.position).sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0) || b.fitness - a.fitness)[0]
        ?? benchPool.filter(player => groupOf(player) === groupOf(tired)).sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0) || b.fitness - a.fitness)[0];
      if (!bench) break;
      tired.substitutedOff = true; invalidateActorCache(match); tired.state = 'SUBBED_OFF'; tired.intent = 'SUBBED_OFF'; tired.vx = 0; tired.vy = 0;
      Object.assign(bench, { role: tired.role, tacticalRole: tired.tacticalRole, tacticalZone: tired.tacticalZone, profile: tired.profile, formationSlot: { ...tired.formationSlot }, laneSide: tired.laneSide, x: tired.x, y: tired.y, target: { ...tired.target }, state: tired.role.startsWith('DEFENDER') ? 'DEFEND_SHAPE' : 'SUPPORT', intent: tired.role.startsWith('DEFENDER') ? 'DEFEND_SHAPE' : 'SUPPORT', timeInState: 0, commitment: 0, substitutedOff: false, sentOff: false, vx: 0, vy: 0 });
      active.push(bench);
      match.substitutes[team] = match.substitutes[team].filter(player => player.id !== bench.id);
      match.substitutionCounts[team]++;
      const line = match.statistics?.players?.[bench.id]; if (line) line.appearances = 1;
      for (const player of teamPlayers(match, team)) {
        player.positionalProfile = formationPositions(match, player);
        player.tacticalZone = player.positionalProfile.zone;
        player.baseFormationPosition = player.positionalProfile.base ?? formationAnchor(match, player);
        const target = formationTarget(match, player);
        if (target) player.target = { ...target };
      }
      log(match, 'substitution', `${teamName(match, team)} substitution: ${tired.name} OFF, ${bench.name} ON (half time).`);
    }
  }
}

export function resumeSecondHalf(match) {
  if (match.phase !== "halftime") return;
  match.half = 2;
  match.phase = "playing";
  match.minute = 45;
  match.aiAccumulator = 0;
  for (const team of ["home", "away"]) {
    match.teamContexts[team].attackDirection *= -1;
    for (const player of teamPlayers(match, team)) {
      const target = formationTarget(match, player);
      if (target) {
        player.target = { ...target };
        player.positionalProfile = formationPositions(match, player);
        player.baseFormationPosition = player.positionalProfile.base ?? formationAnchor(match, player);
        player.targetReason = "Retake formation after the teams switch ends";
        player.commitment = 0;
      }
    }
    const keeper = match.goalkeepers?.[team];
    if (keeper) keeper.target = { x: goalkeeperHomeX(match, team), y: 0.5 };
  }
  makeHalftimeSubstitutions(match);
  match.attackProgressWatch = { team: null, startedAt: match.elapsed, bestProgress: 0, lastProgressAt: match.elapsed, lastRecoveryAt: -Infinity, recoveryCount: 0 };
  log(match, "halftime", "Teams switch ends for the second half.");
}

// If every actor and the ball stop changing for several seconds, mark stale
// movement plans for the existing stuck-plan fallback. This never assigns
// possession or moves the ball; it only asks the decision layer to reconsider.
function reevaluateIfSimulationIsStalled(match, dt) {
  const actors = allActors(match);
  const snapshot = {
    ball: { x: match.ball.x, y: match.ball.y, vx: match.ball.vx, vy: match.ball.vy },
    ownerId: match.ball.ownerId,
    ballState: match.ball.state,
    possessionTeam: match.possessionTeam,
    eventId: match.eventId,
    actors: actors.map(player => ({
      id: player.id, x: player.x, y: player.y, vx: player.vx, vy: player.vy,
      state: player.state, intent: player.intent,
    })),
  };
  const previous = match.progressSnapshot;
  match.progressSnapshot = snapshot;
  if (!previous) return;

  const ballChanged = Math.hypot(snapshot.ball.x - previous.ball.x, snapshot.ball.y - previous.ball.y) > 0.0015 ||
    Math.hypot(snapshot.ball.vx - previous.ball.vx, snapshot.ball.vy - previous.ball.vy) > 0.025;
  const actorChanged = snapshot.actors.some((actor, index) => {
    const before = previous.actors[index];
    return !before || actor.id !== before.id ||
      Math.hypot(actor.x - before.x, actor.y - before.y) > 0.0015 ||
      Math.hypot(actor.vx - before.vx, actor.vy - before.vy) > 0.025 ||
      actor.state !== before.state || actor.intent !== before.intent;
  });
  const matchChanged = snapshot.ownerId !== previous.ownerId ||
    snapshot.ballState !== previous.ballState ||
    snapshot.possessionTeam !== previous.possessionTeam ||
    snapshot.eventId !== previous.eventId;
  if (ballChanged || actorChanged || matchChanged) {
    match.noProgressSeconds = 0;
    return;
  }

  match.noProgressSeconds = (match.noProgressSeconds ?? 0) + dt;
  if (match.noProgressSeconds < 6) return;

  for (const player of actors) {
    if (player.isGoalkeeper) continue;
    const isCarrier = player.id === match.ball.ownerId;
    const needsMovement = Math.hypot(player.target.x - player.x, player.target.y - player.y) > 0.055;
    if (!isCarrier && !needsMovement) continue;
    player.stuckTimer = Math.max(player.stuckTimer ?? 0, 3);
    player.fallbackReadyAt = 0;
    player.lastDecisionKey = null;
    player.repeatedDecisionTime = 0;
    player.commitment = 0;
  }
  match.deadlockReevaluationCount = (match.deadlockReevaluationCount ?? 0) + 1;
  match.noProgressSeconds = 0;
}

/** Advance the current match through the same fixed-step engine until full time. */
export function simulateToEnd(match) {
  let steps = 0;
  while (match.phase !== "fulltime" && steps < MATCH_LENGTH * 60 + 4) {
    if (match.phase === "halftime") resumeSecondHalf(match);
    advanceMatch(match, FIXED_TIMESTEP);
    steps += 1;
  }
  return match;
}

export function restartMatch(match, seed = (match.seed + 1) >>> 0) {
  const managedTeam = match.managedTeam ?? null;
  const teamTactics = match.teamTactics ?? createTeamTactics();
  const previousFitness = Object.fromEntries(allActors(match).map(player => [player.id, player.fitness ?? 100]));
  Object.assign(match, createMatch(seed));
  invalidateActorCache(match);
  match.managedTeam = managedTeam;
  match.teamTactics = teamTactics;
  for (const player of allActors(match)) {
    const previous = previousFitness[player.id];
    if (previous == null) continue;
    const recovery = 1 + (player.attributes.FIT ?? 70) * 0.09;
    player.fitness = Math.min(100, previous + recovery);
  }
}
