import { overallRating } from '../simulation/ratings.js'
import { DEFAULT_TACTICS } from '../simulation/tactics.js'
import { FORMATION_SHAPES } from '../simulation/team.js'
import { calculateMatchRating } from '../simulation/matchRatings.js'
import { CLUBS, LEAGUES } from './clubCatalog.js'
import { realPlayerAt } from './playerCatalog.js'
export { CLUBS, LEAGUES } from './clubCatalog.js'

export const SAVE_KEY = 'football_manager_save_v1'
export const SAVE_SLOTS_KEY = 'foma_career_save_slots_v1'
export const SAVE_SLOT_COUNT = 4
export const SAVE_VERSION = 10
export const FORMATIONS = FORMATION_SHAPES
export const INITIAL_CAREER_DATE = '2025-08-01'
export const TRANSFER_WINDOWS = Object.freeze([{name:'Summer',startMonth:7,startDay:1,endMonth:8,endDay:31},{name:'Winter',startMonth:1,startDay:1,endMonth:1,endDay:31}])
export function transferWindowState(date){const [year,month,day]=date.split('-').map(Number),key=month*100+day,active=TRANSFER_WINDOWS.find(window=>key>=window.startMonth*100+window.startDay&&key<=window.endMonth*100+window.endDay);if(active){const end=new Date(Date.UTC(year,active.endMonth-1,active.endDay));const current=utcDate(date);return {open:true,name:active.name,daysRemaining:Math.ceil((end-current)/86400000)+1,nextWindow:null}}const next=month<7?`${year}-07-01`:month<1?`${year}-01-01`:`${year+1}-01-01`;return {open:false,nextWindow:next}}
const FIRST = ['Mateo','Jonah','Luca','Ethan','Milan','Dario','Tomas','Niko','Alex','Sam','Noah','Milo','Leo','Oscar','Rafael','Kai','Theo','Jude','Arlo','Felix','Emil','Andre','Hugo','Nolan','Elias','Ruben','Leon','Ari']
const LAST = ['Silva','Reed','Hayes','Cole','Kovac','Moretti','Novak','Petrov','Bennett','Carter','Varga','Lind','Costa','Meyer','Stone','Morris','Parker','Rossi','Keller','Nordin','Santos','Ward','Bauer','Fischer','Young','Diaz','Campbell','James']
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
const utcDate = value => new Date(`${value}T00:00:00.000Z`)
const dateKey = value => utcDate(value).toISOString().slice(0, 10)
export function addCareerDays(value, days) {
  const date = utcDate(value)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
export function formatCareerDate(value, options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) {
  return utcDate(value).toLocaleDateString('en-US', { ...options, timeZone: 'UTC' })
}
function firstFixtureDate(value) {
  const date = utcDate(value)
  const daysUntilFriday = (5 - date.getUTCDay() + 7) % 7 || 7
  return addCareerDays(value, daysUntilFriday)
}
function dateFromExpirySeason(career, expirySeason) {
  const baseYear = Number(String(career.careerDate ?? INITIAL_CAREER_DATE).slice(0, 4))
  const yearsAfterCurrent = Math.max(0, Number(expirySeason ?? career.season + 1) - Number(career.season ?? 1))
  return `${baseYear + yearsAfterCurrent}-06-30`
}
const contractYearsRemaining = (career, player) => {
  const expiry = player?.contractExpiryDate ?? dateFromExpirySeason(career, player?.contractExpiry)
  return Math.max(0, (utcDate(expiry) - utcDate(career.careerDate ?? INITIAL_CAREER_DATE)) / (365.2425 * 86400000))
}
function rng(seed) { let value = seed >>> 0; return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296 } }
const varied = (random, base, spread = 8) => clamp(Math.round(base + (random() + random() - 1) * spread), 38, 93)
const SEASON_STAT_FIELDS = ['appearances','minutes','goals','assists','shots','shotsOnTarget','passesAttempted','passesCompleted','throughBalls','successfulThroughBalls','longBalls','successfulLongBalls','tackles','successfulTackles','tacklesWon','interceptions','blocks','dribbles','successfulDribbles','possessionLosses','recoveries','saves','claims','distributionPasses','distributionCompletions','goalsConceded','keyPasses','clearances','fouls','foulsSuffered','yellowCards','redCards','ratingTotal','ratingMatches']
const blankSeasonStats = () => ({ ...Object.fromEntries(SEASON_STAT_FIELDS.map(field => [field, 0])), lastMatchRating: null })
const ACCUMULATED_STAT_FIELDS = SEASON_STAT_FIELDS.filter(field => !['appearances','minutes','ratingTotal','ratingMatches','lastMatchRating','tacklesWon'].includes(field))
function blankClubSeasonSegment(career,player,clubId,startDate=career.careerDate){
  career.playerSeasonClubStats??=[]
  const sequence=career.playerSeasonClubStats.filter(item=>item.playerId===player.id&&item.seasonId===career.season).length+1
  const segment={segmentId:`pscs-${career.season}-${player.id}-${sequence}`,playerId:player.id,seasonId:career.season,clubId:clubId??null,startDate,endDate:null,stats:blankSeasonStats()}
  career.playerSeasonClubStats.push(segment)
  return segment
}
function closePlayerSeasonClubSegment(career,playerId,date=career.careerDate){
  const active=(career.playerSeasonClubStats??[]).filter(item=>item.playerId===playerId&&item.seasonId===career.season&&!item.endDate).at(-1)
  if(active)active.endDate=date
  return active??null
}
export function recordPlayerMatchStats(career,player,line) {
  if(!player||!line?.appearances)return
  player.appearances=(player.appearances??0)+1;player.lastMatchRating=line.rating
  const season=player.seasonStats;season.appearances+=(line.appearances??0);season.minutes+=(line.minutes??0)
  for(const key of ACCUMULATED_STAT_FIELDS)season[key]=(season[key]??0)+(line[key]??0)
  season.tacklesWon=(season.tacklesWon??0)+(line.successfulTackles??0)
  season.ratingTotal+=(line.rating??6.2);season.ratingMatches++;season.lastMatchRating=line.rating??6.2
  const clubId=player.teamId??player.clubId??player.loanParentClubId??null
  let segment=(career.playerSeasonClubStats??[]).filter(item=>item.playerId===player.id&&item.seasonId===career.season&&!item.endDate).at(-1)
  if(!segment||segment.clubId!==clubId){closePlayerSeasonClubSegment(career,player.id);segment=blankClubSeasonSegment(career,player,clubId)}
  const stats=segment.stats
  stats.appearances+=(line.appearances??0);stats.minutes+=(line.minutes??0)
  for(const key of ACCUMULATED_STAT_FIELDS)stats[key]=(stats[key]??0)+(line[key]??0)
  stats.tacklesWon=(stats.tacklesWon??0)+(line.successfulTackles??0)
  stats.ratingTotal+=(line.rating??6.2);stats.ratingMatches++;stats.lastMatchRating=line.rating??6.2
}
export function playerSeasonTotals(career,playerId,seasonId){
  const segments=(career.playerSeasonClubStats??[]).filter(item=>item.playerId===playerId&&Number(item.seasonId)===Number(seasonId))
  const stats=blankSeasonStats()
  for(const segment of segments)for(const key of SEASON_STAT_FIELDS)stats[key]=(stats[key]??0)+(segment.stats?.[key]??0)
  stats.lastMatchRating=segments.filter(item=>item.stats?.lastMatchRating!=null).at(-1)?.stats.lastMatchRating??null
  return {playerId,seasonId:Number(seasonId),segments,stats}
}
const stableUnit = value => {
  let hash = 2166136261
  for (const character of String(value)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  return (hash >>> 0) / 4294967296
}
const boardPriority = value => ['HIGH','MEDIUM','LOW'].includes(value) ? value : 'MEDIUM'
const startingBalance = team => Math.max(12000000,22000000+(team.strength??70)*250000+({Possession:8000000,'High press':1000000,'Defensive / counter':-7000000,Direct:0,Variable:250000,Balanced:0}[team.identity]??0))
const startingTransferBudget = team => Math.max(4500000,6500000+((team.strength??74)-74)*350000+({Possession:1200000,'High press':300000,'Defensive / counter':-700000,Direct:400000,Variable:150000,Balanced:0}[team.identity]??0))

function createBoard(team) {
  const domestic = team.strength >= 76 ? 'HIGH' : team.strength <= 73 ? 'LOW' : 'MEDIUM'
  const financial = team.identity === 'Possession' || team.strength <= 74 ? 'HIGH' : team.identity === 'Direct' ? 'LOW' : 'MEDIUM'
  const youth = team.identity === 'Variable' || team.strength <= 73 ? 'HIGH' : team.identity === 'Defensive / counter' ? 'MEDIUM' : 'LOW'
  const continental = team.strength >= 76 ? 'MEDIUM' : 'LOW'
  return {
    priorities: { domestic, financial, youth, continental },
    expectation: team.strength >= 82 ? 'Challenge for the title' : team.strength >= 78 ? 'Qualify for Champions League' : team.strength >= 74 ? 'Finish in the top 6' : team.strength >= 70 ? 'Finish in the top 10' : 'Avoid relegation',
    objectives: [], confidence: 70, confidenceHistory: [], negotiationUsed: false, fired: false,
  }
}

function addPlayerDefaults(player, careerOrSeed = 1) {
  const career = typeof careerOrSeed === 'object' && careerOrSeed ? careerOrSeed : null
  const careerSeed = career?.seed ?? careerOrSeed
  player.seasonStats = { ...blankSeasonStats(), ...(player.seasonStats ?? {}) }
  player.salaryWeekly = Number.isFinite(player.salaryWeekly) ? player.salaryWeekly : Math.round((player.overall ?? 65) * 650 / 100) * 100
  player.releaseClause = Number.isFinite(player.releaseClause) && player.releaseClause > (player.marketValue ?? 0)
    ? player.releaseClause
    : Math.ceil((player.marketValue ?? 500000) * (1.35 + stableUnit(`${careerSeed}:${player.id}:clause`) * .4) / 50000) * 50000
  player.transferListed = player.transferListed == null
    ? stableUnit(`${careerSeed}:${player.id}:listed`) < .13
    : Boolean(player.transferListed)
  player.loanListed = Boolean(player.loanListed)
  player.askingPrice=Number.isFinite(player.askingPrice)&&player.askingPrice>0?player.askingPrice:Math.ceil((player.marketValue??500000)*(1.06+stableUnit(`${careerSeed}:${player.id}:asking`)*.22)/50000)*50000
  player.positionGroup ??= ({ GK:'GK',RB:'DEF',LB:'DEF',CB:'DEF',DM:'MID',CM:'MID',AM:'MID',RW:'ATT',LW:'ATT',ST:'ATT',DEF:'DEF',MID:'MID',ATT:'ATT' }[player.position] ?? 'MID')
  player.playerId ??= player.id
  player.contractId ??= `contract-${player.playerId}`
  player.clubId ??= player.teamId ?? null
  player.status ??= player.teamId ? 'CONTRACTED' : 'FREE_AGENT'
  player.OVR ??= player.overall
  player.primaryPosition ??= player.position
  player.secondaryPositions ??= ({RB:['RWB'],LB:['LWB'],CB:['LB','RB'],DM:['CDM','CM'],CM:['DM','AM'],AM:['CAM','CM'],RW:['RM','CF'],LW:['LM','CF'],ST:['CF']})[player.primaryPosition] ?? []
  if (player.position === 'DEF' || player.position === 'MID' || player.position === 'ATT') {
    const slot = Object.values(career?.teams ?? []).find(team => team.roster?.includes(player.id))
    const inDefense = slot?.lineup?.defs?.includes(player.id), inMidfield = slot?.lineup?.mids?.includes(player.id)
    const pool = player.position === 'DEF' ? (inDefense ? ['CB','RB','LB'] : ['CB']) : player.position === 'MID' ? (inMidfield ? ['CM','DM','AM'] : ['CM']) : (inMidfield ? ['AM','CM'] : ['ST','RW','LW'])
    player.position = pool[Math.floor(stableUnit(`${careerSeed}:${player.id}:position`) * pool.length)]
  }
  player.positionGroup = ({ GK:'GK',RB:'DEF',LB:'DEF',CB:'DEF',DM:'MID',CM:'MID',AM:'MID',RW:'ATT',LW:'ATT',ST:'ATT' })[player.position] ?? player.positionGroup
  player.nationality ??= 'Unspecified'
  player.potential ??= clamp((player.overall ?? 60) + Math.round(stableUnit(`${careerSeed}:${player.id}:potential`) * (player.age < 23 ? 17 : 7)), player.overall ?? 1, 99)
  player.contractYears ??= 1 + Math.floor(stableUnit(`${careerSeed}:${player.id}:years`) * 5)
  player.contractExpiry ??= (career?.season ?? 1) + player.contractYears
  player.contractExpiryDate ??= dateFromExpirySeason(career, player.contractExpiry)
  player.contractStatus ??= player.contractExpiryDate <= career?.careerDate ? 'Expired' : 'Active'
  player.wage ??= player.salaryWeekly
  player.salaryWeekly = player.wage
  return player
}

function addClubDefaults(team, career) {
  team.leagueId ??= 'crown-league'
  team.clubIdentity ??= { shortName: team.name, colors: ['#376b4d','#e8eee7'] }
  team.manager ??= { name: 'AI Manager', identity: team.identity ?? 'Balanced' }
  const wageSpend = (team.roster ?? []).reduce((sum, id) => sum + (career.players[id]?.salaryWeekly ?? 0), 0)
  team.transferBudget = Number.isFinite(team.transferBudget) ? team.transferBudget : 9000000
  team.wageSpend = Number.isFinite(team.wageSpend) ? team.wageSpend : wageSpend
  team.wageBudget = Number.isFinite(team.wageBudget) ? team.wageBudget : Math.ceil(Math.max(wageSpend * 1.28, 250000) / 1000) * 1000
  team.finances ??= { balance: startingBalance(team), seasonIncome: 0, seasonExpenses: 0, seasonProfit: 0, previousSeasonProfit: 0 }
  team.board ??= createBoard(team)
  team.board.priorities ??= createBoard(team).priorities
  for (const key of ['domestic','financial','youth','continental']) team.board.priorities[key] = boardPriority(team.board.priorities[key])
  team.board.expectation ??= createBoard(team).expectation
  team.board.objectives ??= []
  team.board.confidence = clamp(Number(team.board.confidence ?? 70), 0, 100)
  team.board.confidenceHistory ??= []
  team.board.negotiationUsed ??= false
  team.board.fired ??= false
}

export function migrateCareer(career) {
  if (!career || !career.players || !Array.isArray(career.teams)) return career
  const oldVersion = career.saveVersion ?? 1
  career.season ??= 1
  const hadCalendarDate = Boolean(career.careerDate)
  career.careerDate ??= addCareerDays(INITIAL_CAREER_DATE, (Math.max(1, career.currentMatchday ?? 1) - 1) * 7)
  if (!Number.isFinite(Date.parse(career.careerDate))) career.careerDate = INITIAL_CAREER_DATE
  career.scheduledEvents ??= []
  career.processedCareerEvents ??= []
  for (const player of Object.values(career.players)) addPlayerDefaults(player, career)
  if(oldVersion<SAVE_VERSION)for(const player of Object.values(career.players)){
    const club=career.teams.find(team=>team.id===player.teamId),group=positionGroup(player)
    if((player.marketValue??0)<=350000)player.marketValue=Math.round(clamp((player.overall-40)**2*5500*(group==='GK'?.82:1)*(player.age<22?1.17:player.age>30?.76:1)*(1+((club?.strength??70)-70)*.025),350000,18500000)/50000)*50000
    if(!Number.isFinite(player.askingPrice)||player.askingPrice<=0)player.askingPrice=Math.ceil(player.marketValue*(1.06+stableUnit(`${career.seed}:${player.id}:asking`)*.22)/50000)*50000
    player.salaryWeekly=player.wage=Math.max(1000,player.salaryWeekly??Math.round((player.overall-38)**2*82/1000)*1000)
    if(!player.releaseClause||player.releaseClause<=player.marketValue)player.releaseClause=Math.ceil(player.marketValue*(1.35+stableUnit(`${career.seed}:${player.id}:clause`)*.4)/50000)*50000
  }
  if (career.teams.length === 6) {
    const oldFixtures = Array.isArray(career.fixtures) ? career.fixtures : []
    const archivedSeason=career.season??1
    career.legacyArchive ??= { sourceVersion: oldVersion, oldTeamCount: career.teams.length, archivedSeason, completedFixtures: oldFixtures.filter(f => f.status === 'played').map(f=>({id:f.id,homeTeamId:f.homeTeamId,awayTeamId:f.awayTeamId,result:f.result})), completedMatches:career.completedMatches??[], standings:career.teams.map(team=>({teamId:team.id,name:team.name,table:team.table})), playerSeasonStats:Object.fromEntries(Object.entries(career.players).map(([id,player])=>[id,player.seasonStats])) }
    const existing = new Set(career.teams.map(team => team.id)), random = rng((career.seed ?? 1) ^ 0x51a7c3)
    career.teams.forEach(team=>{team.leagueId='crown-league'})
    const positions = ['GK','GK','RB','LB','CB','CB','CB','CB','DM','DM','CM','CM','CM','CM','AM','AM','RW','RW','LW','LW','ST','ST','ST']
    const legacyCrownSlots = career.teams.length === 6 ? new Set(CLUBS.filter(club=>club.leagueId==='crown-league').slice(0,6).map(club=>club.id)) : new Set()
    const additions = CLUBS.filter(club => !existing.has(club.id) && !legacyCrownSlots.has(club.id)).map(club => ({ ...club, formation:'4-4-2', roster:[], lineup:{gk:null,defs:[],mids:[],atts:[]}, tactics:identityTactics(club.identity), table:{played:0,wins:0,draws:0,losses:0,gf:0,ga:0,points:0}, transferBudget:startingTransferBudget(club), finances:{balance:startingBalance(club),seasonIncome:0,seasonExpenses:0,seasonProfit:0,previousSeasonProfit:0}, manager:{name:'AI Manager',identity:club.identity}, clubIdentity:{shortName:club.name,colors:['#376b4d','#e8eee7']} }))
    for (const team of additions) {
      positions.forEach((position,index)=>{const player=makePlayer(team,index,position,team.strength,random);career.players[player.id]=player;team.roster.push(player.id)})
      const take=(group,count)=>team.roster.map(id=>career.players[id]).filter(p=>positionGroup(p)===group).sort((a,b)=>b.overall-a.overall).slice(0,count).map(p=>p.id)
      team.lineup={gk:take('GK',1)[0],defs:take('DEF',4),mids:take('MID',4),atts:take('ATT',2)}
      team.wageSpend=team.roster.reduce((sum,id)=>sum+career.players[id].salaryWeekly,0);team.wageBudget=Math.ceil(team.wageSpend*1.28/1000)*1000;team.board=createBoard(team)
      team.roster.forEach(id=>{career.players[id].transferListed=false})
      const starters=new Set([team.lineup.gk,...team.lineup.defs,...team.lineup.mids,...team.lineup.atts])
      const listedCount=1+(stableUnit(`${career.seed}:${team.id}:transfer-list`)>.82?1:0)
      team.roster.map(id=>career.players[id]).filter(player=>!starters.has(player.id)&&positionGroup(player)!=='GK').sort((a,b)=>(a.overall+(a.potential??a.overall)*.15)-(b.overall+(b.potential??b.overall)*.15)||b.age-a.age).slice(0,listedCount).forEach(player=>{player.transferListed=true})
    }
    career.teams.push(...additions)
    career.teams.forEach(team=>{team.table={played:0,wins:0,draws:0,losses:0,gf:0,ga:0,points:0};team.leagueId??='crown-league'})
    career.season=archivedSeason+1
    const addedIds=new Set(additions.flatMap(team=>team.roster))
    for(const [id,player] of Object.entries(career.players)){
      player.seasonStats=blankSeasonStats();player.appearances=0;player.lastMatchRating=null
      if(addedIds.has(id))player.contractExpiry=career.season+player.contractYears
      player.contractStatus=player.contractExpiry-career.season<=1?'Expiring Soon':'Active'
    }
    career.currentMatchday=1;career.fixtures=makeFixtures(career.teams,career.season,career.careerDate);career.leagues=LEAGUES.map(league=>({...league,teamIds:career.teams.filter(team=>team.leagueId===league.id).map(team=>team.id)}));career.inbox??=[];career.lastResult=null;career.currentMatchFixtureId=null;career.lastBoardReview=null
    career.inbox.unshift({id:`league-expansion-${career.seed}`,type:'CAREER MIGRATION',text:`The previous six-club season ${archivedSeason} was archived, including its standings, results, and player season totals. This save now uses three 20-team leagues and begins season ${career.season} at Matchday 1.`})
  }
  for (const team of career.teams) addClubDefaults(team, career)
  for (const team of career.teams) {
    if (team.tactics) delete team.tactics.playerFreedom
    if (!FORMATIONS[team.formation]) team.formation = '4-4-2'
    team.lineup.mids ??= []
    const shape = FORMATIONS[team.formation]
    const used = new Set([team.lineup.gk])
    const fill = (current, count, eligible) => {
      const next = (current ?? []).filter(id => !used.has(id) && eligible(career.players[id])).slice(0, count)
      next.forEach(id => used.add(id))
      while (next.length < count) {
        const replacement = (team.roster ?? []).map(id => career.players[id]).filter(player => player && !used.has(player.id) && eligible(player)).sort((a, b) => b.overall - a.overall)[0]
        if (!replacement) break
        next.push(replacement.id); used.add(replacement.id)
      }
      return next
    }
    team.lineup.defs = fill(team.lineup.defs, shape.defs, player => positionGroup(player) === 'DEF')
    team.lineup.mids = fill(team.lineup.mids, shape.mids, player => ['MID','DEF','ATT'].includes(positionGroup(player)))
    team.lineup.atts = fill(team.lineup.atts, shape.atts, player => ['ATT','MID'].includes(positionGroup(player)))
    syncBench(team)
  }
  career.activeNegotiation ??= null
  career.negotiationHistory ??= []
  career.lastBoardReview ??= null
  career.boardReviews ??= []
  career.transferHistory ??= []
  career.playerSeasonHistory ??= {}
  career.playerSeasonClubStats ??= []
  career.shortlist ??= []
  career.loanOffers ??= []
  const knownSegments=new Set(career.playerSeasonClubStats.map(item=>item.segmentId))
  for(const [playerId,entries] of Object.entries(career.playerSeasonHistory))for(const entry of entries??[]){
    const seasonId=Number(entry.seasonId??entry.seasonNumber??entry.season)
    const segmentId=`legacy-pscs-${seasonId}-${playerId}-${entry.clubId??'unknown'}`
    if(!Number.isFinite(seasonId)||knownSegments.has(segmentId))continue
    career.playerSeasonClubStats.push({segmentId,playerId,seasonId,clubId:entry.clubId??null,startDate:entry.startDate??null,endDate:entry.endDate??null,stats:{...blankSeasonStats(),...(entry.stats??{})}});knownSegments.add(segmentId)
  }
  for(const player of Object.values(career.players)){
    const hasCurrent=career.playerSeasonClubStats.some(item=>item.playerId===player.id&&Number(item.seasonId)===Number(career.season))
    if(!hasCurrent&&(player.seasonStats?.appearances??0)>0)career.playerSeasonClubStats.push({segmentId:`migrated-current-${career.season}-${player.id}`,playerId:player.id,seasonId:Number(career.season),clubId:player.teamId??player.formerClubId??null,startDate:null,endDate:null,stats:{...blankSeasonStats(),...player.seasonStats}})
  }
  career.transferOffers ??= []
  career.loans ??= []
  career.loanNegotiations ??= []
  career.loanNegotiation ??= null
  career.completedMatches ??= []
  career.fixtures ??= []
  const firstDate = firstFixtureDate(hadCalendarDate ? career.careerDate : INITIAL_CAREER_DATE)
  for (const fixture of career.fixtures) {
    fixture.scheduledDate ??= addCareerDays(firstDate, (fixture.matchday - 1) * 7)
  }
  for (const player of Object.values(career.players)) {
    player.contractExpiryDate ??= dateFromExpirySeason(career, player.contractExpiry)
    const daysRemaining = Math.ceil((utcDate(player.contractExpiryDate) - utcDate(career.careerDate)) / 86400000)
    player.contractStatus = daysRemaining <= 0 ? 'Expired' : daysRemaining <= 30 ? 'Expiring Soon' : 'Active'
  }
  career.leagues ??= LEAGUES.map(league=>({...league,teamIds:career.teams.filter(team=>team.leagueId===league.id).map(team=>team.id)}))
  career.season ??= 1
  career.saveVersion = SAVE_VERSION
  return career
}

function positionGroup(playerOrPosition) {
  const position = typeof playerOrPosition === 'string' ? playerOrPosition : playerOrPosition?.positionGroup ?? playerOrPosition?.position
  return ({GK:'GK',RB:'DEF',LB:'DEF',CB:'DEF',DM:'MID',CM:'MID',AM:'MID',RW:'ATT',LW:'ATT',ST:'ATT'})[position] ?? position
}
export function syncBench(team) {
  if(!team?.roster||!team.lineup)return []
  const starters=new Set([team.lineup.gk,...(team.lineup.defs??[]),...(team.lineup.mids??[]),...(team.lineup.atts??[])].filter(Boolean))
  team.bench=team.roster.filter(id=>!starters.has(id))
  return team.bench
}
function repairTeamLineup(career,team){
  if(!team?.roster?.length)return
  const shape=FORMATIONS[team.formation??'4-4-2'],used=new Set()
  const take=(current,count,eligible)=>{
    const next=(current??[]).filter(id=>team.roster.includes(id)&&!used.has(id)&&eligible(career.players[id])).slice(0,count)
    next.forEach(id=>used.add(id))
    while(next.length<count){const candidate=team.roster.map(id=>career.players[id]).filter(player=>player&&!used.has(player.id)&&eligible(player)).sort((a,b)=>b.overall-a.overall)[0];if(!candidate)break;next.push(candidate.id);used.add(candidate.id)}
    return next
  }
  const gkCurrent=team.lineup?.gk
  const gk=take(gkCurrent?[gkCurrent]:[],1,player=>positionGroup(player)==='GK')[0]??null
  if(gk)used.add(gk)
  const defs=take(team.lineup?.defs,shape.defs,player=>positionGroup(player)==='DEF')
  const mids=take(team.lineup?.mids,shape.mids,player=>['DEF','MID','ATT'].includes(positionGroup(player)))
  const atts=take(team.lineup?.atts,shape.atts,player=>['ATT','MID'].includes(positionGroup(player)))
  if(gk&&defs.length===shape.defs&&mids.length===shape.mids&&atts.length===shape.atts)team.lineup={gk,defs,mids,atts}
  syncBench(team)
}

function makePlayer(team, index, position, strength, random, ordinal = 0, claimedRealPlayers = new Set()) {
  const name = `${FIRST[Math.floor(random() * FIRST.length)]} ${LAST[Math.floor(random() * LAST.length)]}`
  const group = positionGroup(position)
  const role = group === 'GK' ? 'GOALKEEPER' : group === 'DEF' ? (index % 2 ? 'DEFENDER_SUPPORT' : 'DEFENDER') : position==='ST' ? 'ATTACKER' : ['DM','CM'].includes(position) ? 'SUPPORT' : 'ATTACKER_SUPPORT'
  const age = 18 + Math.floor(random() * 17), base = strength + (age < 22 ? -3 : age > 31 ? -2 : 0)
  const attributes = {
    PAC: varied(random, base + (['ST','RW','LW','RB','LB'].includes(position) ? 5 : 0)), PAS: varied(random, base + (['DM','CM','AM'].includes(position) ? 6 : 0)),
    SHO: varied(random, base + (['ST','RW','LW','AM'].includes(position) ? 7 : group === 'GK' ? -35 : -9)), DRI: varied(random, base + (['ST','RW','LW','AM'].includes(position) ? 5 : -2)),
    CON: varied(random, base + (['DM','CM','AM'].includes(position) || group === 'GK' ? 4 : 0)), FIT: varied(random, 82, 12),
    TAC: varied(random, base + (group === 'DEF' || position === 'DM' ? 8 : -7)), DEC: varied(random, base + (group === 'DEF' || group === 'MID' ? 4 : 0)),
    POS: varied(random, group === 'DEF' || group === 'ATT' ? base + 4 : base), VIS: varied(random, base + (group === 'MID' ? 7 : 0)), DEF: varied(random, base + (group === 'DEF' || group === 'GK' ? 8 : -12)),
  }
  if (group === 'GK') Object.assign(attributes, { REF: varied(random, base + 9), POS_GK: varied(random, base + 7), HAN: varied(random, base + 8) })
  else Object.assign(attributes,{REF:1,POS_GK:1,HAN:1})
  const id = `${team.id}-p${index + 1}`
  const player = { id, playerId:id, teamId: team.id, number: index + 1, name, age, nationality: 'Unspecified', position, primaryPosition:position, secondaryPositions:({RB:['RWB'],LB:['LWB'],CB:['LB','RB'],DM:['CDM','CM'],CM:['DM','AM'],AM:['CAM','CM'],RW:['RM','CF'],LW:['LM','CF'],ST:['CF']})[position]??[], positionGroup: group, role, attributes, fitness: 96 + Math.floor(random() * 5), seasonStats: blankSeasonStats(), lastMatchRating: null, appearances: 0, potential: 0, marketValue: 0, salaryWeekly: 0, wage: 0, contractYears: 1 + Math.floor(random()*5), contractExpiry: 0, contractStatus: 'Active', releaseClause: 0, transferListed: stableUnit(`${id}:listed`) < .13 }
  const real=realPlayerAt(team.name,position,ordinal)
  if(real&&!claimedRealPlayers.has(real.name)){claimedRealPlayers.add(real.name);player.name=real.name;player.age=real.age;player.nationality=real.nationality;player.attributes=real.attributes;player.potential=real.potential;player.marketValue=real.marketValue;player.salaryWeekly=real.salaryWeekly;player.contractYears=real.contractYears;player.contractExpiryDate=real.contractExpiryDate;player.secondaryPositions=real.secondaryPositions}
  player.overall = overallRating(player)
  player.OVR=player.overall
  player.potential ||= clamp(player.overall + Math.round(random() * (player.age < 23 ? 18 : 8)), player.overall, 99)
  player.marketValue ||= Math.round(clamp((player.overall - 40) ** 2 * 5500 * (group === 'GK' ? 0.82 : 1) * (age < 22 ? 1.17 : age > 30 ? 0.76 : 1) * (1 + (team.strength - 70) * .025) * (1+(player.potential-player.overall)*.018), 350000, 18500000) / 50000) * 50000
  player.askingPrice=Math.ceil(player.marketValue*(1.06+stableUnit(`${id}:asking`)*.22)/50000)*50000
  player.salaryWeekly ||= Math.round(clamp((player.overall - 38) ** 2 * 82 * (1 + (team.strength - 70) * .025) / 1000, 1, 200) * 1000); player.wage = player.salaryWeekly
  player.contractExpiry = player.contractYears + 1
  player.releaseClause = Math.ceil(player.marketValue * (1.35 + stableUnit(`${id}:clause`) * .4) / 50000) * 50000
  return player
}

const identityTactics = identity => {
  const tactics = { ...DEFAULT_TACTICS }
  if (identity === 'Possession') Object.assign(tactics, { attackingMentality: 'possession', transitionStyle: 'slow_build' })
  if (identity === 'Defensive / counter') Object.assign(tactics, { defensiveApproach: 'low_block', transitionStyle: 'fast_counter', defensiveLine: 'low' })
  if (identity === 'Direct') Object.assign(tactics, { attackingMentality: 'direct', transitionStyle: 'fast_counter' })
  if (identity === 'High press') Object.assign(tactics, { defensiveApproach: 'high_press', defensiveLine: 'high' })
  return tactics
}

function makeFixtures(teams, season = 1, startDate = INITIAL_CAREER_DATE) {
  const fixtures=[]
  for(const leagueId of [...new Set(teams.map(team=>team.leagueId??'crown-league'))]){
    const rotation=teams.filter(team=>(team.leagueId??'crown-league')===leagueId).map(team=>team.id)
    if(rotation.length<2||rotation.length%2)continue
    const firstHalf=[]
    for(let round=0;round<rotation.length-1;round++){
      const row=[]
      for(let i=0;i<rotation.length/2;i++){
        const a=rotation[i],b=rotation[rotation.length-1-i],homeTeamId=(round+i)%2?b:a
        row.push({homeTeamId,awayTeamId:homeTeamId===a?b:a})
      }
      firstHalf.push(row);rotation.splice(1,0,rotation.pop())
    }
    for(let round=0;round<firstHalf.length;round++)for(let i=0;i<firstHalf[round].length;i++){
      const first=firstHalf[round][i]
      const firstMatchday = round + 1
      const secondMatchday = round + 1 + firstHalf.length
      fixtures.push({id:`${leagueId}-s${season}-md${firstMatchday}-${i+1}`,season,leagueId,matchday:firstMatchday,scheduledDate:addCareerDays(firstFixtureDate(startDate),(firstMatchday-1)*7),...first,status:'scheduled',result:null})
      fixtures.push({id:`${leagueId}-s${season}-md${secondMatchday}-${i+1}`,season,leagueId,matchday:secondMatchday,scheduledDate:addCareerDays(firstFixtureDate(startDate),(secondMatchday-1)*7),homeTeamId:first.awayTeamId,awayTeamId:first.homeTeamId,status:'scheduled',result:null})
    }
  }
  return fixtures
}

export function createCareer(seed = Date.now(), leagueId = null) {
  const careerDate = INITIAL_CAREER_DATE
  const random = rng(seed)
  const selectedClubs=CLUBS.filter(club=>!leagueId||club.leagueId===leagueId)
  const teams = selectedClubs.map(club => ({ ...club, clubIdentity: { shortName: club.shortName ?? club.name, colors: club.colors ?? ['#376b4d','#e8eee7'] }, manager: { name:'AI Manager', identity:club.identity }, formation: '4-4-2', roster: [], lineup: { gk: null, defs: [], mids: [], atts: [] }, tactics: identityTactics(club.identity), table: { played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, points: 0 }, transferBudget: startingTransferBudget(club), finances: { balance: startingBalance(club), seasonIncome: 0, seasonExpenses: 0, seasonProfit: 0, previousSeasonProfit: 0 } }))
  const players = {}, claimedRealPlayers=new Set(), positions = ['GK','GK','RB','LB','CB','CB','CB','CB','DM','DM','CM','CM','CM','CM','AM','AM','RW','RW','LW','LW','ST','ST','ST']
  teams.forEach(team => {
    positions.forEach((position, index) => { const ordinal=positions.slice(0,index).filter(item=>item===position).length;const player = makePlayer(team, index, position, team.strength, random, ordinal, claimedRealPlayers); players[player.id] = player; team.roster.push(player.id) })
    const select = (group, count) => team.roster.map(id => players[id]).filter(player => positionGroup(player) === group).sort((a,b) => b.overall-a.overall).slice(0,count).map(player => player.id)
    team.lineup = { gk: select('GK',1)[0], defs: select('DEF',4), mids: select('MID',4), atts: select('ATT',2) }
    syncBench(team)
    const wageSpend = team.roster.reduce((sum,id) => sum + players[id].salaryWeekly, 0)
    team.wageSpend = wageSpend
    team.wageBudget = Math.ceil(wageSpend * 1.28 / 1000) * 1000
    team.board = createBoard(team)
    team.roster.forEach(id=>{players[id].transferListed=false})
    const starters=new Set([team.lineup.gk,...team.lineup.defs,...team.lineup.mids,...team.lineup.atts])
    const listedCount=1+(stableUnit(`${seed}:${team.id}:listed-count`)>.82?1:0)
    team.roster.map(id=>players[id]).filter(player=>!starters.has(player.id)&&positionGroup(player)!=='GK').sort((a,b)=>(a.overall+(a.potential??a.overall)*.15)-(b.overall+(b.potential??b.overall)*.15)||b.age-a.age).slice(0,listedCount).forEach(player=>{player.transferListed=true})
  })
  Object.values(players).forEach(player=>{player.contractExpiryDate??=`${Number(careerDate.slice(0,4))+Math.max(0,player.contractExpiry-1)}-06-30`})
  teams.forEach(team=>{if(team.id!==null&&team.strength<74){const starters=new Set([team.lineup.gk,...team.lineup.defs,...team.lineup.mids,...team.lineup.atts]);team.roster.map(id=>players[id]).filter(player=>!starters.has(player.id)&&player.age<=22&&player.positionGroup!=='GK').slice(0,2).forEach(player=>{player.loanListed=true})}})
  return { saveVersion: SAVE_VERSION, saveSlot:1, season: 1, currentMatchday: 1, careerDate, managedTeamId: null, manager: { name: 'Manager' }, leagues: LEAGUES.filter(league=>!leagueId||league.id===leagueId).map(league=>({...league,teamIds:teams.filter(team=>team.leagueId===league.id).map(team=>team.id)})), teams, players, fixtures: makeFixtures(teams,1,careerDate), completedMatches: [], transferHistory: [], transferOffers: [], loans: [], loanOffers:[], shortlist:[], loanNegotiations: [], loanNegotiation:null, scheduledEvents: [], processedCareerEvents: [], inbox: [{ id: 'welcome', type: 'NEWS', date: careerDate, text: 'Welcome to the league. Choose your club to manage.' }], lastResult: null, currentMatchFixtureId: null, settings: {}, seed, activeNegotiation: null, negotiationHistory: [], lastBoardReview: null, boardReviews: [] }
}

export function leagueTable(career, leagueId = null) {
  const selected = leagueId ?? career.teams.find(team=>team.id===career.managedTeamId)?.leagueId ?? career.teams[0]?.leagueId
  return career.teams.filter(team=>team.leagueId===selected).map(team => ({ ...team, goalDifference: team.table.gf-team.table.ga })).sort((a,b) => b.table.points-a.table.points || b.goalDifference-a.goalDifference || b.table.gf-a.table.gf || a.name.localeCompare(b.name))
}
export function applyTableResult(home, away, homeGoals, awayGoals) {
  home.table.played++; away.table.played++; home.table.gf+=homeGoals; home.table.ga+=awayGoals; away.table.gf+=awayGoals; away.table.ga+=homeGoals
  if (homeGoals>awayGoals) { home.table.wins++; home.table.points+=3; away.table.losses++ }
  else if (awayGoals>homeGoals) { away.table.wins++; away.table.points+=3; home.table.losses++ }
  else { home.table.draws++; away.table.draws++; home.table.points++; away.table.points++ }
}
export function simulateMatchday(career, matchday) {
  const target = career.fixtures.find(fixture => fixture.matchday === matchday)?.scheduledDate
  if (!target || target < career.careerDate) return { ok: false, message: 'That matchday is not upcoming.' }
  let result = { ok: true, date: career.careerDate }
  while (career.careerDate < target) {
    result = advanceCareerDay(career)
    if (!result.ok) return result
  }
  return result
}

function nextManagedFixture(career) {
  if (!career.managedTeamId) return null
  return career.fixtures.filter(fixture => fixture.status === 'scheduled' &&
    (fixture.homeTeamId === career.managedTeamId || fixture.awayTeamId === career.managedTeamId))
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.matchday - b.matchday)[0] ?? null
}

