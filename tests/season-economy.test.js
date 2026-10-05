import test from 'node:test'
import assert from 'node:assert/strict'
import { calculatePlayerMarketValue, conductBoardReview, createCareer, loadCareer, saveCareer, simulateCareerToSeasonEnd } from '../src/management/career.js'

test('market valuation reflects quality, upside, age and club tier',()=>{
  const club={strength:82}
  const base={overall:72,potential:72,age:29,contractYears:2}
  const highPotential=calculatePlayerMarketValue({...base,potential:90,age:19},club)
  const ordinary=calculatePlayerMarketValue(base,club)
  const elite=calculatePlayerMarketValue({...base,overall:90,potential:94,age:25,contractYears:4},club)
  assert.ok(highPotential>ordinary)
  assert.ok(elite>highPotential)
  assert.ok(calculatePlayerMarketValue(base,{strength:82})>calculatePlayerMarketValue(base,{strength:64}))
})

test('clubs receive different financial scales and categorized persistent ledgers',()=>{
  const career=createCareer(821,'premier-league')
  const teams=[...career.teams].sort((a,b)=>b.strength-a.strength)
  assert.ok(teams[0].transferBudget>teams.at(-1).transferBudget)
  assert.ok(teams[0].finances.categories)
  assert.ok(Array.isArray(teams[0].finances.transactions))
})

test('board confidence responds deterministically to finishing position against expectations',()=>{
  const run=champion=>{
    const career=createCareer(921,'premier-league'),target=career.teams[0]
    career.fixtures.forEach(fixture=>fixture.status='played')
    target.board.expectation='Win the league'
    for(const team of career.teams)team.table={played:38,wins:10,draws:0,losses:28,gf:25,ga:80,points:30}
    target.table=champion?{played:38,wins:32,draws:4,losses:2,gf:90,ga:20,points:100}:{played:38,wins:4,draws:6,losses:28,gf:20,ga:90,points:18}
    const before=target.board.confidence
    assert.equal(conductBoardReview(career).ok,true)
    return {before,after:target.board.confidence,review:career.lastBoardReview.teamReviews.find(item=>item.teamId===target.id)}
  }
  const success=run(true),failure=run(false)
  assert.ok(success.after>success.before)
  assert.ok(failure.after<failure.before)
  assert.ok(success.review.objectives.some(item=>item.key.startsWith('vision-')))
})

test('Sim to End archives season standings, stats and finances before creating season two',async()=>{
  const career=createCareer(293,'premier-league')
  career.managedTeamId=career.teams[0].id
  const player=career.players[career.teams[0].roster[0]]
  player.seasonStats.appearances=2
  career.playerSeasonClubStats??=[]
  career.playerSeasonClubStats.push({segmentId:'test-season-player',playerId:player.id,seasonId:1,clubId:player.teamId,startDate:career.careerDate,endDate:null,stats:{...player.seasonStats}})
  career.fixtures=career.fixtures.slice(0,1)
  career.fixtures[0].scheduledDate=career.careerDate
  const before=career.teams[0].board.confidence
  const result=await simulateCareerToSeasonEnd(career)
  assert.equal(result.ok,true)
  assert.equal(career.season,2)
  assert.equal(career.seasonHistory[0].season,1)
  assert.equal(career.seasonHistory[0].standings.length,career.teams.length)
  assert.equal(career.seasonHistory[0].playerStats.find(item=>item.playerId===player.id)?.stats.appearances,3)
  assert.equal(player.seasonStats.appearances,0)
  assert.notEqual(career.teams[0].board.confidence,before)
  assert.ok(career.teams[0].finances.transactions.some(item=>item.category==='wages'))
  assert.ok(career.teams[0].finances.transactions.some(item=>item.category==='sponsorship'))
  assert.equal(career.fixtures.every(item=>item.season===2&&item.status==='scheduled'),true)
  const prior=globalThis.localStorage,store=new Map()
  globalThis.localStorage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)}
  try{
    assert.equal(saveCareer(career,4),true)
    const loaded=loadCareer(4).career
    assert.equal(loaded.seasonHistory[0].season,1)
    assert.deepEqual(loaded.teams[0].finances.transactions,career.teams[0].finances.transactions)
    assert.deepEqual(loaded.teams[0].board.vision,career.teams[0].board.vision)
  }finally{if(prior===undefined)delete globalThis.localStorage;else globalThis.localStorage=prior}
})
