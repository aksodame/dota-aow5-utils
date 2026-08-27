Item art ships inside the app now, drop sounds can be set by rarity and level —
with a price floor and a mute list to keep a whole tier liveable — and every
global key the tracker uses can be rebound.

## 0.1.8-beta

### Added

- **Drop sounds by grade.** Under *Sounds*, a sound can be set on a whole rarity
  — Common through Divine — or on a level, instead of on one item at a time.
  What a drop plays is decided in that order: a sound you set on the item itself
  wins, then its rarity, then its level, and a pickup rings once whatever else
  it matches.
- **More than one sound in the box.** Every sound the app ships is offered in
  the menu behind any grade or bound item, beside *Choose a file…* for your own.
- **Rebindable shortcuts.** A *Shortcuts* section in settings. Every global key
  hangs off one **action key** — Ctrl by default — so a player whose Ctrl chords
  are already spoken for changes one setting rather than every binding. A key
  another application already owns is marked in the field that set it, instead
  of failing silently the way it always did. Rebinding takes effect the moment
  it is made, not at the next launch, and an upgrade keeps whatever `hotkey` was
  already in the config file.
- **A key for the skull.** `Ctrl+E` marks the last room as a death without
  focusing the overlay first. It is the one control with a deadline — a room you
  died in reports the same loot lines as one you cleared, and the correction has
  to land before the next room starts — and reaching it used to mean three
  actions in the seconds after dying.
- **A price floor under the sounds.** Under *Sounds*, *Only ring above a price*
  keeps a cheap drop silent whatever grade it is. It is judged on what one is
  worth at your prices — not on the pile, so a big stack of something cheap is
  still cheap. This is what makes a rule on a whole rarity liveable: Mythic is
  239 items and most of an evening's worth of them are not news.
- **A list of items that never ring.** *Never ring for* is the other half of it,
  for the drop that is expensive and simply too frequent to be worth a sound.
  Pick a rarity or a level to look through a tier — cheapest first, since that
  is where the noise is — or search by name. A muted item stays silent whatever
  else would have rung it, its own bound sound included.
- **The top two rarities ring out of the box.** A new install starts with a
  sound on Legendary and another on Mythic — the two grades worth looking up
  from a fight for. Everything below stays silent, and either can be changed or
  cleared in one click. An existing install is left exactly as it is: rules you
  never set are not added to a config you already have.

### Changed

- **The history controls stay put.** The pager and the delete button are pinned
  to the bottom of the window instead of sitting at the end of the list, so they
  are reachable without scrolling to the end of a page first.
- **History is paged.** The archive draws ten sessions at a time, with *Newer*
  and *Older* under the list — an evening from a fortnight ago is a click away
  instead of a scroll through everything since. Nothing is deleted or hidden:
  the pager only appears once there is a second page, and deleting a page's
  worth lands you on the last page there is rather than on an empty one.
- **Sounds are listed the way they are edited.** *By item* now leads the
  section, with the rarity and level grids under it. The grids are set once and
  left alone; the bound items are the part you come back to.
- **Item art is part of the download.** All 1,053 icons ship inside the app
  instead of loading from the builder's site, so they draw on a machine that
  cannot reach it — a DNS server that will not answer for the art host, a VPN,
  an office network. The overlay now makes no outbound request at all. It costs
  about 14 MB in the installer, and an update only downloads the parts that
  changed.
- **Clear cache is gone**, along with the automatic clear on every update. Both
  existed for downloaded art, and there is none left to clear.
- **Overridden prices fit.** The field is wider and its digits a size smaller,
  so a six-figure price is readable while it is being typed.
- **Tracked items are a list, not a row of pills.** Each pinned item now gets a
  row with its icon, its name in its rarity's colour and what it is worth —
  matching the repriced items above it, and readable at a glance once there are
  more than a few.

### Fixed

- **The map row no longer contradicts itself between rooms.** *Current time*
  read 00:00 the moment you stepped out of a room, while *current gold* and the
  loot list below it went on showing what that room gave — a row claiming a
  room had paid 12k in no time at all. The clock now follows the same room the
  loot list does, until the next one starts.
- **The unknown-item icon.** An id the tables have never heard of drew a broken
  image rather than the placeholder — it was the one icon that had never been
  where the app asked for it.

## 0.1.7-beta

### Fixed

- **Item icons were missing.** The builder's old address began redirecting icon
  requests onto a path that serves the site's HTML page, so the overlay was
  handed a web page where a picture should have been and drew a broken image.
  It failed silently, and only on machines that had not already downloaded the
  art — which is why some people saw every icon, some saw none, and some saw a
  mix. Fixed at the server.

### Added

- **The tracker clears its downloaded art on every update.** A stale answer from
  a server can otherwise sit in the cache for weeks, outliving the fix — so a new
  version now always starts clean.
- **Clear cache**, in Settings under *Console log → Optimization*, does the same
  on demand. Reach for it if icons ever go blank or broken between updates.

## 0.1.6-beta

### Added

- **English, Русский and 简体中文.** The whole overlay, and the item and room
  names with it — the tables carry all three, so nothing is left half-translated.
  It follows Windows by default and can be set by hand in Settings.
- **Tracker style.** Two layouts for the farm readout, chosen in Settings under
  *Appearance*:
  - **Minimalistic** — the original. Every stat gets the same card, three to a
    row, and you read the one you came for.
  - **Torchlight** — built around your best drop of the session: its art, its
    worth and its name across the top, with the rest demoted to a band of
    smaller figures underneath. Expanded still shows the full loot list.

  Both are the same numbers; only the arrangement differs.

## Pak 2883951116 — published 2026-08-23 10:55

1749 → **1812** items, 1640 → **1703** playable, 40 → **45** abilities.

### Added — 63 items

62 gem, 1 equip.

<details><summary><b>gem — 62</b></summary>

| id | name | quality | level |
|---|---|---|---|
| `item_G100_4` | 符印：分裂斩击Ⅳ | q6 | L8 |
| `item_G101_4` | 符印：多重斩击Ⅳ | q6 | L8 |
| `item_G102_4` | 符印：角质化Ⅳ | q6 | L8 |
| `item_G103_4` | 符印：暴虐Ⅳ | q6 | L8 |
| `item_G104_4` | 符印：旋舞螺旋Ⅳ | q6 | L8 |
| `item_G105_4` | 符印：双重螺旋Ⅳ | q6 | L8 |
| `item_G106_4` | 符印：甲胄爆裂Ⅳ | q6 | L8 |
| `item_G107_4` | 符印：炽热螺旋Ⅳ | q6 | L8 |
| `item_G108_4` | 符印：绝境斩击Ⅳ | q6 | L8 |
| `item_G109_4` | 符印：嗜血斩击Ⅳ | q6 | L8 |
| `item_G110_4` | 符印：旋风螺旋Ⅳ | q6 | L8 |
| `item_G111_4` | 符印：易伤倾泻Ⅳ | q6 | L8 |
| `item_G112_4` | 符印：怒意斩击Ⅳ | q6 | L8 |
| `item_G114_4` | 符印：怒吼余震Ⅳ | q6 | L8 |
| `item_G200_4` | 符印：绝对冷静Ⅳ | q6 | L8 |
| `item_G202_4` | 符印：指尖戏法Ⅳ | q6 | L8 |
| `item_G203_4` | 符印：无限猎手Ⅳ | q6 | L8 |
| `item_G204_4` | 符印：暗器绝技Ⅳ | q6 | L8 |
| `item_G206_4` | 符印：无极斩Ⅳ | q6 | L8 |
| `item_G207_4` | 符印：鬼影斩Ⅳ | q6 | L8 |
| `item_G208_4` | 符印：切割Ⅳ | q6 | L8 |
| `item_G209_4` | 符印：分影斩Ⅳ | q6 | L8 |
| `item_G210_4` | 符印：弹射镖Ⅳ | q6 | L8 |
| `item_G211_4` | 符印：致伤刀阵Ⅳ | q6 | L8 |
| `item_G212_4` | 符印：高阶洞察Ⅳ | q6 | L8 |
| `item_G213_4` | 符印：弱点洞悉Ⅳ | q6 | L8 |
| `item_G214_4` | 符印：魅影刀阵Ⅳ | q6 | L8 |
| `item_G300_4` | 符印：灼地龙破Ⅳ | q6 | L8 |
| `item_G301_4` | 符印：超载龙破Ⅳ | q6 | L8 |
| `item_G302_4` | 符印：炽魂疾行Ⅳ | q6 | L8 |
| `item_G303_4` | 符印：火咒复燃Ⅳ | q6 | L8 |
| `item_G305_4` | 符印：火陨凝咒Ⅳ | q6 | L8 |
| `item_G309_4` | 符印：龙魄Ⅳ | q6 | L8 |
| `item_G310_4` | 符印：双影龙破Ⅳ | q6 | L8 |
| `item_G312_4` | 符印：陨石雨Ⅳ | q6 | L8 |
| `item_G314_4` | 符印：化神Ⅳ | q6 | L8 |
| `item_G315_4` | 符印：双重光击Ⅳ | q6 | L8 |
| `item_G316_4` | 符印：爆裂Ⅳ | q6 | L8 |
| `item_G400` | Sigil: Frost Corrosion I | q3 | L3 |
| `item_G400_2` | Sigil: Frost Corrosion II | q4 | L4 |
| `item_G400_3` | Sigil: Frost Corrosion III | q5 | L5 |
| `item_G401` | 符印：冻魄Ⅰ | q3 | L3 |
| `item_G401_2` | 符印：冻魄Ⅱ | q4 | L4 |
| `item_G401_3` | 符印：冻魄Ⅲ | q5 | L5 |
| `item_G402` | 符印：繁星Ⅰ | q3 | L3 |
| `item_G402_2` | 符印：繁星Ⅱ | q4 | L4 |
| `item_G402_3` | 符印：繁星Ⅲ | q5 | L5 |
| `item_G403` | 符印：凝眸Ⅰ | q3 | L3 |
| `item_G403_2` | 符印：凝眸Ⅱ | q4 | L4 |
| `item_G403_3` | 符印：凝眸Ⅲ | q5 | L5 |
| `item_G404` | 符印：叠矢Ⅰ | q3 | L3 |
| `item_G404_2` | 符印：叠矢Ⅱ | q4 | L4 |
| `item_G404_3` | 符印：叠矢Ⅲ | q5 | L5 |
| `item_G406` | 符印：疾弦Ⅰ | q3 | L3 |
| `item_G406_2` | 符印：疾弦Ⅱ | q4 | L4 |
| `item_G406_3` | 符印：疾弦Ⅲ | q5 | L5 |
| `item_G407` | 符印：霜羽Ⅰ | q3 | L3 |
| `item_G407_2` | 符印：霜羽Ⅱ | q4 | L4 |
| `item_G407_3` | 符印：霜羽Ⅲ | q5 | L5 |
| `item_G408` | 符印：淬霜Ⅰ | q3 | L3 |
| `item_G408_2` | 符印：淬霜Ⅱ | q4 | L4 |
| `item_G408_3` | 符印：淬霜Ⅲ | q5 | L5 |

