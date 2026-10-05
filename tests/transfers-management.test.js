import test from 'node:test'
import assert from 'node:assert/strict'
import { createCareer, beginLoanNegotiation, beginClubNegotiation, extendPlayerContract, setPlayerAskingPrice, setPlayerLoanListed, setPlayerTransferListed, shortlistPlayer, removeFromShortlist, respondToLoanOption, saveCareer, loadCareer, simulateCareerToSeasonEnd } from '../src/management/career.js'
import { tacticalRoleForSlot } from '../src/simulation/team.js'

function setup(){
  const career=createCareer(914,'premier-league')
  const [club,other]=career.teams
  career.managedTeamId=club.id
  const player=club.roster.map(id=>career.players[id]).find(item=>item.position!=='GK')
  return {career,club,other,player}
}

test('custom asking price is retained independently from market value and listing state',()=>{
  const {career,player}=setup()
  const askingPrice=Math.max(1,Math.round(player.marketValue*.73))
  assert.equal(setPlayerAskingPrice(career,player.id,askingPrice).ok,true)
  assert.equal(setPlayerTransferListed(career,player.id,true).ok,true)
  assert.equal(player.askingPrice,askingPrice)
  assert.equal(setPlayerTransferListed(career,player.id,false).ok,true)
  assert.equal(player.transferListed,false)
  assert.equal(player.askingPrice,askingPrice)
})

test('shortlist is a player reference, independent from transfer listing, and removable',()=>{
  const {career,player}=setup()
  assert.equal(shortlistPlayer(career,player.id).ok,true)
  assert.equal(shortlistPlayer(career,player.id).ok,true)
  assert.equal(player.transferListed,false)
  assert.equal(career.shortlist.filter(item=>item.playerId===player.id).length,1)
  assert.equal(removeFromShortlist(career,player.id).shortlisted,false)
  assert.equal(career.shortlist.some(item=>item.playerId===player.id),false)
})

test('loan offer defaults use listing wage coverage and no market-value loan fee',()=>{
  const {career,club,other,player}=setup()
  const terms={loanFee:175000,wageContribution:85,duration:1,optionToBuy:player.marketValue*1.2}
  assert.equal(setPlayerLoanListed(career,player.id,true,terms).ok,true)
  const negotiation=beginLoanNegotiation(career,player.id,other.id)
  assert.equal(negotiation.ok,true)
  assert.equal(negotiation.negotiation.loanFee,175000)
  assert.equal(negotiation.negotiation.wageContribution,85)
  assert.equal(negotiation.negotiation.optionToBuy,terms.optionToBuy)
})

test('contract renewal cancels a pending release-clause decision',()=>{
  const {career,player}=setup()
  career.transferOffers=[{id:'release-test',playerId:player.id,releaseClauseTriggered:true,status:'RELEASE_CLAUSE_PENDING'}]
  const result=extendPlayerContract(career,player.id,4)
  assert.equal(result.ok,true)
  assert.equal(result.releaseOffersCancelled,1)
  assert.equal(career.transferOffers[0].status,'CANCELLED')
  assert.ok(career.inbox.some(item=>item.type==='CONTRACT RENEWED'&&item.playerId===player.id))
})

test('exercising a loan option converts the same player into a permanent player',()=>{
  const {career,club,other,player}=setup()
  club.transferBudget=500_000_000;other.transferBudget=500_000_000;club.wageBudget=100_000_000;other.wageBudget=100_000_000
  club.roster=club.roster.filter(id=>id!==player.id);other.roster.push(player.id);player.teamId=other.id;player.loanId='option-loan';player.loanParentClubId=club.id
  career.loans=[{id:'option-loan',playerId:player.id,fromClubId:club.id,toClubId:other.id,status:'OPTION_PENDING',optionToBuy:2_000_000,wageContribution:70,endDate:career.careerDate}]
  career.managedTeamId=other.id
  const result=respondToLoanOption(career,'option-loan',true)
  assert.equal(result.ok,true)
  assert.equal(player.id,career.loans[0].playerId)
  assert.equal(player.teamId,other.id)
  assert.equal(player.status,'CONTRACTED')
  assert.equal(player.loanId,undefined)
  assert.equal(career.loans[0].status,'CONVERTED')
  assert.equal(career.transferHistory.at(0).transferType,'PERMANENT')
})

