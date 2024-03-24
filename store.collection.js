module.exports = async function (waw) {
	const Schema = waw.mongoose.Schema({
		enabled: {
			type: Boolean,
			default: false
		},
		name: String,
		location: String,
		thumb: String,
		description: String,
		url: { type: String, sparse: true, trim: true, unique: true },
		domain: String,
		website: String,
		markup: Number,
		data: {},
		variables: {},
		indexPage: String, // in case we wanna replace index page with other page, we set it here
		tag: {
			type: waw.mongoose.Schema.Types.ObjectId,
			ref: "Tag",
		},
		headerTags: [
			{
				type: waw.mongoose.Schema.Types.ObjectId,
				ref: "Tag",
			}
		],
		theme: {
			type: waw.mongoose.Schema.Types.ObjectId,
			ref: "Theme",
		},
		agent: {
			type: waw.mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
		author: {
			type: waw.mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
		moderators: [
			{
				type: waw.mongoose.Schema.Types.ObjectId,
				sparse: true,
				ref: "User",
			},
		],
		moderators: [
			{
				type: waw.mongoose.Schema.Types.ObjectId,
				sparse: true,
				ref: "User",
			},
		],
		features: [
			{
				type: waw.mongoose.Schema.Types.ObjectId,
				ref: "Userfeature",
			},
		],
	});

	Schema.methods.create = function (obj, user) {
		if (user.is && user.is.agent) {
			this.agent = user._id;
		}
		this.author = user._id;
		this.moderators = [user._id];
		this.tag = obj.tag;
		this.location = obj.location;
		this.domain = obj.domain;
		this.website = obj.website;
		this.url = obj.url;
		this.thumb = obj.thumb;
		this.markup = obj.markup;
		this.theme = obj.theme;
		this.name = obj.name;
		this.description = obj.description;
		this.variables = obj.variables || {};
		this.data = obj.data;
		this.features = obj.features;
	};

	return (waw.Store = waw.mongoose.model("Store", Schema));
};
