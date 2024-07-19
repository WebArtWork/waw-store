const path = require("path");
module.exports = async (waw) => {
	waw.configurePage = {};
	const serveStore = async (store, _template) => {
		if (!store.domain) return;
		console.log("serveStore: ", store.domain);

		store.data = store.data || {};

		const templateJson = {
			...waw.config,
			variables: store.variables,
			store,
			footer: {},
			_page: {},
		};

		if (waw.config.store.json) {
			await waw.processJson(waw.config.store.json, store, templateJson);
		}

		waw.apiCleanPage(store.domain);

		if (!store.enabled) {
			return waw.api({
				domain: store.domain,
				page: {
					"*": (req, res) => {
						res.send(
							waw.render(
								path.join(_template, "dist", "disabled.html"),
								templateJson,
								waw.translate(req)
							)
						);
					},
				},
			});
		}

		const _page = {};
		waw.configurePage[store.domain] = (page) => {
			page.pageJson = page.pageJson || {};

			const callback = async (req, res) => {
				const json = {
					...templateJson,
					...page.pageJson,
					title:
						(store.data[page.page + "_title"] ||
							store.data["seo_title"] ||
							page.page) +
						" | " +
						store.name,
					description:
						store.data[page.page + "_description"] ||
						store.data["seo_description"] ||
						store.description ||
						templateJson.description,
					image:
						"https://" +
						store.domain +
						(store.data["seo_thumb"] ||
							store.thumb ||
							templateJson.thumb),
					favicon:
						store.data["seo_favicon"] ||
						store.favicon ||
						templateJson.favicon,
					currency:
						store.currency ||
						waw.config.currency ||
						templateJson.currency,
				};

				if (waw.config.store.pageJson) {
					await waw.processJson(
						waw.config.store.pageJson,
						store,
						json,
						req
					);
				}

				if (page.json) {
					await waw.processJson(page.json, store, json, req);
				}

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

			waw.api({
				domain: store.domain,
				page: _page,
			})
		};

		for (const page of waw.config.store.pages || []) {
			if (
				page.page === "index" &&
				store.indexPage &&
				waw.config.store.pages.find((p) => p.page === store.indexPage)
			) {
				const replacedPage = waw.config.store.pages.find(
					(p) => p.page === store.indexPage
				);
				waw.configurePage[store.domain]({
					...replacedPage,
					url: "/",
				});
			} else {
				waw.configurePage[store.domain](page);
			}
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
			if (store.theme && store.domain) {
				serveStore(
					store,
					path.join(process.cwd(), "themes", store.theme.id)
				);
			}
		}
	};
	waw.loadStores();

	// manage SSL
	const timeouts = {};
	const setStore = async (store) => {
		if (store.theme && store.domain) {
			if (timeouts[store.domain]) {
				clearTimeout(timeouts[store.domain]);
			}
			timeouts[store.domain] = setTimeout(() => {
				const _template = path.join(
					process.cwd(),
					"themes",
					store.theme.toString()
				);

				serveStore(store, _template);
			}, 2000);
		}
	};

	waw.on("store_create", setStore);
	waw.on("store_update", setStore);

	const setLabelEntity = async (doc) => {
		setStore(await waw.Store.findById(doc.store));
	};
	waw.on("label_create", setLabelEntity);
	waw.on("label_update", setLabelEntity);
	waw.on("entity_create", setLabelEntity);
	waw.on("entity_update", setLabelEntity);
};
