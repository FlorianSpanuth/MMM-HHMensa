/* MMM-HHMensa – parser for the menu page of Studierendenwerk Hamburg (stwhh.de/speiseplan)
 *
 * The page is server-rendered (TYPO3). Each dish is a <div class="singlemeal " …> with data
 * attributes (location ID, category IDs, symbol IDs, allergens); names of locations and categories
 * come from the filter lists on the same page. Pure functions, no I/O – see test/lib.test.js.
 */

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#8364": "€", "#39": "'" };

function decode(s) {
	return String(s)
		.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
			if (ENTITIES[e] !== undefined) return ENTITIES[e];
			if (e[0] === "#") return String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
			return m;
		})
		.replace(/\s+/g, " ")
		.trim();
}

const text = (html) => decode(String(html).replace(/<[^>]*>/g, " "));

// Date of the menu shown. Both pages contain both labels ("Heute, 15.10.2026" and
// "Nächster Öffnungstag, 16.10.2026"), so the label is chosen by the requested day.
function pageDate(html, day = "today") {
	const label = day === "next_day" ? "(?:Nächster|N&auml;chster) (?:Öffnungstag|&Ouml;ffnungstag)" : "Heute";
	const m = new RegExp(`${label}\\s*,\\s*(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})`).exec(html);
	return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

// filter lists: data-filter-id="174" …>Mensa MIN<
function filterNames(html) {
	const names = {};
	for (const m of html.matchAll(/data-filter-id="(\d+)"[^>]*>\s*([^<]{2,80}?)\s*</g)) {
		names[m[1]] ??= decode(m[2]);
	}
	return names;
}

// symbol IDs → names, from the icon tooltips ("<b>Vegan</b>…")
function symbolNames(html) {
	const names = {};
	const re = /title="(?:<b>|&lt;b&gt;)([^<&]+)(?:<\/b>|&lt;\/b&gt;)[^"]*"\s*>\s*<img[^>]*>\s*<\/span>\s*<span class="singlemeal__iconmodal" data-section="icon_(\d+)"/g;
	for (const m of html.matchAll(re)) names[m[2]] ??= decode(m[1]);
	return names;
}

const PRICE_GROUPS = { Studierende: "students", Bedienstete: "employees", "Gäste": "guests" };

function parseMeal(block, names, symbols) {
	const attr = (n) => (new RegExp(`data-${n}="([^"]*)"`).exec(block)?.[1] || "").trim();
	const ids = (n) => attr(n).split(/\s+/).filter(Boolean);
	const headline = /class="singlemeal__headline[^"]*">([\s\S]*?)<\/h5>/.exec(block);
	if (!headline) return null;
	const fullName = text(headline[1]);

	const prices = {};
	for (const m of text(block).matchAll(/(\d+,\d{2})\s*€\s*(Studierende|Bedienstete|Gäste)/g)) {
		prices[PRICE_GROUPS[m[2]]] = Number(m[1].replace(",", "."));
	}
	const allergens = [];
	for (const m of block.matchAll(/<strong>\s*([^<]+?)\s*<\/strong>\s*=\s*([^<]+)</g)) allergens.push({ code: decode(m[1]), text: decode(m[2]) });

	return {
		name: cleanName(fullName),
		fullName,
		location: attr("locations"),
		categories: ids("categories").map((id) => names[id] || id),
		labels: ids("symbols").map((id) => symbols[id]).filter(Boolean),
		allergens,
		prices
	};
}

// "One Pot Kichererbse mit Tomate (Sw), pikantes Möhrengemüse (Sl)" → without the allergen codes
function cleanName(name) {
	return name
		.replace(/\s*\((?:[A-Za-zÄÖÜäöü]{1,4}|\d{1,2})(?:\s*,\s*(?:[A-Za-zÄÖÜäöü]{1,4}|\d{1,2}))*\)/g, "")
		.replace(/\s+,/g, ",")
		.replace(/\s{2,}/g, " ")
		.trim();
}

// whole page → { date, locations: { id: name }, meals: [...] }; day: "today" | "next_day"
function parseMenuPage(html, day = "today") {
	const names = filterNames(html);
	const symbols = symbolNames(html);
	const meals = html
		.split(/<div\s+class="singlemeal "/)
		.slice(1)
		.map((part) => parseMeal(`<div class="singlemeal ${part}`, names, symbols))
		.filter(Boolean);
	const locations = {};
	for (const m of meals) locations[m.location] = names[m.location] || m.location;
	return { date: pageDate(html, day), locations, meals };
}

// config names ("Mensa MIN", "Blattwerk") → location IDs; case-insensitive, part of the name is enough
function matchLocations(wanted, locations) {
	const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
	return wanted.map((w) => {
		const hit = Object.entries(locations).find(([, n]) => norm(n).includes(norm(w)));
		return { wanted: w, id: hit?.[0] ?? null, name: hit?.[1] ?? w };
	});
}

module.exports = { parseMenuPage, matchLocations, cleanName, pageDate, decode };
