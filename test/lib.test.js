// Run: npm test   (node --test)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseMenuPage, matchLocations, cleanName, pageDate } = require("../lib");

const html = fs.readFileSync(path.join(__dirname, "fixture.html"), "utf8");

test("parses dishes with location, category, prices, labels and allergens", () => {
	const page = parseMenuPage(html);
	assert.equal(page.meals.length, 3);
	const m = page.meals[0];
	assert.equal(m.location, "174");
	assert.deepEqual(m.categories, ["Pottkieker"]);
	assert.equal(m.name, "One Pot Kichererbse mit Tomate, pikantes Möhrengemüse");
	assert.deepEqual(m.prices, { students: 2.2, employees: 3.5, guests: 4.8 });
	assert.ok(m.labels.includes("Vegan"));
	assert.deepEqual(m.allergens.map((a) => a.code), ["Sl", "Sw"]);
	assert.ok(page.meals.some((x) => x.categories.includes("Pastabar")));
});

test("location names come from the page", () => {
	const page = parseMenuPage(html);
	assert.equal(page.locations["174"], "Mensa MIN");
});

test("canteens are matched by (part of) their name", () => {
	const locations = { 174: "Mensa MIN", 142: "Blattwerk – deine vegetarische Mensa", 137: "Mensa Studierendenhaus" };
	const r = matchLocations(["mensa min", "Blattwerk", "Studierendenhaus", "Nowhere"], locations);
	assert.deepEqual(r.map((x) => x.id), ["174", "142", "137", null]);
});

test("date depends on the requested day", () => {
	assert.equal(pageDate(html, "today"), "2026-10-15");
	assert.equal(pageDate(html, "next_day"), "2026-10-16");
});

test("allergen codes are removed from dish names", () => {
	assert.equal(cleanName("Hühnerfrikassee (3,8,Mi,Sw,GlW,GlG), Fingermöhrchen"), "Hühnerfrikassee, Fingermöhrchen");
	assert.equal(cleanName("Sojageschnetzeltes mit Waldpilzen (Sojaprotein) (So,Sl,GlW), Reis"), "Sojageschnetzeltes mit Waldpilzen (Sojaprotein), Reis");
});
