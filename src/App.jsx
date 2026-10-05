import { useEffect, useRef, useState } from 'react'
import { advanceMatch, changeLiveFormation, createMatch, FIXED_TIMESTEP, restartMatch, resumeSecondHalf, simulateToEnd, substitutePlayer } from './simulation/engine.js'
import { overallRating, ROLE_LABELS } from './simulation/ratings.js'
import { passAccuracy } from './simulation/statistics.js'
import { playerOfTheMatch } from './simulation/matchRatings.js'
import { TACTIC_CONTROLS, DEFAULT_TACTICS } from './simulation/tactics.js'
import { attributesForPosition, FORMATION_SHAPES, tacticalRoleForSlot } from './simulation/team.js'

function Pitch({ match }) {
  const actors = [...match.players, ...(match.opponents || []), ...Object.values(match.goalkeepers || {})].filter(player => !player.substitutedOff && !player.sentOff)
  const left = 18, top = 18, width = 1440, height = 790, centerX = left + width / 2, centerY = top + height / 2
  const lineX = (fraction) => left + width * fraction
  const lineY = (fraction) => top + height * fraction
  const goalHalf = height * .076
  const penaltyHalf = height * .237, boxHalf = height * .134
  const outerBox = width * .15, innerBox = width * .056
  const goalLeft = left - 54, goalRight = left + width + 54
  return <svg className="pitch" viewBox="-58 0 1580 826" role="img" aria-label="Football pitch">
    <defs><pattern id="mow" width="240" height={height} patternUnits="userSpaceOnUse"><rect width="120" height={height} fill="#fff" opacity=".035" /></pattern></defs>
    <rect x="-58" width="1580" height="826" rx="12" fill="#247b50"/><rect x="-58" width="1580" height="826" rx="12" fill="url(#mow)"/>
    <g className="lines"><rect x={left} y={top} width={width} height={height}/><line x1={centerX} y1={top} x2={centerX} y2={top + height}/><circle cx={centerX} cy={centerY} r={height * .137}/><circle cx={centerX} cy={centerY} r="3" className="spot"/><rect x={left} y={centerY - penaltyHalf} width={outerBox} height={penaltyHalf * 2}/><rect x={left} y={centerY - boxHalf} width={innerBox} height={boxHalf * 2}/><rect x={left + width - outerBox} y={centerY - penaltyHalf} width={outerBox} height={penaltyHalf * 2}/><rect x={left + width - innerBox} y={centerY - boxHalf} width={innerBox} height={boxHalf * 2}/><path d={`M${lineX(.15)} ${centerY - height * .118} A${height * .134} ${height * .134} 0 0 1 ${lineX(.15)} ${centerY + height * .118} M${lineX(.85)} ${centerY - height * .118} A${height * .134} ${height * .134} 0 0 0 ${lineX(.85)} ${centerY + height * .118}`}/></g>
    <g className={`goal-net ${match.ball.state === 'goal' && match.lastGoalX < .5 ? 'scored' : ''}`}><path d={`M${left} ${centerY - goalHalf} H${goalLeft} V${centerY + goalHalf} H${left} M${left} ${centerY - goalHalf} V${centerY + goalHalf} M${goalLeft + 9} ${centerY - goalHalf} V${centerY + goalHalf} M${goalLeft + 27} ${centerY - goalHalf} V${centerY + goalHalf} M${goalLeft + 45} ${centerY - goalHalf} V${centerY + goalHalf} M${goalLeft} ${centerY - goalHalf / 2} H${left} M${goalLeft} ${centerY} H${left} M${goalLeft} ${centerY + goalHalf / 2} H${left}`}/></g>
    <g className={`goal-net ${match.ball.state === 'goal' && match.lastGoalX >= .5 ? 'scored' : ''}`}><path d={`M${left + width} ${centerY - goalHalf} H${goalRight} V${centerY + goalHalf} H${left + width} M${left + width} ${centerY - goalHalf} V${centerY + goalHalf} M${goalRight - 9} ${centerY - goalHalf} V${centerY + goalHalf} M${goalRight - 27} ${centerY - goalHalf} V${centerY + goalHalf} M${goalRight - 45} ${centerY - goalHalf} V${centerY + goalHalf} M${left + width} ${centerY - goalHalf / 2} H${goalRight} M${left + width} ${centerY} H${goalRight} M${left + width} ${centerY + goalHalf / 2} H${goalRight}`}/></g>
    <g className="goal-frame"><path d={`M${left} ${centerY - goalHalf} H${goalLeft} V${centerY + goalHalf} H${left} M${left} ${centerY - goalHalf} V${centerY + goalHalf} M${left + width} ${centerY - goalHalf} H${goalRight} V${centerY + goalHalf} H${left + width} M${left + width} ${centerY - goalHalf} V${centerY + goalHalf}`}/></g>
    {actors.map(player => { const kit = match.teamContexts[player.team]?.kit; return <g key={player.id} style={{ '--kit-primary': kit?.primary ?? '#167d62', '--kit-secondary': kit?.secondary ?? '#eff8f2' }} className={`player team-${player.team} ${player.state === 'MAKE_RUN' ? 'running' : ''} ${player.isGoalkeeper ? 'goalkeeper' : ''} ${player.sentOff ? 'sent-off' : ''}`} transform={`translate(${lineX(player.x)} ${lineY(player.y)})`}>
      {player.id === match.ball.ownerId && <circle r="15" className="possession-ring"/>}
      <circle r="12" className="halo"/><circle r="10" className={`disc player-${player.number}`} transform="rotate(45)"/>
      {kit?.pattern === 'stripes' && <><defs><clipPath id={`kit-${player.id}`}><circle r="10"/></clipPath></defs><path d="M-9 -11V11 M-3 -11V11 M3 -11V11 M9 -11V11" stroke="var(--kit-secondary)" strokeWidth="2.3" clipPath={`url(#kit-${player.id})`}/></>}
      <text y="1" fontSize="9">{player.isGoalkeeper ? 'GK' : player.number}</text><path d="M0 0 L10 0" transform={`rotate(${player.heading * 180 / Math.PI})`} className="facing"/>{player.card && <rect x="6" y="-13" width="5" height="7" rx="1" fill={player.card === 'RED' || player.card === 'SECOND_YELLOW' ? '#e43d45' : '#f3d442'} stroke="#18201c" strokeWidth=".8"/>}
    </g>})}
    <g transform={`translate(${lineX(match.ball.x)} ${lineY(match.ball.y)})`} className={`ball ${match.ball.state === 'goal' ? 'scored' : ''}`}><circle r="6"/><path d="M-2-2 2 2M2-2-2 2"/></g>
    {match.ball.state === 'shot' && <text x={lineX(.82)} y={lineY(.4)} className="goal-label">SHOT</text>}
  </svg>
}