</details>

### equip — 1

| id | name | quality | level |
|---|---|---|---|
| `item_0322` | 裂矢弓 | q4 | L4 |

### Prices changed — 15

| id | name | was | now |
|---|---|---|---|
| `item_2020` | Assassin Notes (Tier 3) | 800 | **1500** |
| `item_2021` | Warrior Notes (Tier 3) | 800 | **1500** |
| `item_2022` | Mage Notes (Tier 3) | 800 | **1500** |
| `item_2023` | Archer Notes (Tier 3) | 800 | **1500** |
| `item_2024` | Ice Maiden Notes (Tier 3) | 800 | **1500** |
| `item_2030` | Assassin Notes (Tier 4) | 800 | **3000** |
| `item_2031` | Warrior's Notes (Tier 4) | 800 | **3000** |
| `item_2032` | Mage's Notes (Tier 4) | 800 | **3000** |
| `item_2033` | _unnamed in the addon_ | 800 | **3000** |
| `item_2034` | _unnamed in the addon_ | 800 | **3000** |
| `item_2040` | Assassin's Notes (Tier 5) | 800 | **8000** |
| `item_2041` | Warrior's Notes (Tier 5) | 800 | **8000** |
| `item_2042` | Mage's Notes (Tier 5) | 800 | **8000** |
| `item_2043` | _unnamed in the addon_ | 800 | **8000** |
| `item_2044` | _unnamed in the addon_ | 800 | **8000** |

### Levels changed — 12

| id | name | was | now |
|---|---|---|---|
| `item_0548` | Diamond Body | 10 | **9** |
| `item_0568` | Toxin Convergence | 10 | **9** |
| `item_0570` | Crown of Ten Thousand Curses | 10 | **9** |
| `item_0577` | Tome of Soul Erosion | 10 | **9** |
| `item_0602` | Cycle of Surge and Distill | 10 | **9** |
| `item_0603` | Proof of Six Extremes | 9 | **10** |
| `item_0604` | Overheat Core | 10 | **9** |
| `item_0607` | Curse Brand | 10 | **9** |
| `item_0608` | Crown of Paranoia | 10 | **9** |
| `item_0631` | Overheat Core | 10 | **9** |
| `item_5001` | Skyfall Invitation (Tier 1) | 7 | **6** |
| `item_M408` | Guild Charter | 1 | **2** |

### Heroes and abilities

- **drow_ranger** gained 5: `drow_006`, `drow_007`, `drow_008`, `drow_009`, `drow_010`

<details><summary><b>Renamed in English — 288</b></summary>

