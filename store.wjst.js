import Crud from '/api/wjst/crud';
class Store extends Crud {
	getName = 'public';
	constructor() {
		super('/api/store');
	}
}
export default new Store();
