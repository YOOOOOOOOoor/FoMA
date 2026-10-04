// Curated 2025/26 first-team player records for the most selected clubs.
// Other clubs can add entries here without changing career or UI code.
const raw = {
  'Manchester City':[
    ['Gianluigi Donnarumma','GK',26,'Italy',88],['James Trafford','GK',22,'England',74],
    ['Rico Lewis','RB',20,'England',77],['Rayan Aït-Nouri','LB',24,'Algeria',82],
    ['Rúben Dias','CB',28,'Portugal',86],['Joško Gvardiol','CB',23,'Croatia',86],['Nathan Aké','CB',30,'Netherlands',82],['John Stones','CB',31,'England',82],
    ['Rodri','DM',29,'Spain',91],['Mateo Kovačić','DM',31,'Croatia',83],['Tijjani Reijnders','CM',27,'Netherlands',86],['Bernardo Silva','CM',31,'Portugal',87],['Phil Foden','CM',25,'England',88],['Nico González','CM',23,'Spain',79],
    ['Rayan Cherki','AM',22,'France',83],['Oscar Bobb','AM',22,'Norway',77],['Savinho','RW',21,'Brazil',82],['Jeremy Doku','RW',23,'Belgium',84],['Omar Marmoush','LW',26,'Egypt',83],['Jack Grealish','LW',30,'England',82],['Erling Haaland','ST',25,'Norway',91],['Erling Haaland','ST',25,'Norway',91],['Erling Haaland','ST',25,'Norway',91],
  ],
  Arsenal:[
    ['David Raya','GK',30,'Spain',87],['Kepa Arrizabalaga','GK',31,'Spain',79],['Jurrien Timber','RB',24,'Netherlands',84],['Riccardo Calafiori','LB',23,'Italy',83],['William Saliba','CB',24,'France',88],['Gabriel Magalhães','CB',27,'Brazil',87],['Ben White','CB',28,'England',84],['Piero Hincapié','CB',23,'Ecuador',83],['Declan Rice','DM',26,'England',89],['Christian Nørgaard','DM',31,'Denmark',80],['Martin Ødegaard','CM',26,'Norway',88],['Mikel Merino','CM',29,'Spain',83],['Martín Zubimendi','CM',26,'Spain',86],['Kai Havertz','CM',26,'Germany',84],['Eberechi Eze','AM',27,'England',85],['Ethan Nwaneri','AM',18,'England',75],['Bukayo Saka','RW',24,'England',90],['Noni Madueke','RW',23,'England',82],['Gabriel Martinelli','LW',24,'Brazil',84],['Leandro Trossard','LW',31,'Belgium',83],['Viktor Gyökeres','ST',27,'Sweden',87],['Viktor Gyökeres','ST',27,'Sweden',87],['Viktor Gyökeres','ST',27,'Sweden',87],
  ],
  Liverpool:[
    ['Alisson Becker','GK',33,'Brazil',89],['Giorgi Mamardashvili','GK',25,'Georgia',83],['Jeremie Frimpong','RB',24,'Netherlands',84],['Milos Kerkez','LB',21,'Hungary',82],['Virgil van Dijk','CB',34,'Netherlands',89],['Ibrahima Konaté','CB',26,'France',86],['Joe Gomez','CB',28,'England',80],['Giovanni Leoni','CB',18,'Italy',74],['Ryan Gravenberch','DM',23,'Netherlands',85],['Wataru Endo','DM',32,'Japan',78],['Alexis Mac Allister','CM',27,'Argentina',87],['Dominik Szoboszlai','CM',25,'Hungary',86],['Curtis Jones','CM',25,'England',82],['Florian Wirtz','CM',22,'Germany',89],['Florian Wirtz','AM',22,'Germany',89],['Harvey Elliott','AM',22,'England',79],['Mohamed Salah','RW',33,'Egypt',90],['Federico Chiesa','RW',28,'Italy',81],['Cody Gakpo','LW',26,'Netherlands',85],['Rio Ngumoha','LW',17,'England',70],['Alexander Isak','ST',26,'Sweden',88],['Hugo Ekitike','ST',23,'France',84],['Darwin Núñez','ST',26,'Uruguay',83],
  ],
  'Real Madrid':[
    ['Thibaut Courtois','GK',33,'Belgium',90],['Andriy Lunin','GK',26,'Ukraine',82],['Dani Carvajal','RB',34,'Spain',83],['Ferland Mendy','LB',30,'France',82],['Antonio Rüdiger','CB',33,'Germany',87],['Éder Militão','CB',28,'Brazil',85],['Dean Huijsen','CB',20,'Spain',82],['David Alaba','CB',33,'Austria',82],['Aurélien Tchouaméni','DM',26,'France',86],['Eduardo Camavinga','DM',23,'France',85],['Federico Valverde','CM',27,'Uruguay',89],['Dani Ceballos','CM',29,'Spain',80],['Jude Bellingham','CM',22,'England',91],['Arda Güler','CM',21,'Türkiye',82],['Brahim Díaz','AM',26,'Morocco',83],['Franco Mastantuono','AM',18,'Argentina',78],['Rodrygo','RW',25,'Brazil',87],['Brahim Díaz','RW',26,'Morocco',83],['Vinícius Júnior','LW',25,'Brazil',91],['Kylian Mbappé','LW',27,'France',92],['Kylian Mbappé','ST',27,'France',92],['Endrick','ST',19,'Brazil',78],['Gonzalo García','ST',21,'Spain',74],
  ],
  Barcelona:[
    ['Joan García','GK',24,'Spain',82],['Marc-André ter Stegen','GK',34,'Germany',88],['Jules Koundé','RB',27,'France',87],['Alejandro Balde','LB',22,'Spain',83],['Pau Cubarsí','CB',19,'Spain',84],['Ronald Araújo','CB',27,'Uruguay',86],['Andreas Christensen','CB',30,'Denmark',83],['Eric García','CB',25,'Spain',81],['Marc Bernal','DM',18,'Spain',76],['Frenkie de Jong','DM',28,'Netherlands',87],['Pedri','CM',23,'Spain',90],['Gavi','CM',21,'Spain',86],['Fermín López','CM',23,'Spain',82],['Marc Casadó','CM',22,'Spain',79],['Dani Olmo','AM',27,'Spain',86],['Lamine Yamal','AM',18,'Spain',90],['Lamine Yamal','RW',18,'Spain',90],['Roony Bardghji','RW',20,'Sweden',77],['Raphinha','LW',29,'Brazil',87],['Ansu Fati','LW',23,'Spain',79],['Robert Lewandowski','ST',37,'Poland',87],['Ferran Torres','ST',26,'Spain',83],['Marcus Rashford','ST',28,'England',84],
  ],
  Inter:[
    ['Yann Sommer','GK',37,'Switzerland',85],['Josep Martínez','GK',27,'Spain',78],['Denzel Dumfries','RB',30,'Netherlands',84],['Federico Dimarco','LB',28,'Italy',87],['Alessandro Bastoni','CB',26,'Italy',88],['Benjamin Pavard','CB',30,'France',84],['Francesco Acerbi','CB',38,'Italy',82],['Yann Bisseck','CB',25,'Germany',80],['Hakan Çalhanoğlu','DM',32,'Türkiye',88],['Piotr Zieliński','DM',31,'Poland',83],['Nicolò Barella','CM',29,'Italy',88],['Davide Frattesi','CM',26,'Italy',83],['Henrikh Mkhitaryan','CM',37,'Armenia',82],['Carlos Augusto','CM',27,'Brazil',81],['Marcus Thuram','AM',28,'France',86],['Lautaro Martínez','AM',28,'Argentina',90],['Luis Henrique','RW',24,'Brazil',79],['Matteo Darmian','RW',36,'Italy',80],['Carlos Augusto','LW',27,'Brazil',81],['Ange-Yoan Bonny','LW',22,'France',78],['Lautaro Martínez','ST',28,'Argentina',90],['Marcus Thuram','ST',28,'France',86],['Mehdi Taremi','ST',33,'Iran',80],
  ],
  'Bayern Munich':[
    ['Manuel Neuer','GK',40,'Germany',87],['Jonas Urbig','GK',22,'Germany',77],['Konrad Laimer','RB',28,'Austria',83],['Alphonso Davies','LB',25,'Canada',86],['Dayot Upamecano','CB',27,'France',85],['Jonathan Tah','CB',30,'Germany',86],['Kim Min-jae','CB',29,'South Korea',84],['Hiroki Ito','CB',26,'Japan',82],['Joshua Kimmich','DM',31,'Germany',89],['Leon Goretzka','DM',31,'Germany',83],['Aleksandar Pavlović','CM',21,'Germany',82],['Serge Gnabry','CM',30,'Germany',83],['Raphaël Guerreiro','CM',32,'Portugal',83],['Tom Bischof','CM',20,'Germany',78],['Jamal Musiala','AM',23,'Germany',91],['Michael Olise','AM',24,'France',87],['Michael Olise','RW',24,'France',87],['Lennart Karl','RW',18,'Germany',75],['Luis Díaz','LW',29,'Colombia',87],['Kingsley Coman','LW',29,'France',84],['Harry Kane','ST',32,'England',92],['Nicolas Jackson','ST',24,'Senegal',82],['Mathys Tel','ST',21,'France',79],
  ],
  'Bayer Leverkusen':[
    ['Mark Flekken','GK',32,'Netherlands',82],['Janis Blaswich','GK',34,'Germany',77],['Arthur','RB',22,'Brazil',77],['Alejandro Grimaldo','LB',30,'Spain',87],['Edmond Tapsoba','CB',27,'Burkina Faso',85],['Jonathan Tah','CB',30,'Germany',86],['Jarell Quansah','CB',23,'England',80],['Loïc Badé','CB',26,'France',82],['Exequiel Palacios','DM',27,'Argentina',85],['Robert Andrich','DM',31,'Germany',82],['Aleix García','CM',28,'Spain',83],['Granit Xhaka','CM',33,'Switzerland',86],['Ezequiel Fernández','CM',23,'Argentina',80],['Ibrahim Maza','CM',20,'Algeria',78],['Florian Wirtz','AM',22,'Germany',89],['Jonas Hofmann','AM',33,'Germany',81],['Nathan Tella','RW',26,'Nigeria',81],['Jeremie Frimpong','RW',25,'Netherlands',84],['Martin Terrier','LW',29,'France',82],['Amine Adli','LW',26,'Morocco',81],['Patrik Schick','ST',30,'Czechia',85],['Victor Boniface','ST',25,'Nigeria',84],['Christian Kofane','ST',19,'Cameroon',76],
  ],
}

