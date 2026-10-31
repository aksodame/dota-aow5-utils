import assert from 'node:assert/strict';
import test from 'node:test';
import { applyEffects, effectOf, type DerivedTotals } from './itemeffects.ts';

/**
 * Scenarios run once through the partner wiki's `itemeffects.js` under Node;
 * `extra` is what it returned. The port must agree to the last digit — the
 * fixed point included.
 */
const derive = (P: Record<string, number>): DerivedTotals => {
  const m = (k: string) => 1 + ((P[k] ?? 0) + (P.all_all_stats_pct ?? 0)) / 100;
  const all = P.bonus_all_stats ?? 0;
  const str = (120 + (P.bonus_strength ?? 0) + all) * m('all_strength_pct');
  const agi = (90 + (P.bonus_agility ?? 0) + all) * m('all_agility_pct');
  const int = (80 + (P.bonus_intelligence ?? 0) + all) * m('all_intelligence_pct');
  return { str, agi, int, mana: 260 + (P.bonus_mana ?? 0) + int * 0.85 };
};

const SCENARIOS: Array<{ eq: Array<{ id: string; stats: Record<string, number> }>; extra: Record<string, number>; counted: Array<[string, boolean]> }> = [
  {
    "eq": [
      {
        "id": "item_0608",
        "stats": {
          "bonus_all_stats": 65,
          "all_all_stats_pct": 26,
          "ability_value_boost_pct": 43,
          "ability_value_c_reduce_pct": 12
        }
      },
      {
        "id": "item_0336",
        "stats": {
          "bonus_intelligence": 40,
          "bonus_mana": 600
        }
      },
      {
        "id": "item_0335",
        "stats": {
          "bonus_mana": 300
        }
      }
    ],
    "extra": {
      "bonus_intelligence": -22,
      "bonus_strength": 79,
      "bonus_agility": -18,
      "magical_damage_add_pct": 40,
      "bonus_health": 1334
    },
    "counted": [
      [
        "item_0608",
        true
      ],
      [
        "item_0336",
        true
      ],
      [
        "item_0335",
        true
      ]
    ]
  },
  {
    "eq": [
      {
        "id": "item_0876",
        "stats": {
          "physical_damage_add_pct": 20,
          "ability_value_convert_pct": 150
        }
      },
      {
        "id": "item_0100",
        "stats": {
          "physical_damage_add_pct": 15
        }
      },
      {
        "id": "item_0658",
        "stats": {
          "physical_crit_chance_pct": 30,
          "omni_crit_chance_pct": 5,
          "bonus_agility": 700
        }
      }
    ],
    "extra": {
      "physical_damage_add_pct": -35,
      "magical_damage_add_pct": 52.5,
      "physical_crit_chance_pct": -7,
      "magical_crit_chance_pct": 7
    },
    "counted": [
      [
        "item_0876",
        true
      ],
      [
        "item_0658",
        true
      ]
    ]
  },
  {
    "eq": [
      {
        "id": "item_0208",
        "stats": {
          "magical_lifesteal_pct": 12,
          "omni_lifesteal_pct": 4.5
        }
      },
      {
        "id": "item_0615",
        "stats": {}
      },
      {
        "id": "item_0737",
        "stats": {
          "bonus_strength": 300
        }
      },
      {
        "id": "item_0541",
        "stats": {}
      }
    ],
    "extra": {
      "magical_damage_add_pct": 41,
      "bonus_strength": 134,
      "bonus_agility": -13,
      "bonus_intelligence": -12
    },
    "counted": [
      [
        "item_0208",
        true
      ],
      [
        "item_0615",
        true
      ],
      [
        "item_0737",
        true
      ],
      [
        "item_0541",
        false
      ]
    ]
  }
];

test('effects match the partner wiki, fixed point included', () => {
  for (const { eq, extra, counted } of SCENARIOS) {
    const got = applyEffects(eq, derive);
    assert.deepEqual(got.extra, extra);
    assert.deepEqual(
      got.notes.map((n) => [n.itemId, n.facts !== null]),
      counted,
    );
  }
});

test('ancestors resolve to their base, by alias or through the fate stone', () => {
  assert.equal(effectOf('item_0608'), 'crown');
  assert.equal(effectOf('item_0737'), 'crown');
  assert.equal(effectOf('item_0100'), undefined);
  assert.equal(effectOf('item_9999', (id) => (id === 'item_9999' ? 'item_0335' : undefined)), 'arcaneCloak');
});

test('the codex is conditional and nothing else is', () => {
  const { notes } = applyEffects([{ id: 'item_0615', stats: {} }, { id: 'item_0335', stats: {} }], derive);
  assert.deepEqual(notes.map((n) => n.conditional), [true, false]);
});

test('Overflow turns physical crit above the cap into crit damage', () => {
  const got = applyEffects(
    [
      {
        id: 'item_0610',
        stats: {
          physical_crit_chance_pct: 124,
          ability_value_c_crit_cap_pct: 100,
          ability_overflow_per_step: 2,
          ability_value_crit_damage_per_step: 3,
        },
      },
    ],
    derive,
  );
  assert.equal(got.extra.crit_damage_pct, 36);
  assert.deepEqual(got.notes.find((n) => n.itemId === 'item_0610')?.facts, {
    kind: 'overcrit',
    total: 124,
    cap: 100,
    overflow: 24,
    step: 2,
    perStep: 3,
    amp: 36,
  });
  assert.equal(effectOf('item_0820'), 'overcrit');
});

test('Primal Crystal conversion happens before Overflow reads the crit chance', () => {
  const got = applyEffects(
    [
      {
        id: 'item_0610',
        stats: {
          physical_crit_chance_pct: 130,
          ability_value_c_crit_cap_pct: 100,
          ability_overflow_per_step: 2,
          ability_value_crit_damage_per_step: 3,
        },
      },
      { id: 'item_0658', stats: { bonus_agility: 600 } },
    ],
    derive,
  );
  // 658 converts 20% of 130 = 26 physical into magical, so 610 sees 104 and
  // adds floor((104 − 100) / 2) × 3 = 6, not 45 from the pre-conversion 130.
  assert.equal(got.extra.physical_crit_chance_pct, -26);
  assert.equal(got.extra.crit_damage_pct, 6);
});

test('Infinity turns both crit chances into crit damage', () => {
  const got = applyEffects(
    [
      {
        id: 'item_0368',
        stats: {
          physical_crit_chance_pct: 50,
          magical_crit_chance_pct: 20,
          omni_crit_chance_pct: 10,
          ability_value_crit_damage_convert_pct: 70,
        },
      },
    ],
    derive,
  );
  assert.equal(got.extra.crit_damage_pct, 63);
  assert.deepEqual(got.notes.find((n) => n.itemId === 'item_0368')?.facts, {
    kind: 'infinity',
    physical: 60,
    magical: 30,
    convert: 70,
    amp: 63,
  });
  assert.equal(effectOf('item_0779'), 'infinity');
});