function currentManagedMatch(career, date = career.careerDate) {
  return career.fixtures.find(fixture => fixture.status === 'scheduled' && fixture.scheduledDate === date &&
    (fixture.homeTeamId === career.managedTeamId || fixture.awayTeamId === career.managedTeamId)) ?? null
}

function addInboxEvent(career, event) {
  career.inbox ??= []
  if (career.inbox.some(item => item.id === event.id)) return
  career.inbox.unshift({ ...event, date: event.date ?? career.careerDate })
}

function evaluatePendingClubOffer(career, negotiation, offer) {
  const player = career.players[negotiation.playerId]
  const seller = career.teams.find(team => team.id === negotiation.sellerTeamId)
  const buyer = career.teams.find(team => team.id === negotiation.buyerTeamId)
  if (!player || !seller || !buyer) return { ok: false, message: 'The negotiation clubs or player are no longer available.' }
  const amount = offer.amount
  const starting = [seller.lineup?.gk, ...seller.lineup.defs, ...(seller.lineup.mids ?? []), ...seller.lineup.atts].includes(player.id)
  const depth = seller.roster.map(id => career.players[id]).filter(candidate => positionGroup(candidate) === positionGroup(player) && candidate.id !== player.id).length
  const importancePenalty = (starting ? .09 : 0) + (depth === 0 ? .08 : depth === 1 ? .035 : 0)
  const contractYears = contractYearsRemaining(career, player)
  const playerLeverage = (player.age < 22 ? .025 : player.age >= 31 ? -.02 : 0) + clamp(((player.potential ?? player.overall) - player.overall) * .0012, 0, .025) + (contractYears >= 4 ? .025 : contractYears <= 1 ? -.035 : 0)
  const rangePosition = clamp((amount - negotiation.askingRange.low) / (negotiation.askingRange.high - negotiation.askingRange.low), 0, 1)
  const valueFactor = clamp((amount / player.marketValue - .82) / .8, 0, 1)
  const listedBonus = player.transferListed ? .09 : 0
  const financialNeed = seller.finances.balance < 12000000 ? .075 : seller.finances.balance < 25000000 ? .035 : 0
  const previous = negotiation.clubOffers.at(-1)
  const history = previous ? (amount > previous.amount ? .045 : -.06) : 0
  const score = clamp(.3 + rangePosition * .34 + valueFactor * .19 + listedBonus + financialNeed - importancePenalty + history + playerLeverage, 0, 1)
  const feeling = score >= .72 ? 'HIGH' : score >= .43 ? 'MEDIUM' : 'LOW'
  const remaining = Math.max(0, negotiation.clubAttemptsRemaining - 1)
  negotiation.clubAttemptsRemaining = remaining
  negotiation.clubFeeling = feeling
  offer.score = score
  offer.feeling = feeling
  offer.status = feeling === 'HIGH' ? 'ACCEPTED' : feeling === 'MEDIUM' ? 'COUNTERED' : remaining === 0 ? 'REJECTED' : 'DECLINED'
  negotiation.clubOffers.push(offer)
  negotiation.pendingClubOffer = null
  if (feeling === 'HIGH') negotiation.stage = 'CLUB_HIGH'
  else if (feeling === 'MEDIUM') {
    const requested = Math.max(amount, negotiation.askingRange.low + (negotiation.askingRange.high - negotiation.askingRange.low) * .68)
    negotiation.clubCounterAmount = Math.ceil(requested / 50000) * 50000
    negotiation.stage = 'CLUB_COUNTER'
  } else if (remaining === 0) {
    negotiation.stage = 'FAILED'
    negotiation.result = 'CLUB_REJECTED'
  } else negotiation.stage = 'CLUB'
  const response = feeling === 'HIGH'
    ? `${seller.name} accepted your €${(amount / 1e6).toFixed(2)}M offer for ${player.name}.`
    : feeling === 'MEDIUM'
      ? `${seller.name} countered your €${(amount / 1e6).toFixed(2)}M offer for ${player.name}. They want €${(negotiation.clubCounterAmount / 1e6).toFixed(2)}M.`
      : `${seller.name} rejected your €${(amount / 1e6).toFixed(2)}M offer for ${player.name}.`
  offer.response = response
  addInboxEvent(career, { id: `club-response-${offer.id}`, type: 'TRANSFER RESPONSE', text: response })
  return { ok: true, feeling, remaining, score }
}

