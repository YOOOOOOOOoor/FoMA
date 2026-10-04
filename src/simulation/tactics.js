export const DEFAULT_TACTICS = Object.freeze({
  defensiveApproach: 'mid_block',
  attackingMentality: 'balanced',
  transitionStyle: 'controlled',
  defensiveLine: 'medium',
})

export const TACTIC_CONTROLS = [
  {
    key: 'defensiveApproach', label: 'Defensive Approach', options: [
      ['high_press', 'High Press', 'Press aggressively and defend higher, leaving more space behind.'],
      ['mid_block', 'Mid Block', 'Press selectively while keeping a balanced team shape.'],
      ['low_block', 'Low Block', 'Stay compact and deeper, reducing aggressive pressing.'],
    ],
  },
  {
    key: 'attackingMentality', label: 'Attacking Mentality', options: [
      ['balanced', 'Balanced', 'Use normal risk and forward movement.'],
      ['possession', 'Possession', 'Favor safer short passes and support around the ball.'],
      ['direct', 'Direct', 'Seek forward passes, runs and quicker progression.'],
      ['aggressive', 'Aggressive', 'Move forward with greater attacking risk.'],
    ],
  },
  {
    key: 'transitionStyle', label: 'Transition Style', options: [
      ['fast_counter', 'Fast Counter', 'Look forward quickly after winning the ball.'],
      ['controlled', 'Controlled', 'Secure the ball, then build at a balanced pace.'],
      ['slow_build', 'Slow Build-up', 'Favor short circulation and patient progression.'],
    ],
  },
  {
    key: 'defensiveLine', label: 'Defensive Line', options: [
      ['high', 'High', 'Step up to compress space and support pressing.'],
      ['medium', 'Medium', 'Keep a balanced defensive line.'],
      ['low', 'Low', 'Stay deeper and reduce space behind the defenders.'],
    ],
  },
]

export function createTeamTactics() {
  return {
    home: { ...DEFAULT_TACTICS },
    away: { ...DEFAULT_TACTICS },
  }
}

export function tacticsFor(match, team) {
  const tactics = { ...DEFAULT_TACTICS, ...(match.teamTactics?.[team] ?? {}) }
  delete tactics.playerFreedom
  return tactics
}

export function isFastTransition(match, team) {
  return match.transitionTeam === team && match.elapsed <= (match.transitionUntil ?? 0)
}
