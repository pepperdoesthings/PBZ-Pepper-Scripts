"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { lib } = require("./paths");
const { shortName, createBossMatcher } = lib("BossNames");

test("shortName reduces class paths to a lower-case name without the _C suffix", () => {
    assert.equal(shortName("/Game/Enemies/BP_Foo_P2.BP_Foo_P2_C"), "bp_foo_p2");
    assert.equal(shortName("Class'/Game/X/BP_Bar.BP_Bar_C'"), "bp_bar");
    assert.equal(shortName("/Game/X/BP_Baz"), "bp_baz");
    assert.equal(shortName("BP_Plain"), "bp_plain");
});

test("shortName of nothing is empty", () => {
    for (const bad of [undefined, null, ""])
        assert.equal(shortName(bad), "");
});

function matcher() {
    return createBossMatcher([
        { classes: ["/G/BP_Boss_One.BP_Boss_One_C", "/G/BP_Boss_Alias.BP_Boss_Alias_C"], isBoss: true },
        { classes: ["/G/BP_Grunt.BP_Grunt_C"], isBoss: false },
        { classes: ["/G/BP_Elite_01.BP_Elite_01_C"], isBoss: true },
        { classes: ["/G/BP_Hook_P2.BP_Hook_P2_C"], isBoss: true },
        { classes: [], isBoss: false },
    ]);
}

test("a class listed as a boss, or as an alias of one, is a boss", () => {
    const is = matcher();
    assert.equal(is("/G/BP_Boss_One.BP_Boss_One_C"), true);
    assert.equal(is("/G/BP_Boss_Alias.BP_Boss_Alias_C"), true);
});

test("a class listed as a normal enemy is not a boss", () => {
    assert.equal(matcher()("/G/BP_Grunt.BP_Grunt_C"), false);
});

test("a numbered sibling of a boss is a boss", () => {
    assert.equal(matcher()("/G/BP_Elite_02.BP_Elite_02_C"), true);
});

test("the base name of a boss variant is a boss", () => {
    assert.equal(matcher()("/G/BP_Hook.BP_Hook_C"), true);
});

test("an unknown class is not a boss, and neither is an empty one", () => {
    const is = matcher();
    assert.equal(is("/G/BP_Mystery.BP_Mystery_C"), false);
    assert.equal(is(""), false);
    assert.equal(is(undefined), false);
});

test("an exact normal row wins over a boss of the same stripped name", () => {
    const is = createBossMatcher([
        { classes: ["/G/BP_Thing_01.BP_Thing_01_C"], isBoss: true },
        { classes: ["/G/BP_Thing_02.BP_Thing_02_C"], isBoss: false },
    ]);
    assert.equal(is("/G/BP_Thing_02.BP_Thing_02_C"), false);
    assert.equal(is("/G/BP_Thing_03.BP_Thing_03_C"), true);
});

test("no rows at all means nothing is a boss", () => {
    assert.equal(createBossMatcher([])("/G/BP_Anything.BP_Anything_C"), false);
});
