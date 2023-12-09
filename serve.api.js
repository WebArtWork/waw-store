const path = require("path");
module.exports = async (waw) => {
	const processJson = async (jsons, store, fillJson, req) => {
		if (typeof jsons === "string") {
			jsons = jsons.split(" ");
		}

		if (!Array.isArray(jsons) && typeof jsons === "object") {
			jsons = [jsons];
		}

		for (let i = 0; i < jsons.length; i++) {
			if (typeof jsons[i] === "string") {
				jsons[i] = {
					path: jsons[i],
				};
			}
		}
		for (const json of jsons) {
			if (typeof waw[json.path] === "function") {
				await waw[json.path](store, fillJson, req);
			}
		}
	};

	const serveStore = async (store, _template) => {
		console.log("serveStore: ", store.domain);

		const templateJson = {
			variables: store.variables,
			footer: {},
			_page: {},
		};

		if (waw.config.store.json) {
			await processJson(waw.config.store.json, store, templateJson);
		}

		const _page = {};
		let _pages = "content";
		const configurePage = (page) => {
			page.pageJson = page.pageJson || {};

			if (!(_pages + " ").includes(" " + page.page + " ")) {
				_pages += " " + page.page;
			}

			const callback = async (req, res) => {
				const json = {
					...templateJson,
					...page.pageJson,
					title:
						(store.data[page.page + "_name"] ||
							page.pageJson.name ||
							page.page) +
						" | " +
						store.name,
					description:
						store.data[page.page + "_description"] ||
						page.pageJson.description ||
						store.description ||
						templateJson.description,
				};

				if (page.json) {
					await processJson(page.json, store, json, req);
				}

				console.log(req.originalUrl, json);

				res.send(
					waw.render(
						path.join(_template, "dist", page.page + ".html"),
						json,
						waw.translate(req)
					)
				);
			};

			const urls = page.url.split(" ");
			for (const url of urls) {
				_page[url] = callback;
			}
		};
		for (const page of waw.config.store.pages || []) {
			configurePage(page);
		}

		const templatePageJson = (url, pageJson) => {
			_page[url] = (req, res) => {
				res.send(
					waw.render(
						path.join(_template, "dist", "content.html"),
						{
							...templateJson,
							...pageJson,
							title: pageJson.name + " | " + store.name,
							description:
								pageJson.description ||
								store.description ||
								templateJson.description,
						},
						waw.translate(req)
					)
				);
			};
		};

		for (const url in templateJson._page) {
			templatePageJson(url, templateJson._page[url]);
		}

		waw.api({
			domain: store.domain,
			template: {
				path: _template,
				prefix: "/" + store.theme.folder,
				pages: _pages,
			},
			page: _page,
		});
	};

	// manage Stores
	waw.loadStores = async (
		query = {
			domain: {
				$exists: true,
			},
		}
	) => {
		const stores = await waw.Store.find(query).populate({
			path: "theme",
			select: "folder",
		});

		for (const store of stores) {
			if (store.theme) {
				serveStore(
					store,
					path.join(process.cwd(), "templates", store.theme.folder)
				);
			}
		}
	};
	waw.loadStores();

	// manage SSL
	const setStore = async (store) => {
		if (waw.reserved(store.domain)) {
			return;
		}

		if (store.theme) {
			const _store = await waw.Store.findOne({
				_id: store._id,
			}).populate({
				path: "theme",
				select: "folder",
			});

			const _template = path.join(
				process.cwd(),
				"templates",
				_store.theme.folder
			);

			serveStore(_store, _template);
		}
	};

	waw.on("store_create", setStore);
	waw.on("store_update", setStore);
};
