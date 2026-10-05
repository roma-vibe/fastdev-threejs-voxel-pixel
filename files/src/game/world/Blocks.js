import { P, PP, PAL, shadePal } from './TexturePainter.js';

/**
 * Block registry. Shapes: cube | cross | slab | torch | fence | pane | layer | ladder | lantern | liquid | none
 * Buckets: opaque | cutout | translucent | water | lava
 */
export const SHAPE = {
  CUBE: 0,
  CROSS: 1,
  SLAB: 2,
  TORCH: 3,
  FENCE: 4,
  PANE: 5,
  LAYER: 6,
  LADDER: 7,
  LANTERN: 8,
  LIQUID: 9,
  NONE: 10,
  TOPSLAB: 11,
};

const DEFAULT_ENV = {
  grass: 0x5d9b35,
  foliage: 0x4a8a2a,
  water: 0x3a6fd0,
  jungle: 0x2f8a1e,
  spruce: 0x3d5e3a,
  birch: 0x7ca84a,
  darkOak: 0x3b6e24,
  acacia: 0x6a8a28,
};

/** Texture key -> painter(t, env). Painted per level so biome tints can change. */
export const TEXTURES = {
  stone: (t) => P.stone(t),
  smooth_stone: (t) => P.smoothStone(t),
  cobblestone: (t) => P.cobble(t, PAL.stone, 0x4a4a4a),
  mossy_cobblestone: (t) => (P.cobble(t, PAL.stone, 0x4a4a4a), P.moss(t, 0.4)),
  stone_bricks: (t) => P.stoneBricks(t),
  mossy_stone_bricks: (t) => (P.stoneBricks(t), P.moss(t, 0.35)),
  cracked_stone_bricks: (t) => (P.stoneBricks(t), P.crack(t, 0x3e3e3e, 4)),
  chiseled_stone_bricks: (t) => {
    P.smoothStone(t);
    for (let i = 3; i < 13; i++)
      t.set(i, 3, 0x5a5a5a).set(i, 12, 0x5a5a5a).set(3, i, 0x5a5a5a).set(12, i, 0x5a5a5a);
    t.rect(6, 6, 4, 4, 0x6b6b6b).rect(7, 7, 2, 2, 0x8f8f8f);
  },
  andesite: (t) => P.stone(t, PAL.andesite),
  polished_andesite: (t) => P.smoothStone(t, PAL.andesite),
  granite: (t) => P.stone(t, PAL.granite),
  diorite: (t) => P.stone(t, PAL.diorite),
  calcite: (t) => P.stone(t, PAL.calcite),
  tuff: (t) => P.stone(t, PAL.tuff),
  deepslate: (t) => P.stone(t, PAL.deepslate),
  deepslate_bricks: (t) => P.stoneBricks(t, PAL.deepslate),
  cobbled_deepslate: (t) => P.cobble(t, PAL.deepslate, 0x1e1e24),
  dirt: (t) => P.dirt(t),
  coarse_dirt: (t) => (P.dirt(t, PAL.coarse), t.speck(0x777777, 0.08)),
  mud: (t) => P.dirt(t, PAL.mud),
  clay: (t) => P.sand(t, PAL.clay),
  gravel: (t) => P.gravel(t),
  sand: (t) => P.sand(t, PAL.sand),
  red_sand: (t) => P.sand(t, PAL.redsand),
  sandstone_top: (t) => P.sand(t, PAL.sandstone),
  sandstone_side: (t) => P.sandstoneSide(t, PAL.sandstone),
  red_sandstone_side: (t) => P.sandstoneSide(t, PAL.redsand),
  grass_top: (t, env) => P.grassTop(t, shadePal(env.grass, [0.78, 0.88, 0.96, 1.04, 1.12])),
  grass_side: (t, env) => P.grassSide(t, PAL.dirt, shadePal(env.grass, [0.8, 0.9, 1, 1.08])),
  snow_side: (t) => P.snowSide(t, PAL.dirt),
  podzol_top: (t) =>
    t.noise(
      [0x4a3017, 0x5a3a1d, 0x6a4524, 0x7a5a2a],
      [
        [4, 0.5],
        [16, 0.5],
      ],
      0.5,
    ),
  podzol_side: (t) => P.grassSide(t, PAL.dirt, [0x4a3017, 0x5a3a1d, 0x6a4524], [2, 3]),
  path_top: (t) => P.path(t),
  farmland_top: (t) => P.farmland(t),
  snow: (t) => P.snow(t),
  ice: (t) => P.ice(t),
  packed_ice: (t) => P.ice(t, PAL.packedIce, 255),
  blue_ice: (t) => P.ice(t, [0x5a8ae0, 0x6a98e8, 0x7aa6ee, 0x8ab4f2], 255),
  terracotta: (t) => P.terracotta(t, 0x985e44),
  orange_terracotta: (t) => P.terracotta(t, 0xa15325),
  red_terracotta: (t) => P.terracotta(t, 0x8f3d2e),
  yellow_terracotta: (t) => P.terracotta(t, 0xba8523),
  brown_terracotta: (t) => P.terracotta(t, 0x4d3323),
  white_terracotta: (t) => P.terracotta(t, 0xd1b2a1),
  light_gray_terracotta: (t) => P.terracotta(t, 0x876b62),
  oak_log: (t) => P.logSide(t, PAL.oakLog),
  oak_log_top: (t) => P.logTop(t, PAL.oakRing, PAL.oakLog),
  oak_planks: (t) => P.planks(t, PAL.oakPlank),
  oak_leaves: (t, env) => P.leaves(t, shadePal(env.foliage, [0.6, 0.75, 0.9, 1.05, 1.2])),
  birch_log: (t) => P.birchSide(t),
  birch_log_top: (t) => P.logTop(t, PAL.birchPlank, PAL.birchLog),
  birch_planks: (t) => P.planks(t, PAL.birchPlank),
  birch_leaves: (t, env) => P.leaves(t, shadePal(env.birch, [0.65, 0.8, 0.95, 1.1])),
  spruce_log: (t) => P.logSide(t, PAL.spruceLog),
  spruce_log_top: (t) => P.logTop(t, PAL.sprucePlank, PAL.spruceLog),
  spruce_planks: (t) => P.planks(t, PAL.sprucePlank),
  spruce_leaves: (t, env) => P.leaves(t, shadePal(env.spruce, [0.6, 0.75, 0.9, 1.05]), 0.15),
  jungle_log: (t) => P.logSide(t, PAL.jungleLog),
  jungle_log_top: (t) => P.logTop(t, PAL.junglePlank, PAL.jungleLog),
  jungle_planks: (t) => P.planks(t, PAL.junglePlank),
  jungle_leaves: (t, env) => P.leaves(t, shadePal(env.jungle, [0.6, 0.75, 0.9, 1.05, 1.2]), 0.18),
  dark_oak_log: (t) => P.logSide(t, PAL.darkOakLog),
  dark_oak_log_top: (t) => P.logTop(t, PAL.darkOakPlank, PAL.darkOakLog),
  dark_oak_planks: (t) => P.planks(t, PAL.darkOakPlank),
  dark_oak_leaves: (t, env) => P.leaves(t, shadePal(env.darkOak, [0.6, 0.75, 0.9, 1.05]), 0.18),
  acacia_log: (t) => P.logSide(t, PAL.acaciaLog),
  acacia_log_top: (t) => P.logTop(t, PAL.acaciaPlank, PAL.acaciaLog),
  acacia_planks: (t) => P.planks(t, PAL.acaciaPlank),
  acacia_leaves: (t, env) => P.leaves(t, shadePal(env.acacia, [0.6, 0.75, 0.9, 1.05])),
  charred_log: (t) => (P.logSide(t, PAL.charred), t.speck(0xff5a1a, 0.02)),
  charred_planks: (t) => (P.planks(t, PAL.charred), P.crack(t, 0x0a0808, 2)),
  glass: (t) => P.glass(t),
  blue_glass: (t) => P.glass(t, 0x6a9ae8, 0x3a6ad0, 110),
  red_glass: (t) => P.glass(t, 0xc84a4a, 0xa82020, 120),
  purple_glass: (t) => P.glass(t, 0xa86ad8, 0x7a2ac0, 120),
  white_wool: (t) => P.wool(t, 0xe9ecec),
  red_wool: (t) => P.wool(t, 0xa12722),
  blue_wool: (t) => P.wool(t, 0x35399d),
  light_blue_wool: (t) => P.wool(t, 0x3aafd9),
  black_wool: (t) => P.wool(t, 0x1d1d21),
  gray_wool: (t) => P.wool(t, 0x3e4447),
  yellow_wool: (t) => P.wool(t, 0xf8c627),
  green_wool: (t) => P.wool(t, 0x546d1b),
  purple_wool: (t) => P.wool(t, 0x7a2aad),
  brown_wool: (t) => P.wool(t, 0x724728),
  cyan_wool: (t) => P.wool(t, 0x158991),
  orange_wool: (t) => P.wool(t, 0xf07613),
  bricks: (t) => P.bricks(t, [0x7a3a2a, 0x8a4434, 0x96503c, 0xa35a44], 0x9a8a7a, 8, 4),
  bookshelf: (t) => P.bookshelf(t),
  crafting_top: (t) => P.craftingTop(t),
  crafting_side: (t) => P.craftingSide(t),
  furnace_front: (t) => P.furnaceFront(t, false),
  furnace_lit: (t) => P.furnaceFront(t, true),
  furnace_top: (t) => P.smoothStone(t),
  chest_side: (t) => P.chestSide(t),
  chest_top: (t) => P.planks(t, [0x6a4a1c, 0x7a5622, 0x8a6228, 0x996e2e]),
  barrel_side: (t) => P.barrelSide(t),
  barrel_top: (t) => (P.planks(t, PAL.sprucePlank), t.rect(6, 6, 4, 4, 0x2a1d0e)),
  hay_top: (t) => P.hayTop(t),
  hay_side: (t) => P.haySide(t),
  pumpkin_side: (t) => P.pumpkinSide(t),
  jack_face: (t) => P.pumpkinSide(t, true),
  pumpkin_top: (t) => (P.pumpkinSide(t), t.rect(6, 6, 4, 4, 0x4a6a1a)),
  melon_side: (t) => P.melonSide(t),
  target: (t) => P.target(t),
  note_block: (t) => P.noteBlock(t),
  coal_ore: (t) => P.ore(t, PAL.stone, [0x1a1a1a, 0x2a2a2a, 0x4a4a4a]),
  iron_ore: (t) => P.ore(t, PAL.stone, [0xa07a5a, 0xc8a080, 0xe6c8a8]),
  gold_ore: (t) => P.ore(t, PAL.stone, [0xb08a14, 0xf0c832, 0xfff08a]),
  diamond_ore: (t) => P.ore(t, PAL.stone, [0x1a8a8a, 0x4ae0d6, 0xbafff6]),
  lapis_ore: (t) => P.ore(t, PAL.stone, [0x1a2a8a, 0x2a4ad0, 0x5a7af0]),
  emerald_ore: (t) => P.ore(t, PAL.stone, [0x0a6a2a, 0x1ac84a, 0x8affaa], 3),
  redstone_ore: (t) => P.ore(t, PAL.stone, [0x6a0a0a, 0xd01a1a, 0xff6a6a]),
  iron_block: (t) => P.metal(t, [0x9a9a9a, 0xbcbcbc, 0xd6d6d6, 0xe6e6e6, 0xf6f6f6]),
  gold_block: (t) => P.metal(t, [0xb08a14, 0xd6aa22, 0xf0c832, 0xfad84a, 0xfff08a]),
  copper_block: (t) => P.metal(t, [0x8a4a2a, 0xa65a34, 0xc06c40, 0xd07a4a, 0xe08a5a]),
  diamond_block: (t) => P.gemBlock(t, [0x1a8a8a, 0x4ac8c8, 0x62e8e0, 0x9af6f0, 0xd6fffc]),
  lapis_block: (t) => P.gemBlock(t, [0x14246a, 0x1e3490, 0x2a44b0, 0x3a5ad0, 0x6a8af0]),
  emerald_block: (t) => P.gemBlock(t, [0x0a6a2a, 0x14a040, 0x1ac84a, 0x4ae06a, 0x8affaa]),
  redstone_block: (t) => P.gemBlock(t, [0x6a0a0a, 0x9a0e0e, 0xc01a1a, 0xe02a2a, 0xff6a6a]),
  prismarine: (t) =>
    t.noise(
      PAL.prismarine,
      [
        [4, 0.5],
        [8, 0.5],
      ],
      0.4,
    ),
  prismarine_bricks: (t) => P.prismarineBricks(t),
  dark_prismarine: (t) => P.bricks(t, PAL.darkPrismarine, 0x1e3a30, 8, 8, true),
  sea_lantern: (t) => P.seaLantern(t),
  rune_bricks: (t) => P.stoneBricks(t, [0x5a6068, 0x6a717a, 0x7a818a, 0x8a929b, 0x9aa2ab]),
  rune_rune_blue: (t) =>
    P.runes(t, [0x5a6068, 0x6a717a, 0x7a818a, 0x8a929b, 0x9aa2ab], 0x55d6ff, 0),
  rune_rune_blue2: (t) =>
    P.runes(t, [0x5a6068, 0x6a717a, 0x7a818a, 0x8a929b, 0x9aa2ab], 0x55d6ff, 2),
  rune_rune_red: (t) => P.runes(t, PAL.blackstone, 0xff3a2a, 1),
  rune_rune_yellow: (t) => P.runes(t, PAL.calcite, 0xffd23a, 2),
  rune_rune_green: (t) => P.runes(t, PAL.andesite, 0x4aff7a, 0),
  shadow_bricks: (t) => P.stoneBricks(t, [0x1c181c, 0x241f24, 0x2c262c, 0x352e35, 0x3e363e]),
  obsidian: (t) => P.obsidian(t),
  crying_obsidian: (t) => P.obsidian(t, true),
  bedrock: (t) => P.bedrock(t),
  netherrack: (t) => P.netherrack(t),
  nether_bricks: (t) => P.bricks(t, PAL.netherBrick, 0x120708, 8, 4, false),
  red_nether_bricks: (t) => P.bricks(t, PAL.redNetherBrick, 0x1e0203, 8, 4, false),
  nether_wart: (t) => P.wart(t),
  basalt_side: (t) => P.basaltSide(t),
  basalt_top: (t) => P.basaltTop(t),
  blackstone: (t) => P.stone(t, PAL.blackstone),
  polished_blackstone_bricks: (t) => P.stoneBricks(t, PAL.blackstone),
  gilded_blackstone: (t) => P.ore(t, PAL.blackstone, [0xb08a14, 0xf0c832, 0xfff08a], 5),
  soul_sand: (t) => P.soulsand(t),
  soul_soil: (t) => P.dirt(t, PAL.soulsand),
  magma: (t) => P.magma(t),
  glowstone: (t) => P.glowstone(t),
  shroomlight: (t) => P.shroomlight(t),
  end_stone: (t) => P.endstone(t),
  end_stone_bricks: (t) => P.bricks(t, PAL.endstone, 0xb8b884, 8, 4, true),
  purpur_block: (t) => P.purpur(t),
  purpur_pillar: (t) => P.pillarSide(t, PAL.purpur),
  quartz: (t) => P.smoothStone(t, [0xd8d2c8, 0xe2ddd4, 0xebe6de, 0xf2eee8, 0xfaf8f4]),
  quartz_pillar: (t) => P.pillarSide(t, [0xd8d2c8, 0xe2ddd4, 0xebe6de, 0xf2eee8]),
  // plants & specials
  tall_grass: (t, env) => PP.grass(t, shadePal(env.grass, [0.7, 0.85, 1, 1.15])),
  fern: (t, env) => PP.fern(t, shadePal(env.foliage, [0.7, 0.85, 1, 1.15])),
  dandelion: (t) => PP.flower(t, 0xf5d020, 0xd08a10),
  poppy: (t) => PP.flower(t, 0xd01a1a, 0x2a0a0a),
  cornflower: (t) => PP.flower(t, 0x4a6ae8, 0x2a3a9a),
  allium: (t) => PP.tallFlower(t, 0xb46ae0),
  oxeye: (t) => PP.flower(t, 0xf0f0f0, 0xe0c020),
  lily: (t) => PP.tallFlower(t, 0xf5f5ff),
  blue_orchid: (t) => PP.flower(t, 0x2ab0f0, 0x1a70c0),
  dead_bush: (t) => PP.deadBush(t),
  wheat: (t) => PP.wheat(t, true),
  wheat_young: (t) => PP.wheat(t, false),
  sugar_cane: (t) => PP.sugarCane(t),
  bamboo: (t) => PP.bamboo(t),
  lilac: (t) => PP.lilac(t),
  lilac_top: (t) => PP.lilac(t, true),
  pink_tulip: (t) => PP.flower(t, 0xf0a0c8, 0xffe0f0),
  moss_block: (t) => (P.dirt(t, [0x4f7a24, 0x5d8a2c, 0x6a9a34, 0x4a6e20]), t.speck(0x7aaa3c, 0.12)),
  red_mushroom: (t) => PP.mushroom(t, 0xc8201a, 0xffffff),
  brown_mushroom: (t) => PP.mushroom(t, 0x9a6a4a, null),
  fire: (t) => PP.fire(t, false),
  soul_fire: (t) => PP.fire(t, true),
  cobweb: (t) => PP.cobweb(t),
  vines: (t, env) => PP.vines(t, shadePal(env.jungle, [0.7, 0.85, 1])),
  crimson_roots: (t) => PP.roots(t, [0x8a1a2a, 0xa82a3a, 0xc83a4a]),
  warped_roots: (t) => PP.roots(t, [0x14806a, 0x1aa08a, 0x2ac0aa]),
  torch: (t) => PP.torch(t),
  soul_torch: (t) => PP.torch(t, undefined, true),
  red_torch: (t) => PP.torch(t, [0xffa0a0, 0xff3a2a, 0xa01010]),
  lantern: (t) => PP.lantern(t),
  soul_lantern: (t) => PP.lantern(t, true),
  ladder: (t) => PP.ladder(t),
  iron_bars: (t) => PP.bars(t),
  berry_bush: (t) => PP.berryBush(t),
  chorus: (t) => PP.chorusFlower(t),
};