function updateCurrentMatchday(career) {
  const next = nextManagedFixture(career)
  if (next) career.currentMatchday = next.matchday
  else career.currentMatchday = Math.min(38, career.currentMatchday ?? 1)
}

function processContractDates(career) {
  for (const player of Object.values(career.players)) {
    if (!player.contractExpiryDate) player.contractExpiryDate = dateFromExpirySeason(career, player.contractExpiry)
    const days = Math.ceil((utcDate(player.contractExpiryDate) - utcDate(career.careerDate)) / 86400000)
    player.contractStatus = days <= 0 ? 'Expired' : days <= 30 ? 'Expiring Soon' : 'Active'
    if(days>30&&days<=180)shortlistNotice(career,player,'CONTRACT-180',`${player.name}'s contract expires in six months.`)
    if(days<=0&&player.teamId&&!player.loanId){const former=career.teams.find(team=>team.id===player.teamId);if(former){closePlayerSeasonClubSegment(career,player.id);former.roster=former.roster.filter(id=>id!==player.id);former.wageSpend=Math.max(0,former.wageSpend-(player.salaryWeekly??0));if(former.lineup.gk===player.id)former.lineup.gk=null;for(const key of ['defs','mids','atts'])former.lineup[key]=(former.lineup[key]??[]).filter(id=>id!==player.id);repairTeamLineup(career,former);player.formerClubId=former.id;player.teamId=null;player.clubId=null;player.status='FREE_AGENT';player.transferListed=false;player.loanListed=false;career.freeAgents??=[];if(!career.freeAgents.includes(player.id))career.freeAgents.push(player.id);shortlistNotice(career,player,'FREE_AGENT',`${player.name} is now available as a free agent.`)}}
    const noticeType = days <= 0 ? 'expired' : days <= 30 ? '30-day-warning' : null
    if (noticeType) {
      const id = `contract-${noticeType}-${player.id}-${player.contractExpiryDate}`
      if (!career.processedCareerEvents.includes(id)) {
        career.processedCareerEvents.push(id)
        addInboxEvent(career, { id, type: noticeType === 'expired' ? 'CONTRACT EXPIRED' : 'CONTRACT WARNING', text: noticeType === 'expired' ? `${player.name}'s contract has expired.` : `${player.name}'s contract expires in 30 days.` })
      }
    }
  }
}

function simulateFixturesForDate(career, random, simulateManagedFixture = false) {
  const userFixture = currentManagedMatch(career)
  const fixtures = career.fixtures.filter(fixture => fixture.status === 'scheduled' && fixture.scheduledDate === career.careerDate && (simulateManagedFixture || fixture.id !== userFixture?.id))
  const appeared = new Set()
  for (const fixture of fixtures) {
    const home = career.teams.find(team => team.id === fixture.homeTeamId)
    const away = career.teams.find(team => team.id === fixture.awayTeamId)
    if (!home || !away) continue
    creditFixtureIncome(home, true)
    creditFixtureIncome(away, false)
    const quick = simulateQuickFixture(career, home, away, random)
    for (const [playerId, line] of Object.entries(quick.statistics.players)) {
      const player = career.players[playerId]
      if (!player || !line.appearances) continue
      recordPlayerMatchStats(career,player,line)
      appeared.add(playerId)
    }
    fixture.status = 'played'
    fixture.result = { homeGoals: quick.homeGoals, awayGoals: quick.awayGoals, simulated: true, statistics: { teams: quick.statistics.teams } }
    applyTableResult(home, away, quick.homeGoals, quick.awayGoals)
    const completed = { fixtureId: fixture.id, homeTeamId: home.id, awayTeamId: away.id, homeGoals: quick.homeGoals, awayGoals: quick.awayGoals, simulated: true, date: career.careerDate }
    career.completedMatches.push(completed)
  }
  for (const player of Object.values(career.players)) {
    if (!appeared.has(player.id)) player.fitness = Math.min(100, (player.fitness ?? 80) + 3 + (player.attributes.FIT ?? 70) * .045)
  }
  if (fixtures.length) {
    const seedText = `${career.seed}:${career.careerDate}:daily-fixtures`
    let seed = 2166136261
    for (const ch of seedText) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619)
    const offerRng = rng(seed >>> 0)
    const matchday = fixtures[0].matchday
    const offer = generateAiTransferOffersForMatchday(career, matchday, offerRng)
    if (offer) {
      offer.date = career.careerDate
      const inboxItem = career.inbox.find(item => item.offerId === offer.id)
      if (inboxItem) inboxItem.date = career.careerDate
    }
  }
  return { fixtures, userFixture }
}

export function scheduleCareerEvent(career, event) {
  if (!career || !event?.date || !event?.id) return { ok: false, message: 'A career event needs a stable ID and date.' }
  career.scheduledEvents ??= []
  if (career.scheduledEvents.some(item => item.id === event.id)) return { ok: false, message: 'That event is already scheduled.' }
  career.scheduledEvents.push({ ...event, processed: false })
  career.scheduledEvents.sort((a, b) => a.date.localeCompare(b.date))
  return { ok: true }
}

function settleLoanMovement(career, loan) {
  const player=career.players[loan.playerId],from=career.teams.find(team=>team.id===loan.fromClubId),to=career.teams.find(team=>team.id===loan.toClubId)
  if(!player||!from||!to||loan.status!=='PLAYER_ACCEPTED'||!transferWindowState(career.careerDate).open)return false
  if(!from.roster.includes(player.id)||to.roster.includes(player.id))return false
  if(loan.loanFee>to.transferBudget||to.wageSpend+Math.round((player.salaryWeekly??0)*(loan.wageContribution??100)/100)>to.wageBudget)return false
  closePlayerSeasonClubSegment(career,player.id)
  from.roster=from.roster.filter(id=>id!==player.id);to.roster.push(player.id);player.loanParentClubId=from.id;player.teamId=to.id;player.clubId=to.id;player.status='LOANED';player.loanId=loan.id;player.loanListed=false;loan.status='ACTIVE';loan.startDate=career.careerDate
  blankClubSeasonSegment(career,player,to.id,career.careerDate)
  loan.endDate=addCareerDays(career.careerDate,Math.round(loan.duration*365))
  const paidShare=Math.round((player.salaryWeekly??0)*(loan.wageContribution??100)/100)
  from.wageSpend=Math.max(0,from.wageSpend-paidShare);to.wageSpend+=paidShare
  from.transferBudget+=loan.loanFee;to.transferBudget=Math.max(0,to.transferBudget-loan.loanFee)
  career.transferHistory??=[];loan.transferId??=`loan-${loan.id}`;career.transferHistory.unshift({id:loan.transferId,transferId:loan.transferId,playerId:player.id,playerName:player.name,seasonId:career.season,seasonNumber:career.season,date:career.careerDate,fromClubId:from.id,toClubId:to.id,fee:loan.loanFee??0,transferType:'LOAN'})
  repairTeamLineup(career,from);repairTeamLineup(career,to)
  addInboxEvent(career,{id:`loan-active-${loan.id}`,type:'LOAN',playerId:player.id,loanId:loan.id,text:`${player.name} has joined ${to.name} on loan from ${from.name}.`})
  return true
}

