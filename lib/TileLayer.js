var TileRequestHandler = require('./TileRequestHandler.js');

var TileLayer = module.exports = function() {
	this.name = null;
	this.routes = {};
};

TileLayer.prototype.setName = function(name) {
	if (!/^[a-zA-Z0-9_\-]+$/.test(name)) {
		throw new Error('Invalid layer name "' + name + '" (must match /^[a-zA-Z0-9_\-]+$)');
	}
	this.name = name;
};

TileLayer.prototype.registerRoute = function(filename, init) {
	var handler = new TileRequestHandler();
	init(handler);
	this.routes[filename] = {
		filename: filename,
		handler: handler
	};
};