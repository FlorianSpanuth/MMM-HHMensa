/* MMM-HHMensa – today's menu of the Hamburg university canteens (Studierendenwerk Hamburg)
 *
 * Several canteens, chosen by name; one is shown at a time, they take turns every `rotateInterval`
 * seconds. Daily recurring counters (pasta bar, vegetable bar) are hidden by default.
 * After `switchTime` the next opening day is shown.
 * See README.md.
 */
Module.register("MMM-HHMensa", {
	defaults: {
		mensen: ["Studierendenhaus"], // canteen names (case-insensitive, part of the name is enough)
		hideCategories: ["Pastabar", "Gemüsebar"], // counters that are the same every day
		price: "students", // "students" | "employees" | "guests" | null (no prices)
		showCategory: false, // counter name above each dish ("CampusKlassiker", "Pottkieker", …)
		showLabels: false, // vegan, vegetarian, poultry, beef, pork, fish, mensaVital, lactose-free
		showAllergens: false, // allergen and additive codes (Sl, GlW, …)
		maxMeals: 0, // per canteen, 0 = all
		switchTime: "17:00", // from this time on, the next opening day is shown
		rotateInterval: 20, // seconds per canteen when several are configured
		animationSpeed: 1000 // ms cross-fade when switching canteens
	},

	getStyles() {
		return ["MMM-HHMensa.css"];
	},

	getTranslations() {
		return { en: "translations/en.json", de: "translations/de.json" };
	},

	start() {
		this.data.header ??= "Mensa";
		this.menu = null;
		this.error = null;
		this.current = 0;
		this.sendSocketNotification("MENSA_START", { identifier: this.identifier, config: this.config });
		if (this.config.mensen.length > 1) {
			this.rotation = setInterval(() => {
				this.current = (this.current + 1) % this.config.mensen.length;
				this.updateDom(this.config.animationSpeed);
			}, this.config.rotateInterval * 1000);
		}
	},

	socketNotificationReceived(notification, payload) {
		if (payload?.identifier !== this.identifier) return;
		if (notification === "MENSA_DATA") {
			this.menu = payload;
			this.error = null;
			// lets a visibility manager (e.g. MMM-Director) hide the module when there's nothing to show
			this.sendNotification("MM2_CONTENT", { hasContent: this.visibleMensen().some((m) => m.meals.length) });
		} else if (notification === "MENSA_ERROR") {
			this.error = payload.message;
			if (this.menu) return;
		}
		this.updateDom(0);
	},

	visibleMensen() {
		const hidden = new Set(this.config.hideCategories.map((c) => c.toLowerCase()));
		return (this.menu?.mensen || []).map((m) => {
			let meals = m.meals.filter((meal) => !meal.categories.some((c) => hidden.has(c.toLowerCase())));
			if (this.config.maxMeals > 0) meals = meals.slice(0, this.config.maxMeals);
			return { ...m, meals };
		});
	},

	// "Heute" / "Morgen" / "Montag, 19.10."
	dayLabel() {
		const date = new Date(`${this.menu.date}T12:00:00`);
		const today = new Date();
		const diff = Math.round((new Date(date.toDateString()) - new Date(today.toDateString())) / 86400000);
		if (diff === 0) return this.translate("TODAY");
		if (diff === 1) return this.translate("TOMORROW");
		return date.toLocaleDateString(config.locale || config.language, { weekday: "long", day: "numeric", month: "numeric" });
	},

	price(meal) {
		const p = meal.prices[this.config.price];
		return typeof p === "number" ? p.toLocaleString(config.locale || config.language, { style: "currency", currency: "EUR" }) : "";
	},

	getDom() {
		const wrapper = document.createElement("div");
		wrapper.className = "hhmensa";
		if (!this.menu) {
			wrapper.innerHTML = `<div class="dimmed small">${this.error ? `${this.translate("ERROR")}: ${escape(this.error)}` : this.translate("LOADING")}</div>`;
			return wrapper;
		}

		// one canteen at a time; the dots show which one and how many there are
		const mensen = this.visibleMensen();
		const mensa = mensen[this.current % mensen.length];
		const dots = mensen.length > 1 ? `<span class="hhmensa-dots">${mensen.map((_, i) => `<span class="${i === this.current % mensen.length ? "on" : ""}"></span>`).join("")}</span>` : "";
		wrapper.insertAdjacentHTML("beforeend", `<div class="hhmensa-head"><span class="hhmensa-name">${escape(mensa.label)}</span><span class="hhmensa-day">${escape(this.dayLabel())}</span>${dots}</div>`);
		if (!mensa.found) {
			wrapper.insertAdjacentHTML("beforeend", `<div class="dimmed xsmall">${this.translate("NOT_FOUND")}</div>`);
		} else if (!mensa.meals.length) {
			wrapper.insertAdjacentHTML("beforeend", `<div class="dimmed xsmall">${this.translate("CLOSED")}</div>`);
		}
		for (const meal of mensa.meals) {
			const labels = this.config.showLabels && meal.labels.length ? `<span class="hhmensa-labels">${meal.labels.map((l) => `<span class="hhmensa-label ${labelClass(l)}">${escape(this.labelText(l))}</span>`).join("")}</span>` : "";
			const allergens = this.config.showAllergens && meal.allergens.length ? `<div class="hhmensa-allergens">${meal.allergens.map((a) => escape(a.code)).join(", ")}</div>` : "";
			const category = this.config.showCategory && meal.categories.length ? `<div class="hhmensa-category">${escape(meal.categories.join(" · "))}</div>` : "";
			wrapper.insertAdjacentHTML(
				"beforeend",
				`<div class="hhmensa-meal">
					<div class="hhmensa-text">${category}<div class="hhmensa-dish">${escape(meal.name)}${labels}</div>${allergens}</div>
					<div class="hhmensa-price">${this.price(meal)}</div>
				</div>`
			);
		}
		return wrapper;
	},

	// short, translated label texts
	labelText(label) {
		const key = LABELS[label.toLowerCase()];
		return key ? this.translate(key) : label;
	}
});

const LABELS = {
	vegan: "LABEL_VEGAN",
	vegetarisch: "LABEL_VEGETARIAN",
	"geflügel": "LABEL_POULTRY",
	rind: "LABEL_BEEF",
	schwein: "LABEL_PORK",
	"mit fisch": "LABEL_FISH",
	mensavital: "LABEL_VITAL",
	"enthält keine laktosehaltigen lebensmittel": "LABEL_LACTOSE_FREE"
};

function labelClass(label) {
	const l = label.toLowerCase();
	if (l === "vegan") return "vegan";
	if (l === "vegetarisch") return "vegetarian";
	if (l === "mensavital") return "vital";
	return "";
}

function escape(s) {
	return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
