const nginx = `server {
	server_name HOST;
	location / {
			client_max_body_size 10M;
			proxy_set_header X-Real-IP $remote_addr;
			proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
			proxy_set_header Host $http_host;
			proxy_set_header X-NginX-Proxy true;
			proxy_pass http://127.0.0.1:9905;
			proxy_redirect off;
	}
	listen 80;
}`;
const domain_regex =
	/^(?:(?:https?|ftp):\/\/)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})(?:\/.*)?$/i;
const SSL = `certbot --nginx -d HOST --redirect`;
const filePath = "/etc/nginx/conf.d/HOST.conf";
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const template = path.join(process.cwd(), "template");
module.exports = async (waw) => {
	waw.stores = async (query = {}, limit, count = false) => {
		let exe = count ? waw.Store.countDocuments(query) : waw.Store.find(query);

		if (limit) {
			exe = exe.limit(limit);
		}

		return await exe;
	};

	waw.store = async (query) => {
		return await Store.findOne(query);
	};

	waw.crud('store', {
		get: {
			query: (req)=>{
				if (req.user.is.admin) {
					return {};
				} else {
					return {
						moderators: req.user._id
					};
				}
			}
		},
		update: {
			query: (req) => {
				if (req.user.is.admin) {
					return {
						_id: req.body._id
					};
				} else {
					return {
						moderators: req.user._id,
						_id: req.body._id
					};
				}
			}
		},
		delete: {
			query: (req) => {
				if (req.user.is.admin) {
					return {
						_id: req.body._id
					};
				} else {
					return {
						moderators: req.user._id,
						_id: req.body._id
					};
				}
			}
		}
	});
	const allGroups = await waw.category_groups();
	const allTags = await waw.tagsWithCategories();
	const serveStore = async (store, _template) => {
		waw.serve(_template, {
			prefix: "/" + store.theme.folder,
			host: store.domain,
		});
		const query = {
			author: store.author
		};
		const contents = await waw.contents(query);
		const tags = allTags.slice();
		for (let i = tags.length - 1; i >= 0; i--) {
			if (tags[i].category.group === 'store') {
				tags.splice(i, 1);
				continue;
			}
			for (const group of waw.config.groups) {
				if (
					tags[i].category.group === group.name
				) {
					if (!await waw[group.docs]({
						...query,
						tag: tags[i]._id
					}, 0, true)) {
						tags.splice(i, 1);
					}
					break;
				}
			}
		}
		const groups = JSON.parse(JSON.stringify(allGroups));
		const tagIds = tags.map(t => t._id.toString());
		for (let k = groups.length - 1; k >= 0; k--) {
			groups[k].categories = groups[k].categories || [];

			for (let j = groups[k].categories.length - 1; j >= 0; j--) {
				groups[k].categories[j].tags = groups[k].categories[j].tags || [];
				for (let i = groups[k].categories[j].tags.length -1; i >= 0; i--) {
					if (tagIds.indexOf(groups[k].categories[j].tags[i]._id.toString()) === -1) {
						groups[k].categories[j].tags.splice(i, 1);
					}
				}

				if (!groups[k].categories[j].tags.length) {
					groups[k].categories.splice(j, 1);
				}
			}

			if (!groups[k].categories.length) {
				groups.splice(k, 1);
			}
		}
		const templateJson = {
			variables: store.variables,
			tags,
			store,
			groups,
			footer: {
				articles: await waw.articles(query, 3),
				designs: await waw.designs(query, 3),
				products: await waw.products(query, 3),
				contents,
				groups
			}
		};

		waw.build(_template, "index");
		waw.serve_land[store.domain] = async (req, res) => {
			const products = await waw.products(query, 6);
			const latest_products = [products.shift(), products.shift()];
			const articles = await waw.articles(query, 4);
			res.send(
				waw.render(path.join(_template, "dist", "index.html"), {
					...templateJson,
					title: store.name,
					description:
						store.data.land_description || store.description,
					latest_products,
					products,
					articles,
				})
			);
		};

		waw.build(_template, "articles");
		waw.build(_template, "article");
		waw.serve_articles[store.domain] = async (req, res) => {
			const articles = await waw.articles(query, 15);
			res.send(
				waw.render(path.join(_template, "dist", "articles.html"), {
					...templateJson,
					title: store.name + " | " + store.name,
					description:
						store.data.articles_description || store.description,
					articles,
				})
			);
		};
		waw.serve_article[store.domain] = async (req, res) => {
			const article = await waw.article({
				_id: req.params._id,
			});
			const articles = await waw.articles({
				_id: {
					$ne: req.params._id,
				},
			});

			res.send(
				waw.render(path.join(_template, "dist", "article.html"), {
					...templateJson,
					...article.toObject(),
					article,
					data: {
						...store.data,
						...article.data,
					},
					title: article.name + " | " + store.name,
					description: article.short,
					articles,
				})
			);
		};

		waw.build(_template, "products");
		waw.build(_template, "product");
		waw.serve_products[store.domain] = async (req, res) => {
			const products = await waw.products(
				req.params.tag_id
					? {
						...query,
						tag: req.params.tag_id,
					}
					: req.originalUrl === "/sales"
						? {
							...query,
							sale: {
								$gt: 0,
								$ne: null,
							},
						}
						: query,
				20
			);
			res.send(
				waw.render(path.join(_template, "dist", "products.html"), {
					...templateJson,
					title: store.name + " | " + store.name,
					description:
						store.data.products_description || store.description,
					products
				})
			);
		};
		waw.serve_product[store.domain] = async (req, res) => {
			const product = await waw.product({
				_id: req.params._id,
			});
			const products = await waw.products(
				req.params.tag_id
					? {
						...query,
						tag: req.params.tag_id,
					}
					: req.originalUrl === "/sales"
						? {
							...query,
							sale: {
								$gt: 0,
								$ne: null,
							},
						}
						: query,
				6
			);
			res.send(
				waw.render(path.join(_template, "dist", "product.html"), {
					...templateJson,
					...product.toObject(),
					products,
					product,
					data: {
						...store.data,
						...product.data,
					},
					title: product.name + " | " + store.name,
					description: product.short,
				})
			);
		};

		waw.build(_template, "designs");
		waw.build(_template, "design");
		waw.serve_designs[store.domain] = async (req, res) => {
			const designs = await waw.designs(
				req.params.tag_id ? { tag: req.params.tag_id } : query
			);
			res.send(
				waw.render(path.join(_template, "dist", "designs.html"), {
					...templateJson,
					title: store.name + " | " + store.name,
					description:
						store.data.designs_description || store.description,
					designs,
				})
			);
		};
		waw.serve_design[store.domain] = async (req, res) => {
			const design = await waw.design({
				_id: req.params._id,
			});
			res.send(
				waw.render(path.join(_template, "dist", "design.html"), {
					...templateJson,
					...design.toObject(),
					design,
					data: {
						...store.data,
						...design.data,
					},
					title: design.name + " | " + store.name,
					description: design.short,
				})
			);
		};

		waw.build(_template, "content");
		const serve_content = async (content) => {
			waw.app.get(content.url, async (req, res, next) => {
				if (req.get("host") === store.domain) {
					res.send(
						waw.render(
							path.join(_template, "dist", "content.html"),
							{
								...templateJson,
								...content.toObject(),
								content,
								data: {
									...store.data,
									...content.data,
								},
								title: content.name + " | " + store.name,
							}
						)
					);
				} else {
					next();
				}
			});
		};
		for (const content of contents) {
			serve_content(content);
		}
	};

	// manage Stores
	waw.loadStores = async (author = "") => {
		const stores = await waw.Store.find(
			author
				? {
					author,
					domain: {
						$exists: true,
					},
				}
				: {
					domain: {
						$exists: true,
					},
				}
		).populate({
			path: "theme",
			select: "folder",
		});
		if (!author) {
			waw.build(template, "stores");
			waw.build(template, "store");
			setTimeout(() => {
				waw.url(path.join(template, "dist", "stores.html"), "/stores", {
					...waw.readJson(path.join(template, "template.json")),
					...waw.readJson(
						path.join(template, "pages", "stores", "page.json")
					),
					...waw.config,
					title: "Stores | " + waw.config.title,
					description:
						"Welcome to our section featuring clothing stores! Here you can explore various stores, their locations, and the types of products they offer.We provide reviews of popular clothing stores, where you can learn about their style, brands, types of clothing and accessories they sell.",
					stores
				});
			}, 1000);
		}

		for (const store of stores) {
			waw.url(
				path.join(template, "dist", "store.html"),
				"/store/" + store._id,
				{
					...waw.readJson(path.join(template, "template.json")),
					...waw.readJson(
						path.join(template, "pages", "stores", "page.json")
					),
					...waw.config,
					title: store.name + " | " + waw.config.title,
					description:
						"Welcome to our section featuring clothing stores! Here you can explore various stores, their locations, and the types of products they offer.We provide reviews of popular clothing stores, where you can learn about their style, brands, types of clothing and accessories they sell.",
					store,
				}
			);

			if (!store.theme) {
				continue;
			}

			const _template = path.join(
				process.cwd(),
				"templates",
				store.theme.folder
			);

			serveStore(store, _template);
		}
	};
	waw.loadStores();

	// manage SSL
	const setStore = async (store) => {
		if (waw.reserved(store.domain)) {
			return;
		}

		if (
			waw.config.production &&
			store.domain &&
			store.theme &&
			domain_regex.test(store.domain) &&
			!store.domain.endsWith('.' + waw.config.land)
		) {
			setNginx(store.domain, filePath.replace("HOST", store.domain));
		}

		if (store.theme) {
			const _store = await Store.findOne({
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

	const setNginx = (domain, _filePath) => {
		if (!fs.existsSync(_filePath)) {
			fs.writeFileSync(_filePath, nginx.replace("HOST", domain));
		}

		if (fs.readFileSync(_filePath).length < 500) {
			execSync(SSL.replace("HOST", domain));
			execSync("service nginx restart");
		}
	};

	waw.store_middleware = async (req, res, next) => {
		const store = await Store.find({
			domain: req.get("host"),
		});

		if (store) {
			res.locals.store = store;
		}

		next();
	};
};
