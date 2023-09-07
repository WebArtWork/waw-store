import Crud from '/api/wjst/crud';
class Storet extends Crud {
	getName = 'public';
	constructor() {
		super('/api/store');
	}
}
export default new Storet();