test('listing, shortlist, pending offers, and loan terms survive save and load',()=>{
  const {career,player}=setup()
  const prior=globalThis.localStorage,storage=new Map()
  globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}
  try{
    const managed=career.teams.find(team=>team.id===career.managedTeamId)
    managed.formation='4-3-3 (2)';managed.lineup.atts.push(managed.lineup.mids.pop())
    setPlayerAskingPrice(career,player.id,Math.round(player.marketValue*.9));setPlayerTransferListed(career,player.id,true)
    setPlayerLoanListed(career,player.id,true,{loanFee:125000,wageContribution:82,duration:1,optionToBuy:player.marketValue})
    shortlistPlayer(career,player.id);career.transferOffers=[{id:'save-transfer',playerId:player.id,status:'PENDING'}];career.loanOffers=[{id:'save-loan',playerId:player.id,status:'PENDING'}]
    assert.equal(saveCareer(career,1),true)
    const loaded=loadCareer(1).career,copy=loaded.players[player.id]
    assert.equal(copy.transferListed,true);assert.equal(copy.askingPrice,player.askingPrice);assert.equal(copy.loanListed,true);assert.equal(copy.loanListing.wageContribution,82)
    assert.ok(loaded.shortlist.some(item=>item.playerId===player.id));assert.equal(loaded.transferOffers[0].id,'save-transfer');assert.equal(loaded.loanOffers[0].id,'save-loan')
    assert.equal(loaded.teams.find(team=>team.id===loaded.managedTeamId).formation,'4-3-3 (2)')
  }finally{if(prior===undefined)delete globalThis.localStorage;else globalThis.localStorage=prior}
})

test('shortlist removal leaves transfer and loan listing state unchanged',()=>{
  const {career,other,player}=setup()
  player.teamId=other.id
  assert.equal(setPlayerTransferListed(career,player.id,true).ok,true)
  assert.equal(setPlayerLoanListed(career,player.id,true,{duration:1}).ok,true)
  shortlistPlayer(career,player.id)
  removeFromShortlist(career,player.id)
  assert.equal(player.transferListed,true)
  assert.equal(player.loanListed,true)
})

test('unlisted shortlisted player uses the existing release-clause negotiation path',()=>{
  const {career,other,player}=setup()
  player.teamId=other.id;player.transferListed=false
  career.teams.find(team=>team.id===career.managedTeamId).transferBudget=1_000_000_000
  const result=beginClubNegotiation(career,player.id,career.managedTeamId)
  assert.equal(result.ok,true)
  assert.equal(career.activeNegotiation.source,'RELEASE_CLAUSE')
  assert.equal(career.activeNegotiation.agreedFee,player.releaseClause)
})

test('full career simulation rolls over once and archives the completed season',async()=>{
  const career=createCareer(218,'premier-league')
  career.managedTeamId=career.teams[0].id
  career.careerDate=career.fixtures[0].scheduledDate
  const firstSeasonFixtures=career.fixtures.slice()
  const fixtureIds=new Set(firstSeasonFixtures.map(fixture=>fixture.id))
  assert.equal(fixtureIds.size,firstSeasonFixtures.length)
  const result=await simulateCareerToSeasonEnd(career)
  assert.equal(result.ok,true)
  assert.equal(result.completedSeason,1)
  assert.equal(career.season,2)
  assert.equal(career.seasonHistory[0].season,1)
  assert.equal(career.fixtures.some(fixture=>fixture.season===2&&fixture.status==='scheduled'),true)
  assert.equal(new Set(career.completedMatches.map(match=>match.fixtureId)).size,firstSeasonFixtures.length)
  for(const fixture of firstSeasonFixtures){
    assert.ok(fixture.result.homeGoals>=0&&fixture.result.awayGoals>=0)
    const stats=fixture.result.statistics?.teams
    if(stats){for(const side of ['home','away'])assert.ok(stats[side].goals<=stats[side].shotsOnTarget&&stats[side].shotsOnTarget<=stats[side].shots)}
  }
})

test('4-3-3 variants assign meaningfully different tactical positions',()=>{
  assert.deepEqual([0,1,2].map(index=>tacticalRoleForSlot('4-3-3','midfield',index)),['LCM','CM','RCM'])
  assert.deepEqual([0,1,2].map(index=>tacticalRoleForSlot('4-3-3 (2)','midfield',index)),['LDM','CM','CAM'])
  assert.deepEqual([0,1,2].map(index=>tacticalRoleForSlot('4-3-3 (3)','midfield',index)),['DM','LCM','RCM'])
})
