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
				name: 'admin',
				ensure: waw.role('admin'),
				query: () => {
					return {};
				}
			}
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
};
