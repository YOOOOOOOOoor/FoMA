import { tacticsFor } from './tactics.js'
import { formationTarget, maximumPositionalDeviation, opponentTeam, playersForTeam, teamContext, teamDirection, teamProgress } from './team.js'

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value))
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
function distanceToSegment(point, start, end) {
  const dx=end.x-start.x, dy=end.y-start.y
  const t=clamp(((point.x-start.x)*dx+(point.y-start.y)*dy)/(dx*dx+dy*dy||1))
  return distance(point,{x:start.x+t*dx,y:start.y+t*dy})
}
const plan=(state,target,reason,targetPlayerId=null,scores={})=>({state,intent:state,target,reason,targetPlayerId,scores})

export function perceiveDefender(match, defender, carrier=null) {
  const rival=opponentTeam(defender.team), teammate=carrier?playersForTeam(match,rival).find(p=>p.id!==carrier.id)??null:null
  const ownGoal=teamContext(match,defender.team).ownGoalX
  return {position:{x:defender.x,y:defender.y},velocity:{x:defender.vx,y:defender.vy},ballPosition:{x:match.ball.x,y:match.ball.y},ballVelocity:{x:match.ball.vx,y:match.ball.vy},distanceToBall:distance(defender,match.ball),distanceToCarrier:carrier?distance(defender,carrier):Infinity,distanceToOwnGoal:Math.hypot(defender.x-ownGoal,defender.y-.5),carrierPosition:carrier?{x:carrier.x,y:carrier.y}:null,teammatePosition:teammate?{x:teammate.x,y:teammate.y}:null,goalSide:carrier?teamProgress(match,defender.team,defender.x)<teamProgress(match,defender.team,carrier.x):false,shootingLaneDistance:carrier?distanceToSegment(defender,carrier,{x:ownGoal,y:.5}):Infinity,passLaneDistance:carrier&&teammate?distanceToSegment(defender,carrier,teammate):Infinity,zone:!carrier?'SHAPE':Math.abs(carrier.x-ownGoal)<.42?'DEFENSIVE_AREA':Math.abs(carrier.x-ownGoal)<.68?'MID_DEFENSIVE_AREA':'PRESSING_AREA',carrierId:carrier?.id??null}
}