| id | was | now |
|---|---|---|
| `item_0144` | Shadow Amulet | ★Shadow Amulet |
| `item_0145` | Ghost Scepter | ★Ghost Scepter |
| `item_0161` | Selimone's Crown | ★Selimone's Crown |
| `item_0187` | Blackfeather Sword | ★Blackfeather Sword |
| `item_0190` | Force Staff | ★Force Staff |
| `item_0192` | Meteor Hammer | ★Meteor Hammer |
| `item_0196` | Orchid | ★Orchid Malevolence |
| `item_0197` | Spirit Binding Lock | Gleipnir |
| `item_0199` | Wind Staff | ★Wind Staff |
| `item_0204` | Aghanim's Scepter | ★Aghanim's Blessing |
| `item_0206` | Desolator | ★Desolator |
| `item_0211` | Shadow Blade | ★Shadow Blade |
| `item_0224` | Solar Crest | ★Solar Crest |
| `item_0232` | Blade of Fleeting Shadow | ★Blade of Fleeting Shadow |
| `item_0233` | Eye of Skadi | ★Eye of Skadi |
| `item_0239` | Stonebreaker | ★Stonebreaker |
| `item_0241` | Bloodthirsty Heart | ★Bloodthirsty Heart |
| `item_0308` | Blade of Valor | ★Aghanim's Scepter |
| `item_0311` | Avenger's Bloodhand | ★Armor-Piercing Heavy Blade |
| `item_0331` | Lionheart Hammer | Guardian Hammer |
| `item_0334` | Thorn Shield | ★Thorned Shield |
| `item_0350` | Boots of Tolerance | Beast Leather Boots |
| `item_0392` | Beast Leather Boots | Boots of Tolerance |
| `item_0420` | Blood Moon Fragment | Bloodthorn Blade |
| `item_0428` | Mjolnir | Mjollnir |
| `item_0436` | Void Eye | Eye of the Void |
| `item_0443` | Sage's Ring | Ring of Blessing |
| `item_0445` | Assassin's Satchel | Swift Shadow Backpack |
| `item_0456` | Solar Robe | Robe of the Sage |
| `item_0457` | Sword of Valor | Sword of Courage |
| `item_0513` | Crystallized Lightning | Condensed Lightning Crystal |
| `item_0515` | Sanguine Sovereignty | Bloodthirsty Sovereignty |
| `item_0523` | Shadow Rush | Swift Shadow Gloves |
| `item_0528` | Tempered Blade | Thousandfold Blade |
| `item_0536` | Raging Tide Axe | Lionheart Battleaxe |
| `item_0544` | Heavenly Halberd | Heaven's Halberd |
| `item_1101` | Blueprint: Wooden Stick | Recipe: Wooden Stick |
| `item_1102` | Blueprint: Cracked Vest | Recipe: Shattered Vest |
| `item_1103` | Blueprint: Chainmail | Recipe: Chainmail |
| `item_1104` | Blueprint: Helm of Iron Will | Recipe: Helm of Iron Will |
| `item_1105` | Blueprint: Boots of Speed | Recipe: Boots of Speed |
| `item_1106` | Blueprint: Ogre Axe | Recipe: Ogre Axe |
| `item_1107` | Blueprint: Scale Mail | Recipe: Piece of Armor |
| `item_1108` | Blueprint: Ring of Regen | Recipe: Ring of Regeneration |
| `item_1109` | Blueprint: Travel Pack | Recipe: Travel Pack |
| `item_1110` | Blueprint: Mystic Pendant | Recipe: Wizard Robe |
| `item_1111` | Blueprint: Blade of Alacrity | Recipe: Blade of Alacrity |
| `item_1112` | Blueprint: Bracer | Recipe: Bracer |
| `item_1113` | Blueprint: Power Boots | Recipe: Power Treads |
| `item_1114` | Blueprint: Claymore | Recipe: Great Sword |
| `item_1115` | Blueprint: Talisman of Evasion | Recipe: Talisman of Evasion |
| `item_1116` | Blueprint: Blades of Attack | Recipe: Blades of Attack |
| `item_1117` | Blueprint: Maelstrom | Recipe: Maelstrom |
| `item_1121` | Recipe: Sharp Axe | Recipe: Keen Greataxe |
| `item_1128` | Recipe: Lightning Gloves | Recipe: Lightning Gauntlet |
| `item_1131` | Recipe: Crystalys | Recipe: Crystal Sword |
| `item_1133` | Recipe: Circlet | Recipe: Noble Circlet |
| `item_1134` | Recipe: Slippers of Agility | Recipe: Elven Cloth Belt |
| `item_1135` | Recipe: Robe of the Magi | Recipe: Mage Robe |
| `item_1138` | Recipe: Crown | Recipe: Gem Crown |
| `item_1139` | Recipe: Vitality Booster | Recipe: Essence Sphere |
| `item_1141` | Recipe: Fluffy Hat | Recipe: Fuzzy Hat |
| `item_1144` | Recipe: Shadow Amulet | Recipe: ★Shadow Amulet |
| `item_1145` | Recipe: Ghost Scepter | Recipe: ★Ghost Scepter |
| `item_1153` | Recipe: Oblivion Staff | Recipe: Staff of Wizardry |
| `item_1158` | Recipe: Silver Moon Crystal | Recipe: Moon Shard |
| `item_1159` | Recipe: Soul Suppression Stone | Recipe: Soul Booster |
| `item_1160` | Recipe: Ring of the Dread Turtle | Recipe: Ring of Tarrasque |
| `item_1161` | Recipe: Crown of Celimone | Recipe: ★Selimone's Crown |
| `item_1162` | Recipe: Ring of Plenty | Recipe: Ring of Abundance |
| `item_1169` | Recipe: Destruction Orb | Recipe: Orb of Destruction |
| `item_1175` | Recipe: Tide Pendant | Recipe: Frost Pendant |
| `item_1180` | Recipe: Sange and Kaya | Recipe: Kaya and Sange |
| `item_1181` | Recipe: Kaya and Yasha | Recipe: Yasha and Kaya |
| `item_1187` | Recipe: Eaglesong | Recipe: ★Blackfeather Sword |
| `item_1190` | Recipe: Force Staff | Recipe: ★Force Staff |
| `item_1192` | Recipe: Meteor Hammer | Recipe: ★Meteor Hammer |
| `item_1196` | Recipe: Orchid Malevolence | Recipe: ★Orchid Malevolence |
| `item_1199` | Recipe: Wind Waker | Recipe: ★Wind Staff |
| `item_1204` | Recipe: Aghanim's Scepter | Recipe: ★Aghanim's Blessing |
| `item_1206` | Recipe: Desolator | Recipe: ★Desolator |
| `item_1211` | Recipe: Shadow Blade | Recipe: ★Shadow Blade |
| `item_1212` | Recipe: Pavise | Recipe: Revenant's Brooch |
| `item_1213` | Recipe: Phylactery | Recipe: Holy Axe |
| `item_1218` | Blueprint: Divine Rapier | Recipe: Divine Rapier |
| `item_1219` | Blueprint: Diffusal Blade | Recipe: Soul Scatter Blade |
| `item_1220` | Blueprint: Butterfly | Recipe: Butterfly |
| `item_1221` | Blueprint: Bloodthorn | Recipe: Bloodthorn |
| `item_1222` | Blueprint: Arcane Boots | Recipe: Arcane Pendant |
| `item_1223` | Blueprint: Tranquil Boots | Recipe: Tranquil Boots |
| `item_1224` | Blueprint: Solar Crest | Recipe: ★Solar Crest |
| `item_1225` | Blueprint: Vanguard | Recipe: Vanguard |
| `item_1226` | Blueprint: Blade Mail | Recipe: Blade Mail |
| `item_1227` | Blueprint: Dragon Lance | Recipe: Dragon Lance |
| `item_1228` | Blueprint: Arcane Boots | Recipe: Arcane Boots |
| `item_1229` | Blueprint: Battle Fury | Recipe: Battle Fury |
| `item_1230` | Blueprint: Elite Satchel | Recipe: Elite Satchel |
| `item_1231` | Blueprint: Essence Ring | Recipe: Essence Ring |
| `item_1232` | Blueprint: Heartpiercer | Recipe: ★Blade of Fleeting Shadow |
| `item_1233` | Blueprint: Eye of Skadi | Recipe: ★Eye of Skadi |
| `item_1234` | Blueprint: Corrosive Scythe | Recipe: Corrosive Spine |
| `item_1235` | Blueprint: Dragonbone Greatsword | Recipe: Dragonbone Greatsword |
| `item_1236` | Blueprint: Swift Shadow Boots | Recipe: Swift Shadow Greaves |
| `item_1237` | Blueprint: Bloodseeker's Boots | Recipe: Bloodhunter's Boots |
| `item_1238` | Recipe: Murky Armor | Recipe: Gloom Armor |
| `item_1239` | Recipe: xxxx | Recipe: ★Stonebreaker |
| `item_1240` | Recipe: Unyielding Heavy Armor | Recipe: Unyielding Cuirass |
| `item_1241` | Recipe: Mythical Battle Armor | Recipe: ★Bloodthirsty Heart |
| `item_1242` | Recipe: Mythical Robe | Recipe: Ember Ring |
| `item_1243` | Recipe: Mythical Staff | Recipe: Skinning Knife |
| `item_1244` | Recipe: Mythical Pendant | Recipe: Boiling Blood Amulet |
| `item_1245` | Recipe: Mythical Light Blade | Recipe: Tormentor's Crossbow |
| `item_1246` | Recipe: Mythical Bracer | Recipe: Boots of Oblivion |
| `item_1247` | Recipe: Mythical War Boots | Recipe: Bone-Eating Core |
| `item_1248` | Recipe: Mythical Blade Ring | Recipe: Plague Totem |
| `item_1249` | Recipe: Mythical Evasion Cloak | Recipe: Execution |
| `item_1250` | Recipe: Mythical War Boots | Recipe: Kobold Goblet |
| `item_1251` | Recipe: Mythical Blade Ring | Recipe: Tadpole Charm |
| `item_1252` | Recipe: Mythical Evasion Cloak | Recipe: Dormant Treasure |
| `item_1296` | Recipe: Frost Soul Greatsword | Recipe: Frost Fang |
| `item_1302` | Recipe: Arcane Pouch | Recipe: Arcane Bag |
| `item_1308` | Recipe: Blade of Courage | Recipe: ★Aghanim's Scepter |
| `item_1309` | Recipe: Hurricane Pike | Recipe: Tempest Pike |
| `item_1311` | Recipe: Avenger's Gauntlets | Recipe: ★Armor-Piercing Heavy Blade |
| `item_1314` | Recipe: Crown | Recipe: Imperial Crown |
| `item_1315` | Recipe: King's Pack | Recipe: King's Backpack |
| `item_1319` | Recipe: Slaughter Spikes | Recipe: Carnage Spike |
| `item_1320` | Recipe: Daedalus | Recipe: Daedalus' Lament |
| `item_1321` | Recipe: Heart of Tarrasque | Recipe: Heart of the Dreaded Turtle |
| `item_1330` | Recipe: Medal of Sacrifice | Recipe: Medallion of Sacrifice |
| `item_1331` | Recipe: Lionheart Warhammer | Recipe: Guardian Hammer |
| `item_1334` | Recipe: Thorned Shield | Recipe: ★Thorned Shield |
| `item_1345` | Recipe: Lightning Rod | Recipe: Lightning Scepter |
| `item_1346` | Recipe: Nightcrow Cloak | Recipe: Nightraven Cloak |
| `item_1350` | Recipe: Boots of Tolerance | Recipe: Beast Leather Boots |
| `item_1360` | Recipe: Hunting Boots | Recipe: Pursuit Boots |
| `item_1361` | Recipe: Nether Spines | Recipe: Phantom Spike |
| `item_1366` | Recipe: Spiked Gauntlet | Recipe: Spiked Gauntlets |
| `item_1367` | Recipe: Shadow Greaves | Recipe: Shadow Boots |
| `item_1371` | Recipe: Blade of Corruption | Recipe: Corrosion Blade |
| `item_1374` | Recipe: Sniper Gloves | Recipe: Sniper's Gloves |
| `item_1385` | Recipe: Lionheart Pack | Recipe: Lionheart Backpack |
| `item_1391` | Recipe: Frost Satchel | Recipe: Frost Pack |
| `item_1392` | Recipe: Hide Warboots | Recipe: Boots of Tolerance |
| `item_1394` | Recipe: Sacred Vestments | Recipe: Sacred Armor |
| `item_1397` | Recipe: Hand of Serpent's Shadow | Recipe: Serpent Shadow Hand |
| `item_1398` | Recipe: Bloodrend Heavy Blade | Recipe: Bloodbreaker Heavy Blade |
| `item_1399` | Recipe: Blood Oath Broken Blade | Recipe: Blood Pact Cleaver |
| `item_1401` | Recipe: Empty Blade Talisman | Recipe: Void Blade Charm |
| `item_1403` | Recipe: Ripper Gauntlet | Recipe: Ripper Gauntlets |
| `item_1404` | Recipe: Shadow Garment | Recipe: Shadow Armor |
| `item_1409` | Recipe: Burning Pattern Ring | Recipe: Ashmark Ring |
| `item_1411` | Recipe: Frost Rift Shoulderguards | Recipe: Frost Rift Pauldrons |
| `item_1420` | Recipe: Blood Moon Fragment | Recipe: Bloodthorn Blade |
| `item_1426` | Blueprint: Void Backpack | Recipe: Void Backpack |
| `item_1428` | Recipe: Mjolnir | Recipe: Mjollnir |
| `item_1432` | Recipe: Supreme Divine Crown | Recipe: Supreme Crown |
| `item_1436` | Recipe: Void Eye | Recipe: Eye of the Void |
| `item_1440` | Recipe: Eternal Fall | Recipe: Cosmic Pendant |
| `item_1441` | Recipe: Omnipotent Blessing | Recipe: Omni Blessing |
| `item_1444` | Recipe: Daedalus | Recipe: Daedalus's Sorrow |
| `item_1445` | Recipe: Assassin's Backpack | Recipe: Swift Shadow Backpack |
| `item_1448` | Recipe: Arcane Staff | Recipe: Mana Wand |
| `item_1452` | Recipe: Mystic Emblem | Recipe: Mystic Crest |
| `item_1453` | Recipe: Ghostly Thorn | Recipe: Stygian Spike |
| `item_1454` | Recipe: Rainbow Edge | Recipe: Iridescent Blade |
| `item_1456` | Recipe: Polar Day Robe | Recipe: Robe of the Sage |
| `item_1457` | Blueprint: Sword of Courage | Recipe: Sword of Courage |
| `item_1459` | Recipe: Valorous Crown | Recipe: Spirit Crown |
| `item_1466` | Recipe: Shadow Sage's Crown | Recipe: Shadow Sage Crown |
| `item_1467` | Recipe: Demon War Axe | Recipe: Demon God Axe |
| `item_1468` | Recipe: Thor's Fury | Recipe: Thor's Wrath |
| `item_1469` | Recipe: Thunderfang | Recipe: Thunder Fang |
| `item_1470` | Recipe: Storm Eye | Recipe: Eye of the Storm |
| `item_1502` | Recipe: Demon Armor | Recipe: Demon God Armor |
| `item_1503` | Recipe: Edge Blade | Recipe: Charge Blade |
| `item_1505` | Recipe: Helheim Staff | Recipe: Staff of Helheim |
| `item_1506` | Recipe: Thunder Crown of Nine Heavens | Recipe: Nine Heavens Thunder Crown |
| `item_1507` | Recipe: Wrath of Thunder Punishment | Recipe: Wrath of Lightning Punishment |
| `item_1509` | Recipe: Lightning Bind Ring | Recipe: Lightning Binding Ring |
| `item_1510` | Recipe: Quenched Lightning Fang | Recipe: Lightning Poison Fang |
| `item_1512` | Recipe: Swift Thunder Pendant | Recipe: Swift Lightning Pendant |
| `item_1514` | Recipe: Shadowy Void Scepter | Recipe: Void Shadow Scepter |
| `item_1516` | Recipe: Demon God Gauntlets | Recipe: Demon God Gloves |
| `item_1517` | Recipe: Skyward Slash Blade | Recipe: Skyrend Blade |
| `item_1518` | Recipe: Star Eclipse Disk | Recipe: Eclipse Star Chart |
| `item_1520` | Recipe: Soul Devouring Blood Blade | Recipe: Soulreaper Bloodblade |
| `item_1523` | Recipe: Shadow Dash Strike | Recipe: Swift Shadow Gloves |
| `item_1524` | Recipe: Infernal Treads | Recipe: Infernal Boots |
| `item_1527` | Recipe: Lionheart's Crown | Recipe: Lionheart Crown |
| `item_1534` | Recipe: Emblem of Burning Sky | Recipe: Blazing Sky Crest |
| `item_1536` | Recipe: Frenzy Battleaxe | Recipe: Lionheart Battleaxe |
| `item_1537` | Recipe: Tome of Wisdom | Recipe: Tome of Arcane Depths |
| `item_1539` | Recipe: Eternal Loop | Recipe: Ring of Eternal Recurrence |
| `item_1543` | Recipe: Mana-Eater Grip | Recipe: Mana Drain Grip |
| `item_1551` | Recipe: Spirit Spring | Recipe: Mystic Spring |
| `item_1564` | Recipe: Psionic Perpetuity | Recipe: Psionic Continuance |
| `item_1569` | Recipe: Time Lag Blood Pact | Recipe: Time-Lag Blood Pact |
| `item_1589` | Recipe: Heavenfall Core | Recipe: Skyfall Core |
| `item_1596` | Recipe: Blade of Blood Sacrifice | Recipe: Blood Sacrifice Blade |
| `item_1599` | Recipe: Shadow Dancer's Silk | Recipe: Shadow Dancer's Sash |
| `item_1604` | Recipe: Overheated Blood Pendant | Recipe: Overheat Core |
| `item_1606` | Recipe: Overclocked Bracer | Recipe: Overclock Bracer |
| `item_1619` | Recipe: Solar Forge | Recipe: Solar Furnace |
| `item_1620` | Recipe: Heavy Blade of Legion | Recipe: Army Breaker Blade |
| `item_1622` | Recipe: Starbreaker Axe | Recipe: Star-Shatter Battle Axe |
| `item_1635` | Recipe: Rock-Splitter Grip | Recipe: Rockrender Grip |
| `item_1637` | Recipe: Ender's Fierce Blade | Recipe: Ender Reaver |
| `item_1644` | Recipe: Book of the Poison Sect | Recipe: Tome of the Poison Sect |
| `item_1648` | Recipe: Demon Edge | Recipe: Demon Sword |
| `item_1M404` | Blueprint: Kaitis Relic | Recipe: Katis Relic |
| `item_1M503` | Blueprint: Maya Relic | Recipe: Maya Relic |
| `item_1M509` | Blueprint: Primal Crystal | Recipe: Primordial Crystal |
| `item_1M518` | Recipe: Core of Frigid Silence | Recipe: Frozen Core |
| `item_1M519` | Recipe: Core of Scorching Silence | Recipe: Combustion Core |
| `item_1M528` | Recipe: Thunderhide Leather | Recipe: Thunder Leather |
| `item_1M540` | Recipe: Shadow Ingot | Recipe: Dread Ingot |
| `item_AP025` | Recipe: Greater Restoration Potion | Recipe: Greater Recovery Potion |
| `item_AP032` | Recipe: Ultimate Enlightenment Potion | Recipe: Superior Enlightenment Potion |
| `item_AP036` | Recipe: Ultimate Spell Mastery Potion | Recipe: Superior Spell Mastery Potion |
| `item_AP048` | Recipe: Advanced Magic Potion | Recipe: Advanced Mana Potion |
| `item_AP053` | Recipe: Lightning Concoction | Recipe: Lightning Mixture |
| `item_AP054` | Recipe: Thunder Elixir | Recipe: Thunderstrike Elixir |
| `item_AP260` | Recipe: Aghanim's Primal | Recipe: Aghanim's Core |
| `item_M302` | Endwood Plank | Ender Plank |
| `item_M306` | End Ore | Ender Ore |
| `item_M307` | End Powder | Ender Powder |
| `item_M310` | Ender Hide | Ender Leather |
| `item_M319` | Black Scales | Ender Hide |
| `item_M320` | End Crystal | Ender Crystal |
| `item_M510` | Umbral Crystal | Ender Crystal |
| `item_P012` | Arcane Potion | Esoteric Potion |
| `item_P022` | Greater Armor Potion | Greater Defense Potion |
| `item_P025` | Greater Regeneration Potion | Greater Recovery Potion |
| `item_P030` | Enlightening Potion | Enlightenment Potion |
| `item_P032` | Superior Enlightening Potion | Superior Enlightenment Potion |
| `item_P034` | Spell Mastery Elixir | Spell Damage Potion |
| `item_P035` | Greater Spell Mastery Elixir | Greater Spell Mastery Potion |
| `item_P036` | Superior Spell Mastery Elixir | Superior Spell Mastery Potion |
| `item_P048` | Greater Mana Potion | Advanced Mana Potion |
| `item_P222` | Endshadow Special | Ender Special |
| `item_P253` | Ender Contract | Ender Secret Pact |
| `item_P270` | 狮心秘酒 | Lionheart's Secret Brew |
| `item_P271` | 神秘扩容包 | Mysterious Expansion Pack |
| `item_YP000` | Recipe: Minor Health Potion | Recipe: Lesser Health Potion |
| `item_YP003` | Recipe: Potent Health Potion | Recipe: Superior Health Potion |
| `item_YP004` | Recipe: Minor Mana Potion | Recipe: Lesser Mana Potion |
| `item_YP005` | Blueprint: Magic Potion | Recipe: Mana Potion |
| `item_YP006` | Blueprint: Defense Potion | Recipe: Defense Potion |
| `item_YP007` | Blueprint: Restoration Potion | Recipe: Recovery Potion |
| `item_YP008` | Blueprint: Swiftness Potion | Recipe: Swiftness Potion |
| `item_YP009` | Blueprint: Rage Potion | Recipe: Fury Potion |
| `item_YP010` | Blueprint: Warmth Potion | Recipe: Warmth Potion |
| `item_YP011` | Blueprint: Tenacity Potion | Recipe: Fortitude Potion |
| `item_YP012` | Blueprint: Esoteric Potion | Recipe: Esoteric Potion |
| `item_YP014` | Blueprint: Arcane Potion | Recipe: Arcane Potion |
| `item_YP015` | Blueprint: Frenzy Potion | Recipe: Frenzy Potion |
| `item_YP016` | Blueprint: Guardian Potion | Recipe: Guardian Potion |
| `item_YP021` | Blueprint: Magic Resistance Potion | Recipe: Magic Resistance Potion |
| `item_YP023` | Recipe: Supreme Defense Potion | Recipe: Superior Defense Potion |
| `item_YP024` | Recipe: Stone Shield Mixture | Recipe: Stone Shield Elixir |
| `item_YP026` | Recipe: Supreme Recovery Potion | Recipe: Superior Recovery Potion |
| `item_YP027` | Recipe: Nourishing Mixture | Recipe: Nourishing Elixir |
| `item_YP033` | Recipe: Endless Knowledge Mixture | Recipe: Endless Knowledge Elixir |
| `item_YP041` | Recipe: Supreme Swiftness Potion | Recipe: Superior Swiftness Potion |
| `item_YP043` | Recipe: Mana Potion | Recipe: Mana Regeneration Potion |
| `item_YP045` | Recipe: Supreme Mana Regeneration Potion | Recipe: Superior Mana Regeneration Potion |
| `item_YP046` | Recipe: Meditation Mixture | Recipe: Meditation Elixir |
| `item_YP049` | Blueprint: Luminescent Potion | Recipe: Glow Potion |
| `item_YP051` | Recipe: Nature's Secret Elixir | Recipe: Nature's Elixir |
| `item_YP056` | Blueprint: Attack Elixir II | Recipe: Attack Potion II |
| `item_YP057` | Blueprint: Defense Elixir II | Recipe: Defense Potion II |
| `item_YP101` | Recipe: Strong Magic Potion | Recipe: Greater Mana Potion |
| `item_YP157` | Recipe: Monkey King Fruit Wine | Recipe: Monkey King's Fruit Wine |
| `item_YP158` | Recipe: Frost Wolf Brew | Recipe: Frostwolf Brew |
| `item_YP159` | Recipe: Celestial Feather Wine | Recipe: Skyfeather Fruit Wine |
| `item_YP160` | Recipe: Perseverance Ale | Recipe: Endurance Ale |
| `item_YP200` | Blueprint: Fairy's Secret Wine | Recipe: Fairy's Secret Wine |
| `item_YP201` | Blueprint: Dragon's Breath Ale | Recipe: Dragonfire Brew |
| `item_YP202` | Blueprint: Polar Ice Wine | Recipe: Polar Ice Wine |
| `item_YP203` | Blueprint: Night Watchman's Dark Wine | Recipe: Shadow Thief's Moonshine |
| `item_YP204` | Blueprint: Moon Shadow White Brew | Recipe: Moonlight White Brew |
| `item_YP205` | Blueprint: Serpent's Kiss | Recipe: Serpent's Kiss |
| `item_YP206` | Blueprint: Griffin Brandy | Recipe: Gryphon Brandy |
| `item_YP207` | Blueprint: Crimson Breath | Recipe: Scarlet Breath |
| `item_YP220` | Blueprint: Serene Echo | Recipe: Serene Echo |
| `item_YP258` | Recipe: Mechanism Secret Box | Recipe: Mechanical Secret Chest |
| `item_YP261` | Recipe: Stormbrew | Recipe: Storm Brew |