const clamp=(value,min=1,max=99)=>Math.max(min,Math.min(max,Math.round(value)))
const group=position=>position==='GK'?'GK':['LB','CB','RB'].includes(position)?'DEF':['DM','CM','AM'].includes(position)?'MID':'ATT'
function attributesFor(ovr,position,index){
  const n=key=>clamp(ovr+(((index*7+key.charCodeAt(0))%9)-4))
  if(position==='GK')return {PAC:n('P')-8,PAS:n('A')-3,SHO:15,DRI:n('D')-9,CON:n('C'),FIT:n('F'),TAC:n('T'),DEC:n('E'),POS:n('O')+4,VIS:n('V'),DEF:n('D')+5,REF:clamp(ovr+5),POS_GK:clamp(ovr+4),HAN:clamp(ovr+3)}
  const role=group(position)
  const values={PAC:n('P'),PAS:n('A'),SHO:n('S'),DRI:n('D'),CON:n('C'),FIT:n('F'),TAC:n('T'),DEC:n('E'),POS:n('O'),VIS:n('V'),DEF:n('D')}
  if(role==='DEF'){values.DEF=clamp(ovr+6);values.TAC=clamp(ovr+5);values.POS=clamp(ovr+4);values.SHO=clamp(ovr-22);values.PAC=clamp(ovr+(['LB','RB'].includes(position)?2:-5))}
  if(role==='MID'){values.PAS=clamp(ovr+5);values.VIS=clamp(ovr+5);values.CON=clamp(ovr+4);values.DEC=clamp(ovr+3);values.DEF=clamp(ovr+(position==='DM'?4:-9))}
  if(role==='ATT'){values.SHO=clamp(ovr+(position==='ST'?7:2));values.PAC=clamp(ovr+4);values.POS=clamp(ovr+5);values.DEF=clamp(ovr-24)}
  values.REF=1;values.POS_GK=1;values.HAN=1
  return values
}
export function realPlayerAt(clubName,position,ordinal=0){
  const player=raw[clubName]?.filter(item=>item[1]===position)[ordinal]
  if(!player)return null
  const [name,,age,nationality,ovr]=player
  return {name,age,nationality,position,OVR:ovr,attributes:attributesFor(ovr,position,name.length),potential:clamp(ovr+(age<22?12:age<25?7:age>30?1:3)),marketValue:Math.max(450000,Math.round((ovr-48)**2*(age<23?21000:age>31?7000:14000)/50000)*50000),salaryWeekly:Math.round((ovr-48)**2*95/1000)*1000,contractYears:2+(age%4),contractExpiryDate:`${2027+(age%3)}-06-30`,releaseClause:0,secondaryPositions:[]}
}
