var _ = require('lodash');
var async = require('async');
var http = require('http');
var etag = require('etag');
var TileLayer = require('./TileLayer.js');
var TileRequest = require('./TileRequest.js');
var version = require('../package.json').version;

var HEADER_XPOWEREDBY = 'TileStrata/' + version;
var BUFFER_NOTFOUND = new Buffer('Not found', 'utf8');
var BUFFER_NOTIMPLEMENTED = new Buffer('Not implemented', 'utf8');

/**
 * Tile Server Implementation
 *
 * Usage:
 *   var server = new TileServer();
 *   server.registerLayer(require('./layers/basemap.js'));
 *   server.getTile('basemap', 'tile.png', x, y, z, function(err, buffer, headers) { ... });
 *   server.serve(req, {}, function(status, buffer, headers) { ... });
 *
 * @constructor
 * @return {void}
 */
var TileServer = module.exports = function() {
	this.layers = {};
};

/** @type {string} */
TileServer.prototype.version = version;

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
	var self = this;
	async.each(_.values(this.layers), function(layer, callback) {
		async.each(_.values(layer.routes), function(route, callback) {
			route.handler.initialize(self, callback);
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
 * @param {TileRequest} req
 * @param {boolean|object} hooks
 * @param {function} callback(status, buffer, headers)
 * @return {void}
 */
TileServer.prototype.serve = function(req, hooks, callback) {
	var self = this;
	if (!req) return callback(404, BUFFER_NOTFOUND, {});
	var _method = req.method;

	if (req.method === 'HEAD') {
		_method = 'GET';
	}

	var handler = this.getHandler(req);
	if (!handler) {
		return callback(404, BUFFER_NOTFOUND, {
			'X-Powered-By': HEADER_XPOWEREDBY,
			'Content-Length': BUFFER_NOTFOUND.length
		});
	} else if (_method !== _method.toUpperCase() || !handler[_method]) {
		return callback(501, BUFFER_NOTIMPLEMENTED, {
			'X-Powered-By': HEADER_XPOWEREDBY,
			'Content-Length': BUFFER_NOTIMPLEMENTED.length
		});
	}

	var result = {};

	async.series([
		function invokeRequestHooks(callback) {
			if (!hooks || !handler.requestHooks.length) return callback();
			async.eachSeries(handler.requestHooks, function(hook, callback) {
				hook.hook(self, req, hooks.req, hooks.res, callback);
			}, callback);
		},
		function handleRequest(callback) {
			handler[_method](self, req, function(status, buffer, headers) {
				headers = headers || {};

				headers['Content-Length'] = buffer ? buffer.length : 0;
				headers['X-Powered-By'] = HEADER_XPOWEREDBY;

				if (status === 200) {
					headers['Cache-Control'] = 'max-age=60';
					headers['ETag'] = etag(buffer);
					var ifnonematch = req.headers['if-none-match'];
					if (ifnonematch && ifnonematch === headers['ETag']) {
						status = 304;
						buffer = new Buffer([]);
					}
				}

				if (req.method === 'HEAD') buffer = new Buffer([]);
				result = {status: status, buffer: buffer, headers: headers};
				callback();
			});
		},
		function invokeResponseHooks(callback) {
			if (!hooks || !handler.responseHooks.length) return callback();
			async.eachSeries(handler.responseHooks, function(hook, callback) {
				hook.hook(self, req, hooks.req, hooks.res, result.headers, result.buffer, callback);
			}, callback);
		}
	], function(err) {
		if (err) {
			var buffer = new Buffer(String(err.message || err), 'utf8');
			console.error('[' + (new Date()).toISOString() + '] 500: TileStrata failed to serve ' + req.filename + ' for "' + req.layer + '" layer {x:' + req.x + ',y:' + req.y + ',z:' + req.z + '}');
			console.error(err.stack || err);
			callback(500, buffer, {
				'Cache-Control': 'no-cache, no-store, must-revalidate',
				'Pragma': 'no-cache',
				'Expires': '0',
				'X-Powered-By': HEADER_XPOWEREDBY,
				'Content-Length': buffer.length
			});
		} else {
			callback(result.status, result.buffer, result.headers);
		}
	});
};

/**
 * Handles a standard request.
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @return {void}
 */
TileServer.prototype.respond = function(req, res) {
	var tilereq = TileRequest.parse(req.url, req.headers, req.method);
	var handler = this.serve(tilereq, {req: req, res: res}, function(status, buffer, headers) {
		res.writeHead(status, headers);
		res.write(buffer);
		res.end();
	});
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
	var req = new TileRequest(x, y, z, layer, filename, {}, 'GET');
	this.serve(req, false, function(status, buffer, headers) {
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
 * Starts listening on the specified port / hostname. The arguments
 * to this function are exactly identical to node's
 * http.Server listen() method.
 *
 * @param {int} port
 * @param {string} [hostname]
 * @param {function} [callback]
 * @return {void}
 */
TileServer.prototype.listen = function(port, callback) {
	callback = callback || function() {};

	var self = this;
	var args = arguments;
	var server = http.createServer(function(req, res) {
		self.respond(req, res);
	});

	self.initialize(function(err) {
		if (err) return callback(err);
		server.listen.apply(server, args);
	});
};