const B = [];
const byName = {};

function def(name, o = {}) {
  const id = B.length;
  const b = {
    id,
    name,
    shape: o.shape ?? SHAPE.CUBE,
    bucket: o.bucket ?? 'opaque',
    solid: o.solid ?? true,
    opaque:
      o.opaque ??
      ((o.shape == null || o.shape === SHAPE.CUBE) && (o.bucket == null || o.bucket === 'opaque')),
    light: o.light ?? 0,
    lightColor: o.lightColor ?? 0xffc080,
    filter: o.filter ?? (o.opaque === false || o.bucket ? 1 : 15),
    tex: normalizeTex(o.tex ?? name),
    sound: o.sound ?? 'stone',
    climb: !!o.climb,
    damage: o.damage ?? 0,
    liquid: o.liquid ?? null,
    wind: o.wind ?? 0,
    hardness: o.hardness ?? 1,
    breakable: !!o.breakable,
    replaceable: !!o.replaceable,
    tint: o.tint ?? null,
  };
  B.push(b);
  byName[name] = b;
  return b;
}

function normalizeTex(tex) {
  if (typeof tex === 'string') return { top: tex, bottom: tex, side: tex };
  return {
    top: tex.top ?? tex.all ?? tex.side,
    bottom: tex.bottom ?? tex.top ?? tex.all ?? tex.side,
    side: tex.side ?? tex.all,
    front: tex.front,
  };
}

