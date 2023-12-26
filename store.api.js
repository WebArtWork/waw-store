module.exports = async function (waw) {
	const Schema = waw.mongoose.Schema({
		active: Boolean,
		name: String,
		thumb: String,
		description: String,
		url: { type: String, sparse: true, trim: true, unique: true },
		domain: String,
		website: String,
		markup: Number,
		data: {},
		variables: {},
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
	});

	Schema.methods.create = function (obj, user, waw) {
		this.author = user._id;
		this.moderators = [user._id];
		this.tag = obj.tag;
		this.domain = obj.domain;
		this.website = obj.website;
		this.url = obj.url;
		this.thumb = obj.thumb;
		this.markup = obj.markup;
		this.theme = obj.theme;
		this.name = obj.name;
		this.description = obj.description;
		this.data = obj.data;
	};

	return (waw.Store = waw.mongoose.model("Store", Schema));
};