function clockText(match) {
  const totalSeconds = Math.floor((match.elapsed / 480) * 90 * 60)
  const minutes = Math.min(90, Math.floor(totalSeconds / 60))
  const seconds = minutes === 90 ? 0 : totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function snapshotMatch(match) {
  return { ...match,
    teamTactics: { home: { ...match.teamTactics.home }, away: { ...match.teamTactics.away } },
    teamContexts: { home: { ...match.teamContexts.home }, away: { ...match.teamContexts.away } },
    teamIds: { ...match.teamIds },
    players: match.players.map(player => ({ ...player, target: { ...player.target }, actionScores: { ...player.actionScores }, perception: player.perception ? { ...player.perception } : null })),
    opponents: match.opponents.map(player => ({ ...player, target: { ...player.target }, actionScores: { ...player.actionScores }, perception: player.perception ? { ...player.perception } : null })),
    goalkeepers: Object.fromEntries(Object.entries(match.goalkeepers).map(([team, player]) => [team, { ...player, target: { ...player.target }, actionScores: { ...player.actionScores } }])),
    ball: { ...match.ball }, events: [...match.events], goals: [...(match.goals ?? [])],
    firstHalfStatistics: match.firstHalfStatistics ? { teams: Object.fromEntries(Object.entries(match.firstHalfStatistics.teams).map(([team, line]) => [team, { ...line }])), players: Object.fromEntries(Object.entries(match.firstHalfStatistics.players).map(([id, line]) => [id, { ...line }])) } : null,
    statistics: { teams: { home: { ...match.statistics.teams.home }, away: { ...match.statistics.teams.away } }, players: Object.fromEntries(Object.entries(match.statistics.players).map(([id, stats]) => [id, { ...stats }])) },
  }
}
const actorsOf = match => [...match.players, ...match.opponents, ...Object.values(match.goalkeepers)]
const positionTag = player => player.isGoalkeeper ? 'GK' : player.role.startsWith('DEFENDER') ? 'DEF' : player.role.startsWith('ATTACKER') ? 'ATT' : 'SUP'
const statRows = [['Goals','goals'],['Assists','assists'],['Shots','shots'],['Shots on target','shotsOnTarget'],['Passes attempted','passesAttempted'],['Passes completed','passesCompleted'],['Pass accuracy','accuracy'],['Key passes','keyPasses'],['Through balls','throughBalls'],['Through balls completed','successfulThroughBalls'],['Long balls','longBalls'],['Long balls completed','successfulLongBalls'],['Tackles','tackles'],['Successful tackles','successfulTackles'],['Interceptions','interceptions'],['Blocks','blocks'],['Dribbles','dribbles'],['Successful dribbles','successfulDribbles'],['Fouls','fouls'],['Yellow cards','yellowCards'],['Red cards','redCards'],['Possession losses','possessionLosses']]

function PlayerDetails({ player, onClose, matchRating }) {
  if (!player) return null
  return <div className="modal-backdrop" onClick={onClose}><section className="player-detail modal-card" onClick={event => event.stopPropagation()}><button className="modal-close" onClick={onClose} aria-label="Close player details">x</button><span className="eyebrow">{player.clubName ?? player.team.toUpperCase()} SQUAD  |  {ROLE_LABELS[player.role] ?? player.role}</span><h2>{player.name}</h2><p>{positionTag(player)}  |  {player.isGoalkeeper ? 'Goalkeeper' : `#${player.number}`}  |  <strong>{overallRating(player)} OVR</strong>{matchRating != null && <>  |  <strong>{Number(matchRating).toFixed(1)} MATCH RATING</strong></>}</p><p className="ability-caption">Overall shows permanent ability. Match rating reflects this match; fitness is current physical condition.</p><div className="rating-list">{Object.entries(player.attributes).map(([key, value]) => <div className="rating-row" key={key} title={key === 'FIT' ? 'Permanent stamina/endurance ability' : undefined}><b>{key === 'FIT' ? 'END' : key}</b><span className="rating-track"><i style={{ width: `${value}%` }}/></span><strong>{value}</strong></div>)}<div className="fitness-detail"><span>Current match fitness</span><b>{Math.round(player.fitness ?? 100)}%</b><span className="rating-track"><i style={{ width: `${player.fitness ?? 100}%` }}/></span></div></div></section></div>
}

function LineupColumn({ team, name, players, onSelect, managed = false, tactics, onTacticChange }) {
  const roleOrder = ['GOALKEEPER','DEFENDER','DEFENDER_SUPPORT','ATTACKER','ATTACKER_SUPPORT']
  const ordered = [...players].sort((a,b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role))
  return <section className={`lineup-column ${team}`}><header><span className="team-chip">{team === 'home' ? 'HOME' : 'AWAY'}</span><h2>{name}</h2><small>11 players  |  {players.filter(player => player.role.startsWith('DEFENDER')).length} defenders  |  {players.filter(player => player.formationSlot?.line === 'midfield').length} midfielders  |  {players.filter(player => player.role.startsWith('ATTACKER')).length} attackers  |  goalkeeper{managed ? '  |  MANAGED' : ''}</small></header>{ordered.map(player => <button className="lineup-player" key={player.id} onClick={() => onSelect(player)}><span className={`lineup-pos ${team}`}>{positionTag(player)}</span><span className="lineup-name"><b>{player.name}</b><small>{player.isGoalkeeper ? 'Goalkeeper' : `${ROLE_LABELS[player.role]}  |  #${player.number}`}</small></span><strong className="overall">{overallRating(player)}</strong></button>)}{managed && <TacticsControls team={team} tactics={tactics ?? DEFAULT_TACTICS} onChange={onTacticChange}/>}</section>
}

function TeamSelection({ onChoose }) {
  return <main className="app-shell pre-match"><header className="topbar"><div className="brand"><span className="brand-mark">F</span><span>FoMA <small>GAMEPLAY LAB</small></span></div><div className="mode-label"><i/> 11V11 TACTICAL SIMULATION</div></header><section className="team-select"><span className="eyebrow">MATCH DAY  |  11V11</span><h1>Choose your team</h1><p>Select the side whose tactics you want to manage.</p><div className="team-select-options"><button className="team-select-card home" onClick={() => onChoose('home')}><i/><b>HOME</b><span>Harbor Athletic</span></button><button className="team-select-card away" onClick={() => onChoose('away')}><i/><b>AWAY</b><span>Redvale FC</span></button></div></section></main>
}

function TacticsControls({ team, tactics, onChange }) {
  return <div className={`tactical-controls ${team}`}><div className="tactical-heading"><span className="eyebrow">MANAGED TEAM</span><h3>Tactical controls</h3></div>{TACTIC_CONTROLS.map(control => <fieldset className="tactic-group" key={control.key}><legend>{control.label}</legend><div className="tactic-segments">{control.options.map(([value, label, description]) => <button key={value} type="button" aria-pressed={tactics[control.key] === value} title={description} className={tactics[control.key] === value ? 'selected' : ''} onClick={() => onChange(control.key, value)}>{label}</button>)}</div></fieldset>)}</div>
}

function MatchTeamColumn({ team, players, goalkeeper, managed, tactics, onTacticChange, onSelect, displayMode, statistics }) {
  const roleOrder = ['GOALKEEPER', 'DEFENDER', 'DEFENDER_SUPPORT', 'ATTACKER', 'ATTACKER_SUPPORT']
  const ordered = [...players, goalkeeper].filter(player => !player.substitutedOff).sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role))
  return <section className={`match-team-column ${team}`}><header><span className={`team-chip ${team}`}>{players[0]?.clubName ?? (team === 'home' ? 'HOME' : 'AWAY')}</span><small>{managed ? 'MANAGED' : 'OPPONENT'}</small></header><div className="match-team-roster">{ordered.map(player => <button type="button" className={`player-row ${displayMode === 'rating' ? 'rating-mode' : 'attributes-mode'}`} key={player.id} onClick={() => onSelect(player)} aria-label={`Inspect ${player.name}`}><span className={`number number-${player.number} team-${player.team} ${player.isGoalkeeper ? `number-gk-${player.team}` : ''}`}>{player.isGoalkeeper ? 'GK' : player.number}</span><div className="identity"><b>{player.name}</b><small>{ROLE_LABELS[player.role] ?? player.role} | {player.state.replaceAll('_', ' ')}</small></div><span className={`player-overall ${player.team}`}>{overallRating(player)}<small>OVR</small></span><span className="match-rating" title="Performance rating in this match">{Number(statistics.players[player.id]?.rating ?? 6.2).toFixed(1)}<small>RATING</small></span><span className="current-fitness" title="Current physical condition">FIT {Math.round(player.fitness ?? 100)}</span>{displayMode === 'attributes' && <div className="attribute-grid">{Object.entries(player.attributes).map(([key, value]) => <span key={key} title={key === 'FIT' ? 'Permanent stamina/endurance ability' : undefined}><b>{key === 'FIT' ? 'END' : key}</b>{value}</span>)}</div>}</button>)}</div>{managed && <TacticsControls team={team} tactics={tactics} onChange={onTacticChange}/>}</section>
}

