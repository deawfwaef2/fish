// These data IDs intentionally match the original offline save format.
export const ROUND_SECONDS = 60;
export const STAGES = [
  { name:'白浪浅滩', sky:0x143746, water:0x108b94, bank:0x254e45, fog:0x102d34, light:0xffdcb1, foam:0xc9ffef },
  { name:'暮影漩湾', sky:0x292b4b, water:0x336db1, bank:0x413d56, fog:0x252848, light:0xe4bded, foam:0xb0e5ff },
  { name:'冰晶断峡', sky:0x172d49, water:0x197ab8, bank:0x283e60, fog:0x182e4c, light:0xb8e7ff, foam:0xe2faff },
  { name:'熔霞裂谷', sky:0x512738, water:0x9b3e60, bank:0x65414b, fog:0x402634, light:0xffb98f, foam:0xffd8c6 },
  { name:'星渊王座', sky:0x151e3a, water:0x273f93, bank:0x2b3155, fog:0x182344, light:0xffd394, foam:0xffdf9b }
];

// radius is an approximate visual/interaction scale in 3D world units.
export const FISH = [
  {id:'silver',name:'银尾鱼',tier:0,value:7,power:1.3,radius:.49,speed:3.8,shape:'slim',color:0xb7e9dd,weight:29},
  {id:'blue',name:'蓝鳞鱼',tier:0,value:10,power:1.6,radius:.58,speed:3.4,shape:'slim',color:0x80cce9,weight:23},
  {id:'needle',name:'细吻针鱼',tier:0,value:12,power:1.5,radius:.55,speed:5.6,shape:'needle',color:0xe6e1ac,weight:14},
  {id:'goby',name:'夜纹虾虎',tier:0,value:8,power:1.2,radius:.52,speed:2.9,shape:'stripe',color:0xbd9db2,weight:17},
  {id:'perch',name:'纹鳍鲈',tier:0,value:16,power:2.0,radius:.72,speed:3.1,shape:'stripe',color:0xe4cc88,weight:16},
  {id:'carp',name:'绯纹鲤',tier:0,value:25,power:2.5,radius:.92,speed:2.6,shape:'round',color:0xf2a17c,weight:9},
  {id:'catfish',name:'泥纹鲶',tier:0,value:22,power:2.35,radius:.90,speed:2.5,shape:'whisker',color:0xb0c0b2,weight:8},
  {id:'eel',name:'电纹鳗',tier:1,value:36,power:3.2,radius:1.08,speed:4.2,shape:'eel',color:0x8fdec4,weight:14},
  {id:'puffer',name:'灯笼河豚',tier:1,value:45,power:3.8,radius:1.03,speed:2.2,shape:'puffer',color:0xf4d49a,weight:11},
  {id:'moon',name:'月盘鱼',tier:1,value:42,power:3.5,radius:1.01,speed:2.9,shape:'disc',color:0xe6b4a9,weight:9},
  {id:'butterfly',name:'镜蝶鱼',tier:2,value:67,power:4.8,radius:1.3,speed:3.0,shape:'ray',color:0xead89c,weight:9},
  {id:'ray',name:'琉璃鳐',tier:2,value:77,power:5.0,radius:1.48,speed:3.2,shape:'ray',color:0x8fcaec,weight:8},
  {id:'shark',name:'裂鳍鲨',tier:2,value:112,power:6.3,radius:1.75,speed:4.5,shape:'shark',color:0x93afc1,weight:7},
  {id:'lion',name:'赤焰狮子鱼',tier:3,value:130,power:7.0,radius:1.63,speed:2.6,shape:'spined',color:0xf4a06e,weight:8},
  {id:'angler',name:'深海灯鱼',tier:3,value:150,power:7.2,radius:1.72,speed:2.8,shape:'angler',color:0xbda4e7,weight:7},
  {id:'sword',name:'赤潮剑鱼',tier:3,value:180,power:8.2,radius:1.8,speed:5.0,shape:'sword',color:0xda809d,weight:5},
  {id:'dragon',name:'星河龙鱼',tier:4,value:230,power:9.2,radius:2.15,speed:3.9,shape:'eel',color:0xd4aeef,weight:4},
  {id:'leviathan',name:'渊流巨鱼',tier:4,value:360,power:10.0,radius:2.85,speed:2.0,shape:'giant',color:0xf0c082,weight:2}
];