function reachablePassPoint(match,defender,attackingTeam) {
  const ball=match.ball
  if(ball.state!=='pass'||!ball.targetId||ball.team!==attackingTeam)return null
  const receiver=playersForTeam(match,attackingTeam).find(p=>p.id===ball.targetId), speed=Math.hypot(ball.vx,ball.vy)
  if(!receiver||speed<.08)return null
  const flight=Math.hypot(ball.targetX-ball.x,ball.targetY-ball.y)/speed, maxTime=Math.min(1.1,flight-.16)
  if(distanceToSegment(defender,ball,{x:ball.targetX,y:ball.targetY})>.035)return null
  const defenderSpeed=(.075+defender.attributes.PAC*.00062)*(.76+defender.fitness*.0024)
  for(let time=.07;time<=maxTime;time+=.05){const point={x:ball.x+ball.vx*time,y:ball.y+ball.vy*time},reach=Math.min(defenderSpeed*time,.5*.55*time*time+.008);if(distance(defender,point)<=reach&&distance(receiver,point)>.07)return point}
  return null
}
function goalSidePosition(match,carrier,defendingTeam,gap){
  const direction=teamDirection(match,defendingTeam), x=clamp(carrier.x-direction*gap,.04,.96), ownGoal=teamContext(match,defendingTeam).ownGoalX
  const t=clamp(Math.abs(x-ownGoal)/Math.max(.08,Math.abs(carrier.x-ownGoal)))
  return {x,y:clamp(.5+(carrier.y-.5)*t,.08,.92)}
}
function primaryPlan(match,defender,carrier,defendingTeam){
  const p=defender.perception,tactics=tacticsFor(match,defendingTeam),direction=teamDirection(match,defendingTeam),ownGoal=teamContext(match,defendingTeam).ownGoalX
  const gap=Math.max(.045,(p.zone==='DEFENSIVE_AREA'?.07:p.zone==='MID_DEFENSIVE_AREA'?.11:.17)+(tactics.defensiveLine==='high'?-.025:tactics.defensiveLine==='low'?.04:0))
  const goalTarget=goalSidePosition(match,carrier,defendingTeam,gap),space=carrier.perception?.availableSpace??1
  const angle=Math.abs(Math.atan2(carrier.y-.5,Math.abs(ownGoal-carrier.x))),laneThreat=angle<.85&&Math.abs(ownGoal-carrier.x)<.42
  const progressing=carrier.vx*-direction>.025||Math.abs(ownGoal-carrier.x)<.28
  const frontPress=FRONT_ROLES.has(roleOf(defender))&&tactics.defensiveApproach!=='low_block'
  const dangerous=p.zone==='PRESSING_AREA'?frontPress:laneThreat||(progressing&&space>.38)||(p.zone==='MID_DEFENSIVE_AREA'&&space>.62),d=p.distanceToCarrier
  const carrierHasPassedDefender=teamProgress(match,defendingTeam,carrier.x)<teamProgress(match,defendingTeam,defender.x)-.035
  if(carrierHasPassedDefender&&!(frontPress&&tactics.defensiveApproach==='high_press'&&p.zone!=='DEFENSIVE_AREA')){const canRecover=d<.22,shape=formationTarget(match,defender);return plan('RECOVER',canRecover?goalSidePosition(match,carrier,defendingTeam,.045):{x:ownGoal-direction*.08,y:shape?.y??.5},canRecover?'Recover goal-side while the attacker remains reachable':'Recover toward the defensive shape',carrier.id,{RECOVER:canRecover?82:66})}
  const carrierName=teamContext(match,carrier.team).name
  // Set the challenge window wider than the containment stand-off. Previously
  // the defender stopped at ~.075 while a challenge required <.037, so a
  // goal-side defender could contain forever without ever contesting the ball.
  if(p.zone!=='PRESSING_AREA'&&d<=.061&&p.distanceToBall<=.068&&(p.goalSide||p.distanceToBall<=.055)&&match.elapsed>=(defender.challengeReadyAt??0))return plan('CHALLENGE',{x:carrier.x-direction*.018,y:carrier.y},'Step in and challenge '+carrierName+' #'+carrier.number+' for the ball',carrier.id,{CHALLENGE:88})
  if(p.zone!=='PRESSING_AREA'&&d<=.105)return plan('CONTAIN',goalSidePosition(match,carrier,defendingTeam,.045),'Contain '+carrierName+' #'+carrier.number+' while staying goal-side',carrier.id,{CONTAIN:84})
  const pressRange=(p.zone==='DEFENSIVE_AREA'?.34:p.zone==='MID_DEFENSIVE_AREA'?.28:.21)+(tactics.defensiveApproach==='high_press'?.05:tactics.defensiveApproach==='low_block'?-.045:0)-(100-(defender.fitness??100))*.0003
  const pressureTarget=frontPress?{x:clamp(carrier.x-direction*.07,.04,.96),y:carrier.y}:goalTarget
  if(dangerous&&d<=pressRange)return plan('PRESS',pressureTarget,'Close down '+carrierName+' #'+carrier.number+' while protecting goal-side space',carrier.id,{PRESS:laneThreat?86:74})
  const shape=formationTarget(match,defender)??{x:ownGoal-direction*.22,y:.5},ballProgress=teamProgress(match,defendingTeam,match.ball.x)
  return plan('DEFEND_SHAPE',{x:clamp(shape.x+direction*(ballProgress>.45?.08:.02),.04,.96),y:clamp(.5+(carrier.y-.5)*.28,.12,.88)},'Hold the formation goal-side against '+carrierName+' #'+carrier.number,carrier.id,{DEFEND_SHAPE:70})
}
function coverPlan(match,defender,primary,carrier,teammate,defendingTeam){
  const direction=teamDirection(match,defendingTeam),shape=formationTarget(match,defender,'defending')??{x:teamContext(match,defendingTeam).ownGoalX,y:.5}
  const role=roleOf(defender),ballSideDistance=Math.abs(defender.y-carrier.y)
  const gap=teamProgress(match,defendingTeam,carrier.x)-teamProgress(match,defendingTeam,shape.x)
  const attackingTeam=opponentTeam(defendingTeam),deepThreat=teamProgress(match,attackingTeam,carrier.x)>=.68
  const centralThreat=Math.abs(carrier.y-.5)<.31
  const laneTarget=deepThreat&&centralThreat
    ?{x:carrier.x-direction*.19,y:clamp(.5+(carrier.y-.5)*.3,.25,.75)}
    :teammate?{x:carrier.x+(teammate.x-carrier.x)*.48,y:carrier.y+(teammate.y-carrier.y)*.48}:goalSidePosition(match,carrier,defendingTeam,.12)
  const roleShift=['CB','LCB','RCB','DM','LDM','RDM','CM','LCM','RCM','CAM'].includes(role)?.62:.76
  const max=deepThreat?Math.max(.14,maximumPositionalDeviation(defender)*1.4):maximumPositionalDeviation(defender)*roleShift
  const targetY=deepThreat&&centralThreat?laneTarget.y:shape.y+clamp((laneTarget.y-shape.y)*.55,-max,max)
  const target={x:clamp(shape.x+clamp((laneTarget.x-shape.x)*.5,-max,max),shape.x-max,shape.x+max),y:clamp(targetY,.08,.92)}
  const coverLabel=teammate?`${teamContext(match,teammate.team).name} #${teammate.number}`:'the central passing lane'
  return {...plan('COVER',target,'Support the press by screening '+coverLabel,teammate?.id??carrier.id,{COVER:82,DEFEND_SHAPE:70,INTERCEPT:58}),responsibility:'COVER_SPACE',recoveryTarget:shape,coverGap:gap,ballSideDistance}
}