function runAiClubManagement(career){
  if(!career.careerDate.endsWith('-01')&&!career.careerDate.endsWith('-15'))return
  const windowOpen=transferWindowState(career.careerDate).open
  for(const club of career.teams){
    if(club.id===career.managedTeamId)continue
    const marker=`ai-review-${career.season}-${club.id}-${career.careerDate}`
    career.processedCareerEvents??=[];if(career.processedCareerEvents.includes(marker))continue;career.processedCareerEvents.push(marker)
    const positional=['GK','DEF','MID','ATT'];const depth=Object.fromEntries(positional.map(group=>[group,club.roster.map(id=>career.players[id]).filter(player=>player&&positionGroup(player)===group).length]))
    const weakest=positional.filter(group=>depth[group]<5).sort((a,b)=>depth[a]-depth[b])[0]
    if(windowOpen&&club.roster.length>21&&stableUnit(`${career.seed}:${marker}:loan-list`)<.3){
      const starters=new Set([club.lineup.gk,...club.lineup.defs,...(club.lineup.mids??[]),...club.lineup.atts])
      const prospect=club.roster.map(id=>career.players[id]).filter(player=>player&&!starters.has(player.id)&&player.age<=23&&depth[positionGroup(player)]>5&&!player.loanId&&!player.transferListed).sort((a,b)=>a.overall-b.overall)[0]
      if(prospect&&!prospect.loanListed){prospect.loanListed=true;prospect.loanListing={loanFee:0,wageContribution:70,duration:1,optionToBuy:prospect.age<=21?Math.round(prospect.marketValue*1.35/50000)*50000:0,mandatoryBuy:0,mandatoryBuyMatches:20}}
    }
    if(windowOpen&&club.id!==career.managedTeamId&&club.roster.length<25){
      const candidates=Object.values(career.players).filter(player=>player?.loanListed&&!player.loanId&&player.teamId&&player.teamId!==club.id&&player.teamId!==career.managedTeamId&&depth[positionGroup(player)]<8&&player.salaryWeekly<=club.wageBudget-club.wageSpend).sort((a,b)=>depth[positionGroup(a)]-depth[positionGroup(b)]||a.age-b.age||b.overall-a.overall)
      const candidate=candidates[0]
      if(candidate&&stableUnit(`${career.seed}:${marker}:loan:${candidate.id}`)<.36){const parent=career.teams.find(team=>team.id===candidate.teamId),terms=candidate.loanListing??{loanFee:0,wageContribution:70,duration:1,optionToBuy:0,mandatoryBuy:0};if(parent&&parent.roster.length>18){career.loans??=[];const loan={id:`ai-loan-${career.season}-${career.careerDate}-${candidate.id}-${club.id}`,playerId:candidate.id,fromClubId:parent.id,toClubId:club.id,loanFee:terms.loanFee??0,wageContribution:terms.wageContribution??70,duration:terms.duration??1,optionToBuy:terms.optionToBuy??0,mandatoryBuy:terms.mandatoryBuy??0,mandatoryBuyMatches:terms.mandatoryBuyMatches??20,status:'PLAYER_ACCEPTED'};career.loans.push(loan);if(settleLoanMovement(career,loan))addInboxEvent(career,{id:`${loan.id}-ai`,type:'AI LOAN',playerId:candidate.id,loanId:loan.id,text:`${candidate.name} joined ${club.name} on loan from ${parent.name}.`});else career.loans.pop()}}
    }
    if(windowOpen&&weakest&&club.roster.length<25&&career.managedTeamId){
      const parent=career.teams.find(team=>team.id===career.managedTeamId)
      const candidate=parent?.roster.map(id=>career.players[id]).filter(player=>player?.loanListed&&!player.loanId&&depth[positionGroup(player)]<8&&player.salaryWeekly<=club.wageBudget-club.wageSpend).sort((a,b)=>depth[positionGroup(a)]-depth[positionGroup(b)])[0]
      const alreadyOffered=(career.loanOffers??[]).some(offer=>offer.playerId===candidate?.id&&['PENDING','AI_COUNTERED'].includes(offer.status))
      if(candidate&&!alreadyOffered&&stableUnit(`${career.seed}:${marker}:loan-request:${candidate.id}`)<.32){career.loanOffers??=[];const terms={loanFee:candidate.loanListing?.loanFee??0,wageContribution:candidate.loanListing?.wageContribution??70,duration:candidate.loanListing?.duration??1,optionToBuy:candidate.loanListing?.optionToBuy??0,mandatoryBuy:candidate.loanListing?.mandatoryBuy??0,mandatoryBuyMatches:candidate.loanListing?.mandatoryBuyMatches??20};const offer={id:`loan-request-${career.season}-${career.careerDate}-${club.id}-${candidate.id}`,playerId:candidate.id,fromClubId:club.id,toClubId:parent.id,...terms,status:'PENDING',date:career.careerDate};career.loanOffers.unshift(offer);addInboxEvent(career,{id:`inbox-${offer.id}`,type:'LOAN OFFER',playerId:candidate.id,loanOfferId:offer.id,text:`${club.name} requested ${candidate.name} on loan for ${terms.duration} season(s), covering ${terms.wageContribution}% of wages.`})}
    }
    if(windowOpen&&weakest&&club.roster.length<25){const candidates=Object.values(career.players).filter(player=>player.teamId&&player.teamId!==club.id&&!player.loanId&&positionGroup(player)===weakest&&(player.transferListed||career.teams.find(item=>item.id===player.teamId)?.roster.length>22)&&player.overall>(club.roster.map(id=>career.players[id]).filter(p=>positionGroup(p)===weakest).sort((a,b)=>b.overall-a.overall)[2]?.overall??0)+2&&player.salaryWeekly<=club.wageBudget-club.wageSpend).sort((a,b)=>(a.marketValue/Math.max(1,a.overall+Math.max(0,a.potential-a.overall)*.2))-(b.marketValue/Math.max(1,b.overall+Math.max(0,b.potential-b.overall)*.2)))
      const player=candidates[0],seller=career.teams.find(item=>item.id===player?.teamId),fee=player?.transferListed?player.askingPrice:player?.releaseClause
      if(player&&seller&&fee<=club.transferBudget&&seller.roster.length>18&&stableUnit(`${career.seed}:${marker}:${player.id}`)<.22){const result=transferPlayer(career,player.id,club.id,fee);if(result.ok)addInboxEvent(career,{id:`${marker}-signed`,type:'AI TRANSFER',playerId:player.id,text:`${club.name} signed ${player.name} to address its ${weakest} depth.`})}
    }
    if(windowOpen&&club.roster.length>22&&stableUnit(`${career.seed}:${marker}:sale-check`)<.15){const startersNow=new Set([club.lineup.gk,...club.lineup.defs,...(club.lineup.mids??[]),...club.lineup.atts]);const surplus=club.roster.map(id=>career.players[id]).filter(player=>player&&!startersNow.has(player.id)&&(player.transferListed||player.age>=32||player.contractStatus==='Expiring Soon')).sort((a,b)=>a.overall-b.overall)[0];if(surplus){const buyers=career.teams.filter(target=>target.id!==club.id&&target.id!==career.managedTeamId&&target.roster.length<25&&target.transferBudget>=(surplus.askingPrice??surplus.marketValue)&&target.wageSpend+(surplus.salaryWeekly??0)<=target.wageBudget&&target.roster.map(id=>career.players[id]).filter(p=>positionGroup(p)===positionGroup(surplus)).length<5).sort((a,b)=>a.roster.length-b.roster.length);const buyer=buyers[0],fee=Math.min(surplus.askingPrice??surplus.marketValue,buyer?.transferBudget??0);if(buyer&&stableUnit(`${career.seed}:${marker}:${surplus.id}:sale`)<.25)transferPlayer(career,surplus.id,buyer.id,fee)}}
    const availableFreeAgents=Object.values(career.players).filter(player=>player.status==='FREE_AGENT'&&!player.teamId&&player.salaryWeekly<=club.wageBudget-club.wageSpend&&player.age<=32).sort((a,b)=>b.overall-a.overall)
    if(club.roster.length<25&&availableFreeAgents.length&&stableUnit(`${career.seed}:${marker}:free-agent`)<.12){const player=availableFreeAgents.find(candidate=>depth[positionGroup(candidate)]<5);if(player){const result=transferPlayer(career,player.id,club.id,0,{salaryWeekly:player.salaryWeekly,years:2,squadRole:'Rotation',releaseClause:player.releaseClause});if(result.ok)addInboxEvent(career,{id:`${marker}-${player.id}-free-agent`,type:'AI TRANSFER',playerId:player.id,text:`${club.name} signed free agent ${player.name} to improve squad depth.`})}}
    const starters=new Set([club.lineup.gk,...club.lineup.defs,...(club.lineup.mids??[]),...club.lineup.atts])
    const expirers=club.roster.map(id=>career.players[id]).filter(player=>player&&player.contractStatus==='Expiring Soon'&&(starters.has(player.id)||['Regular Starter','Important Player','Key Player'].includes(player.squadRole)))
    for(const player of expirers.slice(0,1)){if(club.wageSpend+(player.salaryWeekly*.12)<=club.wageBudget){club.wageSpend+=Math.round(player.salaryWeekly*.12);player.salaryWeekly=Math.round(player.salaryWeekly*1.12);player.wage=player.salaryWeekly;player.contractExpiryDate=`${Number(career.careerDate.slice(0,4))+3}-06-30`;player.contractExpiry=career.season+3;player.contractStatus='Active';addInboxEvent(career,{id:`${marker}-${player.id}-renewed`,type:'CONTRACT',playerId:player.id,text:`${club.name} renewed ${player.name}'s contract.`})}}
    if(weakest||club.roster.length!==club.lastAiSquadSize){repairTeamLineup(career,club);club.lastAiSquadSize=club.roster.length}
  }
}
function processAcceptedLoans(career){for(const loan of career.loans??[])if(loan.status==='PLAYER_ACCEPTED')settleLoanMovement(career,loan)}
function processReleaseClauseDecisions(career){
  for(const offer of career.transferOffers??[]){
    if(!offer.releaseClauseTriggered||!['RELEASE_CLAUSE_PENDING','RELEASE_CLAUSE_ACCEPTED_PENDING_WINDOW'].includes(offer.status))continue
    const player=career.players[offer.playerId],seller=career.teams.find(team=>team.id===offer.toClubId),buyer=career.teams.find(team=>team.id===offer.fromClubId)
    if(!player||!seller||!buyer||player.teamId!==seller.id){offer.status='CANCELLED';continue}
    if(offer.status==='RELEASE_CLAUSE_PENDING'&&offer.playerDecisionDate>career.careerDate)continue
    if(offer.status==='RELEASE_CLAUSE_PENDING'){
      const accepted=offer.playerAccepted??(stableUnit(`${career.seed}:${offer.id}:decision`)<.67)
      if(!accepted){offer.status='PLAYER_REJECTED';offer.response=`${player.name} rejected ${buyer.name}'s contract offer.`;addInboxEvent(career,{id:`release-player-reject-${offer.id}`,type:'PLAYER DECISION',playerId:player.id,offerId:offer.id,text:offer.response});continue}
      offer.playerAccepted=true;offer.status='RELEASE_CLAUSE_ACCEPTED_PENDING_WINDOW'
    }
    if(!transferWindowState(career.careerDate).open)continue
    const result=transferPlayer(career,player.id,buyer.id,offer.amount,offer.playerContract)
    if(!result.ok){offer.status='PLAYER_ACCEPTED_PENDING_TRANSFER';offer.transferFailure=result.message;continue}
    offer.status='COMPLETED';offer.completedFee=offer.amount;offer.completedDate=career.careerDate;offer.response=`${player.name} accepted ${buyer.name}'s contract and transferred for the release clause.`
    addInboxEvent(career,{id:`release-completed-${offer.id}`,type:'PLAYER TRANSFERRED',playerId:player.id,offerId:offer.id,text:offer.response})
  }
}
function processAcceptedReleaseClauseTransfers(career){for(const offer of career.transferOffers??[])if(offer.status==='PLAYER_ACCEPTED_PENDING_TRANSFER'){offer.status='RELEASE_CLAUSE_ACCEPTED_PENDING_WINDOW';processReleaseClauseDecisions(career)}}
function completeLoanPurchase(career,loan){
  const player=career.players[loan.playerId],parent=career.teams.find(team=>team.id===loan.fromClubId),buyer=career.teams.find(team=>team.id===loan.toClubId),fee=Number(loan.purchaseFee??loan.mandatoryBuy??loan.optionToBuy??0)
  if(!player||!parent||!buyer||player.loanId!==loan.id||!buyer.roster.includes(player.id))return false
  if(!transferWindowState(career.careerDate).open||fee>buyer.transferBudget||buyer.wageSpend+(player.salaryWeekly??0)-Math.round((player.salaryWeekly??0)*(loan.wageContribution??100)/100)>buyer.wageBudget)return false
  const covered=Math.round((player.salaryWeekly??0)*(loan.wageContribution??100)/100)
  parent.wageSpend=Math.max(0,parent.wageSpend-Math.max(0,(player.salaryWeekly??0)-covered))
  buyer.wageSpend+=Math.max(0,(player.salaryWeekly??0)-covered)
  parent.transferBudget+=fee;buyer.transferBudget-=fee;parent.finances.balance+=fee;parent.finances.seasonIncome+=fee;buyer.finances.balance-=fee;buyer.finances.seasonExpenses+=fee
  player.status='CONTRACTED';delete player.loanId;delete player.loanParentClubId;player.transferListed=false;player.loanListed=false
  player.contractYears=3;player.contractExpiry=career.season+3;player.contractExpiryDate=`${Number(career.careerDate.slice(0,4))+3}-06-30`;player.contractStatus='Active';player.squadRole='Rotation'
  loan.status='CONVERTED';loan.conversionDate=career.careerDate;loan.completedFee=fee
  career.transferHistory??=[];const id=`loan-purchase-${loan.id}`;career.transferHistory.unshift({id,transferId:id,seasonId:career.season,seasonNumber:career.season,date:career.careerDate,playerId:player.id,playerName:player.name,position:player.position,fromClubId:parent.id,toClubId:buyer.id,fee,transferType:'PERMANENT'})
  addInboxEvent(career,{id:`${id}-event`,type:'PLAYER TRANSFERRED',playerId:player.id,loanId:loan.id,text:`${player.name} joined ${buyer.name} permanently after the loan for ${moneySafe(fee)}.`})
  return true
}
function moneySafe(value){return `?${(value/1e6).toFixed(2)}M`}
function returnExpiredLoans(career) {
  for(const loan of career.loans??[]){
    if(!['ACTIVE','OPTION_PENDING','OPTION_ACCEPTED_PENDING_WINDOW','MANDATORY_BUY_PENDING_WINDOW','OPTION_DECLINED'].includes(loan.status))continue
    const player=career.players[loan.playerId],from=career.teams.find(team=>team.id===loan.fromClubId),to=career.teams.find(team=>team.id===loan.toClubId)
    if(!player||!from||!to)continue
    if(loan.status==='OPTION_ACCEPTED_PENDING_WINDOW'||loan.status==='MANDATORY_BUY_PENDING_WINDOW'){if(transferWindowState(career.careerDate).open)completeLoanPurchase(career,loan);continue}
    if(loan.status==='OPTION_PENDING'&&loan.optionDecisionDate>career.careerDate)continue
    if(loan.status==='OPTION_PENDING'&&loan.optionDecisionDate<=career.careerDate)loan.status='OPTION_DECLINED'
    if(loan.status==='ACTIVE'&&loan.endDate>career.careerDate)continue
    if(loan.status==='ACTIVE'){
      const appearances=(career.playerSeasonClubStats??[]).filter(segment=>segment.playerId===player.id&&segment.clubId===loan.toClubId&&(!loan.startDate||!segment.startDate||segment.startDate>=loan.startDate)).reduce((sum,segment)=>sum+(segment.stats?.appearances??0),0),conditionMet=loan.mandatoryBuy>0&&appearances>=(loan.mandatoryBuyMatches??20)
      if(conditionMet){loan.purchaseFee=loan.mandatoryBuy;loan.status='MANDATORY_BUY_PENDING_WINDOW';addInboxEvent(career,{id:`loan-mandatory-${loan.id}`,type:'MANDATORY BUY',playerId:player.id,loanId:loan.id,text:`${player.name} met the mandatory purchase condition with ${appearances} appearances.`});if(transferWindowState(career.careerDate).open)completeLoanPurchase(career,loan);continue}
      if(loan.optionToBuy>0){
        loan.purchaseFee=loan.optionToBuy
        if(loan.toClubId===career.managedTeamId){loan.status='OPTION_PENDING';loan.optionDecisionDate=addCareerDays(career.careerDate,7);addInboxEvent(career,{id:`loan-option-${loan.id}`,type:'OPTION TO BUY',playerId:player.id,loanId:loan.id,text:`${to.name} must decide whether to buy ${player.name} for ${moneySafe(loan.optionToBuy)}.`});continue}
        const exercise=stableUnit(`${career.seed}:${loan.id}:option`) < .35&&loan.optionToBuy<=to.transferBudget
        if(exercise){loan.status='OPTION_ACCEPTED_PENDING_WINDOW';addInboxEvent(career,{id:`loan-option-ai-${loan.id}`,type:'OPTION TO BUY',playerId:player.id,loanId:loan.id,text:`${to.name} exercised the option to buy ${player.name}.`});if(transferWindowState(career.careerDate).open)completeLoanPurchase(career,loan);continue}
      }
    }
    closePlayerSeasonClubSegment(career,player.id);to.roster=to.roster.filter(id=>id!==player.id);if(!from.roster.includes(player.id))from.roster.push(player.id)
    const paidShare=Math.round((player.salaryWeekly??0)*(loan.wageContribution??100)/100)
    to.wageSpend=Math.max(0,to.wageSpend-paidShare);from.wageSpend+=paidShare
    player.teamId=from.id;player.clubId=from.id;player.status='CONTRACTED';blankClubSeasonSegment(career,player,from.id,career.careerDate);delete player.loanId;delete player.loanParentClubId;loan.status=loan.status==='RECALLED'?'RECALLED':'EXPIRED';loan.returnDate=career.careerDate
    repairTeamLineup(career,from);repairTeamLineup(career,to);addInboxEvent(career,{id:`loan-expired-${loan.id}`,type:'LOAN',playerId:player.id,loanId:loan.id,text:`${player.name} has returned to ${from.name} after the loan ended.`})
  }
}

function processLoanNegotiation(career) {
  const negotiation=career.loanNegotiation
  if(!negotiation)return null
  const player=career.players[negotiation.playerId],club=career.teams.find(team=>team.id===negotiation.fromClubId),buyer=career.teams.find(team=>team.id===negotiation.toClubId)
  if(!player||!club||!buyer)return null
  if(negotiation.status==='CLUB_RESPONSE_PENDING'&&negotiation.clubDecisionDate<=career.careerDate){
    const roleFit=player.age<23&&player.overall<buyer.strength*.9?.12:.02;const quality=(negotiation.wageContribution/100)*.52+Math.min(negotiation.duration,2)*.07+roleFit+Math.min(.12,negotiation.loanFee/Math.max(1,player.salaryWeekly*52)*.08)+(negotiation.optionToBuy? .04:0)
    const response=quality>=.42?'ACCEPTED':quality>=.31?'COUNTERED':'REJECTED'
    negotiation.status=response;negotiation.clubResponseDate=career.careerDate
    if(response==='ACCEPTED'){negotiation.status='PLAYER_DECISION_PENDING';negotiation.playerDecisionDate=addCareerDays(career.careerDate,1+Math.floor(stableUnit(`${career.seed}:${negotiation.id}:player-date`)*2));negotiation.clubAccepted=true}
    else if(response==='COUNTERED'){negotiation.counter={loanFee:Math.max(0,Math.ceil(player.marketValue*.04/50000)*50000),wageContribution:Math.min(100,negotiation.wageContribution+15),duration:negotiation.duration,optionToBuy:negotiation.optionToBuy};}
    addInboxEvent(career,{id:`loan-club-${negotiation.id}`,type:'LOAN',playerId:player.id,loanId:negotiation.id,text:response==='ACCEPTED'?`${club.name} accepted the loan proposal for ${player.name}. The player will decide shortly.`:response==='COUNTERED'?`${club.name} countered your loan proposal for ${player.name}.`:`${club.name} rejected your loan proposal for ${player.name}.`})
  }
  if(negotiation.status==='PLAYER_DECISION_PENDING'&&negotiation.playerDecisionDate<=career.careerDate){
    const accepted=stableUnit(`${career.seed}:${negotiation.id}:player-choice`)<.72
    const loan={id:negotiation.id,playerId:player.id,fromClubId:club.id,toClubId:buyer.id,loanFee:negotiation.loanFee,wageContribution:negotiation.wageContribution,duration:negotiation.duration,optionToBuy:negotiation.optionToBuy||null,mandatoryBuy:negotiation.mandatoryBuy||null,status:accepted?'PLAYER_ACCEPTED':'PLAYER_REJECTED',decisionDate:career.careerDate,startDate:null,endDate:null}
    career.loans.push(loan);negotiation.status=loan.status
    if(accepted)settleLoanMovement(career,loan)
    else addInboxEvent(career,{id:`loan-player-rejected-${loan.id}`,type:'PLAYER DECISION',playerId:player.id,loanId:loan.id,text:`${player.name} rejected the move to ${buyer.name}.`})
  }
  return negotiation
}

