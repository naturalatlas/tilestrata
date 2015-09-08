var tilebelt = require('tilebelt');
var intersect = require('bbox-intersect');
var TileRequestHandler = require('./TileRequestHandler.js');

var TileLayer = module.exports = function(name, options) {
	if (!name) throw new Error('The layer must be given name');
	if (!/^[a-zA-Z0-9_\-]+$/.test(name)) {
		throw new Error('Invalid layer name "' + name + '" (must match /^[a-zA-Z0-9_\-]+$)');
	}

	this.options = options || {};
	this.name = name;
	this.routes = {};

	// handle bbox checking differently depending on count for performance
	var bbox = this.options.bbox;
	if (bbox) {
		if (Array.isArray(bbox[0])) {
			var bbox_count = bbox.length;
			this._isInBounds = function(req) {
				var req_bbox = tilebelt.tileToBBOX([req.x,req.y,req.z]);
				for (var i = 0; i < bbox_count; i++) {
					if (intersect(req_bbox, bbox[i])) return true;
				}
				return false;
			};
		} else {
			this._isInBounds = function(req) {
				var req_bbox = tilebelt.tileToBBOX([req.x,req.y,req.z]);
				return intersect(req_bbox, bbox);
			};
		}
	}
};

TileLayer.prototype._isInBounds = function(req) {
	return true;
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
