/* MMM-HHMensa – server side
 *
 * Fetches the menu page of Studierendenwerk Hamburg (all canteens in one page, ≈ 2 MB) and keeps it
 * cached per day; all module instances share it. Before `switchTime` today's menu is shown,
 * afterwards the next opening day's ("next_day" also skips weekends and holidays).
 *
 * Light on the website: at most one request per day and hour during the day, fewer at night.
 */
const NodeHelper = require("node_helper");
const Log = require("logger");
const { parseMenuPage, matchLocations } = require("./lib");

const URL = "https://www.stwhh.de/speiseplan";
const USER_AGENT = "MMM-HHMensa (MagicMirror module; one request per hour at most)";
const CHECK_MS = 5 * 60 * 1000; // local check whether a refresh is due (no request)

module.exports = NodeHelper.create({
	start() {
		this.instances = new Map();
		this.cache = new Map(); // "today" | "next_day" -> { fetchedAt, data } or { promise }
	},

	socketNotificationReceived(notification, payload) {
		if (notification === "MENSA_START") {
			const inst = this.instances.get(payload.identifier) || { identifier: payload.identifier };
			inst.config = payload.config;
			this.instances.set(payload.identifier, inst);
			this.update(inst);
		}
	},

	day(config) {
		const [h, m] = config.switchTime.split(":").map(Number);
		const now = new Date();
		return now.getHours() * 60 + now.getMinutes() >= h * 60 + m ? "next_day" : "today";
	},

	maxAge() {
		const h = new Date().getHours();
		return (h >= 6 && h < 18 ? 60 : 180) * 60 * 1000;
	},

	// one shared request per day key, cached
	async menu(day) {
		const entry = this.cache.get(day);
		if (entry?.promise) return entry.promise;
		const today = new Date().toDateString();
		if (entry?.data && entry.day === today && Date.now() - entry.fetchedAt < this.maxAge()) return entry.data;

		const promise = (async () => {
			const res = await fetch(`${URL}?t=${day}`, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(30000) });
			if (!res.ok) throw new Error(`stwhh.de: HTTP ${res.status}`);
			const data = parseMenuPage(await res.text(), day);
			if (!data.meals.length) throw new Error("stwhh.de: no dishes found – page layout changed?");
			Log.log(`${day}: ${data.meals.length} dishes in ${Object.keys(data.locations).length} canteens (${data.date})`);
			this.cache.set(day, { data, fetchedAt: Date.now(), day: today });
			return data;
		})();
		this.cache.set(day, { ...entry, promise });
		try {
			return await promise;
		} catch (error) {
			// keep the last good data, if any
			this.cache.set(day, { ...entry, promise: undefined });
			if (entry?.data) {
				Log.warn(`${error.message} – showing the last menu`);
				return entry.data;
			}
			throw error;
		}
	},

	async update(inst) {
		clearTimeout(inst.timer);
		const day = this.day(inst.config);
		try {
			const data = await this.menu(day);
			const selected = matchLocations(inst.config.mensen, data.locations);
			for (const s of selected) {
				if (!s.id) Log.warn(`canteen "${s.wanted}" not found. Available: ${Object.values(data.locations).join(", ")}`);
			}
			this.sendSocketNotification("MENSA_DATA", {
				identifier: inst.identifier,
				day,
				date: data.date,
				mensen: selected.map((s) => ({ label: s.wanted, name: s.name, found: Boolean(s.id), meals: data.meals.filter((m) => m.location === s.id) }))
			});
		} catch (error) {
			Log.error(error.message);
			this.sendSocketNotification("MENSA_ERROR", { identifier: inst.identifier, message: error.message });
		}
		inst.timer = setTimeout(() => this.update(inst), CHECK_MS);
	}
});