export function beginLoanNegotiation(career, playerId, toClubId=career.managedTeamId) {
  const player=career?.players?.[playerId],from=career?.teams?.find(team=>team.id===player?.teamId),to=career?.teams?.find(team=>team.id===toClubId)
  if(!player||!from||!to||!player.loanListed||from.id===to.id)return {ok:false,message:'This player is not available for a loan.'}
  if(to.roster.length>=25)return {ok:false,message:'Your squad has reached the player limit.'}
  const existing=(career.loans??[]).some(loan=>loan.playerId===player.id&&['ACTIVE','PLAYER_ACCEPTED','PLAYER_DECISION_PENDING'].includes(loan.status))
  if(existing)return {ok:false,message:'This player already has an active loan.'}
  const id=`loan-${career.season}-${career.careerDate}-${player.id}-${to.id}`
  career.loanNegotiation={id,playerId:player.id,fromClubId:from.id,toClubId:to.id,status:'OFFER_DRAFT',loanFee:player.loanListing?.loanFee??0,wageContribution:player.loanListing?.wageContribution??70,duration:player.loanListing?.duration??1,optionToBuy:player.loanListing?.optionToBuy??0,mandatoryBuy:player.loanListing?.mandatoryBuy??0,squadRole:'Rotation',createdDate:career.careerDate}
  return {ok:true,negotiation:career.loanNegotiation}
}
export function submitLoanOffer(career, terms) {
  const n=career?.loanNegotiation
  if(!n||n.status!=='OFFER_DRAFT')return {ok:false,message:'There is no loan offer to submit.'}
  const loanFee=Math.round(Number(terms.loanFee)),wageContribution=Number(terms.wageContribution),duration=Number(terms.duration),optionToBuy=Math.round(Number(terms.optionToBuy)||0),mandatoryBuy=Math.round(Number(terms.mandatoryBuy)||0)
  if(!Number.isSafeInteger(loanFee)||loanFee<0||!Number.isFinite(wageContribution)||wageContribution<0||wageContribution>100||!Number.isFinite(duration)||duration<.25||duration>2||!Number.isSafeInteger(optionToBuy)||optionToBuy<0||!Number.isSafeInteger(mandatoryBuy)||mandatoryBuy<0)return {ok:false,message:'Check the loan fee, wage share, duration, and purchase options.'}
  const buyer=career.teams.find(team=>team.id===n.toClubId)
  if(!buyer||loanFee>buyer.transferBudget)return {ok:false,message:'The loan fee exceeds the available transfer budget.'}
  Object.assign(n,{loanFee,wageContribution,duration,optionToBuy,mandatoryBuy,status:'CLUB_RESPONSE_PENDING',clubDecisionDate:addCareerDays(career.careerDate,1+Math.floor(stableUnit(`${n.id}:club-date`)*2)),offerDate:career.careerDate})
  addInboxEvent(career,{id:`loan-offer-sent-${n.id}`,type:'LOAN OFFER SENT',playerId:n.playerId,loanId:n.id,text:`Your loan offer for ${career.players[n.playerId].name} has been sent. The club response is due ${formatCareerDate(n.clubDecisionDate,{month:'short',day:'numeric'})}.`})
  return {ok:true,negotiation:n}
}
export function respondToLoanCounter(career, accept=true) {
  const n=career?.loanNegotiation
  if(!n||n.status!=='COUNTERED')return {ok:false,message:'There is no loan counter to respond to.'}
  if(!accept){n.status='REJECTED';return {ok:true,status:n.status}}
  Object.assign(n,n.counter,{status:'PLAYER_DECISION_PENDING',clubAccepted:true,playerDecisionDate:addCareerDays(career.careerDate,1+Math.floor(stableUnit(`${n.id}:counter-player-date`)*2))})
  return {ok:true,negotiation:n}
}

export function respondToLoanOption(career,loanId,exercise){
  const loan=career.loans?.find(item=>item.id===loanId&&item.status==='OPTION_PENDING')
  if(!loan||loan.toClubId!==career.managedTeamId)return {ok:false,message:'This purchase option is not awaiting your decision.'}
  if(!exercise){loan.status='OPTION_DECLINED';return {ok:true,status:loan.status}}
  loan.status='OPTION_ACCEPTED_PENDING_WINDOW';loan.purchaseFee=loan.optionToBuy
  if(transferWindowState(career.careerDate).open&&completeLoanPurchase(career,loan))return {ok:true,status:loan.status}
  return {ok:true,status:loan.status,message:'The option is accepted and will complete in the next transfer window.'}
}

export function recallPlayerFromLoan(career,loanId,parentTeamId=career.managedTeamId){
  const loan=career.loans?.find(item=>item.id===loanId&&item.status==='ACTIVE')
  if(!loan||loan.fromClubId!==parentTeamId)return {ok:false,message:'This player is not on loan from your club.'}
  if(!transferWindowState(career.careerDate).open)return {ok:false,message:'Players can only be recalled during a transfer window.'}
  const player=career.players[loan.playerId],parent=career.teams.find(team=>team.id===loan.fromClubId),loanClub=career.teams.find(team=>team.id===loan.toClubId)
  if(!player||!parent||!loanClub||player.loanId!==loan.id)return {ok:false,message:'The loan record no longer matches the player.'}
  closePlayerSeasonClubSegment(career,player.id)
  loanClub.roster=loanClub.roster.filter(id=>id!==player.id);if(!parent.roster.includes(player.id))parent.roster.push(player.id)
  const covered=Math.round((player.salaryWeekly??0)*(loan.wageContribution??100)/100)
  loanClub.wageSpend=Math.max(0,loanClub.wageSpend-covered);parent.wageSpend+=covered
  player.teamId=parent.id;player.clubId=parent.id;player.status='CONTRACTED';delete player.loanId;delete player.loanParentClubId
  blankClubSeasonSegment(career,player,parent.id,career.careerDate)
  loan.status='RECALLED';loan.returnDate=career.careerDate
  repairTeamLineup(career,parent);repairTeamLineup(career,loanClub)
  addInboxEvent(career,{id:`loan-recalled-${loan.id}`,type:'LOAN',playerId:player.id,loanId:loan.id,text:`${player.name} was recalled from ${loanClub.name} and returned to ${parent.name}.`})
  return {ok:true,loan,player}
}

export function respondToLoanOffer(career,offerId,action,terms=null){
  const offer=career.loanOffers?.find(item=>item.id===offerId)
  if(!offer||!['PENDING','AI_COUNTERED'].includes(offer.status))return {ok:false,message:'This loan offer is no longer active.'}
  if(action==='reject'){offer.status='REJECTED';offer.response='Your club rejected the loan offer.';return {ok:true,status:offer.status}}
  const player=career.players[offer.playerId],parent=career.teams.find(team=>team.id===offer.toClubId),loanClub=career.teams.find(team=>team.id===offer.fromClubId)
  if(!player||!parent||!loanClub||player.teamId!==parent.id||!player.loanListed)return {ok:false,message:'The player or loan terms are no longer available.'}
  let agreed=offer.status==='AI_COUNTERED'?offer.counterTerms:{loanFee:offer.loanFee,wageContribution:offer.wageContribution,duration:offer.duration,optionToBuy:offer.optionToBuy,mandatoryBuy:offer.mandatoryBuy,mandatoryBuyMatches:offer.mandatoryBuyMatches}
  if(action==='counter'){
    const proposed={...agreed,...terms},fee=Math.round(Number(proposed.loanFee)),share=Number(proposed.wageContribution),duration=Number(proposed.duration)
    if(!Number.isSafeInteger(fee)||fee<0||!Number.isFinite(share)||share<0||share>100||!Number.isFinite(duration)||duration<.25||duration>2)return {ok:false,message:'Check the loan fee, wage share, and duration.'}
    const acceptable=share>=Math.max(55,(player.loanListing?.wageContribution??65)-15)&&fee<=(player.loanListing?.loanFee??0)+Math.max(100000,player.salaryWeekly*8)
    if(!acceptable){offer.status='REJECTED';offer.response=`${loanClub.name} rejected your loan counter.`;return {ok:true,status:offer.status}}
    offer.counterTerms=proposed;offer.status='AI_COUNTERED';offer.response=`${loanClub.name} accepted your counter terms.`;return {ok:true,status:offer.status}
  }
  if(action==='accept'&&offer.status==='AI_COUNTERED')agreed=offer.counterTerms
  if(action!=='accept')return {ok:false,message:'Choose accept, reject, or counter.'}
  if(!transferWindowState(career.careerDate).open)return {ok:false,message:'A loan can only be completed during a transfer window.'}
  const covered=Math.round(player.salaryWeekly*agreed.wageContribution/100)
  if(loanClub.roster.length>=25||agreed.loanFee>loanClub.transferBudget||loanClub.wageSpend+covered>loanClub.wageBudget)return {ok:false,message:'The loan club cannot afford these terms or has a full squad.'}
  const accepted=stableUnit(`${career.seed}:${offer.id}:loan-player-interest`) < (player.age<23&&positionGroup(player)!=='GK'?.84:.68)
  offer.status=accepted?'COMPLETED':'PLAYER_REJECTED';offer.response=accepted?`${player.name} accepted the move to ${loanClub.name}.`:`${player.name} rejected the move to ${loanClub.name}.`
  if(accepted){career.loans??=[];const loan={id:`${offer.id}-loan`,playerId:player.id,fromClubId:parent.id,toClubId:loanClub.id,...agreed,status:'PLAYER_ACCEPTED',decisionDate:career.careerDate};career.loans.push(loan);if(!settleLoanMovement(career,loan)){career.loans.pop();offer.status='PENDING';return {ok:false,message:'The loan could not be completed with the current squad or wage budgets.'}}offer.loanId=loan.id}
  addInboxEvent(career,{id:`${offer.id}-decision`,type:'LOAN NEGOTIATION RESPONSE',playerId:player.id,loanOfferId:offer.id,text:offer.response});return {ok:true,status:offer.status}
}

export function advanceCareerDay(career, { simulateManagedFixture = false, includeCurrentDate = false } = {}) {
  if (!career?.careerDate) return { ok: false, message: 'This career has no active calendar date.' }
  if (!simulateManagedFixture && currentManagedMatch(career)) return { ok: false, reason: 'MATCHDAY', message: 'Your club has a match today. Play it before advancing.' }
  if (!includeCurrentDate) career.careerDate = addCareerDays(career.careerDate, 1)
  const responseEvents = []
  const inboxBefore = career.inbox.length
  const negotiation = career.activeNegotiation
  if (negotiation?.stage === 'CLUB_RESPONSE_PENDING' && negotiation.pendingClubOffer?.responseDueDate <= career.careerDate) {
    responseEvents.push(evaluatePendingClubOffer(career, negotiation, negotiation.pendingClubOffer))
  }
  processLoanNegotiation(career)
  processAcceptedLoans(career)
  processReleaseClauseDecisions(career)
  processAcceptedReleaseClauseTransfers(career)
  returnExpiredLoans(career)
  const dailyRandom = rng((career.seed + Number(career.careerDate.replaceAll('-', '')) * 92821) >>> 0)
  const { fixtures, userFixture } = simulateFixturesForDate(career, dailyRandom, simulateManagedFixture)
  const scheduledEvents = []
  for (const event of career.scheduledEvents ?? []) {
    if (event.processed || event.date > career.careerDate) continue
    event.processed = true
    scheduledEvents.push(event)
    addInboxEvent(career, { id: `scheduled-${event.id}`, type: event.type ?? 'CAREER EVENT', text: event.text ?? event.title ?? 'A scheduled career event is due.' })
  }
  processContractDates(career)
  runAiClubManagement(career)
  updateCurrentMatchday(career)
  const newInbox = career.inbox.slice(0, Math.max(0, career.inbox.length - inboxBefore))
  const incomingOfferArrived = career.inbox.some(event => event.date === career.careerDate && event.offerId)
  const important = Boolean(userFixture || responseEvents.length || scheduledEvents.some(event => event.important) ||
    newInbox.some(event => ['TRANSFER OFFER', 'RELEASE CLAUSE TRIGGERED', 'CONTRACT WARNING', 'CONTRACT EXPIRED', 'LOAN', 'PLAYER DECISION'].includes(event.type)) ||
    incomingOfferArrived)
  const reason = userFixture ? 'MATCHDAY' : responseEvents.length ? 'TRANSFER_RESPONSE' : scheduledEvents.some(event => event.important) ? 'CAREER_EVENT' : newInbox.some(event => ['CONTRACT WARNING', 'CONTRACT EXPIRED'].includes(event.type)) || incomingOfferArrived ? 'CAREER_EVENT' : null
  return { ok: true, date: career.careerDate, fixturesSimulated: fixtures.length, userFixture, responseEvents, scheduledEvents, important, reason }
}