export const GEAR = [
  {id:'reed',slot:'rod',school:'none',name:'旧芦苇竿',rarity:'粗糙',desc:'简单的鱼竿，没有辅助界面。',power:2.1,ui:0,cost:{}},
  {id:'bronze',slot:'rod',school:'power',name:'青铜逆流竿',rarity:'精良 · 力量',desc:'更强收线，常驻排行榜。',power:3.7,ui:1,cost:{silver:8,blue:4}},
  {id:'tide',slot:'rod',school:'flow',name:'逐潮感知竿',rarity:'稀有 · 预判',desc:'探鱼标记，提前量指引与聊天窗。',power:6.4,ui:2,cost:{perch:7,carp:3,eel:2}},
  {id:'abyss',slot:'rod',school:'power',name:'深渊牵星竿',rarity:'史诗 · 深渊',desc:'能拉回深水巨鱼；辉金镜头外框。',power:10.5,ui:3,cost:{puffer:5,ray:3,shark:2}},
  {id:'crown',slot:'rod',school:'flow',name:'潮汐王权竿',rarity:'传说 · 统御',desc:'最强拉力与王冠视效。',power:14,ui:4,cost:{angler:3,leviathan:1,shark:3}},
  {id:'ratchet',slot:'charm',school:'power',name:'鳍骨棘轮',rarity:'精良 · 连打',desc:'每次空格收线更有力。',power:.2,tap:.38,ui:1,cost:{silver:4,perch:2}},
  {id:'sonarCharm',slot:'charm',school:'flow',name:'洄声探针',rarity:'稀有 · 洞察',desc:'延长抛投距离，显示更多预测标记。',power:.25,range:.22,ui:2,cost:{blue:6,carp:3,eel:2}},
  {id:'sinker',slot:'charm',school:'power',name:'稳潮坠',rarity:'稀有 · 稳定',desc:'大鱼挣扎导致的张力增长减缓。',power:.8,steady:.29,ui:1,cost:{catfish:4,puffer:2,carp:2}},
  {id:'greedeye',slot:'charm',school:'flow',name:'贪婪鱼眼',rarity:'史诗 · 掠金',desc:'每条鱼得到更多金币。',power:.3,gold:1.25,ui:2,cost:{moon:3,butterfly:2,ray:2}},
  {id:'sigil',slot:'charm',school:'power',name:'王者徽记',rarity:'史诗 · 爆发',desc:'拉力与连打提升，辉金外框。',power:1,tap:.65,ui:3,cost:{lion:3,angler:2,sword:1}}
];

export const NAMES = ['晚风来信','水边的杉','阿岚','鱼见愁','零点抛竿','下班就钓鱼','北岸七号','青柠薄荷','秋水','无声浪花','咸鱼不翻身','沫沫','某个钓手','逐浪','NullPointer','冰鳍','月亮不咬钩','钓到月亮','摸鱼大师','海盐汽水','钓鱼先睡觉','河畔听风','小河豚','临风','银星','回声','路过的鲤鱼','浪里白条','捞月人','卡着晋级线','极夜','RiverBoy','白鸥','星尘钩手','拾光','舟舟','一竿入魂','南风窗','岸边待机','会钓到的'];
export const TITLES = ['岸边旅人','摸鱼高手','逆流猎人','蓝鳍传说','永不空军','河岸观察员','黄昏钓客','逐潮大师','深水漫游者','断浪预言家'];
