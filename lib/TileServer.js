var _ = require('lodash');
var async = require('async');
var http = require('http');
var chalk = require('chalk');
var TileLayer = require('./TileLayer.js');
var TileRequest = require('./TileRequest.js');

var BUFFER_NOTFOUND = new Buffer('Not found', 'utf8');
var BUFFER_NOTIMPLEMENTED = new Buffer('Not implemented', 'utf8');

/**
 * Tile Server Implementation
 *
 * Usage:
 *   var server = new TileServer();
 *   server.registerLayer(require('./layers/basemap.js'));
 *   server.getTile(layer, '.png', x, y, z, function(err, buffer, headers) { ... });
 *   server.serve('GET', url, function(status, buffer, headers) { ... });
 *
 * @return {void}
 */
var TileServer = module.exports = function() {
	this.layers = {};
};

/**
 * Registers a layer definition so that it can be served.
 *
 * @throws
 * @param {function} init
 * @return {void}
 */
TileServer.prototype.registerLayer = function(init) {
	// layer initialization
	try {
		var layer = new TileLayer();
		init(layer);
	} catch (e) {
		throw new Error('Error initializing layer: "' + e.message + '"');
	}

	// check validity
	if (!layer.name) {
		throw new Error('Layer definition missing name. Use setName() to the layer name.');
	}

	// register layer
	this.layers[layer.name] = layer;
};

/**
 * Initializes all caches and providers.
 *
 * @param {function} callback
 * @return {void}
 */
TileServer.prototype.initialize = function(callback) {
	async.each(_.values(this.layers), function(layer, callback) {
		async.each(_.values(layer.routes), function(route, callback) {
			route.handler.initialize(callback);
		}, function(err) {
			if (err) err = new Error('Unable to initialize "' + layer.name + '" layer: "' + (err.message || err) + '"');
			callback(err);
		});
	}, callback)
};

/**
 * Determines the appropriate TileRequestHandler to handle the request.
 *
 * @param {TileRequest} req
 * @return {TileRequestHandler|undefined}
 */
TileServer.prototype.getHandler = function(req) {
	if (!this.layers.hasOwnProperty(req.layer)) return;
	var layer = this.layers[req.layer];
	var route = layer.routes[req.filename];
	if (!route) return;
	return route.handler;
};

/**
 * Parses the URL and attempts to serve the request.
 *
 * <METHOD> /:layer/:z/:x:/:z/:filename
 *
 * @param {string} method "GET", "DELETE", etc
 * @param {string|TileRequest} url
 * @param {function} callback(status, buffer, headers)
 * @return {void}
 */
TileServer.prototype.serve = function(method, url, callback) {
	var req = url instanceof TileRequest ? url : TileRequest.parse(url);
	if (!req) return callback(404, BUFFER_NOTFOUND, {});

	var handler = this.getHandler(req);
	if (!handler) {
		return callback(404, BUFFER_NOTFOUND, {});
	} else if (method !== method.toUpperCase() || !handler[method]) {
		return callback(501, BUFFER_NOTIMPLEMENTED, {});
	}

	return handler[method](this, req, callback);
};

/**
 * A simplified API for fetching a tile from a layer. If the tile
 * can't be fetched, it will return an error.
 *
 * Example:
 *    server.getTile('basemap', 't.png', x, y, z, function(err, buffer, headers) {
 *        ...
 *    });
 *
 * @param {string} layer
 * @param {string} ext
 * @param {int} x
 * @param {int} y
 * @param {int} z
 * @param {function} callback
 * @return {void}
 */
TileServer.prototype.getTile = function(layer, filename, x, y, z, callback) {
	var req = new TileRequest(x, y, z, layer, filename);
	this.serve('GET', req, function(status, buffer, headers) {
		if (status === 200) {
			callback(null, buffer, headers);
		} else {
			var message = 'Tile unavailable (status ' + status + ')';
			if (buffer.length < 1024) message = buffer.toString('utf8');
			callback(new Error(message));
		}
	});
};

/**
 * Starts listening on a port.
 *
 * @param {int} port
 * @param {function} callback
 * @return {void}
 */
TileServer.prototype.listen = function(port, callback) {
	callback = callback || function() {};

	var self = this;
	var server = http.createServer(function(req, res) {
		self.serve(req.method, req.url, function(status, buffer, headers) {
			res.writeHead(status, headers);
			res.write(buffer);
			res.end();
		});
	});

	self.initialize(function(err) {
		if (err) return callback(err);
		server.listen(port, callback);
	});
};