// Uses the same calendar day processing and quick-match rules as normal career advancement.
export async function simulateCareerToSeasonEnd(career, onProgress = () => {}) {
  if (!career?.fixtures?.length) return { ok: false, message: 'This career has no fixtures to simulate.' }
  let daysAdvanced = 0
  let includeCurrentDate = true
  while (!career.fixtures.every(fixture => fixture.status === 'played')) {
    const result = advanceCareerDay(career, { simulateManagedFixture: true, includeCurrentDate })
    if (!result.ok) return { ...result, daysAdvanced }
    includeCurrentDate = false
    daysAdvanced++
    onProgress({ date: career.careerDate, daysAdvanced, played: career.fixtures.filter(fixture => fixture.status === 'played').length, total: career.fixtures.length })
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  return { ok: true, date: career.careerDate, daysAdvanced, played: career.fixtures.length, total: career.fixtures.length }
}

export function simulateToNextEvent(career, maxDays = 400) {
  if (currentManagedMatch(career)) return { ok: true, date: career.careerDate, daysAdvanced: 0, reason: 'MATCHDAY' }
  for (let day = 1; day <= maxDays; day++) {
    const result = advanceCareerDay(career)
    if (!result.ok) return { ...result, daysAdvanced: day - 1 }
    if (result.important) return { ...result, daysAdvanced: day }
  }
  return { ok: false, date: career.careerDate, daysAdvanced: maxDays, message: 'No important event was found in the next 400 days.' }
}

export function generateAiTransferOffersForMatchday(career, matchday, random = rng((career.seed + matchday * 92821) >>> 0)) {
  if (!transferWindowState(career.careerDate).open) return null
  const seller = career.teams.find(team => team.id === career.managedTeamId)
  const activeStatuses=['PENDING','COUNTER_ACCEPTED','AI_COUNTERED','RELEASE_CLAUSE_PENDING','RELEASE_CLAUSE_ACCEPTED_PENDING_WINDOW','PLAYER_ACCEPTED_PENDING_TRANSFER']
  if (!transferWindowState(career.careerDate).open || !seller || career.transferOffers?.some(offer => activeStatuses.includes(offer.status))) return null
  const openPlayerIds = new Set((career.transferOffers ?? []).filter(offer => activeStatuses.includes(offer.status)).map(offer => offer.playerId))
  const candidates = []
  for (const buyer of career.teams) {
    if (buyer.id === seller.id || buyer.roster.length >= 25) continue
    for (const playerId of seller.roster) {
      const player = career.players[playerId]
      if (!player || openPlayerIds.has(player.id) || positionGroup(player) === 'GK' || player.overall < 65) continue
      const depth = buyer.roster.map(id => career.players[id]).filter(candidate => positionGroup(candidate) === positionGroup(player)).sort((a,b) => b.overall-a.overall)
      if (depth.length > 2 && (!player.transferListed || depth[0].overall >= player.overall - 3)) continue
      if (depth.length === 2 && depth[0].overall >= player.overall + 5 && !player.transferListed) continue
      const quality = clamp((player.overall - buyer.strength * .76) / 28, .12, 1)
      const need = depth.length === 0 ? 1 : depth.length === 1 ? .78 : depth.length === 2 ? .52 : .2
      const prospect = player.age < 24 ? clamp((player.potential - player.overall + 5) / 22, 0, .65) : 0
      const interest = need * .47 + quality * .22 + prospect * .13 + (player.transferListed ? .18 : 0)
      candidates.push({ buyer, player, interest, depth })
    }
  }
  candidates.sort((a,b) => b.interest-a.interest || a.player.id.localeCompare(b.player.id) || a.buyer.id.localeCompare(b.buyer.id))
  const target = candidates[0]
  if (!target || random() > .11 + (target.player.transferListed ? .06 : 0) || target.interest < .48) return null
  const { buyer, player } = target
  const isReleaseClause = !player.transferListed && player.releaseClause <= buyer.transferBudget && random() < .08
  let amount = isReleaseClause ? player.releaseClause : Math.round((player.transferListed ? player.askingPrice : player.marketValue) * (.94 + random() * .16) / 50000) * 50000
  if (amount > buyer.transferBudget) amount = Math.floor(buyer.transferBudget / 50000) * 50000
  if (buyer.wageSpend + player.salaryWeekly > buyer.wageBudget) return null
  const offer = {
    id: `incoming-${career.season}-${matchday}-${buyer.id}-${player.id}`,
    playerId: player.id, fromClubId: buyer.id, toClubId: seller.id,
    amount, playerValue: player.marketValue, releaseClauseTriggered: isReleaseClause,
    maximumWillingness: Math.min(buyer.transferBudget, Math.round(player.marketValue * (player.transferListed ? 1.28 : 1.48) / 50000) * 50000),
    status: isReleaseClause ? 'RELEASE_CLAUSE_PENDING' : 'PENDING', response: null, season: career.season, matchday, date: career.careerDate,
    playerDecisionDate: isReleaseClause ? addCareerDays(career.careerDate, 2) : null,
    playerContract: isReleaseClause ? { salaryWeekly: Math.round((player.salaryWeekly??0)*1.2/1000)*1000, years: 3, squadRole: player.squadRole??'Important Player', releaseClause: Math.round((player.releaseClause??0)*1.3/50000)*50000 } : null,
  }
  career.transferOffers ??= []
  career.transferOffers.unshift(offer)
  career.inbox.unshift({ id: `inbox-${offer.id}`, type: isReleaseClause ? 'RELEASE CLAUSE TRIGGERED' : 'TRANSFER OFFER', offerId: offer.id, text: `${buyer.name} ${isReleaseClause ? 'triggered the release clause' : 'made an offer'} for ${player.name}: €${(amount/1e6).toFixed(2)}M.` })
  return offer
}

export function respondToAiTransferOffer(career, offerId, action, counterAmount = null) {
  const offer = career.transferOffers?.find(item => item.id === offerId)
  if (!offer || offer.releaseClauseTriggered || !['PENDING','COUNTER_ACCEPTED','AI_COUNTERED'].includes(offer.status)) return { ok: false, message: 'This transfer offer is no longer active.' }
  const player = career.players[offer.playerId]
  const buyer = career.teams.find(team => team.id === offer.fromClubId)
  const seller = career.teams.find(team => team.id === offer.toClubId)
  if (!player || !buyer || !seller || player.teamId !== seller.id) return { ok: false, message: 'The player or one of the clubs has changed.' }
  if (action === 'reject') {
    offer.status = 'REJECTED'; offer.response = 'Your club rejected the offer.'
    career.inbox.unshift({ id: `response-${offer.id}-reject`, type: 'TRANSFER RESPONSE', date: career.careerDate, offerId: offer.id, text: `${seller.name} rejected ${buyer.name}'s offer for ${player.name}.` })
    return { ok: true, status: offer.status }
  }
  if (action === 'counter') {
    const amount = Number(counterAmount)
    if (!Number.isSafeInteger(amount) || amount <= offer.amount || amount > 1_000_000_000_000) return { ok: false, message: 'Enter a valid counter offer higher than the current offer.' }
    if(offer.status==='AI_COUNTERED')return {ok:false,message:'Respond to the buying club?s counter first.'}
    offer.counterAmount = amount
    if (amount <= offer.maximumWillingness && amount <= buyer.transferBudget && buyer.roster.length < 25) {
      offer.status = 'COUNTER_ACCEPTED'; offer.response = `${buyer.name} accepted your €${(amount/1e6).toFixed(2)}M counter offer.`
    } else if(amount<=buyer.transferBudget&&buyer.roster.length<25&&amount<offer.maximumWillingness*1.15){
      offer.status='AI_COUNTERED';offer.counterAmount=Math.max(offer.amount+50000,Math.round((amount+offer.maximumWillingness)/2/50000)*50000);offer.response=`${buyer.name} countered at ${offer.counterAmount}.`
    } else {
      offer.status = 'COUNTER_REJECTED'; offer.response = `${buyer.name} rejected your counter offer.`
    }
    career.inbox.unshift({ id: `response-${offer.id}-counter`, type: 'TRANSFER RESPONSE', date: career.careerDate, offerId: offer.id, text: offer.response })
    return { ok: true, status: offer.status }
  }
  if (offer.status==='AI_COUNTERED'&&action==='reject'){offer.status='REJECTED';offer.response='Your club rejected the buying club?s counter offer.';career.inbox.unshift({id:`response-${offer.id}-ai-counter-reject`,type:'TRANSFER RESPONSE',date:career.careerDate,offerId:offer.id,text:offer.response});return {ok:true,status:offer.status}}
  if (action !== 'accept') return { ok: false, message: 'Choose accept, reject, or counter.' }
  const fee = ['COUNTER_ACCEPTED','AI_COUNTERED'].includes(offer.status) ? offer.counterAmount : offer.amount
  const result = transferPlayer(career, player.id, buyer.id, fee)
  if (!result.ok) return result
  offer.status = 'COMPLETED'; offer.completedFee = fee
  offer.response = `${player.name} transferred to ${buyer.name} for €${(fee/1e6).toFixed(2)}M.`
  return { ok: true, status: offer.status, transfer: result }
}

function simulateQuickFixture(career, home, away, random) {
  const fields = ['goals','assists','shots','shotsOnTarget','passesAttempted','passesCompleted','keyPasses','throughBalls','successfulThroughBalls','longBalls','successfulLongBalls','tackles','successfulTackles','interceptions','blocks','dribbles','successfulDribbles','possessionLosses','recoveries','clearances','saves','claims','distributionPasses','distributionCompletions','goalsConceded','fouls','foulsSuffered','yellowCards','redCards']
  const emptyLine = () => Object.fromEntries(fields.map(field => [field, 0]))
  const lineup = team => [team.lineup.gk, ...team.lineup.defs, ...(team.lineup.mids ?? []), ...team.lineup.atts].map(id => career.players[id]).filter(Boolean)
  const squads = { home: lineup(home), away: lineup(away) }
  const sides = { home, away }, teams = { home: emptyLine(), away: emptyLine() }, players = {}
  for (const side of ['home','away']) for (const player of squads[side]) players[player.id] = { ...emptyLine(), appearances: 1, minutes: 90, rating: 6.2 }
  const events = []
  const actionAbility = (player, action) => {
    const a=player.attributes??{}
    const weights=action==='shoot'?{SHO:.45,DEC:.2,POS:.14,CON:.12,PAC:.09}:action==='pass'?{PAS:.35,VIS:.25,DEC:.2,CON:.15,FIT:.05}:action==='defend'?{DEF:.35,TAC:.25,POS:.2,DEC:.15,FIT:.05}:player.position==='GK'?{REF:.35,POS_GK:.3,HAN:.2,DEF:.1,DEC:.05}:player.positionGroup==='DEF'?{DEF:.25,TAC:.2,POS:.18,DEC:.15,PAC:.1,VIS:.08,CON:.04}:player.positionGroup==='MID'?{PAS:.2,VIS:.18,DEC:.17,CON:.15,POS:.12,PAC:.08,DRI:.06,SHO:.04}: {SHO:.2,PAC:.17,CON:.16,DRI:.14,DEC:.13,POS:.1,PAS:.05,VIS:.05}
    return Object.entries(weights).reduce((sum,[key,weight])=>sum+(a[key]??a.DEF??60)*weight,0)
  }
  const average = squad => squad.reduce((sum, player) => sum + actionAbility(player,'general'), 0) / Math.max(1, squad.length)
  const attackStyle = team => (team.tactics.attackingMentality === 'aggressive' ? .06 : team.tactics.attackingMentality === 'direct' ? .045 : team.tactics.attackingMentality === 'possession' ? -.01 : 0) + (team.tactics.transitionStyle === 'fast_counter' ? .025 : 0)
  const defenseStyle = team => (team.tactics.defensiveApproach === 'low_block' ? .06 : team.tactics.defensiveApproach === 'high_press' ? .025 : 0) + (team.tactics.defensiveLine === 'low' ? .02 : 0)
  const weightedPlayer = (squad,action='general') => squad.reduce((sum, player) => sum + Math.max(1, actionAbility(player,action)), 0) * random()
  const choosePlayer = (squad,action='general') => { let ticket = weightedPlayer(squad,action); for (const player of squad) { ticket -= Math.max(1, actionAbility(player,action)); if (ticket <= 0) return player } return squad.at(-1) }

  for (const side of ['home','away']) {
    const opponent = side === 'home' ? 'away' : 'home'
    const team = sides[side], rival = sides[opponent], squad = squads[side]
    const qualityEdge = (average(squad) - average(squads[opponent])) / 100
    const homeEdge = side === 'home' ? .025 : 0
    const shotChance = clamp(.43 + qualityEdge * .16 + attackStyle(team) - defenseStyle(rival) + homeEdge, .28, .62)
    const shooters=squad.filter(player=>player.position!=='GK')
    const shootingAbility=shooters.reduce((sum,player)=>sum+(player.attributes.SHO??60),0)/Math.max(1,shooters.length)
    const targetChance = clamp(.25 + shootingAbility / 260 + qualityEdge * .08, .38, .68)
    const goalChance = clamp(.12 + shootingAbility / 470 + qualityEdge * .16 + attackStyle(team) * .3 - defenseStyle(rival) * .3 + homeEdge, .14, .39)
    const opportunities = 12 + Math.floor(random() * 7)
    for (let opportunity = 0; opportunity < opportunities; opportunity++) {
      if (random() >= shotChance) continue
      const shooter = choosePlayer(shooters,'shoot')
      players[shooter.id].shots++
      const shotEvent = { type: 'shot', teamId: team.id, shooterId: shooter.id, onTarget: false, goal: false }
      events.push(shotEvent)
      if (random() >= targetChance) continue
      players[shooter.id].shotsOnTarget++
      shotEvent.onTarget = true
      if (random() >= goalChance) continue
      players[shooter.id].goals++
      shotEvent.goal = true
      if (random() < .62) {
        const provider = choosePlayer(squad.filter(player => player.id !== shooter.id),'pass')
        players[provider.id].assists++
        events.push({ type: 'goal', teamId: team.id, scorerId: shooter.id, assisterId: provider.id })
      } else events.push({ type: 'goal', teamId: team.id, scorerId: shooter.id, assisterId: null })
    }
  }
  for (const side of ['home','away']) {
    const opponent = side === 'home' ? 'away' : 'home'
    const team = sides[side]
    const squad = squads[side]
    const outfield=squad.filter(player=>player.position!=='GK')
    const passAttempts = 72 + Math.floor(random() * 45)
    for (let i = 0; i < passAttempts; i++) players[choosePlayer(squad,'pass').id].passesAttempted++
    for (const player of squad) {
      const line = players[player.id]
      line.passesCompleted = Math.round(line.passesAttempted * (.68 + random() * .18))
    }
    for(let i=0,count=3+Math.floor(random()*8);i<count;i++)players[choosePlayer(outfield,'pass').id].keyPasses++
    for(let i=0,count=4+Math.floor(random()*9);i<count;i++)players[choosePlayer(outfield,'general').id].possessionLosses++
    for(let i=0,count=8+Math.floor(random()*11);i<count;i++)players[choosePlayer(outfield,'general').id].recoveries++
    for(let i=0,count=5+Math.floor(random()*10);i<count;i++){const player=choosePlayer(outfield,'general');players[player.id].dribbles++;if(random()<clamp(.34+(player.attributes.DRI??60)/220,.48,.82))players[player.id].successfulDribbles++}
    for(let i=0,count=2+Math.floor(random()*6);i<count;i++){const player=choosePlayer(outfield,'pass');players[player.id].throughBalls++;if(random()<clamp(.2+((player.attributes.PAS??60)+(player.attributes.VIS??60))/250,.4,.82))players[player.id].successfulThroughBalls++}
    for(let i=0,count=3+Math.floor(random()*7);i<count;i++){const player=choosePlayer(outfield,'pass');players[player.id].longBalls++;if(random()<clamp(.28+(player.attributes.PAS??60)/200,.5,.84))players[player.id].successfulLongBalls++}
    const tackles = 8 + Math.floor(random() * 9), interceptions = 3 + Math.floor(random() * 7)
    for (let i = 0; i < tackles; i++) { const player = choosePlayer(outfield,'defend'); players[player.id].tackles++; if (random() < clamp(.42+(actionAbility(player,'defend')/100)*.24,.42,.72)) players[player.id].successfulTackles++ }
    for (let i = 0; i < interceptions; i++) players[choosePlayer(outfield,'defend').id].interceptions++
    const defensiveLine=outfield.filter(player=>player.positionGroup==='DEF')
    for(let i=0,count=2+Math.floor(random()*6);i<count;i++)players[choosePlayer(defensiveLine.length?defensiveLine:outfield,'defend').id].clearances++
    const opponentShots=squads[opponent].reduce((sum,player)=>sum+(players[player.id].shots??0),0)
    for(let i=0,count=Math.min(opponentShots,Math.floor(opponentShots*(.04+random()*.12)));i<count;i++)players[choosePlayer(defensiveLine.length?defensiveLine:outfield,'defend').id].blocks++
    const fouls = 7 + Math.floor(random() * 9), foulers = squad.filter(player => player.position !== 'GK'), victims = squads[opponent].filter(player => player.position !== 'GK')
    const bookings = new Map()
    for (let i = 0; i < fouls; i++) {
      const offender = choosePlayer(foulers,'defend'), victim = choosePlayer(victims,'general')
      players[offender.id].fouls++; players[victim.id].foulsSuffered++
      events.push({ type: 'foul', teamId: team.id, playerId: offender.id, victimId: victim.id })
      if (random() < .12) {
        const yellows = (bookings.get(offender.id) ?? 0) + 1; bookings.set(offender.id, yellows)
        players[offender.id].yellowCards++; events.push({ type: 'yellow_card', teamId: team.id, playerId: offender.id })
        if (yellows === 2) { players[offender.id].redCards++; events.push({ type: 'red_card', teamId: team.id, playerId: offender.id, secondYellow: true }) }
      } else if (random() < .006) {
        players[offender.id].redCards++; events.push({ type: 'red_card', teamId: team.id, playerId: offender.id, secondYellow: false })
      }
    }
  }
  for(const side of ['home','away']){
    const keeper=players[sides[side].lineup.gk],opponent=side==='home'?'away':'home'
    if(keeper){keeper.saves=Math.max(0,teams[opponent].shotsOnTarget-teams[opponent].goals);keeper.claims=2+Math.floor(random()*5);keeper.goalsConceded=teams[opponent].goals;keeper.distributionPasses=18+Math.floor(random()*16);keeper.distributionCompletions=Math.round(keeper.distributionPasses*(.67+random()*.2))}
  }
  for (const side of ['home','away']) for (const player of squads[side]) for (const field of fields) teams[side][field] += players[player.id][field]
  for(const side of ['home','away'])for(const player of squads[side])players[player.id].rating=calculateMatchRating(players[player.id],{...player,isGoalkeeper:player.position==='GK'})
  return { homeGoals: teams.home.goals, awayGoals: teams.away.goals, statistics: { teams, players }, events }
}

function creditFixtureIncome(team, home) {
  const income = Math.round((home ? 620000 : 430000) + (team.strength ?? 70) * (home ? 9800 : 7200))
  team.finances ??= { balance: 0, seasonIncome: 0, seasonExpenses: 0, seasonProfit: 0, previousSeasonProfit: 0 }
  team.finances.balance += income
  team.finances.seasonIncome += income
}

export function applyManagedMatch(career, fixtureId, match) {
  const fixture=career.fixtures.find(f=>f.id===fixtureId); if(!fixture||fixture.status==='played') return false
  const home=career.teams.find(t=>t.id===fixture.homeTeamId), away=career.teams.find(t=>t.id===fixture.awayTeamId)
  const homeGoals=match.homeScore, awayGoals=match.awayScore
  const managed=career.teams.find(team=>team.id===career.managedTeamId)
  if(managed&&match.teamContexts){
    const side=match.teamContexts.home?.clubId===managed.id?'home':'away'
    const actors=side==='home'?match.players:match.opponents
    const gk=match.goalkeepers?.[side]
    const lines={defs:actors.filter(player=>player.formationSlot?.line==='defense'&&!player.substitutedOff&&!player.sentOff).map(player=>player.id),mids:actors.filter(player=>player.formationSlot?.line==='midfield'&&!player.substitutedOff&&!player.sentOff).map(player=>player.id),atts:actors.filter(player=>player.formationSlot?.line==='attack'&&!player.substitutedOff&&!player.sentOff).map(player=>player.id)}
    const formation=match.teamContexts[side].formation
    if(FORMATIONS[formation]&&gk?.id&&lines.defs.length===FORMATIONS[formation].defs&&lines.mids.length===FORMATIONS[formation].mids&&lines.atts.length===FORMATIONS[formation].atts){managed.formation=formation;managed.lineup={gk:gk.id,...lines}}
  }
  fixture.status='played'; fixture.result={homeGoals,awayGoals,stats:match.statistics,events:match.events,goals:match.goals}; applyTableResult(home,away,homeGoals,awayGoals)
  creditFixtureIncome(home, true); creditFixtureIncome(away, false)
  const actors=[...match.players,...match.opponents,...Object.values(match.goalkeepers)]
  actors.forEach(actor=>{
    const player=career.players[actor.id]; if(!player)return
    const line=match.statistics.players[actor.id]; player.fitness=Math.round(clamp(actor.fitness??player.fitness,0,100))
    if(line?.appearances) {
      recordPlayerMatchStats(career,player,line)
    }
  })
  const result={fixtureId,homeTeamId:home.id,awayTeamId:away.id,homeGoals,awayGoals,simulated:false}
  career.completedMatches.push(result); career.lastResult=result; career.currentMatchFixtureId=null
  career.inbox.unshift({id:`result-${fixtureId}`,type:'MATCH REPORT',date:career.careerDate,text:`${home.name} ${homeGoals}–${awayGoals} ${away.name}.`})
  if(managed?.board){
    const goals=managed.id===home.id?homeGoals:awayGoals,against=managed.id===home.id?awayGoals:homeGoals
    const formDelta=goals>against?1.1:goals===against?.15:-1.2
    const place=leagueTable(career,managed.leagueId).findIndex(team=>team.id===managed.id)+1
    const target=managed.board.expectation==='Challenge for the title'?1:managed.board.expectation==='Win the league'?1:managed.board.expectation==='Qualify for Champions League'?4:managed.board.expectation==='Finish in the top 3'?3:managed.board.expectation==='Finish in the top 4'?4:managed.board.expectation==='Finish in the top 6'?6:managed.board.expectation==='Finish in the top 10'?10:Math.max(1,leagueTable(career,managed.leagueId).length-2)
    const positionDelta=place<=target?.35:place>target+5?-.8:-.25,before=managed.board.confidence??70
    managed.board.confidence=clamp(Number((before+formDelta+positionDelta).toFixed(1)),0,100)
    const review={id:`confidence-${fixtureId}`,date:career.careerDate,before,change:Number((managed.board.confidence-before).toFixed(1)),after:managed.board.confidence,reasons:[`Result form: ${formDelta>=0?'+':''}${formDelta.toFixed(1)}`,`League position ${place} vs objective ${target}: ${positionDelta>=0?'+':''}${positionDelta.toFixed(1)}`]}
    managed.board.confidenceHistory.unshift(review);managed.board.confidenceHistory=managed.board.confidenceHistory.slice(0,20)
    if(managed.board.confidence===0&&!managed.board.fired){managed.board.fired=true;career.inbox.unshift({id:`manager-fired-${career.season}-${fixtureId}`,type:'BOARD',date:career.careerDate,text:'The board has dismissed you after confidence fell to zero.'})}
    else career.inbox.unshift({id:review.id,type:'BOARD REVIEW',date:career.careerDate,text:`Board confidence ${review.change>=0?'increased':'decreased'} by ${Math.abs(review.change)} after the match.`})
  }
  updateCurrentMatchday(career); return true
}
export function negotiateBoardExpectations(career, option) {
  const team=career?.teams?.find(item=>item.id===career.managedTeamId)
  if(!team?.board)return {ok:false,message:'The board is unavailable.'}
  if(team.board.negotiationUsed)return {ok:false,message:'The board has already negotiated expectations this season.'}
  const targets=option==='higher-budget'
    ? {'Avoid relegation':'Finish in the top 10','Avoid finishing bottom':'Finish in the top 10','Finish in the top 10':'Finish in the top 6','Finish in the top 3':'Challenge for the title','Finish in the top 4':'Finish in the top 3','Finish in the top 6':'Qualify for Champions League','Qualify for Champions League':'Challenge for the title','Challenge for the title':'Win the league','Win the league':'Win the league'}
    : option==='lower-expectation'
      ? {'Challenge for the title':'Qualify for Champions League','Win the league':'Finish in the top 3','Finish in the top 4':'Finish in the top 6','Finish in the top 3':'Finish in the top 6','Qualify for Champions League':'Finish in the top 6','Finish in the top 6':'Finish in the top 10','Finish in the top 10':'Avoid relegation','Avoid relegation':'Avoid relegation','Avoid finishing bottom':'Avoid finishing bottom'}
      : null
  if(!targets)return {ok:false,message:'Choose a board negotiation proposal.'}
  const target=targets[team.board.expectation]??team.board.expectation
  if(option==='higher-budget')team.transferBudget=Math.round(team.transferBudget*1.15/50000)*50000
  else team.transferBudget=Math.round(team.transferBudget*.88/50000)*50000
  team.board.expectation=target
  team.board.negotiationUsed=true
  team.board.negotiationResult=option==='higher-budget'?`Accepted: transfer budget increased by 15%; new objective is ${target}.`:`Accepted: transfer budget reduced by 12%; new objective is ${target}.`
  addInboxEvent(career,{id:`board-negotiation-${career.season}-${team.id}`,type:'BOARD',text:team.board.negotiationResult})
  return {ok:true,message:team.board.negotiationResult}
}

export function saveCareer(career, slot = career?.saveSlot ?? 1) { try {
  if (!Number.isInteger(slot) || slot < 1 || slot > SAVE_SLOT_COUNT) return false
  career.saveSlot = slot
  const saves = JSON.parse(localStorage.getItem(SAVE_SLOTS_KEY) ?? '{}')
  saves[String(slot)] = { saveId: career.saveId ?? `career-slot-${slot}`, clubId: career.managedTeamId ?? null, leagueId: career.teams.find(team=>team.id===career.managedTeamId)?.leagueId ?? null, careerDate: career.careerDate, season: career.season, lastSaved: new Date().toISOString(), careerState: career }
  career.saveId = saves[String(slot)].saveId
  saves[String(slot)].careerState = career
  localStorage.setItem(SAVE_SLOTS_KEY, JSON.stringify(saves))
  localStorage.setItem(SAVE_KEY,JSON.stringify(career))
  return true
} catch { return false } }
export function listSaveSlots() {
  try {
    const saves = JSON.parse(localStorage.getItem(SAVE_SLOTS_KEY) ?? '{}')
    return Array.from({length:SAVE_SLOT_COUNT},(_,index)=>{
      const slot=index+1, entry=saves[String(slot)]
      if (!entry?.careerState) return {slot,empty:true}
      const career=entry.careerState,club=career.teams?.find(team=>team.id===career.managedTeamId),place=club?leagueTable(career,club.leagueId).findIndex(team=>team.id===club.id)+1:null
      const next=career.fixtures?.filter(fixture=>fixture.status==='scheduled'&&(fixture.homeTeamId===club?.id||fixture.awayTeamId===club?.id)).sort((a,b)=>(a.scheduledDate??'').localeCompare(b.scheduledDate??''))[0]
      const nextOpponent=next?.homeTeamId===club?.id?next?.awayTeamId:next?.homeTeamId
      return {slot,empty:false,saveId:entry.saveId,clubId:entry.clubId,leagueId:entry.leagueId,careerDate:entry.careerDate,season:entry.season,position:place,nextMatch:career.teams?.find(team=>team.id===nextOpponent)?.name??'Season complete',lastSaved:entry.lastSaved,careerState:career}
    })
  } catch { return Array.from({length:SAVE_SLOT_COUNT},(_,index)=>({slot:index+1,empty:true})) }
}
export function loadCareer(slot = null) {
  try { const slots = JSON.parse(localStorage.getItem(SAVE_SLOTS_KEY) ?? '{}'); const raw=slot==null?localStorage.getItem(SAVE_KEY):slots[String(slot)]?.careerState?JSON.stringify(slots[String(slot)].careerState):null; if(!raw)return {career:null,error:null}; const career=JSON.parse(raw)
    const teamIds = new Set((Array.isArray(career?.teams) ? career.teams : []).map(team => team?.id).filter(Boolean))
    const legacySave=career?.saveVersion< SAVE_VERSION && career?.teams?.length===6 && career?.fixtures?.length===15
    const validTeams = Array.isArray(career?.teams) && (legacySave || career.teams.length >= 2) && career.teams.every(team => {
      const legacyShape = { '2-2': { defs: 2, mids: 0, atts: 2 }, '3-1': { defs: 3, mids: 0, atts: 1 }, '1-3': { defs: 1, mids: 0, atts: 3 } }
      const shape = FORMATIONS[team.formation ?? '4-4-2'] ?? legacyShape[team.formation]
      const lineupIds = [team.lineup?.gk, ...(team.lineup?.defs ?? []), ...(team.lineup?.mids ?? []), ...(team.lineup?.atts ?? [])]
      return Boolean(shape && Array.isArray(team.roster) && team.roster.every(id => Boolean(career.players?.[id])) &&
        team.lineup?.gk && team.lineup?.defs?.length === shape.defs && (team.lineup?.mids?.length ?? 0) === shape.mids && team.lineup?.atts?.length === shape.atts &&
        lineupIds.every(id => team.roster.includes(id)) && new Set(lineupIds).size === lineupIds.length &&
        positionGroup(career.players[team.lineup.gk]) === 'GK' && team.lineup.defs.every(id => positionGroup(career.players[id]) === 'DEF'))
    })
    const validFixtures = Array.isArray(career?.fixtures) && (legacySave ? career.fixtures.length===15 : career.fixtures.length>0) && career.fixtures.every(fixture => fixture &&
      teamIds.has(fixture.homeTeamId) && teamIds.has(fixture.awayTeamId) && fixture.matchday>=1 && fixture.matchday<=(legacySave?5:38) &&
      (fixture.status === 'scheduled' || fixture.status === 'played'))
    if(!Number.isInteger(career?.saveVersion)||career.saveVersion<1||career.saveVersion>SAVE_VERSION||!validTeams||!career.players||!validFixtures||(!legacySave&&!teamIds.has(career.managedTeamId)))return {career:null,error:'The saved career is invalid or uses an unsupported version.'}
    const migrated=migrateCareer(career)
    migrated.saveSlot = slot ?? migrated.saveSlot ?? 1
    if(migrated.saveVersion!==JSON.parse(raw).saveVersion)saveCareer(migrated,migrated.saveSlot)
    return {career:migrated,error:null}
  } catch { return {career:null,error:'The saved career could not be loaded.'} }
}
export function extendPlayerContract(career, playerId, years) {
  const player = career?.players?.[playerId]
  const duration = Number(years)
  if (!player || !Number.isInteger(duration) || duration < 1 || duration > 5) return { ok: false, message: 'Choose a contract length from one to five seasons.' }
  player.contractYears = duration
  player.contractExpiryDate = `${Number(career.careerDate.slice(0, 4)) + duration}-06-30`
  player.contractExpiry = (career.season ?? 1) + duration
  player.contractStatus = 'Active'
  let releaseOffersCancelled=0
  for(const offer of career.transferOffers??[])if(offer.playerId===player.id&&offer.releaseClauseTriggered&&['RELEASE_CLAUSE_PENDING','RELEASE_CLAUSE_ACCEPTED_PENDING_WINDOW','PLAYER_ACCEPTED_PENDING_TRANSFER'].includes(offer.status)){offer.status='CANCELLED';offer.response=`${player.name} renewed with their club before making a decision.`;releaseOffersCancelled++}
  if(releaseOffersCancelled)addInboxEvent(career,{id:`renewal-release-cancel-${player.id}-${career.careerDate}`,type:'CONTRACT RENEWED',playerId:player.id,text:`${player.name} renewed their contract. The release-clause move was cancelled.`})
  return { ok: true, expiresAt: player.contractExpiryDate, releaseOffersCancelled }
}
export function setPlayerTransferListed(career, playerId, listed) {
  const player = career?.players?.[playerId]
  if (!player) return { ok: false, message: 'Player not found.' }
  const wasListed=Boolean(player.transferListed),next=Boolean(listed)
  if(next&&(!Number.isFinite(player.askingPrice)||player.askingPrice<=0))return {ok:false,message:'Set a valid asking price before listing this player.'}
  player.transferListed = next
  if(wasListed!==next&&career.shortlist?.some(item=>item.playerId===player.id))shortlistNotice(career,player,next?'TRANSFER_LISTED':'TRANSFER_UNLISTED',next?`${player.name} has been transfer listed.`:`${player.name} was removed from the transfer list.`)
  return { ok: true, transferListed: player.transferListed }
}
function shortlistNotice(career,player,event,text){
  if(!career.shortlist?.some(item=>item.playerId===player.id))return
  const id=`shortlist-${event}-${player.id}-${career.season}-${career.careerDate}`
  if(career.inbox.some(item=>item.id===id))return
  addInboxEvent(career,{id,type:'SHORTLIST UPDATE',playerId:player.id,text})
}
export function setPlayerAskingPrice(career,playerId,askingPrice){
  const player=career?.players?.[playerId],price=Math.round(Number(askingPrice))
  if(!player||!Number.isSafeInteger(price)||price<=0)return {ok:false,message:'Enter a valid asking price.'}
  const previous=player.askingPrice;player.askingPrice=price
  if(previous!==price&&player.transferListed)shortlistNotice(career,player,'PRICE',`${player.name}'s asking price changed to €${(price/1e6).toFixed(2)}M.`)
  return {ok:true,askingPrice:price}
}
export function setPlayerLoanListed(career,playerId,listed,terms={}){
  const player=career?.players?.[playerId]
  if(!player)return {ok:false,message:'Player not found.'}
  if(player.loanId)return {ok:false,message:'A player cannot be listed for another loan while already on loan.'}
  const contribution=Math.max(0,Math.min(100,Math.round(Number(terms.wageContribution??player.loanListing?.wageContribution??70))))
  const duration=Number(terms.duration??player.loanListing?.duration??1)
  const loanFee=Math.max(0,Math.round(Number(terms.loanFee??player.loanListing?.loanFee??0)))
  const optionToBuy=Math.max(0,Math.round(Number(terms.optionToBuy??player.loanListing?.optionToBuy??0)))
  const mandatoryBuy=Math.max(0,Math.round(Number(terms.mandatoryBuy??player.loanListing?.mandatoryBuy??0)))
  if(!Number.isFinite(duration)||duration<.25||duration>2)return {ok:false,message:'Choose a loan duration from three months to two seasons.'}
  const changed=Boolean(player.loanListed)!==Boolean(listed)
  player.loanListed=Boolean(listed)
  if(listed)player.loanListing={wageContribution:contribution,duration,loanFee,optionToBuy,mandatoryBuy,mandatoryBuyMatches:Math.max(1,Math.round(Number(terms.mandatoryBuyMatches??20)))}
  if(changed&&career.shortlist?.some(item=>item.playerId===player.id))shortlistNotice(career,player,listed?'LOAN_LISTED':'LOAN_UNLISTED',listed?`${player.name} is now available for loan.`:`${player.name} is no longer listed for loan.`)
  return {ok:true,loanListed:player.loanListed,loanListing:player.loanListing??null}
}
export function shortlistPlayer(career,playerId){
  const player=career?.players?.[playerId]
  if(!player)return {ok:false,message:'Player not found.'}
  career.shortlist??=[]
  if(career.shortlist.some(item=>item.playerId===playerId))return {ok:true,shortlisted:true}
  career.shortlist.push({playerId,dateAdded:career.careerDate})
  return {ok:true,shortlisted:true}
}
export function removeFromShortlist(career,playerId){career.shortlist=(career.shortlist??[]).filter(item=>item.playerId!==playerId);return {ok:true,shortlisted:false}}
export function transferPlayer(career, playerId, buyingTeamId, fee = null, contract = null) {
  const player=career.players[playerId], seller=career.teams.find(t=>t.id===player?.teamId), buyer=career.teams.find(t=>t.id===buyingTeamId)
  migrateCareer(career)
  const transferFee=Number.isFinite(fee)?fee:player?.marketValue
  const salary=Number.isFinite(contract?.salaryWeekly)?contract.salaryWeekly:(player?.salaryWeekly??0)
  const freeAgent=!seller&&player?.status==='FREE_AGENT'
  if(!player||(!seller&&!freeAgent)||!buyer||seller?.id===buyer.id||player.loanId||(!freeAgent&&buyer.transferBudget<transferFee))return {ok:false,message:'The player is unavailable for a permanent transfer or the buyer does not have enough budget.'}
  if(!freeAgent&&!transferWindowState(career.careerDate).open)return {ok:false,message:'Transfer window is closed.'}
  if(buyer.roster.length>=25)return {ok:false,message:'The buying club has reached its 25-player squad limit.'}
  if(buyer.wageSpend+salary>buyer.wageBudget)return {ok:false,message:'The buyer does not have enough wage budget for this contract.'}
  closePlayerSeasonClubSegment(career,player.id)
  if(seller){seller.roster=seller.roster.filter(id=>id!==playerId);seller.transferBudget+=transferFee;seller.wageSpend=Math.max(0,seller.wageSpend-(player.salaryWeekly??0))}buyer.roster.push(playerId); if(!freeAgent)buyer.transferBudget-=transferFee; player.teamId=buyer.id;player.clubId=buyer.id;player.status='CONTRACTED'
  blankClubSeasonSegment(career,player,buyer.id,career.careerDate)
  buyer.wageSpend+=salary; player.salaryWeekly=salary;player.wage=salary
  if(contract){player.contractYears=contract.years;player.contractExpiry=career.season+contract.years;player.contractExpiryDate=`${Number(career.careerDate.slice(0,4))+contract.years}-06-30`;player.contractStatus='Active';player.squadRole=contract.squadRole;if(Number.isFinite(contract.releaseClause))player.releaseClause=contract.releaseClause}
  player.transferListed=false;player.loanListed=false
  if(seller){seller.finances.balance+=transferFee;seller.finances.seasonIncome+=transferFee}
  buyer.finances.balance-=transferFee; buyer.finances.seasonExpenses+=transferFee
  if(seller&&seller.lineup.gk===playerId)seller.lineup.gk=seller.roster.find(id=>career.players[id].position==='GK')??null
  if(seller){seller.lineup.defs=seller.lineup.defs.filter(id=>id!==playerId);seller.lineup.mids=(seller.lineup.mids??[]).filter(id=>id!==playerId);seller.lineup.atts=seller.lineup.atts.filter(id=>id!==playerId)}
  const shape=seller&&FORMATIONS[seller.formation??'4-4-2']
  const fill=(position,used,count,eligible=p=>positionGroup(p)===position)=>seller.roster.map(id=>career.players[id]).filter(p=>eligible(p)&&!used.includes(p.id)).sort((a,b)=>b.overall-a.overall).slice(0,count).map(p=>p.id)
  if(seller&&!seller.lineup.gk)seller.lineup.gk=fill('GK',[],1)[0]??null
  const eligibleMid=p=>['DEF','MID','ATT'].includes(positionGroup(p)), starters=seller?[seller.lineup.gk,...seller.lineup.defs,...seller.lineup.mids,...seller.lineup.atts]:[]
  if(seller)seller.lineup.defs=[...seller.lineup.defs,...fill('DEF',starters,shape.defs-seller.lineup.defs.length)]
  const usedMid=seller?[seller.lineup.gk,...seller.lineup.defs,...seller.lineup.mids,...seller.lineup.atts]:[]
  if(seller)seller.lineup.mids=[...seller.lineup.mids,...fill('MID',usedMid,shape.mids-seller.lineup.mids.length,eligibleMid)]
  const usedAtt=seller?[seller.lineup.gk,...seller.lineup.defs,...seller.lineup.mids,...seller.lineup.atts]:[]
  if(seller)seller.lineup.atts=[...seller.lineup.atts,...fill('ATT',usedAtt,shape.atts-seller.lineup.atts.length,p=>['ATT','MID'].includes(positionGroup(p)))]
  if(seller)syncBench(seller);repairTeamLineup(career,buyer);syncBench(buyer)
  career.transferHistory??=[]
  const transferId=`transfer-${career.season}-${career.careerDate}-${playerId}-${seller?.id??'free'}-${buyer.id}`
  if(!career.transferHistory.some(item=>item.transferId===transferId||item.id===transferId))career.transferHistory.unshift({id:transferId,transferId,seasonId:career.season,seasonNumber:career.season,date:career.careerDate,playerId,playerName:player.name,position:player.position,fromClubId:seller?.id??null,toClubId:buyer.id,fee:freeAgent?0:transferFee,transferType:freeAgent?'FREE_AGENT':'PERMANENT'})
  career.freeAgents=(career.freeAgents??[]).filter(id=>id!==playerId)
  shortlistNotice(career,player,'TRANSFER',`${player.name} moved from ${seller?.name??'Free agents'} to ${buyer.name}.`)
  career.inbox.unshift({id:transferId,type:'TRANSFER',date:career.careerDate,text:`${player.name} joined ${buyer.name}${seller?` from ${seller.name}`:' as a free agent'}.`})
  return {ok:true,message:`${player.name} has joined ${buyer.name}.`,player,seller,buyer,fee:transferFee,salary}
}

function negotiationAskingRange(player, seller, buyer, career) {
  const seed=`${career.seed}:${career.season}:${player.id}:${seller.id}:${buyer.id}`
  const lowerFactor=(player.transferListed ? .88 : .94)+stableUnit(`${seed}:low`)*.1
  const upperFactor=(player.transferListed ? 1.2 : 1.34)+stableUnit(`${seed}:high`)*.26
  const pressure=seller.finances.balance<12000000 ? .025 : 0
  const importance=seller.lineup.gk===player.id||seller.lineup.defs.includes(player.id)||seller.lineup.mids?.includes(player.id)||seller.lineup.atts.includes(player.id)
  const depth=seller.roster.map(id=>career.players[id]).filter(candidate=>positionGroup(candidate)===positionGroup(player)&&candidate.id!==player.id).length
  const yearsRemaining=contractYearsRemaining(career,player)
  const contractLeverage=yearsRemaining>=4?.05:yearsRemaining<=1?-.07:0
  const ageLeverage=player.age<22?.045:player.age>=31?-.05:0
  const potentialLeverage=clamp(((player.potential??player.overall)-player.overall)*.003,0,.06)
  const context=(importance ? .025 : 0)+(depth===0?.045:depth>=3?-.025:0)+contractLeverage+ageLeverage+potentialLeverage
  const reference=player.transferListed?(player.askingPrice??player.marketValue):player.marketValue
  const floor=reference*(lowerFactor-pressure+context)
  const ceiling=reference*(upperFactor-pressure+context)
  return { low:Math.ceil(floor/50000)*50000, high:Math.ceil(Math.max(ceiling,floor+50000)/50000)*50000 }
}

export function beginClubNegotiation(career, playerId, buyerTeamId) {
  migrateCareer(career)
  const player=career.players[playerId], seller=career.teams.find(team=>team.id===player?.teamId), buyer=career.teams.find(team=>team.id===buyerTeamId)
  if(!player||!seller||!buyer||seller.id===buyer.id)return {ok:false,message:'This player is not available to negotiate with.'}
  if(!player.transferListed){if(!(player.releaseClause>0))return {ok:false,message:'This player is not listed and has no release clause. Approach the club through a transfer offer first.'};return beginPlayerNegotiation(career,playerId,buyerTeamId,player.releaseClause,'RELEASE_CLAUSE')}
  if(buyer.roster.length>=25)return {ok:false,message:'Your squad is at its 25-player limit.'}
  const askingRange=negotiationAskingRange(player,seller,buyer,career)
  career.activeNegotiation={playerId,sellerTeamId:seller.id,buyerTeamId:buyer.id,source:'CLUB',stage:'CLUB',askingRange,clubAttemptsRemaining:3,clubOffers:[],clubFeeling:null,agreedFee:null,playerAttemptsRemaining:3,playerOffers:[],playerFeeling:null,agreedContract:null,result:null}
  return {ok:true}
}

export function beginPlayerNegotiation(career, playerId, buyerTeamId, agreedFee = null, source = 'CLUB') {
  migrateCareer(career)
  const player=career.players[playerId], seller=career.teams.find(team=>team.id===player?.teamId), buyer=career.teams.find(team=>team.id===buyerTeamId)
  const fee=Number.isFinite(agreedFee)?agreedFee:player?.releaseClause
  const freeAgent=!seller&&player?.status==='FREE_AGENT';if(!player||(!seller&&!freeAgent)||!buyer||seller?.id===buyer.id)return {ok:false,message:'This player is not available to negotiate with.'}
  if(buyer.roster.length>=25)return {ok:false,message:'Your squad is at its 25-player limit.'}
  if(buyer.transferBudget<fee)return {ok:false,message:'Your transfer budget is below the agreed fee.'}
  career.activeNegotiation={playerId,sellerTeamId:seller?.id??null,buyerTeamId:buyer.id,source:freeAgent?'FREE_AGENT':source,stage:'PLAYER',askingRange:null,clubAttemptsRemaining:source==='CLUB'?career.activeNegotiation?.clubAttemptsRemaining??0:0,clubOffers:career.activeNegotiation?.clubOffers??[],clubFeeling:'HIGH',agreedFee:freeAgent?0:fee,playerAttemptsRemaining:3,playerOffers:[],playerFeeling:null,agreedContract:null,result:null}
  return {ok:true}
}

export function submitClubOffer(career, offer) {
  const negotiation=career.activeNegotiation
  if(!negotiation||!['CLUB','CLUB_COUNTER'].includes(negotiation.stage)||negotiation.clubAttemptsRemaining<=0)return {ok:false,message:'There is no active club negotiation.'}
  const amount=Number(offer)
  if(!Number.isFinite(amount)||!Number.isSafeInteger(amount)||amount<=0||amount>1_000_000_000_000)return {ok:false,message:'Enter a finite, positive transfer amount.'}
  const buyer=career.teams.find(team=>team.id===negotiation.buyerTeamId)
  if(!buyer||amount>buyer.transferBudget)return {ok:false,message:'Your offer is above the available transfer budget.'}
  const submitted={id:`offer-${career.careerDate}-${negotiation.playerId}-${negotiation.clubOffers.length+1}`,amount,status:'WAITING',submittedDate:career.careerDate,responseDueDate:addCareerDays(career.careerDate,2)}
  negotiation.pendingClubOffer=submitted
  negotiation.stage='CLUB_RESPONSE_PENDING'
  career.inbox.unshift({id:`sent-${submitted.id}`,type:'TRANSFER OFFER SENT',date:career.careerDate,offerId:submitted.id,text:`Your €${(amount/1e6).toFixed(2)}M offer for ${career.players[negotiation.playerId]?.name??'the player'} was sent. The club will respond by ${formatCareerDate(submitted.responseDueDate,{month:'short',day:'numeric'})}.`})
  return {ok:true,status:'WAITING',amount,responseDueDate:submitted.responseDueDate}
}

export function acceptClubCounter(career) {
  const negotiation=career.activeNegotiation
  if(!negotiation||negotiation.stage!=='CLUB_COUNTER'||!Number.isFinite(negotiation.clubCounterAmount))return {ok:false,message:'There is no active club counter offer.'}
  negotiation.agreedFee=negotiation.clubCounterAmount
  negotiation.stage='CLUB_AGREED'
  negotiation.clubFeeling='HIGH'
  return {ok:true,fee:negotiation.agreedFee}
}

const SQUAD_ROLES=['Squad Player','Rotation','Regular Starter','Important Player','Key Player']
function desiredSquadRole(player, buyer, career) {
  const positionPlayers=buyer.roster.map(id=>career.players[id]).filter(candidate=>positionGroup(candidate)===positionGroup(player)).map(candidate=>candidate.overall)
  const comparison=positionPlayers.length?Math.max(...positionPlayers):buyer.strength
  return player.overall>=comparison+7?'Important Player':player.overall>=comparison?'Regular Starter':'Rotation'
}

export function submitPlayerOffer(career, offer) {
  const negotiation=career.activeNegotiation
  if(!negotiation||negotiation.stage!=='PLAYER'||negotiation.playerAttemptsRemaining<=0)return {ok:false,message:'There is no active player negotiation.'}
  const player=career.players[negotiation.playerId], buyer=career.teams.find(team=>team.id===negotiation.buyerTeamId)
  const salary=Math.max(0,Math.round(Number(offer?.salaryWeekly)||0)), years=Math.max(1,Math.min(5,Math.round(Number(offer?.years)||0))), squadRole=String(offer?.squadRole??'Rotation'), releaseClause=Math.max(0,Math.round(Number(offer?.releaseClause)||0))
  if(!salary||!years||!SQUAD_ROLES.includes(squadRole))return {ok:false,message:'Enter a valid salary, contract length, and squad role.'}
  const desired=desiredSquadRole(player,buyer,career), desiredIndex=SQUAD_ROLES.indexOf(desired), roleIndex=SQUAD_ROLES.indexOf(squadRole)
  const roleQuality=clamp(1-Math.max(0,desiredIndex-roleIndex)*.22-Math.max(0,roleIndex-desiredIndex-1)*.06,0,1)
  const salaryRatio=salary/Math.max(1000,player.salaryWeekly??player.overall*650)
  const salaryQuality=clamp((salaryRatio-.8)/.72,0,1)
  const lengthQuality=years===3||years===4 ? 1 : years===5 ? .86 : years===2 ? .78 : .55
  const desiredClause=Math.max(player.marketValue*1.2,player.releaseClause*.75)
  const clauseQuality=releaseClause<=0?.45:clamp(1-Math.abs(releaseClause-desiredClause)/Math.max(1,desiredClause*2),0,1)
  const wageRoom=buyer.wageBudget-buyer.wageSpend
  const affordability=salary<=wageRoom?0:clamp((salary-wageRoom)/Math.max(1,buyer.wageBudget)*.65,0,.45)
  let score=clamp(.13+salaryQuality*.51+roleQuality*.19+lengthQuality*.09+clauseQuality*.08-affordability,0,1)
  if(salary>wageRoom)score=Math.min(score,salary>buyer.wageBudget ? .35 : .7)
  const feeling=score>=.73?'HIGH':score>=.45?'MEDIUM':'LOW'
  const remaining=negotiation.playerAttemptsRemaining-1
  negotiation.playerAttemptsRemaining=remaining
  negotiation.playerFeeling=feeling
  const contract={salaryWeekly:salary,years,squadRole,releaseClause:offer?.releaseClause==null?player.releaseClause:releaseClause}
  negotiation.playerOffers.push({...contract,score,feeling})
  if(feeling==='HIGH'){negotiation.stage='PLAYER_HIGH';negotiation.agreedContract=contract}
  else if(remaining===0){negotiation.stage='FAILED';negotiation.result='PLAYER_REJECTED'}
  return {ok:true,feeling,remaining,score}
}

export function finalizeTransfer(career) {
  const negotiation=career.activeNegotiation
  if(!negotiation||negotiation.stage!=='PLAYER_HIGH'||!negotiation.agreedContract)return {ok:false,message:'The player has not accepted the proposed contract.'}
  const result=transferPlayer(career,negotiation.playerId,negotiation.buyerTeamId,negotiation.agreedFee,negotiation.agreedContract)
  if(!result.ok)return result
  negotiation.stage='COMPLETE'; negotiation.result='TRANSFER_COMPLETED'
  career.negotiationHistory.unshift({...negotiation,completedAtSeason:career.season})
  return {ok:true,...result}
}

export function finalizeClubAgreement(career) {
  const negotiation=career.activeNegotiation
  if(!negotiation||negotiation.stage!=='CLUB_HIGH')return {ok:false,message:'The selling club has not agreed to a fee.'}
  const offer=negotiation.clubOffers.at(-1)
  if(!offer)return {ok:false,message:'No club offer has been accepted.'}
  negotiation.agreedFee=offer.amount
  negotiation.stage='CLUB_AGREED'
  return {ok:true}
}

export function startPlayerStage(career) {
  const negotiation=career.activeNegotiation
  if(!negotiation||negotiation.stage!=='CLUB_AGREED')return {ok:false,message:'Confirm the club agreement first.'}
  return beginPlayerNegotiation(career,negotiation.playerId,negotiation.buyerTeamId,negotiation.agreedFee,'CLUB')
}

function boardReviewFor(career, team) {
  const ordered=leagueTable(career,team.leagueId), place=ordered.findIndex(entry=>entry.id===team.id)+1
  const expectation=team.board.expectation
    const domesticMet=expectation==='Challenge for the title'||expectation==='Win the league'?place===1:expectation==='Qualify for Champions League'?place<=4:expectation==='Finish in the top 3'?place<=3:expectation==='Finish in the top 6'?place<=6:expectation==='Finish in the top 10'?place<=10:place<ordered.length-2
  const youngAppearances=team.roster.map(id=>career.players[id]).filter(player=>player.age<=21).reduce((sum,player)=>sum+(player.seasonStats?.appearances??0),0)
  const financialMet=team.finances.seasonIncome-team.finances.seasonExpenses>0
  const youthTarget=team.board.priorities.youth==='HIGH'?5:team.board.priorities.youth==='MEDIUM'?3:1
  return {teamId:team.id,teamName:team.name,season:career.season,objectives:[
    {key:'domestic',label:'Domestic Success',target:expectation,result:`${place}${place===1?'st':place===2?'nd':place===3?'rd':'th'} place`,status:domesticMet?'ACHIEVED':'NOT ACHIEVED',active:true},
    {key:'financial',label:'Financial Profit',target:'Finish with positive finances',result:`€${((team.finances.seasonIncome-team.finances.seasonExpenses)/1000000).toFixed(2)}M`,status:financialMet?'ACHIEVED':'NOT ACHIEVED',active:true},
    {key:'youth',label:'Youth Development',target:`Give U21 players ${youthTarget}+ appearances`,result:`${youngAppearances} appearances`,status:youngAppearances>=youthTarget?'ACHIEVED':'NOT ACHIEVED',active:true},
    {key:'continental',label:'Continental Success',target:'Future objective · no active competition',result:'Not assessed this season',status:'FUTURE',active:false},
  ],place,youngAppearances,financialResult:team.finances.seasonIncome-team.finances.seasonExpenses}
}

function calculateNextResources(team, review) {
  const balance=Math.max(0,team.finances.balance)
  const financialCapacity=clamp(balance/36000000,.45,1.35)
  const reputation=clamp((team.strength??70)/75,.88,1.08)
  const seasonPerformance=review.place===1 ? 1.12 : review.place<=3 ? 1.04 : review.place===6 ? .88 : .96
  const priorFinancial=clamp(1+(team.finances.previousSeasonProfit??0)/80000000,.88,1.12)
  const domesticPriority=team.board.priorities.domestic==='HIGH' ? 1.04 : team.board.priorities.domestic==='LOW' ? .96 : 1
  const financialPriority=team.board.priorities.financial==='HIGH' ? .96 : team.board.priorities.financial==='LOW' ? 1.03 : 1
  const gross=Math.round((1500000+balance*.065+(team.strength??70)*42000)*financialCapacity*reputation*seasonPerformance*priorFinancial*domesticPriority*financialPriority/100000)*100000
  const developmentShare=team.board.priorities.youth==='HIGH' ? .22 : team.board.priorities.youth==='MEDIUM' ? .14 : .08
  const developmentBudget=Math.round(gross*developmentShare/50000)*50000
  const transferBudget=Math.max(500000,gross-developmentBudget)
  const wageBudget=Math.max(Math.round(team.wageSpend*1.12/10000)*10000,Math.round(team.wageBudget*(review.place<=3?1.05:.98)/10000)*10000)
  return {transferBudget, wageBudget, developmentBudget}
}

export function conductBoardReview(career) {
  if(!career.fixtures.every(fixture=>fixture.status==='played'))return {ok:false,message:'The Board review is available after all season fixtures are complete.'}
  if(career.lastBoardReview?.season===career.season)return {ok:true,review:career.lastBoardReview}
  const reviews=[]
  for(const team of career.teams){
    team.finances.seasonExpenses+=team.wageSpend*5
    team.finances.balance-=team.wageSpend*5
    team.finances.seasonProfit=team.finances.seasonIncome-team.finances.seasonExpenses
    const review=boardReviewFor(career,team)
    team.finances.previousSeasonProfit=team.finances.seasonProfit
    team.board.objectives=review.objectives
    review.resources=calculateNextResources(team,review)
    team.transferBudget=review.resources.transferBudget
    team.wageBudget=review.resources.wageBudget
    reviews.push(review)
  }
  career.lastBoardReview={season:career.season,teamReviews:reviews}
  career.boardReviews.unshift(career.lastBoardReview)
  return {ok:true,review:career.lastBoardReview}
}

export function startNextSeason(career) {
  if(!career.fixtures.every(fixture=>fixture.status==='played'))return {ok:false,message:'The current season is not complete.'}
  if(career.lastBoardReview?.season!==career.season)conductBoardReview(career)
  career.playerSeasonClubStats??=[]
  for(const player of Object.values(career.players))closePlayerSeasonClubSegment(career,player.id,career.careerDate)
  career.season++
  career.currentMatchday=1
  career.fixtures=makeFixtures(career.teams,career.season,career.careerDate)
  career.teams.forEach(team=>{
    team.table={played:0,wins:0,draws:0,losses:0,gf:0,ga:0,points:0}
    team.finances.seasonIncome=0;team.finances.seasonExpenses=0;team.finances.seasonProfit=0
    team.board.expectation=createBoard(team).expectation;team.board.negotiationUsed=false;team.board.fired=false;team.board.confidence=Math.max(45,team.board.confidence??70)
    team.board.objectives=[]
  })
  Object.values(career.players).forEach(player=>{player.seasonStats=blankSeasonStats();player.appearances=0;const expiry=player.contractExpiryDate??dateFromExpirySeason(career,player.contractExpiry);const days=Math.ceil((utcDate(expiry)-utcDate(career.careerDate))/86400000);player.contractStatus=days<=0?'Expired':days<=30?'Expiring Soon':'Active';player.fitness=Math.min(100,(player.fitness??80)+15)})
  career.lastResult=null;career.currentMatchFixtureId=null
  return {ok:true,season:career.season}
}
