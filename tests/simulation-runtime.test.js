import test from 'node:test'
import assert from 'node:assert/strict'
import { createMatch, simulateToEnd } from '../src/simulation/engine.js'

test('in-match sim to end reaches full time using consistent team and player totals',()=>{
  const match=simulateToEnd(createMatch(4242))
  assert.equal(match.phase,'fulltime')
  assert.equal(match.minute,90)
  for(const side of ['home','away']){
    const stats=match.statistics.teams[side]
    assert.ok(stats.goals<=stats.shotsOnTarget)
    assert.ok(stats.shotsOnTarget<=stats.shots)
    const playerIds=new Set([...(side==='home'?match.players:match.opponents),match.goalkeepers[side],...(match.substitutes[side]??[])].map(player=>player.id))
    const players=[...playerIds].map(id=>match.statistics.players[id]).filter(Boolean)
    assert.equal(players.reduce((sum,line)=>sum+line.goals,0),stats.goals)
    assert.equal(players.reduce((sum,line)=>sum+line.shots,0),stats.shots)
  }
})