</details>

<details><summary><b>Renamed in Russian — 410</b></summary>

| id | was | now |
|---|---|---|
| `item_0145` | Жезл призрака | ★Жезл призрака |
| `item_0187` | Чернопёрый Меч | ★Чернопёрый Меч |
| `item_0190` | Посох Силы | ★Посох Силы |
| `item_0192` | Метеоритный Молот | ★Метеоритный Молот |
| `item_0196` | Орхидея | ★Орхидея |
| `item_0197` | Посох Атоса | Глейпнир |
| `item_0199` | Жезл ветра | ★Жезл ветра |
| `item_0204` | Аганим | ★Благословение Аганима |
| `item_0206` | ★Разрушитель | ★Дезолятор |
| `item_0207` | Боевая Ярость | Боевая ярость |
| `item_0232` | Клинок теней | ★Клинок мимолетной тени |
| `item_0241` | Кровожадное сердце | ★Кровожадное сердце |
| `item_0308` | ★ Аганимов скипетр | ★Скипетр Аганима |
| `item_0311` | ★ Кровавая перчатка мстителя | ★Тяжёлый бронебойный клинок |
| `item_0321` | Сердце Ужасной Черепахи | Сердце ужасной черепахи |
| `item_0331` | Молот Защитника | Молот защитника |
| `item_0334` | ★Щит шипов | ★Шипастый Щит |
| `item_0338` | Эфирный звездный посох | Эфирный звёздный посох |
| `item_0366` | Шипованный браслет | Шипованные наручи |
| `item_0370` | Теневой клинок | Клинок полумрака |
| `item_0385` | Рюкзак Львиного Сердца | Рюкзак Львиного сердца |
| `item_0391` | Морозная Сумка | Морозная сумка |
| `item_0392` | Сапоги Терпимости | Сапоги терпимости |
| `item_0394` | Священный Доспех | Священный доспех |
| `item_0395` | Легкая броня Кровавого демона | Лёгкая броня кровавого демона |
| `item_0397` | Рука Змеиной Тени | Рука змеиной тени |
| `item_0398` | Тяжелый клинок Кровавого разрыва | Тяжёлый клинок кровавого разрыва |
| `item_0403` | Наручи Разрывателя | Наручи разрывателя |
| `item_0420` | Фрагмент кровавой луны | Меч кровавого шипа |
| `item_0426` | Рюкзак Пустоты | Рюкзак пустоты |
| `item_0440` | Падение вселенной | Космический кулон |
| `item_0443` | Кольцо мудреца | Кольцо благословения |
| `item_0445` | Сумка убийцы | Рюкзак быстрой тени |
| `item_0453` | Призрачный шип | Стигийский шип |
| `item_0460` | Молот Львиного Сердца | Молот Львиного сердца |
| `item_0468` | Гнев Грома | Гнев грома |
| `item_0469` | Клык Грома | Клык грома |
| `item_0470` | Око Бури | Око бури |
| `item_0500` | Шипастый Страж | Шипастый страж |
| `item_0502` | Доспех Демона | Доспех бога демонов |
| `item_0513` | Кристалл конденсации молний | Кристалл сгущённой молнии |
| `item_0515` | Скипетр кровожадности | Кровавое владычество |
| `item_0516` | Перчатки демона | Перчатки бога демонов |
| `item_0520` | Кровавый клинок души | Кровавый клинок душ |
| `item_0523` | Стремительный удар теней | Перчатки быстрой тени |
| `item_0527` | Корона Львиного Сердца | Корона Львиного сердца |
| `item_0536` | Секира бурных волн | Секира Львиного сердца |
| `item_0537` | Гримуар мудрости | Гримуар бездны мудрости |
| `item_0604` | Перегретое Ядро | Перегретое ядро |
| `item_0606` | Браслет Разгона | Браслет разгона |
| `item_0609` | Броня Паладина | Броня паладина |
| `item_0644` | Книга ордена Яда | Книга ордена яда |
| `item_0651` | Кулон Быстрой Тени | Подвеска быстрой тени |
| `item_1101` | Чертеж: Деревянная палка | Рецепт: Дубинка |
| `item_1102` | Чертеж: Разбитый жилет | Рецепт: Трескающийся жилет |
| `item_1103` | Чертеж: Кольчуга | Рецепт: Кольчуга |
| `item_1104` | Чертеж: Шлем железной воли | Рецепт: Железный шлем |
| `item_1105` | Чертеж: Сапоги скорости | Рецепт: Сапоги скорости |
| `item_1106` | Чертеж: Топор огров | Рецепт: Топор огров |
| `item_1107` | Чертеж: Обломок брони | Рецепт: Обломок брони |
| `item_1108` | Чертеж: Кольцо восстановления | Рецепт: Кольцо восстановления |
| `item_1109` | Чертеж: Дорожная сумка | Рецепт: Дорожная сумка |
| `item_1110` | Чертеж: Таинственный кулон | Рецепт: Мантия темного колдуна |
| `item_1111` | Рецепт: Клинок проворства | Рецепт: Клинок радости |
| `item_1112` | Рецепт: Браслет | Рецепт: Наручи |
| `item_1113` | Рецепт: Силовые сапоги | Рецепт: Энергетические сапоги |
| `item_1114` | Рецепт: Клеймор | Рецепт: Большой меч |
| `item_1115` | Рецепт: Талисман уклонения | Рецепт: Плащ сопротивления магии |
| `item_1116` | Рецепт: Когти атаки | Рецепт: Коготь атаки |
| `item_1117` | Рецепт: Мальстрем | Рецепт: Вихрь |
| `item_1119` | Рецепт: Клинок лесоруба | Рецепт: Клинок подавления |
| `item_1123` | Рецепт: Конденсат души | Рецепт: Роса сгущения душ |
| `item_1124` | Рецепт: Орб увядания | Рецепт: Шар увядания |
| `item_1125` | Рецепт: Ледяной орб | Рецепт: Шар мороза |
| `item_1126` | Рецепт: Перчатки скорости | Рецепт: Перчатки ускорения |
| `item_1130` | Рецепт: Мифриловый молот | Рецепт: Молот из мифрила |
| `item_1131` | Рецепт: Кристальный меч | Рецепт: Хрустальный меч |
| `item_1134` | Рецепт: Лента эльфа | Рецепт: Эльфийская повязка |
| `item_1137` | Рецепт: Посох силы магии | Рецепт: Магический посох |
| `item_1138` | Рецепт: Диадема | Рецепт: Венец |
| `item_1139` | Рецепт: Сфера энергии | Рецепт: Сфера эссенции |
| `item_1144` | Рецепт: Амулет тени | Рецепт: ★Талисман тени |
| `item_1145` | Рецепт: Призрачный скипетр | Рецепт: ★Жезл призрака |
| `item_1146` | Рецепт: Кольцо исцеления | Рецепт: Кольцо лечения |
| `item_1147` | Рецепт: Подвеска пустоты | Рецепт: Эфирный подвесок |
| `item_1151` | Рецепт: Клинок Сокола | Рецепт: Клинок сокола |
| `item_1152` | Рецепт: Фаза | Рецепт: Фазовые сапоги |
| `item_1153` | Рецепт: Нулевой Посох | Рецепт: Посох пустоты |
| `item_1154` | Рецепт: Шар Выносливости | Рецепт: Шар стойкости |
| `item_1155` | Рецепт: Маска Безумия | Рецепт: Маска безумия |
| `item_1157` | Рецепт: Ботинки Путешественника | Рецепт: Сапоги путешественника |
| `item_1158` | Рецепт: Лунный Осколок | Рецепт: Осколок луны |
| `item_1159` | Рецепт: Камень Души | Рецепт: Камень душ |
| `item_1160` | Рецепт: Кольцо Барона | Рецепт: Кольцо ужаса |
| `item_1161` | Рецепт: Корона Селемене | Рецепт: ★Корона Селемены |
| `item_1162` | Рецепт: Кольцо Изобилия | Рецепт: Кольцо изобилия |
| `item_1163` | Рецепт: Шар Энергии | Рецепт: Сфера энергии |
| `item_1164` | Рецепт: Шар Жизни | Рецепт: Сфера жизненной силы |
| `item_1165` | Рецепт: Меч Очищения | Рецепт: Клинок очищения душ |
| `item_1166` | Рецепт: Отравленная Сфера | Рецепт: Ядовитый шар |
| `item_1167` | Рецепт: Шкатулка Духа | Рецепт: Ларец духа |
| `item_1168` | Рецепт: Плащ Тени | Рецепт: Плащ тени |
| `item_1169` | Рецепт: Шар Разрушения | Рецепт: Шар разрушения |
| `item_1170` | Рецепт: Лёгкие Сапоги | Рецепт: Сапоги ловкости |
| `item_1171` | Рецепт: Мантия интеллекта | Рецепт: Плащ интеллекта |
| `item_1173` | Рецепт: Туфли ловкости | Рецепт: Кожаные сапоги |
| `item_1174` | Рецепт: Баклер | Рецепт: Кулон земного ядра |
| `item_1175` | Рецепт: Талисман уклонения | Рецепт: Кулон метели |
| `item_1176` | Рецепт: Яша | Рецепт: Якша |
| `item_1177` | Рецепт: Кая | Рецепт: Свет мудрости |
| `item_1178` | Рецепт: Санге | Рецепт: Сангвин |
| `item_1179` | Рецепт: Санге и Яша | Рецепт: Сангвин и Якша |
| `item_1180` | Рецепт: Санге и Кая | Рецепт: Сангвин и Кая |
| `item_1181` | Рецепт: Яша и Кая | Рецепт: Кая и Яша |
| `item_1183` | Рецепт: Ультимативный орб | Рецепт: Ультимативный Орб |
| `item_1184` | Рецепт: Демонический клинок | Рецепт: Демонический Клинок |
| `item_1185` | Рецепт: Мистический посох | Рецепт: Посох Мистерии |
| `item_1186` | Рецепт: Ривер | Рецепт: Топор Разорителя |
| `item_1187` | Рецепт: Песнь орла | Рецепт: ★Чернопёрый Меч |
| `item_1188` | Рецепт: Священная реликвия | Рецепт: Священная Реликвия |
| `item_1189` | Рецепт: Плащ мерцания | Рецепт: Плащ Мерцания |
| `item_1190` | Рецепт: Посох силы | Рецепт: ★Посох Силы |
| `item_1191` | Рецепт: Драгона из дагона | Рецепт: Сила Дагона |
| `item_1192` | Рецепт: Метеоритный молот | Рецепт: ★Метеоритный Молот |
| `item_1193` | Посох Атоса | Рецепт: Жезл Атоса |
| `item_1194` | Эфирная линза | Рецепт: Эфирная линза |
| `item_1195` | Посох Эула | Рецепт: Посох Эула |
| `item_1196` | Орхидея | Рецепт: ★Орхидея |
| `item_1197` | Оковы крови | Рецепт: Глейпнир |
| `item_1198` | Призрачный клинок | Рецепт: Эфирный клинок |
| `item_1199` | Посох ветра | Рецепт: ★Жезл ветра |
| `item_1200` | Сфера обновления | Рецепт: Сфера обновления |
| `item_1201` | Октарин | Рецепт: Октариновое ядро |
| `item_1202` | Злая коса | Рецепт: Коса Вайза |
| `item_1203` | Кровавый камень | Рецепт: Кровавый камень |
| `item_1204` | Скипетр Аганима | Рецепт: ★Благословение Аганима |
| `item_1205` | Противник магов | Рецепт: Убийца магов |
| `item_1206` | Призрачный клинок (Броня) | Рецепт: ★Дезолятор |
| `item_1207` | Боевой топор | Рецепт: Боевая ярость |
| `item_1208` | Нулификатор | Рецепт: Нулификатор |
| `item_1209` | Колдовской клинок | Рецепт: Клинок ведьмы |
| `item_1210` | Дробитель черепов | Рецепт: Крушитель черепов |
| `item_1211` | Чертёж: Призрачный клинок | Рецепт: ★Теневой клинок |
| `item_1212` | Чертёж: Амулет героев | Рецепт: Брошь ревенанта |
| `item_1213` | Чертёж: Священный топор | Рецепт: Святой топор |
| `item_1214` | Чертёж: Клинок бездны | Рецепт: Клинок бездны |
| `item_1216` | Чертёж: Сияние | Рецепт: Сияние |
| `item_1217` | Чертёж: Посох короля обезьян | Рецепт: Джингу Банг |
| `item_1218` | Чертёж: Божественная рапира | Рецепт: Священный меч |
| `item_1219` | Чертёж: Меч развеивания душ | Рецепт: Меч рассеивания душ |
| `item_1220` | Чертёж: Бабочка | Рецепт: Бабочка |
| `item_1221` | Чертёж: Шип крови | Рецепт: Кровавый шип |
| `item_1222` | Чертёж: Сапоги чародея | Рецепт: Арканический подвес |
| `item_1223` | Чертёж: Сапоги безмятежности | Рецепт: Сапоги тишины |
| `item_1224` | Чертёж: Герб солнца | Рецепт: ★Солнечный герб |
| `item_1225` | Чертёж: Авангард | Рецепт: Авангард |
| `item_1226` | Чертёж: Шипастая броня | Рецепт: Шипастый панцирь |
| `item_1227` | Чертёж: Драконья пика | Рецепт: Ураганный посох |
| `item_1228` | Чертёж: Чародейские сапоги | Рецепт: Арканические сапоги |
| `item_1229` | Чертёж: Боевой топор | Рецепт: Боевой топор |
| `item_1230` | Чертёж: Элитный ранец | Рецепт: Элитная сумка |
| `item_1231` | Чертеж: Кольцо сущности | Рецепт: Кольцо здоровья |
| `item_1232` | Чертеж: Клинок разрыва сердец | Рецепт: ★Клинок мимолетной тени |
| `item_1233` | Чертеж: Око Скади | Рецепт: ★Око Скади |
| `item_1234` | Чертеж: Серп коррозии | Рецепт: Шип разложения |
| `item_1235` | Чертеж: Гигантский меч из драконьей кости | Рецепт: Драконий костяной меч |
| `item_1236` | Чертеж: Сапоги стремительной тени | Рецепт: Сапоги быстрой тени |
| `item_1237` | Чертеж: Сапоги охотника на кровь | Рецепт: Сапоги кровавой охоты |
| `item_1238` | Чертеж: Броня мрака | Рецепт: Мрачная броня |
| `item_1239` | Чертеж: xxxx | Рецепт: ★Кулон каменного голема |
| `item_1240` | Чертеж: Непоколебимая броня | Рецепт: Несгибаемая броня |
| `item_1241` | Чертеж: Мифические доспехи | Рецепт: ★Кровожадное сердце |
| `item_1242` | Чертеж: Мифическая мантия | Рецепт: Кольцо пепла |
| `item_1243` | Чертеж: Мифический посох | Рецепт: Сдирающий нож |
| `item_1244` | Чертеж: Мифический кулон | Рецепт: Амулет кипящей крови |
| `item_1245` | Чертеж: Мифический лёгкий клинок | Рецепт: Садистский арбалет |
| `item_1246` | Чертеж: Мифический наруч | Рецепт: Сапоги аннигиляции |
| `item_1247` | Чертеж: Мифические сапоги | Рецепт: Разъедающее ядро |
| `item_1248` | Чертеж: Мифическое кольцо-клинок | Рецепт: Тотем чумы |
| `item_1249` | Чертеж: Мифический плащ уклонения | Рецепт: Казнь |
| `item_1250` | Чертеж: Мифические сапоги | Рецепт: Кубок кобольда |
| `item_1251` | Чертеж: Мифическое кольцо-лезвие | Рецепт: Амулет головастика |
| `item_1252` | Чертеж: Мифический плащ уклонения | Рецепт: Дремлющий артефакт |
| `item_1296` | Чертеж: Ледяной гигантский меч | Рецепт: Клинок ледяного клыка |
| `item_1297` | Чертеж: Рюкзак мастера | Рецепт: Сумка мастера |
| `item_1300` | Чертеж: Ночное пиршество | Рецепт: Пиршество |
| `item_1301` | Чертеж: Рыцарская броня | Рецепт: Рыцарская броня |
| `item_1302` | Чертеж: Магическая сумка | Рецепт: Сумка тайн |
| `item_1303` | Чертеж: Кольцо ядовитой змеи | Рецепт: Кольцо змеи |
| `item_1308` | Чертеж: Посох Аганима | Рецепт: ★Скипетр Аганима |
| `item_1309` | Чертеж: Ураганная алебарда | Рецепт: Глефа урагана |
| `item_1311` | Чертеж: Кровавая рука мстителя | Рецепт: ★Тяжёлый бронебойный клинок |
| `item_1314` | Чертеж: Корона Цезаря | Рецепт: Корона Цезаря |
| `item_1315` | Чертеж: Королевский рюкзак | Рецепт: Рюкзак короля |
| `item_1317` | Чертеж: Маска тени | Рецепт: Теневая маска |
| `item_1318` | Чертеж: Призрачный плащ | Рецепт: Призрачный плащ |
| `item_1319` | Чертеж: Ядовитый клык-шип | Рецепт: Ядовитый шип |
| `item_1320` | Чертеж: Орудие убийства | Рецепт: Оружие бойни |
| `item_1321` | Чертеж: Сердце ужасающего черепаха | Рецепт: Сердце ужасной черепахи |
| `item_1330` | Чертеж: Медаль жертвы | Рецепт: Медаль жертвенности |
| `item_1331` | Рецепт: Молот Защиты | Рецепт: Молот защитника |
| `item_1332` | Рецепт: Жертвенная Кровь | Рецепт: Кровь жертвоприношения |
| `item_1334` | Рецепт: Шипастый Щит | Рецепт: ★Шипастый Щит |
| `item_1336` | Рецепт: Сапоги Мудреца | Рецепт: Сапоги мудреца |
| `item_1337` | Рецепт: Маска Великого Мага | Рецепт: Маска архимага |
| `item_1338` | Рецепт: Эфирный Звёздный Посох | Рецепт: Эфирный звёздный посох |
| `item_1345` | Рецепт: Молниепризывный Скипетр | Рецепт: Жезл призыва молний |
| `item_1350` | Рецепт: Звериные Ботинки | Рецепт: Звериные кожаные сапоги |
| `item_1351` | Рецепт: Удар Урагана | Рецепт: Удар бури |
| `item_1352` | Рецепт: Ботинки Силы | Рецепт: Сапоги силы |
| `item_1360` | Чертёж: Сапоги преследователя | Рецепт: Сапоги преследователя |
| `item_1361` | Чертеж: Призрачный шип | Рецепт: Клинок призрачного убийцы |
| `item_1364` | Чертёж: Браслет боли | Рецепт: Наруч страданий |
| `item_1365` | Чертёж: Клинок кобры | Рецепт: Клинок кобры |
| `item_1366` | Чертёж: Шипованная рукавица | Рецепт: Шипованные наручи |
| `item_1367` | Рецепт: Теневые Сапоги | Рецепт: Теневые сапоги |
| `item_1371` | Чертёж: Клинок порчи | Рецепт: Клинок разложения |
| `item_1374` | Чертёж: Перчатки снайпера | Рецепт: Перчатка снайпера |
| `item_1382` | Рецепт: Посох огненного яда | Рецепт: Скипетр огненного яда |
| `item_1384` | Чертёж: Рюкзак мудреца | Рецепт: Рюкзак мудреца |
| `item_1385` | Рецепт: Рюкзак Львиного Сердца | Рецепт: Рюкзак Львиного сердца |
| `item_1391` | Рецепт: Сумка Мороза | Рецепт: Морозная сумка |
| `item_1392` | Рецепт: Сапоги Терпимости | Рецепт: Сапоги терпимости |
| `item_1393` | Рецепт: Сумка Высокой Тактики | Рецепт: Тактическая сумка высшего уровня |
| `item_1394` | Рецепт: Священная Броня | Рецепт: Священный доспех |
| `item_1395` | Рецепт: Легкая броня кровожадного демона | Рецепт: Лёгкая броня кровавого демона |
| `item_1397` | Чертёж: Рука змеиной тени | Рецепт: Рука змеиной тени |
| `item_1398` | Чертёж: Кроволомный тяжёлый клинок | Рецепт: Тяжёлый клинок кровавого разрыва |
| `item_1399` | Рецепт: Клинок Кровавой Клятвы | Рецепт: Обломок клинка Кровавой клятвы |
| `item_1400` | Рецепт: Кольцо связывания душ | Рецепт: Кольцо привязки душ |
| `item_1401` | Рецепт: Амулет Пустотного Лезвия | Рецепт: Амулет пустотного клинка |
| `item_1402` | Рецепт: Токсичный кулон | Рецепт: Кулон смертельного яда |
| `item_1403` | Чертёж: Наручи раздирателя | Рецепт: Наручи разрывателя |
| `item_1404` | Рецепт: Теневая Броня | Рецепт: Теневой доспех |
| `item_1409` | Рецепт: Кольцо жгучего герба | Рецепт: Кольцо жжёных рун |
| `item_1420` | Чертёж: Фрагмент кровавой луны | Рецепт: Меч кровавого шипа |
| `item_1426` | Чертеж: Рюкзак Пустоты | Рецепт: Рюкзак пустоты |
| `item_1428` | Чертёж: Мьёльнир | Рецепт: Мьёльнир |
| `item_1432` | Рецепт: Верховная корона | Рецепт: Божественная корона |
| `item_1436` | Рецепт: Глаз пустоты | Рецепт: Око пустоты |
| `item_1440` | Рецепт: Падение вечности | Рецепт: Космический кулон |
| `item_1441` | Рецепт: Благословение всемогущего | Рецепт: Всеобщее благословение |
| `item_1443` | Чертеж: Кольцо Защиты | Рецепт: Кольцо благословения |
| `item_1444` | Чертёж: Горе Даэдала | Рецепт: Скорбь Дедала |
| `item_1445` | Чертеж: Сумка Убийцы | Рецепт: Рюкзак быстрой тени |
| `item_1447` | Рецепт: Охрана Шивы | Рецепт: Щит Шивы |
| `item_1448` | Рецепт: Посох магической энергии | Рецепт: Магический жезл |
| `item_1452` | Чертеж: Таинственный Герб | Рецепт: Мистический герб |
| `item_1453` | Рецепт: Призрачный шип | Рецепт: Стигийский шип |
| `item_1454` | Чертеж: Меч Радуги | Рецепт: Клинок радуги |
| `item_1455` | Чертёж: Завеса раздора | Рецепт: Завеса раздора |
| `item_1456` | Чертеж: Мантия полярного дня | Рецепт: Мантия мудреца |
| `item_1457` | Чертёж: Меч отваги | Рецепт: Меч отваги |
| `item_1459` | Чертёж: Венец героев | Рецепт: Корона духов |
| `item_1460` | Чертёж: Молот Львиного Сердца | Рецепт: Молот Львиного сердца |
| `item_1461` | Чертёж: Сапоги резни | Рецепт: Сапоги резни |
| `item_1465` | Рецепт: Кровавый кулон | Рецепт: Кулон кровавой защиты |
| `item_1466` | Рецепт: Корона теней | Рецепт: Корона теневой мудрости |
| `item_1467` | Рецепт: Демоническая секира | Рецепт: Топор демонического бога |
| `item_1468` | Рецепт: Гнев бога грома | Рецепт: Гнев грома |
| `item_1469` | Рецепт: Громовой клык | Рецепт: Клык грома |
| `item_1470` | Рецепт: Глаз бури | Рецепт: Око бури |
| `item_1500` | Рецепт: Страж шипов | Рецепт: Шипастый страж |
| `item_1502` | Рецепт: Демоническая броня | Рецепт: Доспех бога демонов |
| `item_1503` | Рецепт: Острый клинок | Рецепт: Клинок накопленной мощи |
| `item_1506` | Рецепт: Корона девяти небес | Рецепт: Корона громов девяти небес |
| `item_1507` | Рецепт: Гнев молнии | Рецепт: Гнев молний |
| `item_1508` | Рецепт: Амулет от молний | Рецепт: Амулет отражения молний |
| `item_1509` | Рецепт: Кольцо молний | Рецепт: Кольцо пленных молний |
| `item_1510` | Рецепт: Отравленный клык молнии | Рецепт: Отравленный молнией клык |
| `item_1512` | Рецепт: Пояс быстрой молнии | Рецепт: Подвеска стремительной молнии |
| `item_1514` | Рецепт: Посох теней | Рецепт: Скипетр пустотной тьмы |
| `item_1516` | Рецепт: Перчатки демона | Рецепт: Перчатки бога демонов |
| `item_1517` | Рецепт: Клинок разрыва | Рецепт: Клинок разрыва неба |
| `item_1518` | Рецепт: Астральный диск | Рецепт: Астролябия пожирания магии |
| `item_1523` | Рецепт: Теневой натиск | Рецепт: Перчатки быстрой тени |
| `item_1524` | Чертеж: Обувь Огненной Бездны | Рецепт: Ботинки огненной бездны |
| `item_1526` | Чертеж: Знак Мудреца | Рецепт: Знак мудреца |
| `item_1527` | Чертеж: Корона Львиного Сердца | Рецепт: Корона Львиного сердца |
| `item_1528` | Чертеж: Тысяча Клинков | Рецепт: Тысяча лезвий |
| `item_1529` | Чертеж: Глаз Великого Мудреца | Рецепт: Око великого мудреца |
| `item_1534` | Чертеж: Герб Пожирающего Небо | Рецепт: Герб небесного пламени |
| `item_1535` | Чертеж: Стена Огненной Тюрьмы | Рецепт: Бастион адского пламени |
| `item_1536` | Чертеж: Топор Бушующей Волны | Рецепт: Секира Львиного сердца |
| `item_1537` | Чертеж: Гримуар Бездны Мудрости | Рецепт: Гримуар бездны мудрости |
| `item_1539` | Чертеж: Вечный цикл | Рецепт: Вечное возвращение |
| `item_1543` | Чертеж: Хватка пожирателя маны | Рецепт: Хватка пожирателя магии |
| `item_1544` | Чертеж: Алебарда Рая | Рецепт: Алебарда небес |
| `item_1551` | Чертеж: Тайный Источник Духов | Рецепт: Магический источник |
| `item_1554` | Чертёж: Мрачный плащ | Рецепт: Плащ тьмы |
| `item_1555` | Рецепт: Жемчуг конца | Рецепт: Жемчужина Края |
| `item_1559` | Рецепт: Сфера эха | Рецепт: Эхо-сфера |
| `item_1562` | Чертеж: Перчатки теней | Рецепт: Перчатки быстрой тени |
| `item_1564` | Чертеж: Вечное Псио | Рецепт: Псионическая непрерывность |
| `item_1567` | Чертеж: Метка Охоты | Рецепт: Метка охоты |
| `item_1569` | Чертеж: Кровавый договор с задержкой | Рецепт: Отложенная кровная сделка |
| `item_1588` | Рецепт: Небесный кристалл | Рецепт: Кристалл небес |
| `item_1589` | Чертёж: Ядро рушащихся небес | Рецепт: Ядро небес |
| `item_1596` | Чертёж: Клинок кровавой жертвы | Рецепт: Клинок кровавого жертвоприношения |
| `item_1598` | Чертеж: Связь душ | Рецепт: Связь душ |
| `item_1599` | Чертеж: Ткань Танцующей Тени | Рецепт: Шарф теневого танцора |
| `item_1604` | Чертёж: Перегретый кровавый кулон | Рецепт: Перегретое ядро |
| `item_1606` | Чертёж: Разогнанный браслет | Рецепт: Браслет разгона |
| `item_1609` | Чертёж: Доспехи паладина | Рецепт: Броня паладина |
| `item_1619` | Чертеж: Печь Солнца | Рецепт: Солнечная печь |
| `item_1620` | Чертеж: Тяжёлый Клинок Разбивающего Армию | Рецепт: Тяжёлый клинок разрушителя |
| `item_1622` | Чертеж: Топор дробящих звезд | Рецепт: Секира дробящих звёзд |
| `item_1623` | Чертеж: Источник пустоты | Рецепт: Источник пустоты |
| `item_1635` | Чертёж: Скалоломная хватка | Рецепт: Скалоломный хват |
| `item_1637` | Чертёж: Эндер-клинок | Рецепт: Зловещий клинок последней тени |
| `item_1640` | Чертёж: Шёлк ночных перьев | Рецепт: Лёгкий шёлк ночного пера |
| `item_1641` | Чертёж: Мрачная ткань | Рецепт: Лоскут без света |
| `item_1642` | Чертёж: Сумка тайного света | Рецепт: Сумка тайного света |
| `item_1644` | Чертёж: Книга Повелителя яда | Рецепт: Книга ордена яда |
| `item_1648` | Чертёж: Демонический меч | Рецепт: Демонический меч |
| `item_1651` | Чертёж: Подвеска быстрой тени | Рецепт: Подвеска быстрой тени |
| `item_1700` | Чертеж: Шёлк теней | Рецепт: Лента теней |
| `item_1M106` | Чертеж: Зеленый кристалл | Рецепт: Зелёный кристалл |
| `item_1M203` | Чертеж: Синий кристалл | Рецепт: Синий кристалл |
| `item_1M300` | Чертеж: Фиолетовый кристалл | Рецепт: Фиолетовый кристалл |
| `item_1M302` | Чертёж: Эндер-доски | Рецепт: Доска Эндера |
| `item_1M310` | Чертёж: Эндер-кожа | Рецепт: Эндер-кожа |
| `item_1M311` | Чертёж: Эндер-слиток | Рецепт: Эндер-слиток |
| `item_1M401` | Чертеж: Желтый кристалл | Рецепт: Жёлтый кристалл |
| `item_1M404` | Чертеж: Реликвия Кейтис | Рецепт: Реликвия Кайтиса |
| `item_1M422` | Чертеж: Божественный кристалл | Рецепт: Божественный Кристалл |
| `item_1M501` | Чертеж: Красный кристалл | Рецепт: Красный Кристалл |
| `item_1M503` | Чертеж: Реликвия Майя | Рецепт: Артефакт майя |
| `item_1M509` | Чертеж: Изначальный ромбовидный кристалл | Рецепт: Изначальный кристалл |
| `item_1M510` | Чертёж: Эндер-кристалл | Рецепт: Кристалл Края |
| `item_1M511` | Чертёж: Душа королей | Рецепт: Душа королевской семьи |
| `item_1M518` | Рецепт: Ядро ледяной тишины | Рецепт: Ядро ледяного безмолвия |
| `item_1M519` | Рецепт: Ядро огненной тишины | Рецепт: Ядро пылающего уничтожения |
| `item_1M524` | Рецепт: Эссенция тайн | Рецепт: Эссенция тайного ритуала |
| `item_1M528` | Рецепт: Кожа грома | Рецепт: Громовая кожа |
| `item_1M540` | Чертёж: Слиток тени | Рецепт: Слиток ужаса |
| `item_AP022` | Рецепт: Усиленное защитное зелье | Рецепт: Сильное зелье защиты |
| `item_AP025` | Рецепт: Усиленное восстанавливающее зелье | Рецепт: Сильное зелье восстановления |
| `item_AP032` | Рецепт: Экстремальное зелье просветления | Рецепт: Высшее зелье просветления |
| `item_AP035` | Рецепт: Усиленное зелье контроля магии | Рецепт: Сильное зелье контроля магии |
| `item_AP036` | Рецепт: Экстремальное зелье контроля магии | Рецепт: Высшее зелье контроля магии |
| `item_AP040` | Рецепт: Усиленное зелье скорости | Рецепт: Сильное зелье скорости |
| `item_AP044` | Рецепт: Усиленное зелье регенерации маны | Рецепт: Сильное зелье восстановления маны |
| `item_AP048` | Рецепт: Улучшенное магическое зелье | Рецепт: Улучшенное зелье маны |
| `item_AP053` | Рецепт: Молниевое зелье | Рецепт: Эликсир молнии |
| `item_AP054` | Рецепт: Грозовое зелье | Рецепт: Громовой эликсир |
| `item_M319` | Шкура эндера | Эндер-шкура |
| `item_M320` | Кристалл эндера | Кристалл Эндера |
| `item_P000` | Слабое зелье жизни | Малое зелье здоровья |
| `item_P001` | Зелье жизни | Зелье здоровья |
| `item_P002` | Большое зелье жизни | Большое зелье здоровья |
| `item_P003` | Сильное зелье жизни | Сильное зелье здоровья |
| `item_P004` | Слабое магическое зелье | Малое зелье маны |
| `item_P005` | Магическое зелье | Зелье маны |
| `item_P015` | Зелье ярости | Зелье неистовства |
| `item_P016` | Зелье защиты | Зелье стража |
| `item_P022` | Зелье сильной защиты | Сильное зелье защиты |
| `item_P025` | Эликсир сильного восстановления | Сильное зелье восстановления |
| `item_P030` | Эликсир просветления | Зелье просветления |
| `item_P055` | Мощное зелье магической защиты | Сильное зелье сопротивления магии |
| `item_P100` | Свиток телепортации домой | Свиток телепортации |
| `item_P160` | Эль Стойкости | Эль стойкости |
| `item_P270` | 狮心秘酒 | Львиный эликсир |
| `item_P271` | 神秘扩容包 | Таинственный пакет расширения рюкзака |
| `item_YP006` | Рецепт: Защитное зелье | Рецепт: Зелье защиты |
| `item_YP007` | Рецепт: Светящееся зелье | Рецепт: Зелье восстановления |
| `item_YP008` | Рецепт: Зелье скорости | Рецепт: Зелье быстроты |
| `item_YP010` | Рецепт: Теплое зелье | Рецепт: Тёплое зелье |
| `item_YP012` | Рецепт: Зелье тайны | Рецепт: Зелье тайн |
| `item_YP014` | Рецепт: Арканное зелье | Рецепт: Зелье тайной магии |
| `item_YP015` | Рецепт: Зелье берсерка | Рецепт: Зелье неистовства |
| `item_YP016` | Рецепт: Охранное зелье | Рецепт: Зелье стража |
| `item_YP019` | Чертёж: Зелье силы | Рецепт: Зелье силы |
| `item_YP020` | Чертёж: Кровавое зелье | Рецепт: Зелье вампиризма |
| `item_YP023` | Чертёж: Экстремальное защитное зелье | Рецепт: Высшее зелье защиты |
| `item_YP024` | Чертёж: Каменный щит микстура | Рецепт: Эликсир каменного щита |
| `item_YP026` | Чертёж: Экстремальное восстанавливающее зелье | Рецепт: Высшее зелье восстановления |
| `item_YP027` | Чертёж: Питательная микстура | Рецепт: Питательный эликсир |
| `item_YP030` | Чертеж: Зелье просветления | Рецепт: Зелье просветления |
| `item_YP033` | Чертёж: Микстура бесконечных знаний | Рецепт: Эликсир бесконечного знания |
| `item_YP034` | Чертеж: Зелье магического урона | Рецепт: Зелье магического урона |
| `item_YP041` | Чертёж: Экстремальное зелье скорости | Рецепт: Высшее зелье скорости |
| `item_YP043` | Чертеж: Зелье маны | Рецепт: Зелье восстановления маны |
| `item_YP045` | Чертёж: Экстремальное зелье регенерации маны | Рецепт: Высшее зелье восстановления маны |
| `item_YP046` | Чертёж: Микстура медитации | Рецепт: Эликсир медитации |
| `item_YP049` | Чертёж: Светящееся зелье | Рецепт: Светящееся зелье |
| `item_YP051` | Чертёж: Зелье природы | Рецепт: Эликсир природы |
| `item_YP052` | Чертёж: Противоядие от токсинов | Рецепт: Зелье сопротивления яду |
| `item_YP055` | Рецепт: Усиленное зелье сопротивления магии | Рецепт: Сильное зелье сопротивления магии |
| `item_YP056` | Чертёж: Эликсир атаки II | Рецепт: Зелье атаки II |
| `item_YP057` | Чертёж: Эликсир защиты II | Рецепт: Зелье защиты II |
| `item_YP101` | Чертёж: Усиленное магическое зелье | Рецепт: Сильное магическое зелье |
| `item_YP102` | Чертёж: Сильнейшее зелье здоровья | Рецепт: Сильнейшее зелье здоровья |
| `item_YP103` | Чертёж: Сильнейшее зелье маны | Рецепт: Сильнейшее зелье маны |
| `item_YP157` | Рецепт: Вино короля обезьян | Рецепт: Фруктовое вино Короля обезьян |
| `item_YP158` | Чертёж: Ледяная волчья настойка | Рецепт: Ледяная волчья настойка |
| `item_YP159` | Чертёж: Небесное перо вино | Рецепт: Фруктовое вино Небесного пера |
| `item_YP160` | Чертёж: Стойкое ячменное пиво | Рецепт: Эль стойкости |
| `item_YP200` | Рецепт: Тайное эликсир фей | Рецепт: Тайное вино фей |
| `item_YP201` | Чертёж: Эль «Дыхание дракона» | Рецепт: Драконье дыхание |
| `item_YP202` | Чертёж: Полярное ледяное вино | Рецепт: Полярное ледяное вино |
| `item_YP203` | Чертёж: Чёрное вино Ночного дозора | Рецепт: Тайное варево теневого вора |
| `item_YP204` | Чертёж: Белое вино Лунной тени | Рецепт: Лунное белое варево |
| `item_YP205` | Чертёж: Змеиный поцелуй | Рецепт: Поцелуй змея |
| `item_YP206` | Чертёж: Бренди грифона | Рецепт: Бренди грифона |
| `item_YP207` | Чертёж: Багровое дыхание | Рецепт: Алое дыхание |
| `item_YP220` | Чертёж: Тихое эхо | Рецепт: Тихий отзвук |
| `item_YP258` | Чертёж: Механический тайник | Рецепт: Секретный механический ящик |
| `item_YP259` | Чертёж: Фиалковое вино | Рецепт: Фиалковое вино |
| `item_YP261` | Чертёж: Штормовой эль | Рецепт: Штормовой эликсир |

</details>
