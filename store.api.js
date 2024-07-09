const dns = require("dns");
const nginx = `server {
	server_name HOST;
	location / {
			client_max_body_size 10M;
			proxy_set_header X-Real-IP $remote_addr;
			proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
			proxy_set_header Host $http_host;
			proxy_set_header X-NginX-Proxy true;
			proxy_pass http://127.0.0.1:PORT;
			proxy_redirect off;
	}
	listen 80;
}`;
const SSL = `certbot --nginx -d HOST --redirect`;
const filePath = "/etc/nginx/conf.d/HOST.conf";
const { execSync } = require("child_process");
const fs = require("fs");
module.exports = async (waw) => {
	waw.store_middleware = async (req, res, next) => {
		const store = await waw.Store.findOne({
			domain: req.get("host"),
		});

		if (store) {
			res.locals.store = store;
		}

		next();
	};

	waw.storeIds_middleware = async (req, res, next) => {
		if (req.user) {
			req.storeIds = (
				await waw.Store.find({
					moderators: req.user._id,
				}).select("_id")
			).map((s) => s.id);

			if (!req.body.store || req.storeIds.includes(req.body.store)) {
				next();
			} else {
				res.send(false);
			}
		} else {
			res.send(false);
		}
	};

	waw.storeBasedCrud = {
		create: {
			ensure: waw.storeIds_middleware,
		},
		get: {
			ensure: waw.storeIds_middleware,
			query: (req) => {
				return {};
			},
		},
		update: {
			ensure: waw.storeIds_middleware,
			query: (req) => {
				return {
					store: req.storeIds,
					_id: req.body._id,
				};
			},
		},
		delete: {
			ensure: waw.storeIds_middleware,
			query: (req) => {
				return {
					store: req.storeIds,
					_id: req.body._id,
				};
			},
		},
	};

	waw.stores = async (query = {}, limit, count = false) => {
		let exe = count
			? waw.Store.countDocuments(query)
			: waw.Store.find(query);

		if (limit) {
			exe = exe.limit(limit);
		}

		return await exe;
	};

	waw.store = async (query) => {
		return await Store.findOne(query);
	};

	waw.crud("store", {
		get: [
			{
				query: (req) => {
					return req.user.is.admin
						? {}
						: {
								moderators: req.user._id,
						  };
				},
			},
		],
		update: {
			query: (req) => {
				if (req.user.is.admin) {
					return {
						_id: req.body._id,
					};
				} else {
					return {
						moderators: req.user._id,
						_id: req.body._id,
					};
				}
			},
		},
		delete: {
			query: (req) => {
				if (req.user.is.admin) {
					return {
						_id: req.body._id,
					};
				} else {
					return {
						moderators: req.user._id,
						_id: req.body._id,
					};
				}
			},
		},
	});

	await waw.wait(2000);

	waw.setUnique("subdomain", async (subdomain) => {
		const operators = await waw.Operator.find({
			domain: {
				$exists: true,
			},
		}).select("domain");

		for (const operator of operators) {
			if (
				!!(await waw.Store.count({
					domain: subdomain + "." + operator.domain,
				}))
			) {
				return true;
			}
		}
		return false;
	});

	waw.api({
		router: "/api/store",
		post: {
			"/domain": async (req, res) => {
				if (!req.user) {
					return res.json({
						text: "Unauthorized user",
					});
				}
				const store = await waw.Store.findOne(
					req.user.is.admin
						? {
								_id: req.body._id,
						  }
						: {
								_id: req.body._id,
								moderators: req.user._id,
						  }
				);
				if (req.body.domain && !req.body.domain.includes(".")) {
					store.domain = req.body.domain + "." + waw.config.land;
					await store.save();
					res.json({
						updated: store.domain,
						text: "Domain has been updated",
					});
				} else if (
					req.user &&
					!(await waw.Store.count({
						_id: {
							$ne: req.body._id,
						},
						domain: req.body.domain,
					}))
				) {
					dns.lookup(req.body.domain, async (err, address) => {
						if (err) {
							res.json({
								text: "Failed to get DNS of the domain",
							});
						} else {
							if (address === waw.config.store.ip) {
								store.domain = req.body.domain;
								await store.save();
								res.json({
									updated: store.domain,
									text: "Domain has been updated",
								});

								setNginx(
									store.domain,
									filePath.replace("HOST", store.domain)
								);

								waw.loadStores({
									_id: store._id,
								});
							} else {
								req.json({
									text: "Ip is not configured on domain",
								});
							}
						}
					});
				} else {
					res.json({
						text: "Domain has been registered with other store",
					});
				}
			},
			"/change/agent": waw.role("admin", async (req, res) => {
				const store = await waw.Store.findById(req.body.storeId);
				if (store) {
					store.agent = req.body.userId;
					await store.save();
					res.json(true);
				} else {
					res.json(false);
				}
			}),
			"/change/ownership": waw.role("admin agent", async (req, res) => {
				const store = await waw.Store.findOne(
					req.user.is.admin
						? {
								_id: req.body.storeId,
						  }
						: {
								_id: req.body.storeId,
								author: req.user._id,
						  }
				);
				if (store) {
					store.author = req.body.userId;
					store.moderators = [req.body.userId];
					await store.save();
					res.json(true);
				} else {
					res.json(false);
				}
			}),
		},
	});

	const setNginx = (domain, _filePath) => {
		console.log("setNginx: ", domain);
		if (!fs.existsSync(_filePath)) {
			fs.writeFileSync(
				_filePath,
				nginx
					.replace("HOST", domain)
					.replace("PORT", waw.config.store.nginxPort)
			);
		}

		if (fs.readFileSync(_filePath).length < 500) {
			execSync(SSL.replace("HOST", domain));
			execSync("service nginx restart");
		}
	};

	waw.addJson(
		"stores",
		async (store, fillJson) => {
			fillJson.stores = await waw.stores({});
			fillJson.footer.stores = fillJson.stores;
		},
		"Filling all stores documents"
	);
};
