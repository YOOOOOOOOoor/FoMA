const KITS = [
  { primary: '#167d62', secondary: '#eff8f2' },
  { primary: '#7139a8', secondary: '#f4e9ff' },
  { primary: '#d74343', secondary: '#fff0e9' },
  { primary: '#1566a6', secondary: '#eef6ff' },
  { primary: '#cb7622', secondary: '#fff5dc' },
  { primary: '#333e56', secondary: '#fff3a6' },
  { primary: '#bc4f8a', secondary: '#fff0f8' },
  { primary: '#707d20', secondary: '#f7ffdc' },
]

function hash(value) {
  let result = 2166136261
  for (const char of String(value ?? 'club')) result = Math.imul(result ^ char.charCodeAt(0), 16777619)
  return result >>> 0
}

function colorDistance(a, b) {
  const rgb = value => value.match(/[a-f\d]{2}/gi).map(part => parseInt(part, 16))
  const left = rgb(a), right = rgb(b)
  return Math.hypot(...left.map((channel, index) => channel - right[index]))
}

export function kitsForFixture(homeClubId, awayClubId) {
  const homeIndex = hash(homeClubId) % KITS.length
  let awayIndex = hash(awayClubId) % KITS.length
  if (awayIndex === homeIndex) awayIndex = (awayIndex + 1 + hash(`${homeClubId}:${awayClubId}`) % (KITS.length - 1)) % KITS.length
  const home = { ...KITS[homeIndex], pattern: 'solid' }
  const away = { ...KITS[awayIndex], pattern: colorDistance(home.primary, KITS[awayIndex].primary) < 125 ? 'stripes' : 'solid' }
  if (away.pattern === 'stripes') away.secondary = '#ffffff'
  return { home, away }
}