const FRONT_ROLES=new Set(['ST','LW','RW','LAM','CAM','RAM','LM','RM'])
const MID_ROLES=new Set(['CM','LCM','RCM','DM','LDM','RDM','LM','RM','LW','RW','LB','RB','LWB','RWB'])
const DEEP_ROLES=new Set(['CB','LCB','RCB','LB','RB','LWB','RWB','DM','LDM','RDM'])
function roleOf(player){
  if(player.tacticalRole)return player.tacticalRole
  const slot=player.formationSlot
  if(slot?.line==='defense')return slot.index===0?'LB':slot.index===(slot.count??4)-1?'RB':'CB'
  if(slot?.line==='attack')return 'ST'
  if(slot?.line==='midfield')return 'CM'
  return player.role?.startsWith('DEFENDER')?'CB':'CM'
}
function roleFit(player,zone,wide,tactics){
  const role=roleOf(player)
  if(zone==='PRESSING_AREA'){
    if(FRONT_ROLES.has(role))return role==='ST'||role==='CAM'?.045:.025
    if(tactics.defensiveApproach==='high_press'&&MID_ROLES.has(role))return -.025
    return null
  }
  if(zone==='MID_DEFENSIVE_AREA'){
    if(MID_ROLES.has(role))return role==='CM'||role==='LCM'||role==='RCM'||role==='DM'||role==='LDM'||role==='RDM'?.04:.015
    // The three advanced midfield roles in 4-2-3-1 cannot be left idle when
    // play enters the middle block. They press selectively from their high
    // starting lanes while the double pivot and back four keep cover.
    if(['LAM','CAM','RAM'].includes(role))return role==='CAM'?.055:.07
    if(tactics.defensiveApproach==='high_press'&&FRONT_ROLES.has(role))return -.035
    return null
  }
  if(DEEP_ROLES.has(role)){
    if(wide&&['CB','LCB','RCB'].includes(role))return -.025
    if(['CB','LCB','RCB','DM','LDM','RDM'].includes(role))return .045
    return .025
  }
  return null
}
function shapePlan(match,player,carrier,defendingTeam){
  const shape=formationTarget(match,player,'defending')??{x:teamContext(match,defendingTeam).ownGoalX,y:.5}
  const role=roleOf(player),wide=Math.abs(carrier.y-.5)>.28
  const farSide=Math.abs(shape.y-carrier.y)>.31
  let y=shape.y
  if(wide&&farSide)y+=(.5-shape.y)*.09
  else y+=(carrier.y-.5)*(['CB','LCB','RCB','DM','LDM','RDM'].includes(role)?.13:.2)
  // Defending lines move as a unit toward their own goal as the ball advances.
  // This keeps the central block connected instead of leaving static gaps.
  const attackingTeam=opponentTeam(defendingTeam)
  const progress=teamProgress(match,attackingTeam,carrier.x)
  const lineDrop=clamp((progress-.34)*.24,0,.12)
  const tactics=tacticsFor(match,defendingTeam)
  const runnerBehind=playersForTeam(match,attackingTeam).some(attacker=>attacker.id!==carrier.id&&
    teamProgress(match,attackingTeam,attacker.x)>teamProgress(match,attackingTeam,player.x)+.025&&
    (attacker.vx*teamDirection(match,attackingTeam))>.025&&distance(attacker,player)<.24)
  const depth=runnerBehind&&tactics.defensiveLine==='high'?lineDrop+.035:lineDrop
  const target={x:clamp(shape.x-teamDirection(match,defendingTeam)*depth,.035,.965),y:clamp(y,.08,.92)}
  const displaced=distance(player,target)>.07
  const wasEngaged=['PRESS','CONTAIN','CHALLENGE','INTERCEPT','COVER','RECOVER'].includes(player.state)
  const recover=displaced&&(wasEngaged||role==='ST'||FRONT_ROLES.has(role))
  return {...plan(recover?'RECOVER':'DEFEND_SHAPE',target,recover?'Recover toward the '+role+' position':`Hold the ${farSide?'far-side':'ball-side'} ${role} zone`,carrier.id,{[recover?'RECOVER':'DEFEND_SHAPE']:recover?72:70}),responsibility:recover?'RECOVER':'HOLD_SHAPE',recoveryTarget:shape}
}