function MatchActivities({ events = [] }) {
  const labels = { goal: 'GOAL', yellow_card: 'YELLOW CARD', red_card: 'RED CARD', substitution: 'SUBSTITUTION', penalty: 'PENALTY', injury: 'INJURY', own_goal: 'OWN GOAL' }
  const activities = events.filter(event => labels[event.type]).sort((a, b) => a.minute - b.minute || a.id - b.id)
  return <section className="match-activities" aria-label="Match activities"><header><span className="eyebrow">MATCH EVENTS</span><h2>Match Activities</h2></header>{activities.length ? <ol>{activities.map(event => <li className={`activity-${event.type}`} key={event.id}><time>{event.minute}'</time><b>{labels[event.type]}</b><span>{event.text.replace(/^GOAL!\s*/, '').replace(/\s*\([^)]*\) is booked for the foul\.?$/, '')}</span></li>)}</ol> : <p>No goals, cards or substitutions yet.</p>}</section>
}

export function LiveMatchSquad({ match, onSubstitute, onFormationChange, onClose }) {
  const [selectedId, setSelectedId] = useState(null)
  const team = match.managedTeam
  const outfield = team === 'away' ? match.opponents : match.players
  const active = [...outfield, match.goalkeepers?.[team]].filter(player => player && !player.substitutedOff && !player.sentOff)
  const sentOff = [...outfield, match.goalkeepers?.[team]].filter(player => player?.sentOff)
  const bench = match.substitutes?.[team] ?? []
  const outgoing = active.find(player => player.id === selectedId)
  const group = player => player?.positionGroup ?? ({ GK: 'GK', RB: 'DEF', LB: 'DEF', CB: 'DEF', DM: 'MID', CM: 'MID', AM: 'MID', RW: 'ATT', LW: 'ATT', ST: 'ATT' })[player?.position] ?? player?.position
  const canSub = (player, replacement) => ['playing','halftime'].includes(match.phase) && (match.substitutionCounts?.[team] ?? 0) < 5 && Boolean(outgoing) && group(player) === group(outgoing) && Boolean(player.isGoalkeeper) === Boolean(outgoing.isGoalkeeper) && (player.position !== 'GK' || replacement.position === 'GK')
  const rating = player => Number(match.statistics?.players?.[player.id]?.rating ?? 6.2).toFixed(1)
  return <section className="mg-panel mg-live-squad"><div className="mg-page-title"><span className="mg-kicker">{match.teamNames?.[team] ?? team.toUpperCase()} · LIVE MATCH</span><h2>Current XI & bench</h2><p>Changes apply immediately to the paused match. Replacements count toward the five-substitution limit.</p></div><label className="mg-live-formation">FORMATION<select value={match.teamContexts?.[team]?.formation??'4-4-2'} onChange={event=>onFormationChange?.(team,event.target.value)}>{Object.keys(FORMATION_SHAPES).map(name=><option key={name}>{name}</option>)}</select></label><div className="mg-live-sub-summary"><b>{match.substitutionCounts?.[team] ?? 0} / 5 substitutions used</b><span>{Math.max(0,5-(match.substitutionCounts?.[team]??0))} remaining</span></div><section className="mg-live-roster"><h3>CURRENT XI <small>{active.length} active players</small></h3>{active.map(player=><button type="button" key={player.id} className={`mg-live-player ${selectedId===player.id?'selected':''}`} onClick={()=>setSelectedId(selectedId===player.id?null:player.id)} disabled={!['playing','halftime'].includes(match.phase)||(match.substitutionCounts?.[team]??0)>=5}><span className="mg-live-position">{player.isGoalkeeper?'GK':player.tacticalRole??player.position}</span><span className="mg-live-name"><b>{player.name}</b><small>{player.isGoalkeeper?'Goalkeeper':ROLE_LABELS[player.role]??player.role}</small></span><b>{overallRating(player)}<small>OVR</small></b><b>{Math.round(player.fitness??100)}<small>FIT</small></b><b>{rating(player)}<small>RATING</small></b>{selectedId===player.id&&<em>SELECTED</em>}</button>)}</section><section className="mg-live-roster"><h3>BENCH <small>{bench.length} available players</small></h3>{bench.filter(player=>!player.substitutedOff&&!player.sentOff).map(player=>{const eligible=outgoing&&canSub(player,outgoing);return <button type="button" key={player.id} className={`mg-live-player ${eligible?'eligible':''}`} disabled={!eligible} onClick={()=>{const result=onSubstitute(team,outgoing.id,player.id);if(result?.ok)setSelectedId(null)}}><span className="mg-live-position">{player.position}</span><span className="mg-live-name"><b>{player.name}</b><small>{player.isGoalkeeper?'Reserve goalkeeper':ROLE_LABELS[player.role]??player.role}{eligible?' · eligible':' · select a compatible player'}</small></span><b>{overallRating(player)}<small>OVR</small></b><b>{Math.round(player.fitness??100)}<small>FIT</small></b></button>})}</section>{sentOff.length>0&&<section className="mg-live-roster"><h3>SENT OFF</h3>{sentOff.map(player=><p className="mg-live-sentoff" key={player.id}>{player.name} · {player.card??'RED CARD'}</p>)}</section>}{match.phase==='playing'&&(match.substitutionCounts?.[team]??0)>=5&&<p className="mg-empty-state">All substitutions have been used.</p>}<button className="mg-primary" type="button" onClick={onClose}>BACK TO MATCH</button></section>
}

function MatchStats({ match, onClose }) {
  const stats = match.statistics
  const total = stats.teams.home.possessionSeconds + stats.teams.away.possessionSeconds
  const possession = team => total ? Math.round(stats.teams[team].possessionSeconds / total * 100) : 0
  const value = (team, field) => field === 'accuracy' ? `${passAccuracy(stats.teams[team])}%` : stats.teams[team][field] ?? 0
  const players = actorsOf(match)
  const keeperStat = (team, field) => stats.players[players.find(player => player.isGoalkeeper && player.team === team)?.id]?.[field] ?? 0
  return <div className="modal-backdrop stats-backdrop"><section className="stats-modal modal-card"><header className="stats-head"><div><span className="eyebrow">MATCH CENTER  |  {match.half === 1 ? 'FIRST HALF' : 'SECOND HALF'}</span><h2>Match statistics</h2></div><button className="modal-close" onClick={onClose} aria-label="Close statistics">x</button></header><div className="stats-score"><b>{match.teamNames?.home ?? 'HOME'} {match.homeScore}</b><span>-</span><b>{match.awayScore} {match.teamNames?.away ?? 'AWAY'}</b><small>{clockText(match)}</small></div><div className="stats-table"><div className="stats-row stats-labels"><b>STATISTIC</b><b>{match.teamNames?.home ?? 'HOME'}</b><b>{match.teamNames?.away ?? 'AWAY'}</b></div><div className="stats-row"><span>Possession</span><b>{possession('home')}%</b><b>{possession('away')}%</b></div>{statRows.map(([label, field]) => <div className="stats-row" key={field}><span>{label}</span><b>{value('home',field)}</b><b>{value('away',field)}</b></div>)}<div className="stats-row"><span>Goalkeeper saves</span><b>{keeperStat('home','saves')}</b><b>{keeperStat('away','saves')}</b></div><div className="stats-row"><span>Goalkeeper claims</span><b>{keeperStat('home','claims')}</b><b>{keeperStat('away','claims')}</b></div><div className="stats-row"><span>Distribution completions</span><b>{keeperStat('home','distributionCompletions')}</b><b>{keeperStat('away','distributionCompletions')}</b></div></div><h3>Player statistics</h3><div className="player-stats-list">{players.map(player => { const line = stats.players[player.id]; return <div className="player-stats-row" key={player.id}><b>{(match.teamNames?.[player.team] ?? player.team.toUpperCase())}  |  {player.isGoalkeeper ? 'GK' : `#${player.number}`} {player.name}  |  {Number(line.rating ?? 6.2).toFixed(1)}</b><span>MIN {Math.floor(line.minutes ?? 0)}  |  G {line.goals}  |  A {line.assists}  |  SH {line.shots}/{line.shotsOnTarget}  |  PAS {line.passesCompleted}/{line.passesAttempted}  |  THR {line.successfulThroughBalls}/{line.throughBalls}  |  LONG {line.successfulLongBalls}/{line.longBalls}  |  TKL {line.successfulTackles}/{line.tackles}  |  INT {line.interceptions}  |  DRIB {line.successfulDribbles}/{line.dribbles}  |  FOUL {line.fouls}  |  YC {line.yellowCards}  |  RC {line.redCards}{player.isGoalkeeper ? `  |  SV ${line.saves}  |  CL ${line.claims}  |  DIST ${line.distributionCompletions}/${line.distributionPasses}` : ''}</span></div>})}</div><button className="primary-button stats-resume" onClick={onClose}>CLOSE STATS  |  MATCH PAUSED</button></section></div>
}

function MatchSummary({ match, halftime = false, homeName, awayName, homeScore, awayScore, onContinue, onStats, onRestart, onSquad }) {
  const statistics = halftime ? (match.firstHalfStatistics ?? match.statistics) : match.statistics
  const totalPossession = statistics.teams.home.possessionSeconds + statistics.teams.away.possessionSeconds
  const possession = team => totalPossession ? Math.round(statistics.teams[team].possessionSeconds / totalPossession * 100) : 0
  const topPlayers = actorsOf(match).map(player => ({ player, line: statistics.players[player.id] }))
    .sort((a, b) => (b.line?.rating ?? 6.2) - (a.line?.rating ?? 6.2)).slice(0, 3)
  const potm = playerOfTheMatch(match)
  const teamLabel = team => match.teamNames?.[team] ?? team.toUpperCase()
  const shownHomeName = homeName ?? teamLabel('home'), shownAwayName = awayName ?? teamLabel('away')
  const shownHomeScore = homeScore ?? match.homeScore, shownAwayScore = awayScore ?? match.awayScore
  return <div className="fulltime summary-overlay"><section className="summary-panel">
    <span className="eyebrow">LEAGUE MATCH</span>
    <div className="summary-scoreboard"><span>{shownHomeName}</span><strong>{shownHomeScore}</strong><time>{halftime ? '45:00' : '90:00'}</time><strong>{shownAwayScore}</strong><span>{shownAwayName}</span></div>
    <h2>{halftime ? 'Half time' : 'Full time'}</h2>
    <div className="summary-stats">
      {[['Possession', `${possession('home')}%`, `${possession('away')}%`], ['Shots', statistics.teams.home.shots, statistics.teams.away.shots], ['On target', statistics.teams.home.shotsOnTarget, statistics.teams.away.shotsOnTarget], ['Pass accuracy', `${passAccuracy(statistics.teams.home)}%`, `${passAccuracy(statistics.teams.away)}%`], ['Passes completed', statistics.teams.home.passesCompleted, statistics.teams.away.passesCompleted], ['Through balls', `${statistics.teams.home.successfulThroughBalls}/${statistics.teams.home.throughBalls}`, `${statistics.teams.away.successfulThroughBalls}/${statistics.teams.away.throughBalls}`], ['Long balls', `${statistics.teams.home.successfulLongBalls}/${statistics.teams.home.longBalls}`, `${statistics.teams.away.successfulLongBalls}/${statistics.teams.away.longBalls}`], ['Tackles won', statistics.teams.home.successfulTackles, statistics.teams.away.successfulTackles], ['Interceptions', statistics.teams.home.interceptions, statistics.teams.away.interceptions]].map(([label, home, away]) => <div className="summary-stat-row" key={label}><b>{home}</b><span>{label}</span><b>{away}</b></div>)}
    </div>
    {halftime ? <div className="summary-performers"><h3>Top performers</h3>{topPlayers.map(({ player, line }) => <p key={player.id}>{(match.teamNames?.[player.team] ?? player.team.toUpperCase())}  |  {player.name}<b>{Number(line?.rating ?? 6.2).toFixed(1)}</b></p>)}</div> : <>
      <div className="summary-goals"><h3>Goals</h3>{match.goals.length ? match.goals.map((goal, index) => <p key={`${goal.minute}-${index}`}><b>{goal.minute}'</b> {teamLabel(goal.team)}  |  {goal.scorer}{goal.assister ? ` (assist: ${goal.assister})` : ''}</p>) : <p>No goals</p>}</div>
      <div className="player-of-match"><span>PLAYER OF THE MATCH</span><b>{potm?.name ?? '-'}</b><strong>{Number(match.statistics.players[potm?.id]?.rating ?? 6.2).toFixed(1)}</strong></div>
    </>}
    <div className="summary-actions">{halftime&&onSquad&&<button className="secondary-overlay-button" onClick={onSquad}>SQUAD / SUBSTITUTIONS</button>}<button className="primary-button" onClick={onContinue}>{halftime ? 'CONTINUE SECOND HALF' : 'CONTINUE'}</button>{!halftime && <><button className="secondary-overlay-button" onClick={onStats}>VIEW FULL STATISTICS</button><button className="secondary-overlay-button" onClick={onRestart}>PLAY AGAIN</button></>}</div>
  </section></div>
}

export function MatchSimulator({ career = null, fixture = null, onComplete = null, managedTactics = null, onTacticChange = null, onOpenSquad = null }) {
  const buildSetup = () => {
    if (!career || !fixture) return null
    const managed = career.teams.find(team => team.id === career.managedTeamId)
    const fixtureIndex = career.fixtures.indexOf(fixture)
    const homeClub = career.teams.find(team => team.id === fixture.homeTeamId)
    const awayClub = career.teams.find(team => team.id === fixture.awayTeamId)
    const managedSide = managed.id === homeClub.id ? 'home' : 'away'
    const select = team => {
      const attackers = team.lineup.atts.map(id => career.players[id]).filter(Boolean)
      const midfielders = (team.lineup.mids ?? []).map(id => career.players[id]).filter(Boolean)
      const defenders = team.lineup.defs.map(id => career.players[id]).filter(Boolean)
      const rolePositions=(line,count)=>{const presets={defense:{3:['CB','CB','CB'],4:['LB','CB','CB','RB'],5:['LB','CB','CB','CB','RB']},midfield:{2:['DM','CM'],3:['CM','CM','AM'],4:['LM','CM','CM','RM'],5:['LM','DM','CM','CAM','RM']},attack:{1:['ST'],2:['ST','ST'],3:['LW','ST','RW']}};return presets[line]?.[count]??Array(count).fill(line==='defense'?'CB':line==='midfield'?'CM':'ST')}
      const fitted=(player,target)=>({...player,lineupPosition:target,attributes:attributesForPosition(player,target)})
      const players = [
        ...attackers.map((player, index) => ({ ...fitted(player,rolePositions('attack',attackers.length)[index]), matchRole: index === 0 ? 'ATTACKER' : 'ATTACKER_SUPPORT', tacticalRole: tacticalRoleForSlot(team.formation, 'attack', index), formationSlot: { line: 'attack', index, count: attackers.length } })),
        ...midfielders.map((player, index) => {
          const layer = team.formation === '4-2-3-1' ? (index < 2 ? 'holding' : 'advanced') : team.formation === '4-3-3' ? (index === 0 ? 'holding' : index === 2 ? 'advanced' : 'central') : team.formation === '3-5-2' && (index === 0 || index === midfielders.length - 1) ? 'wide' : 'central'
          return { ...fitted(player,rolePositions('midfield',midfielders.length)[index]), matchRole: 'ATTACKER_SUPPORT', tacticalRole: tacticalRoleForSlot(team.formation, 'midfield', index), formationSlot: { line: 'midfield', layer, index, count: midfielders.length } }
        }),
        ...defenders.map((player, index) => ({ ...fitted(player,rolePositions('defense',defenders.length)[index]), matchRole: index === 0 ? 'DEFENDER' : 'DEFENDER_SUPPORT', tacticalRole: tacticalRoleForSlot(team.formation, 'defense', index), formationSlot: { line: 'defense', index, count: defenders.length } })),
      ]
      const squad = team.roster.map(id => career.players[id]).filter(Boolean)
      return { clubId: team.id, name: team.name, players, substitutes: squad.filter(player => !players.some(starter => starter.id === player.id)), goalkeeper: career.players[team.lineup.gk], tactics: team.tactics, formation: team.formation }
    }
    return {
      home: select(homeClub), away: select(awayClub),
      managedTeam: managedSide,
      kickoffTeam: 'home',
      teamIds: { home: homeClub.id, away: awayClub.id },
      seed: (career.seed + fixture.matchday * 997 + fixtureIndex * 7919) >>> 0,
    }
  }
  const matchRef = useRef(null)
  if (!matchRef.current) { const setup = buildSetup(); matchRef.current = createMatch(setup?.seed ?? career?.seed, setup) }
  const accumulator = useRef(0), speedRef = useRef(1), simulatingRef = useRef(false), lastRender = useRef(0)
  const [view, setView] = useState(() => snapshotMatch(matchRef.current))
  const [screen, setScreen] = useState(career ? 'match' : 'intro'), [running, setRunning] = useState(Boolean(career))
  const [speed, setSpeed] = useState(1)
  const [statsOpen, setStatsOpen] = useState(false), [selectedPlayer, setSelectedPlayer] = useState(null)
  const [playerDisplayMode, setPlayerDisplayMode] = useState('rating')
  const [fulltimeDismissed, setFulltimeDismissed] = useState(false)

  useEffect(() => {
    let frame, previous = performance.now()
    const loop = now => {
      const elapsed = Math.min(.1, (now - previous) / 1000); previous = now
      if (screen === 'match' && running && matchRef.current.phase === 'playing') {
        accumulator.current += elapsed * speedRef.current
        let steps = 0
        while (accumulator.current >= FIXED_TIMESTEP && steps < 8) { advanceMatch(matchRef.current, FIXED_TIMESTEP); accumulator.current -= FIXED_TIMESTEP; steps++ }
        if (now - lastRender.current >= 1000 / 30) { lastRender.current = now; setView(snapshotMatch(matchRef.current)) }
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [running, screen])

  useEffect(() => {
    if (!career || !managedTactics || !matchRef.current) return
    matchRef.current.teamTactics[matchRef.current.managedTeam] = { ...managedTactics }
    setView(snapshotMatch(matchRef.current))
  }, [career, managedTactics])

  const restart = () => {
    if (career && fixture) matchRef.current = createMatch((matchRef.current.seed + 1) >>> 0, buildSetup())
    else restartMatch(matchRef.current)
    accumulator.current = 0; setFulltimeDismissed(false); setView(snapshotMatch(matchRef.current)); setStatsOpen(false); setScreen('match'); setRunning(true)
  }
  const runToEnd = async () => {
    if (simulatingRef.current || matchRef.current.phase === 'fulltime') return
    simulatingRef.current = true
    setRunning(false)
    accumulator.current = 0
    setView({ ...snapshotMatch(matchRef.current), simulationProgress: 0 })
    try {
      let steps = 0
      while (matchRef.current.phase !== 'fulltime') {
        if (matchRef.current.phase === 'halftime') resumeSecondHalf(matchRef.current)
        for (let batch = 0; batch < 240 && matchRef.current.phase !== 'fulltime'; batch++) advanceMatch(matchRef.current, FIXED_TIMESTEP)
        steps += 240
        setView({ ...snapshotMatch(matchRef.current), simulationProgress: Math.min(99, Math.round(matchRef.current.elapsed / 480 * 100)) })
        await new Promise(resolve => setTimeout(resolve, 0))
      }
      setFulltimeDismissed(false); setView(snapshotMatch(matchRef.current))
    } finally { simulatingRef.current = false }
  }
  const chooseTeam = team => { matchRef.current.managedTeam = team; setView(snapshotMatch(matchRef.current)); setScreen('lineup') }
  const changeTactic = (key, value) => { const match = matchRef.current; match.teamTactics[match.managedTeam][key] = value; onTacticChange?.(key, value); setView(snapshotMatch(match)) }
  const changeSpeed = value => { speedRef.current = value; setSpeed(value) }
  const openLiveSquad = () => {
    setRunning(false); setStatsOpen(false)
    onOpenSquad?.(snapshotMatch(matchRef.current), (team, outgoingId, incomingId) => {
      const result = substitutePlayer(matchRef.current, team, outgoingId, incomingId)
      if (result.ok) { const updated = snapshotMatch(matchRef.current); setView(updated); return { ...result, match: updated } }
      return result
    }, () => setRunning(true), (team, formation) => {
      const result=changeLiveFormation(matchRef.current,team,formation)
      if(result.ok){const updated=snapshotMatch(matchRef.current);setView(updated);return {...result,match:updated}}
      return result
    })
  }
  const homeName = view.teamNames?.home ?? 'Home Club', awayName = view.teamNames?.away ?? 'Away Club'
  const homeScore = view.homeScore, awayScore = view.awayScore

  if (screen === 'intro') return <main className="app-shell pre-match"><header className="topbar"><div className="brand"><span className="brand-mark">F</span><span>FoMA <small>GAMEPLAY LAB</small></span></div><div className="mode-label"><i/> 11V11 TACTICAL SIMULATION</div></header><div className="pre-match-content"><span className="eyebrow">MATCH DAY  |  11V11</span><h1>Football, from kickoff to full time.</h1><p>Two full squads. Eleven players per club including the goalkeeper. A full 90 minute AI simulation.</p><div className="versus-card"><div className="versus-team home"><i/><span>HARBOR<br/>ATHLETIC</span><small>HOME</small></div><div className="versus-mark">VS</div><div className="versus-team away"><i/><span>REDVALE<br/>FC</span><small>AWAY</small></div></div><div className="intro-facts"><span>11-A-SIDE</span><span>2 x 45 MINUTES</span><span>AI VS AI</span></div><button className="primary-button intro-button" onClick={() => setScreen('team-select')}>CHOOSE YOUR TEAM <b>&gt;</b></button></div></main>

  if (screen === 'team-select') return <TeamSelection onChoose={chooseTeam}/>

  if (screen === 'lineup') return <main className="app-shell pre-match"><header className="topbar"><div className="brand"><span className="brand-mark">F</span><span>FoMA <small>GAMEPLAY LAB</small></span></div><button className="text-button" onClick={() => setScreen('team-select')}>BACK | CHANGE MANAGED TEAM</button></header><div className="lineup-content"><div className="lineup-title"><span className="eyebrow">SQUAD SHEETS  |  SELECT A PLAYER TO INSPECT</span><h1>Starting lineups</h1><p>Role-weighted ratings are calculated from each player's current attributes. Managing {view.teamNames?.[view.managedTeam] ?? 'your club'}.</p></div><div className="lineup-grid"><LineupColumn team="home" name={view.teamNames?.home} players={[...view.players, view.goalkeepers.home]} onSelect={setSelectedPlayer} managed={view.managedTeam === 'home'} tactics={view.teamTactics.home} onTacticChange={changeTactic}/><div className="lineup-divider">VS</div><LineupColumn team="away" name={view.teamNames?.away} players={[...view.opponents, view.goalkeepers.away]} onSelect={setSelectedPlayer} managed={view.managedTeam === 'away'} tactics={view.teamTactics.away} onTacticChange={changeTactic}/></div><div className="lineup-actions"><button className="text-button" onClick={() => setScreen('team-select')}>BACK</button><button className="primary-button" onClick={() => { setScreen('match'); setRunning(true) }}>START MATCH <b>&gt;</b></button></div></div>{selectedPlayer && <PlayerDetails player={selectedPlayer} onClose={() => setSelectedPlayer(null)}/>}</main>

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">F</span><span>FoMA <small>GAMEPLAY LAB</small></span></div>
      <button className="restart" onClick={restart}>Restart</button>
    </header>
    <div className="content">
      <section className="match-card">
        <div className="match-type">LEAGUE MATCH</div>
        <div className="scoreboard" aria-label={homeName + ' ' + homeScore + ', ' + clockText(view) + ', ' + awayScore + ' ' + awayName}>
          <div className="score-team home-team">{homeName}</div>
          <strong className="score-value">{homeScore}</strong>
          <div className="match-clock"><strong>{clockText(view)}</strong></div>
          <strong className="score-value">{awayScore}</strong>
          <div className="score-team away-team">{awayName}</div>
        </div>
        <div className="match-controls">
          <div className="speed-controls" aria-label="Match speed">{[1,5,10].map(value => <button key={value} aria-pressed={speed === value} className={speed === value ? 'selected' : ''} onClick={() => changeSpeed(value)}>{value}x</button>)}</div>
          <div className="match-actions">
            {view.phase === 'playing' && <button className="hud-button" onClick={() => setRunning(value => !value)}>{running ? 'PAUSE' : 'CONTINUE'}</button>}
            {view.phase !== 'fulltime' && <button className="hud-button sim-to-end" onClick={runToEnd} disabled={simulatingRef.current}>SIM TO END</button>}
            <button className="hud-button" onClick={() => { setRunning(false); setStatsOpen(true) }}>STATUS</button>
            {career && fixture && <button className="hud-button squad-match-button" onClick={openLiveSquad}>SQUAD</button>}
          </div>
        </div>
        {simulatingRef.current && <div className="simulation-progress" role="status"><b>SIMULATING MATCH</b><span>{view.minute}' · {view.simulationProgress ?? 0}%</span><progress max="100" value={view.simulationProgress ?? 0}/></div>}
        <div className="pitch-wrap"><Pitch match={view}/></div>
        <MatchActivities events={view.events}/>
        {view.phase === 'halftime' && <MatchSummary match={view} halftime homeName={homeName} awayName={awayName} homeScore={homeScore} awayScore={awayScore} onSquad={career&&fixture?openLiveSquad:null} onContinue={() => { resumeSecondHalf(matchRef.current); setView(snapshotMatch(matchRef.current)); setRunning(true) }}/>}
        {view.phase === 'fulltime' && !fulltimeDismissed && <MatchSummary match={view} homeName={homeName} awayName={awayName} homeScore={homeScore} awayScore={awayScore} onContinue={() => { setFulltimeDismissed(true); if (onComplete) onComplete(matchRef.current) }} onStats={() => setStatsOpen(true)} onRestart={restart}/>}
        {view.phase === 'playing' && !running && !statsOpen && <div className="fulltime"><div><span className="eyebrow">{clockText(view)}</span><h2>Paused</h2><button onClick={() => setRunning(true)}>Continue match</button></div></div>}
      </section>
      <section className="lower-grid"><div className="players-card"><div className="section-heading"><div><span className="eyebrow">ON THE PITCH</span><h2>Teams</h2></div><div className="player-display-toggle" role="group" aria-label="Player information display">{['rating','attributes'].map(mode => <button key={mode} type="button" aria-pressed={playerDisplayMode === mode} className={playerDisplayMode === mode ? 'selected' : ''} onClick={() => setPlayerDisplayMode(mode)}>{mode === 'rating' ? 'Rating' : 'Attributes'}</button>)}</div></div><div className="team-columns"><MatchTeamColumn team="home" players={view.players} goalkeeper={view.goalkeepers.home} managed={view.managedTeam === 'home'} tactics={view.teamTactics.home} onTacticChange={changeTactic} onSelect={setSelectedPlayer} displayMode={playerDisplayMode} statistics={view.statistics}/><MatchTeamColumn team="away" players={view.opponents} goalkeeper={view.goalkeepers.away} managed={view.managedTeam === 'away'} tactics={view.teamTactics.away} onTacticChange={changeTactic} onSelect={setSelectedPlayer} displayMode={playerDisplayMode} statistics={view.statistics}/></div></div></section>
    </div>
    {statsOpen && <MatchStats match={view} onClose={() => setStatsOpen(false)}/>}
    {selectedPlayer && <PlayerDetails player={actorsOf(view).find(player => player.id === selectedPlayer.id) ?? selectedPlayer} matchRating={view.statistics.players[selectedPlayer.id]?.rating} onClose={() => setSelectedPlayer(null)}/>}
  </main>
}

