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
				ensure: waw.next,
			},
			{
				name: "public",
				ensure: waw.next,
				query: () => {
					return {};
				},
			},
			{
				name: "admin",
				ensure: waw.role("admin"),
				query: () => {
					return {};
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

	waw.api({
		router: "/api/store",
		post: {
			"/domain": async (req, res) => {
				if (
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
								text: "Failed to get DNS of the domain"
							});
						} else {
							if (address === waw.config.store.ip) {
								const store = await waw.Store.findOne({
									_id: req.body._id,
									moderators: req.user._id,
								});

								store.domain = req.body.domain;

								await store.save();

								res.json({
									updated: true,
									text: "Domain has been updated"
								});

								setNginx(
									store.domain,
									filePath.replace("HOST", store.domain)
								);

								waw.loadStores({
									_id: store._id
								});
							} else {
								req.json({
									text: "Ip is not configured on domain"
								});
							}
						}
					});
				} else {
					res.json(
						{
							text: req.user
								? "Domain has been registered with other store"
								: "Unauthorized user"
						}
					);
				}
			},
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
};
