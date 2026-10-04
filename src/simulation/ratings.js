const OUTFIELD_WEIGHTS = {
  ATTACKER: { SHO: 0.19, PAC: 0.16, DRI: 0.14, CON: 0.13, DEC: 0.13, POS: 0.12, PAS: 0.06, VIS: 0.04, FIT: 0.03 },
  ATTACKER_SUPPORT: { PAS: 0.16, VIS: 0.15, DEC: 0.14, CON: 0.13, POS: 0.13, DRI: 0.1, PAC: 0.09, SHO: 0.06, FIT: 0.04 },
  SUPPORT: { PAS: 0.18, VIS: 0.16, DEC: 0.15, CON: 0.14, POS: 0.12, PAC: 0.08, DRI: 0.08, SHO: 0.05, FIT: 0.04 },
  DEFENDER: { DEF: 0.2, TAC: 0.17, POS: 0.15, DEC: 0.14, PAC: 0.11, VIS: 0.1, CON: 0.05, PAS: 0.04, FIT: 0.04 },
  DEFENDER_SUPPORT: { DEF: 0.18, POS: 0.16, VIS: 0.15, DEC: 0.14, TAC: 0.13, PAC: 0.09, PAS: 0.06, CON: 0.05, FIT: 0.04 },
  GOALKEEPER: { REF: 0.24, POS_GK: 0.2, HAN: 0.18, DEF: 0.11, DEC: 0.1, CON: 0.07, PAC: 0.04, POS: 0.03, VIS: 0.03 },
}

export function overallRating(player) {
  const weights = OUTFIELD_WEIGHTS[player.role] ?? OUTFIELD_WEIGHTS.SUPPORT
  const values = player.attributes ?? {}
  const total = Object.entries(weights).reduce((sum, [key, weight]) => sum + (values[key] ?? 65) * weight, 0)
  return Math.round(total)
}

export const ROLE_LABELS = {
  ATTACKER: 'Attacker', ATTACKER_SUPPORT: 'Attacking Support', SUPPORT: 'Support',
  DEFENDER: 'Defender', DEFENDER_SUPPORT: 'Defensive Support', GOALKEEPER: 'Goalkeeper',
}