function runnerPlan(match,defender,runner,defendingTeam){
  const direction=teamDirection(match,defendingTeam)
  const shape=formationTarget(match,defender,'defending')??{x:teamContext(match,defendingTeam).ownGoalX,y:.5}
  const a=runner.attributes,d=distance(defender,runner)
  const ability=(a.DEF*.3+a.POS*.28+a.DEC*.22+a.PAC*.2)/99
  const leadTime=clamp(.28+ability*.34,.28,.62)
  const target={x:clamp(runner.x+runner.vx*leadTime-direction*.018,.035,.965),y:clamp(runner.y+runner.vy*leadTime,.08,.92)}
  const role=roleOf(defender)
  const positionalFit=['CB','LCB','RCB','LB','RB','LWB','RWB','DM','LDM','RDM'].includes(role)?1:.58
  const goalSide=teamProgress(match,defendingTeam,defender.x)<teamProgress(match,defendingTeam,runner.x)
  const bounded={x:clamp(target.x,shape.x-maximumPositionalDeviation(defender)*1.35,shape.x+maximumPositionalDeviation(defender)*1.35),y:target.y}
  return {...plan('COVER',bounded,'Track the dangerous run by '+teamContext(match,runner.team).name+' #'+runner.number,runner.id,{COVER:Math.round(70+ability*12)}),responsibility:'TRACK_RUNNER',recoveryTarget:shape,markingQuality:ability,markingDistance:d,goalSide}
}

