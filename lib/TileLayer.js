var TileRequestHandler = require('./TileRequestHandler.js');

var TileLayer = module.exports = function(name, options) {
	if (!name) throw new Error('The layer must be given name');
	if (!/^[a-zA-Z0-9_\-]+$/.test(name)) {
		throw new Error('Invalid layer name "' + name + '" (must match /^[a-zA-Z0-9_\-]+$)');
	}

	this.options = options || {};
	this.name = name;
	this.routes = {};
};

TileLayer.prototype.route = function(template, options) {
	if (this.routes.hasOwnProperty(template)) {
		if (options) throw new Error('Cannot pass options when layer is already registered');
		return this.routes[template].handler;
	}

	var handler = new TileRequestHandler(options);
	handler.layer = this.layer;
	handler.route = this.route.bind(this); // for chaining

	this.routes[template] = {
		template: template,
		handler: handler
	};

	return handler;
};
