// 2025/26 top-flight club catalog. IDs are permanent keys; UI uses display names.
// Rosters remain normalized in career.players and club.roster stores player IDs.
const definitions = [
  ['premier-league','Premier League','England',[
    'Arsenal','Aston Villa','Bournemouth','Brentford','Brighton & Hove Albion','Burnley','Chelsea','Crystal Palace','Everton','Fulham','Leeds United','Liverpool','Manchester City','Manchester United','Newcastle United','Nottingham Forest','Sunderland','Tottenham Hotspur','West Ham United','Wolverhampton Wanderers']],
  ['la-liga','La Liga','Spain',[
    'Alavés','Athletic Club','Atlético de Madrid','Barcelona','Real Betis','Celta Vigo','Elche','Espanyol','Getafe','Girona','Levante','Mallorca','Osasuna','Real Oviedo','Rayo Vallecano','Real Madrid','Real Sociedad','Sevilla','Valencia','Villarreal']],
  ['serie-a','Serie A','Italy',[
    'Atalanta','Bologna','Cagliari','Como','Cremonese','Fiorentina','Genoa','Inter','Juventus','Lazio','Lecce','AC Milan','Napoli','Parma','Pisa','Roma','Sassuolo','Torino','Udinese','Hellas Verona']],
  ['bundesliga','Bundesliga','Germany',[
    'FC Augsburg','1. FC Union Berlin','Werder Bremen','Borussia Dortmund','Eintracht Frankfurt','SC Freiburg','Hamburger SV','1. FC Heidenheim','TSG Hoffenheim','1. FC Köln','RB Leipzig','Bayer Leverkusen','1. FSV Mainz 05','Borussia Mönchengladbach','Bayern Munich','FC St. Pauli','VfB Stuttgart','VfL Wolfsburg']],
]
const profiles = {
  'Manchester City':[84,'Possession'], Arsenal:[82,'High press'], Liverpool:[83,'High press'], 'Manchester United':[78,'Direct'], Chelsea:[80,'Possession'],
  'Real Madrid':[85,'Direct'], Barcelona:[83,'Possession'], 'Atlético de Madrid':[81,'Defensive / counter'], 'Athletic Club':[77,'High press'],
  Inter:[83,'Balanced'], Juventus:[80,'Defensive / counter'], 'AC Milan':[80,'High press'], Napoli:[82,'Possession'], Roma:[78,'Direct'],
  'Bayern Munich':[85,'High press'], 'Borussia Dortmund':[81,'High press'], 'Bayer Leverkusen':[83,'Possession'], 'RB Leipzig':[80,'High press'],
}
const stadiums = {
  'Manchester City':'Etihad Stadium', Arsenal:'Emirates Stadium', Liverpool:'Anfield', 'Manchester United':'Old Trafford', Chelsea:'Stamford Bridge',
  'Real Madrid':'Santiago Bernabéu', Barcelona:'Spotify Camp Nou', 'Atlético de Madrid':'Riyadh Air Metropolitano', Inter:'San Siro', 'AC Milan':'San Siro', Juventus:'Allianz Stadium',
  'Bayern Munich':'Allianz Arena', 'Borussia Dortmund':'Signal Iduna Park', 'Bayer Leverkusen':'BayArena', 'RB Leipzig':'Red Bull Arena',
}
const colors = {
  'Manchester City':['#6caddf','#1c2c5b'], Arsenal:['#ef0107','#ffffff'], Liverpool:['#c8102e','#f6eb61'], 'Manchester United':['#da291c','#fbe122'], Chelsea:['#034694','#dba111'],
  'Real Madrid':['#ffffff','#febe10'], Barcelona:['#004d98','#a50044'], 'Atlético de Madrid':['#cb3524','#ffffff'], Inter:['#0068a8','#111111'], 'AC Milan':['#fb090b','#111111'], Juventus:['#111111','#ffffff'],
  'Bayern Munich':['#dc052d','#ffffff'], 'Borussia Dortmund':['#fde100','#111111'], 'Bayer Leverkusen':['#e32219','#111111'], 'RB Leipzig':['#dd0741','#ffffff'],
}
export const LEAGUES = definitions.map(([id,name,country,names])=>({id,name,country,season:'2025/26',clubIds:names.map((_,i)=>`${id}:club:${String(i+1).padStart(2,'0')}`)}))
export const CLUBS = definitions.flatMap(([leagueId,,country,names])=>names.map((name,index)=>{
  const [strength,identity]=profiles[name]??[68+(index*7%10),['Balanced','Possession','High press','Direct','Defensive / counter','Variable'][index%6]]
  return {id:`${leagueId}:club:${String(index+1).padStart(2,'0')}`,name,shortName:name.replace('Wolverhampton Wanderers','Wolves').replace('Brighton & Hove Albion','Brighton').replace('Tottenham Hotspur','Tottenham').replace('Borussia Mönchengladbach','Gladbach'),leagueId,country,stadium:stadiums[name]??`${name} Stadium`,colors:colors[name]??['#376b4d','#e8eee7'],identity,strength}
}))