// Shared defensive planner: the best positioned defender pressures while teammates protect lanes and recover to their formation.
export function chooseDefensiveIntents(match,defendingTeam){
  const attackingTeam=opponentTeam(defendingTeam), defenders=playersForTeam(match,defendingTeam).filter(p=>!p.isGoalkeeper), attackers=playersForTeam(match,attackingTeam), plans={}
  if(!defenders.length)return plans
  const carrier=attackers.find(p=>p.id===match.ball.ownerId)??null
  for(const defender of defenders)defender.perception=perceiveDefender(match,defender,carrier)
  const reachable=defenders.map(defender=>({defender,point:reachablePassPoint(match,defender,attackingTeam)})).filter(x=>x.point).sort((a,b)=>distance(a.defender,a.point)-distance(b.defender,b.point))[0]
  match.primaryDefenderIds??={};match.defensiveAssignments??={};match.defensiveResponsibilityZones??={}
  if(!carrier){
    const looseCandidates=defenders.map(player=>({player,d:player.perception.distanceToBall,role:roleOf(player)})).filter(item=>item.d<.4).sort((a,b)=>a.d-b.d)
    const looseWinner=looseCandidates[0]?.player??null,interceptor=reachable?.defender??looseWinner
    for(const defender of defenders){
      if(reachable?.defender===defender)plans[defender.id]={...plan('INTERCEPT',reachable.point,'Reach the pass before the receiver',match.ball.targetId,{INTERCEPT:90}),responsibility:'PRESS_BALL'}
      else if(match.ball.state==='loose'&&defender===looseWinner)plans[defender.id]={...plan('GET_BALL',{x:match.ball.x,y:match.ball.y},'Contest the loose ball from a reachable position',null,{GET_BALL:72}),responsibility:'PRESS_BALL'}
      else {const shape=formationTarget(match,defender,'defending')??{x:teamContext(match,defendingTeam).ownGoalX,y:.5};plans[defender.id]={...plan('DEFEND_SHAPE',shape,'Hold the assigned zone while the ball is loose'),responsibility:'HOLD_SHAPE',recoveryTarget:shape}}
      match.defensiveAssignments[defender.id]=defender===interceptor?'PRESSING':'SHAPE'
    }
    match.primaryDefenderIds[defendingTeam]=interceptor?.id??null;match.defensiveResponsibilityZones[defendingTeam]='LOOSE_BALL';return plans
  }
  const tactics=tacticsFor(match,defendingTeam),zone=defenders[0].perception.zone,zoneChanged=match.defensiveResponsibilityZones[defendingTeam]!==zone
  const wide=Math.abs(carrier.y-.5)>.28
  const baseRange=zone==='DEFENSIVE_AREA'?.34:zone==='MID_DEFENSIVE_AREA'?.28:.21
  const maxPressRange=baseRange+(tactics.defensiveApproach==='high_press'?.05:tactics.defensiveApproach==='low_block'?-.045:0)
  const scored=defenders.map(defender=>{
    const p=defender.perception,fit=roleFit(defender,zone,wide,tactics)
    if(fit==null||p.distanceToCarrier>maxPressRange)return null
    const a=defender.attributes,skill=(a.DEF*.32+a.POS*.24+a.VIS*.18+a.DEC*.16+a.PAC*.1)/99
    const behind=teamProgress(match,defendingTeam,defender.x)>teamProgress(match,defendingTeam,carrier.x)+.035
    const lateralPenalty=wide&&Math.abs(defender.y-carrier.y)>.4?.08:0
    const score=p.distanceToCarrier-fit-skill*.025-(p.goalSide?.022:0)+(behind?.085:0)+lateralPenalty
    return {defender,score}
  }).filter(Boolean).sort((a,b)=>a.score-b.score)
  let primary=reachable?.defender&&reachable.defender.perception.distanceToCarrier<.36?reachable.defender:scored[0]?.defender??null
  const incumbent=defenders.find(d=>d.id===match.primaryDefenderIds[defendingTeam])
  if(!zoneChanged&&incumbent&&incumbent!==primary){const old=scored.find(x=>x.defender===incumbent);if(old&&primary&&old.score<=scored[0].score+.018)primary=incumbent}
  match.defensiveResponsibilityZones[defendingTeam]=zone
  match.primaryDefenderIds[defendingTeam]=primary?.id??null
  const runnerThreat=(player)=>{
    const progress=teamProgress(match,carrier.team,player.x),speed=player.vx*teamDirection(match,carrier.team)
    const behindLine=defenders.some(d=>teamProgress(match,defendingTeam,d.x)>teamProgress(match,defendingTeam,player.x)+.02)
    return progress*.42+clamp(speed/.13,0,1)*.32+(behindLine?.16:0)+clamp((.5-Math.abs(player.y-.5))/.5)*.1
  }
  const threateningReceiver=attackers.filter(p=>p.id!==carrier.id).sort((a,b)=>runnerThreat(b)-runnerThreat(a))[0]??null
  const supportRange=maxPressRange+.13
  const supports=defenders.filter(d=>d!==primary&&roleFit(d,zone,wide,tactics)!=null&&distance(d,carrier)<supportRange).map(defender=>{
    const role=roleOf(defender),p=defender.perception
    const roleBonus=['DM','LDM','RDM','CM','LCM','RCM','LB','RB','LWB','RWB'].includes(role)?.035:0
    return {defender,score:p.distanceToCarrier-roleBonus-(Math.abs(defender.y-carrier.y)<.3?.025:0)}
  }).sort((a,b)=>a.score-b.score)
  const supportPlayer=supports[0]?.defender??null
  const dangerousRunner=threateningReceiver&&runnerThreat(threateningReceiver)>.66&&
    (threateningReceiver.vx*teamDirection(match,carrier.team)>.018||teamProgress(match,carrier.team,threateningReceiver.x)>.66)
    ?threateningReceiver:null
  const marker=dangerousRunner?defenders.filter(d=>d!==primary).map(defender=>{
    const role=roleOf(defender),p=defender.perception,a=defender.attributes
    const fit=['CB','LCB','RCB','LB','RB','LWB','RWB','DM','LDM','RDM'].includes(role)?0:-.04
    const skill=(a.DEF*.3+a.POS*.28+a.DEC*.22+a.PAC*.2)/99
    const score=distance(defender,dangerousRunner)-skill*.045+fit+(p.goalSide?-.025:.025)
    return {defender,score}
  }).sort((a,b)=>a.score-b.score)[0]?.defender:null
  for(const defender of defenders){
    if(defender===primary){
      plans[defender.id]=reachable?.defender===primary?{...plan('INTERCEPT',reachable.point,'Reach the pass before the receiver',match.ball.targetId,{INTERCEPT:90}),responsibility:'PRESS_BALL'}:{...primaryPlan(match,defender,carrier,defendingTeam),responsibility:'PRESS_BALL'}
      match.defensiveAssignments[defender.id]='PRESSING'
    }else if(defender===marker&&defender!==supportPlayer){
      plans[defender.id]=runnerPlan(match,defender,dangerousRunner,defendingTeam)
      match.defensiveAssignments[defender.id]='TRACKING'
    }else if(defender===supportPlayer){
      plans[defender.id]=coverPlan(match,defender,primary,carrier,threateningReceiver,defendingTeam)
      match.defensiveAssignments[defender.id]='SUPPORTING'
    }else{
      plans[defender.id]=shapePlan(match,defender,carrier,defendingTeam)
      match.defensiveAssignments[defender.id]='SHAPE'
    }
  }
  return plans
}
