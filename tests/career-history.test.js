import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createCareer, migrateCareer, playerSeasonTotals, recordPlayerMatchStats, saveCareer, loadCareer,
  completeSeason, startNextSeason, transferPlayer,
} from '../src/management/career.js'

function setup(seed=71){
  const career=createCareer(seed,'premier-league')
  const [clubA,clubB,clubC]=career.teams
  for(const club of [clubA,clubB,clubC]){club.transferBudget=500_000_000;club.wageBudget=100_000_000}
  const player=clubA.roster.map(id=>career.players[id]).find(candidate=>candidate.position!=='GK')
  return {career,clubA,clubB,clubC,player}
}
function match(career,player,{goals=0,assists=0,minutes=90}={}){
  recordPlayerMatchStats(career,player,{appearances:1,minutes,goals,assists,shots:goals+2,shotsOnTarget:goals+1,passesAttempted:20,passesCompleted:16,successfulTackles:1,rating:7.5})
}
function move(career,player,club){const result=transferPlayer(career,player.id,club.id,1_000_000);assert.equal(result.ok,true,result.message)}
function finishSeason(career){career.fixtures.forEach(fixture=>{fixture.status='played'});assert.equal(completeSeason(career).ok,true);career.careerDate=career.offSeason.startDate;assert.equal(startNextSeason(career).ok,true)}

test('no transfer keeps a full-season club segment and matching total',()=>{
  const {career,clubA,player}=setup()
  match(career,player,{goals:2,assists:1});match(career,player,{goals:1})
  finishSeason(career)
  const result=playerSeasonTotals(career,player.id,1)
  assert.equal(result.segments.length,1)
  assert.equal(result.segments[0].clubId,clubA.id)
  assert.equal(result.stats.appearances,2);assert.equal(result.stats.goals,3);assert.equal(result.stats.assists,1)
})

test('one transfer splits club stats and retains event history and identity',()=>{
  const {career,clubA,clubB,player}=setup(72),id=player.playerId
  match(career,player,{goals:2,assists:1});move(career,player,clubB);match(career,player,{goals:3,assists:2})
  finishSeason(career)
  const result=playerSeasonTotals(career,id,1),byClub=Object.fromEntries(result.segments.map(item=>[item.clubId,item.stats]))
  assert.equal(byClub[clubA.id].goals,2);assert.equal(byClub[clubA.id].appearances,1)
  assert.equal(byClub[clubB.id].goals,3);assert.equal(byClub[clubB.id].appearances,1)
  assert.equal(result.stats.goals,5);assert.equal(result.stats.assists,3)
  assert.equal(career.transferHistory.filter(item=>item.playerId===id&&item.toClubId===clubB.id).length,1)
  assert.equal(player.playerId,id);assert.deepEqual(career.teams.filter(club=>club.roster.includes(id)).map(club=>club.id),[clubB.id])
})

test('two transfers produce three club segments whose stats sum to the season total',()=>{
  const {career,clubA,clubB,clubC,player}=setup(73)
  match(career,player,{goals:1});move(career,player,clubB);match(career,player,{goals:2,assists:1});move(career,player,clubC);match(career,player,{goals:4,assists:2})
  finishSeason(career)
  const result=playerSeasonTotals(career,player.id,1)
  assert.deepEqual(result.segments.map(item=>item.clubId),[clubA.id,clubB.id,clubC.id])
  assert.equal(result.stats.appearances,result.segments.reduce((sum,item)=>sum+item.stats.appearances,0))
  assert.equal(result.stats.goals,7);assert.equal(result.stats.assists,3)
  for(const [field,total] of Object.entries(result.stats))if(field!=='lastMatchRating'&&typeof total==='number')assert.equal(result.segments.reduce((sum,item)=>sum+(item.stats[field]??0),0),total,`${field} total should equal the club segments`)
  assert.equal(career.transferHistory.filter(item=>item.playerId===player.id).length,2)
})

test('late transfer leaves old stats with the old club and gives the new club only later stats',()=>{
  const {career,clubA,clubB,player}=setup(74)
  match(career,player,{goals:5,assists:2});career.careerDate='2026-01-30';move(career,player,clubB);finishSeason(career)
  const result=playerSeasonTotals(career,player.id,1)
  assert.equal(result.segments.find(item=>item.clubId===clubA.id).stats.goals,5)
  assert.equal(result.segments.find(item=>item.clubId===clubB.id).stats.goals,0)
  assert.equal(result.stats.goals,5)
})

test('seasons remain independent and saved history survives save/load',()=>{
  const {career,clubA,clubB,player}=setup(75)
  match(career,player,{goals:3});finishSeason(career)
  career.careerDate='2026-08-01';move(career,player,clubB);match(career,player,{goals:4,assists:1});finishSeason(career)
  assert.equal(playerSeasonTotals(career,player.id,1).stats.goals,3)
  assert.equal(playerSeasonTotals(career,player.id,2).stats.goals,4)
  assert.equal(playerSeasonTotals(career,player.id,2).segments[0].clubId,clubB.id)
  assert.equal(career.transferHistory.at(-1).fromClubId,clubA.id)
  const prior=globalThis.localStorage
  const storage=new Map();globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}
  try{career.managedTeamId=clubB.id;assert.equal(saveCareer(career,1),true);const loaded=loadCareer(1);assert.equal(loaded.error,null);assert.equal(playerSeasonTotals(loaded.career,player.id,1).stats.goals,3);assert.equal(playerSeasonTotals(loaded.career,player.id,2).stats.goals,4)}finally{if(prior===undefined)delete globalThis.localStorage;else globalThis.localStorage=prior}
})

test('older single-club career-history saves migrate without losing their stored totals',()=>{
  const {career,clubA,player}=setup(76)
  career.saveVersion=9;career.playerSeasonHistory={[player.id]:[{seasonId:1,clubId:clubA.id,stats:{appearances:12,minutes:1080,goals:5,assists:2,ratingTotal:84,ratingMatches:12}}]}
  delete career.playerSeasonClubStats
  migrateCareer(career)
  const migrated=playerSeasonTotals(career,player.id,1)
  assert.equal(migrated.segments.length,1);assert.equal(migrated.segments[0].clubId,clubA.id)
  assert.equal(migrated.stats.appearances,12);assert.equal(migrated.stats.goals,5);assert.equal(migrated.stats.assists,2)
})
