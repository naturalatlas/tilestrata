var TileRequestHandler = require('./TileRequestHandler.js');

var TileLayer = module.exports = function(name) {
	if (!name) throw new Error('The layer must be given name');
	if (!/^[a-zA-Z0-9_\-]+$/.test(name)) {
		throw new Error('Invalid layer name "' + name + '" (must match /^[a-zA-Z0-9_\-]+$)');
	}

	this.name = name;
	this.routes = {};
};

TileLayer.prototype.route = function(filename, options) {
	if (this.routes.hasOwnProperty(filename)) {
		if (options) throw new Error('Cannot pass options when layer is already registered');
		return this.routes[filename].handler;
	}

	var handler = new TileRequestHandler(options);
	handler.layer = this.layer;
	handler.route = this.route.bind(this); // for chaining

	this.routes[filename] = {
		filename: filename,
		handler: handler
	};

	return handler;
};