// --- definitions (order defines ids; air must be 0) ---
def('air', {
  shape: SHAPE.NONE,
  solid: false,
  opaque: false,
  filter: 0,
  tex: 'stone',
  bucket: 'none',
});
def('barrier', {
  shape: SHAPE.NONE,
  solid: true,
  opaque: false,
  filter: 0,
  tex: 'stone',
  bucket: 'none',
});
def('light_block', {
  shape: SHAPE.NONE,
  solid: false,
  opaque: false,
  filter: 0,
  light: 15,
  tex: 'stone',
  bucket: 'none',
});
def('stone');
def('smooth_stone');
def('cobblestone');
def('mossy_cobblestone');
def('stone_bricks');
def('mossy_stone_bricks');
def('cracked_stone_bricks', { breakable: true });
def('chiseled_stone_bricks');
def('andesite');
def('polished_andesite');
def('granite');
def('diorite');
def('calcite');
def('tuff');
def('deepslate');
def('deepslate_bricks');
def('cobbled_deepslate');
def('dirt', { sound: 'gravel' });
def('coarse_dirt', { sound: 'gravel' });
def('mud', { sound: 'gravel' });
def('clay', { sound: 'gravel' });
def('gravel', { sound: 'gravel' });
def('sand', { sound: 'sand' });
def('red_sand', { sound: 'sand' });
def('sandstone', { tex: { top: 'sandstone_top', side: 'sandstone_side' } });
def('red_sandstone', { tex: { top: 'red_sand', side: 'red_sandstone_side' } });
def('grass', { tex: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' }, sound: 'grass' });
def('snowy_grass', { tex: { top: 'snow', side: 'snow_side', bottom: 'dirt' }, sound: 'snow' });
def('podzol', { tex: { top: 'podzol_top', side: 'podzol_side', bottom: 'dirt' }, sound: 'grass' });
def('path', { tex: { top: 'path_top', side: 'dirt' }, sound: 'gravel' });
def('farmland', { tex: { top: 'farmland_top', side: 'dirt' }, sound: 'gravel' });
def('snow', { sound: 'snow' });
def('ice', { bucket: 'translucent', opaque: false, filter: 2, sound: 'glass' });
def('packed_ice', { sound: 'glass' });
def('blue_ice', { sound: 'glass' });
def('cracked_ice', { tex: 'packed_ice', sound: 'glass', breakable: true });
for (const c of [
  'terracotta',
  'orange_terracotta',
  'red_terracotta',
  'yellow_terracotta',
  'brown_terracotta',
  'white_terracotta',
  'light_gray_terracotta',
])
  def(c);
for (const w of ['oak', 'birch', 'spruce', 'jungle', 'dark_oak', 'acacia']) {
  def(w + '_log', { tex: { top: w + '_log_top', side: w + '_log' }, sound: 'wood' });
  def(w + '_planks', { sound: 'wood' });
  def(w + '_leaves', { bucket: 'cutout', opaque: false, filter: 1, sound: 'leaves', wind: 1 });
}
def('charred_log', { tex: { top: 'charred_planks', side: 'charred_log' }, sound: 'wood' });
def('charred_planks', { sound: 'wood', breakable: true });
def('glass', { bucket: 'cutout', opaque: false, filter: 0, sound: 'glass' });
def('blue_glass', { bucket: 'translucent', opaque: false, filter: 0, sound: 'glass' });
def('red_glass', { bucket: 'translucent', opaque: false, filter: 0, sound: 'glass' });
def('purple_glass', { bucket: 'translucent', opaque: false, filter: 0, sound: 'glass' });
for (const c of [
  'white',
  'red',
  'blue',
  'light_blue',
  'black',
  'gray',
  'yellow',
  'green',
  'purple',
  'brown',
  'cyan',
  'orange',
])
  def(c + '_wool', { sound: 'wool' });
def('bricks');
def('bookshelf', { tex: { top: 'oak_planks', side: 'bookshelf' }, sound: 'wood' });
def('crafting_table', {
  tex: { top: 'crafting_top', side: 'crafting_side', bottom: 'oak_planks' },
  sound: 'wood',
});
def('furnace', { tex: { top: 'furnace_top', side: 'cobblestone', front: 'furnace_front' } });
def('furnace_lit', {
  tex: { top: 'furnace_top', side: 'cobblestone', front: 'furnace_lit' },
  light: 13,
});
def('chest', { tex: { top: 'chest_top', side: 'chest_side' }, sound: 'wood' });
def('barrel', { tex: { top: 'barrel_top', side: 'barrel_side' }, sound: 'wood' });
def('hay', { tex: { top: 'hay_top', side: 'hay_side' }, sound: 'grass' });
def('pumpkin', { tex: { top: 'pumpkin_top', side: 'pumpkin_side' }, sound: 'wood' });
def('jack_o_lantern', {
  tex: { top: 'pumpkin_top', side: 'pumpkin_side', front: 'jack_face' },
  light: 15,
  sound: 'wood',
});
def('melon', { tex: { top: 'pumpkin_top', side: 'melon_side' }, sound: 'wood' });
def('target', { sound: 'grass' });
def('note_block', { sound: 'wood' });
for (const o of ['coal', 'iron', 'gold', 'diamond', 'lapis', 'emerald', 'redstone'])
  def(o + '_ore');
for (const o of ['iron', 'gold', 'copper', 'diamond', 'lapis', 'emerald', 'redstone'])
  def(o + '_block', { sound: 'metal' });
def('prismarine');
def('prismarine_bricks');
def('dark_prismarine');
def('sea_lantern', { light: 15, lightColor: 0xc0f0ff, sound: 'glass' });
def('rune_bricks');
def('rune_rune_blue', { light: 9, lightColor: 0x55d6ff });
def('rune_rune_blue2', { light: 9, lightColor: 0x55d6ff });
def('rune_rune_red', { light: 9, lightColor: 0xff3a2a });
def('rune_rune_yellow', { light: 9, lightColor: 0xffd23a });
def('rune_rune_green', { light: 9, lightColor: 0x4aff7a });
def('shadow_bricks');
def('obsidian');
def('crying_obsidian', { light: 10, lightColor: 0xa050ff });
def('bedrock');
def('netherrack');
def('nether_bricks');
def('red_nether_bricks');
def('nether_wart', { tex: 'nether_wart', sound: 'wool' });
def('basalt', { tex: { top: 'basalt_top', side: 'basalt_side' } });
def('blackstone');
def('polished_blackstone_bricks');
def('gilded_blackstone');
def('soul_sand', { sound: 'sand' });
def('soul_soil', { sound: 'sand' });
def('magma', { light: 6, lightColor: 0xff6a1a, damage: 1 });
def('glowstone', { light: 15, lightColor: 0xffd98a, sound: 'glass' });
def('shroomlight', { light: 15, lightColor: 0xffb060, sound: 'wool' });
def('end_stone');
def('end_stone_bricks');
def('purpur_block');
def('purpur_pillar', { tex: { top: 'purpur_block', side: 'purpur_pillar' } });
def('quartz');
def('quartz_pillar', { tex: { top: 'quartz', side: 'quartz_pillar' } });
def('water', {
  shape: SHAPE.LIQUID,
  bucket: 'water',
  solid: false,
  opaque: false,
  filter: 2,
  liquid: 'water',
  tex: 'glass',
  sound: 'water',
});
def('lava', {
  shape: SHAPE.LIQUID,
  bucket: 'lava',
  solid: false,
  opaque: false,
  filter: 15,
  liquid: 'lava',
  light: 15,
  lightColor: 0xff8a2a,
  damage: 4,
  tex: 'magma',
});
// cross plants
const plant = (n, o = {}) =>
  def(n, {
    shape: SHAPE.CROSS,
    bucket: 'cutout',
    solid: false,
    opaque: false,
    filter: 0,
    sound: 'grass',
    wind: 1,
    replaceable: true,
    ...o,
  });
plant('tall_grass');
plant('fern');
plant('dandelion');
plant('poppy');
plant('cornflower');
plant('allium');
plant('oxeye');
plant('lily');
plant('blue_orchid');
plant('dead_bush', { wind: 0.3 });
plant('wheat');
plant('wheat_young');
plant('sugar_cane', { wind: 0.4 });
plant('red_mushroom', { wind: 0 });
plant('brown_mushroom', { wind: 0 });
plant('fire', { light: 15, lightColor: 0xff9a3a, damage: 2, wind: 0, sound: 'fire' });
plant('soul_fire', { light: 12, lightColor: 0x5ae0ff, damage: 2, wind: 0, sound: 'fire' });
plant('cobweb', { wind: 0, sound: 'wool' });
plant('hanging_vines', { tex: 'vines', climb: true, wind: 0.6 });
plant('crimson_roots', { wind: 0.3 });
plant('warped_roots', { wind: 0.3 });
plant('berry_bush');
plant('chorus', { wind: 0.2, light: 6, lightColor: 0xd0a0ff });
def('torch', {
  shape: SHAPE.TORCH,
  bucket: 'cutout',
  solid: false,
  opaque: false,
  filter: 0,
  light: 14,
  lightColor: 0xffb060,
  sound: 'wood',
});
def('soul_torch', {
  shape: SHAPE.TORCH,
  bucket: 'cutout',
  solid: false,
  opaque: false,
  filter: 0,
  light: 11,
  lightColor: 0x5ae0ff,
  sound: 'wood',
});
def('red_torch', {
  shape: SHAPE.TORCH,
  bucket: 'cutout',
  solid: false,
  opaque: false,
  filter: 0,
  light: 11,
  lightColor: 0xff4a2a,
  sound: 'wood',
});
def('lantern', {
  shape: SHAPE.LANTERN,
  bucket: 'cutout',
  solid: false,
  opaque: false,
  filter: 0,
  light: 15,
  lightColor: 0xffc070,
  sound: 'metal',
});
def('soul_lantern', {
  shape: SHAPE.LANTERN,
  bucket: 'cutout',
  solid: false,
  opaque: false,
  filter: 0,
  light: 12,
  lightColor: 0x5ae0ff,
  sound: 'metal',
});
def('ladder', {
  shape: SHAPE.LADDER,
  bucket: 'cutout',
  solid: false,
  opaque: false,
  filter: 0,
  climb: true,
  sound: 'wood',
});
def('iron_bars', {
  shape: SHAPE.PANE,
  bucket: 'cutout',
  solid: true,
  opaque: false,
  filter: 0,
  sound: 'metal',
});
def('glass_pane', {
  shape: SHAPE.PANE,
  bucket: 'cutout',
  solid: true,
  opaque: false,
  filter: 0,
  tex: 'glass',
  sound: 'glass',
});
for (const w of ['oak', 'spruce', 'dark_oak', 'birch', 'jungle', 'acacia'])
  def(w + '_fence', {
    shape: SHAPE.FENCE,
    bucket: 'opaque',
    opaque: false,
    filter: 0,
    tex: w + '_planks',
    sound: 'wood',
  });
def('nether_brick_fence', { shape: SHAPE.FENCE, opaque: false, filter: 0, tex: 'nether_bricks' });
def('stone_wall', { shape: SHAPE.FENCE, opaque: false, filter: 0, tex: 'cobblestone' });
def('blackstone_wall', { shape: SHAPE.FENCE, opaque: false, filter: 0, tex: 'blackstone' });
const slab = (n, tex, o = {}) => def(n, { shape: SHAPE.SLAB, opaque: false, filter: 0, tex, ...o });
slab('stone_slab', 'smooth_stone');
slab('cobblestone_slab', 'cobblestone');
slab('stone_brick_slab', 'stone_bricks');
slab('oak_slab', 'oak_planks', { sound: 'wood' });
slab('spruce_slab', 'spruce_planks', { sound: 'wood' });
slab('dark_oak_slab', 'dark_oak_planks', { sound: 'wood' });
slab('birch_slab', 'birch_planks', { sound: 'wood' });
slab('jungle_slab', 'jungle_planks', { sound: 'wood' });
slab('acacia_slab', 'acacia_planks', { sound: 'wood' });
slab('sandstone_slab', { top: 'sandstone_top', side: 'sandstone_side' });
slab('blackstone_slab', 'polished_blackstone_bricks');
slab('nether_brick_slab', 'nether_bricks');
slab('purpur_slab', 'purpur_block');
slab('end_brick_slab', 'end_stone_bricks');
slab('prismarine_slab', 'prismarine_bricks');
slab('rune_slab', 'rune_bricks');
slab('deepslate_slab', 'deepslate_bricks');
slab('quartz_slab', 'quartz');
def('oak_topslab', {
  shape: SHAPE.TOPSLAB,
  opaque: false,
  filter: 0,
  tex: 'oak_planks',
  sound: 'wood',
});
def('spruce_topslab', {
  shape: SHAPE.TOPSLAB,
  opaque: false,
  filter: 0,
  tex: 'spruce_planks',
  sound: 'wood',
});
def('stone_topslab', { shape: SHAPE.TOPSLAB, opaque: false, filter: 0, tex: 'stone_bricks' });
def('snow_layer', {
  shape: SHAPE.LAYER,
  opaque: false,
  filter: 0,
  tex: 'snow',
  sound: 'snow',
  solid: false,
  replaceable: true,
});
def('red_carpet', {
  shape: SHAPE.LAYER,
  opaque: false,
  filter: 0,
  tex: 'red_wool',
  sound: 'wool',
  solid: false,
});
def('blue_carpet', {
  shape: SHAPE.LAYER,
  opaque: false,
  filter: 0,
  tex: 'blue_wool',
  sound: 'wool',
  solid: false,
});
def('purple_carpet', {
  shape: SHAPE.LAYER,
  opaque: false,
  filter: 0,
  tex: 'purple_wool',
  sound: 'wool',
  solid: false,
});
def('moss_carpet', {
  shape: SHAPE.LAYER,
  opaque: false,
  filter: 0,
  tex: 'green_wool',
  sound: 'grass',
  solid: false,
});
// Appended later: new blocks always go at the end so the ids of older blocks (stored in saves) stay the same.
plant('bamboo', { wind: 0.25 });
plant('lilac');
plant('lilac_top');
plant('pink_tulip');
def('moss_block', { sound: 'grass' });

export const BLOCKS = B;
export const BLOCK = Object.fromEntries(B.map((b) => [b.name, b.id]));
export const blockByName = byName;
export const NUM_BLOCKS = B.length;
if (NUM_BLOCKS > 255) throw new Error('Too many blocks for Uint8 storage');

/** Fast lookup tables for the mesher / physics / lighting. */
export const T_SOLID = new Uint8Array(256);
export const T_OPAQUE = new Uint8Array(256);
export const T_SHAPE = new Uint8Array(256);
export const T_LIGHT = new Uint8Array(256);
export const T_FILTER = new Uint8Array(256);
export const T_CLIMB = new Uint8Array(256);
export const T_LIQUID = new Uint8Array(256); // 0 none, 1 water, 2 lava
export const T_DAMAGE = new Uint8Array(256);
for (const b of B) {
  T_SOLID[b.id] = b.solid ? 1 : 0;
  T_OPAQUE[b.id] = b.opaque ? 1 : 0;
  T_SHAPE[b.id] = b.shape;
  T_LIGHT[b.id] = b.light;
  T_FILTER[b.id] = b.opaque ? 15 : b.filter;
  T_CLIMB[b.id] = b.climb ? 1 : 0;
  T_LIQUID[b.id] = b.liquid === 'water' ? 1 : b.liquid === 'lava' ? 2 : 0;
  T_DAMAGE[b.id] = b.damage;
}

export function mergeEnv(env) {
  return { ...DEFAULT_ENV, ...(env || {}) };
}
