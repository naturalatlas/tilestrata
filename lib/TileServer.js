var _ = require('lodash');
var async = require('async');
var http = require('http');
var log = require('npmlog');
var uuid = require('node-uuid');
var request = require('request');
var Recovery = require('recovery');
var HTTPStatus = require('http-status');
var TileLayer = require('./TileLayer.js');
var TileRequest = require('./TileRequest.js');
var version = require('../package.json').version;
var noop = function() {};

var route_health = require('./routes/health.js');
var route_robots = require('./routes/robots.js');
var route_profile = require('./routes/profile.js');

var PROFILING_ENABLED = !process.env.TILESTRATA_NOPROFILE;
var HEADER_XPOWEREDBY = 'TileStrata/' + version;
var BUFFER_NOTFOUND = new Buffer('Not found', 'utf8');
var BUFFER_NOTIMPLEMENTED = new Buffer('Not implemented', 'utf8');

log.heading = 'tilestrata';
log.prefixStyle = {fg: 'grey'}
log.maxRecordSize = 100;

/**
 * Tile Server Implementation
 *
 * Usage:
 *   var server = new TileServer();
 *   server.layer(name);
 *   server.getTile('basemap', 'tile.png', x, y, z, function(err, buffer, headers) { ... });
 *   server.serve(req, {}, function(status, buffer, headers) { ... });
 *
 * @constructor
 * @param {object} [options]
 * @return {void}
 */
var TileServer = module.exports = function(options) {
	this.http_server = null;
	this.http_port = null;
	this.initialized = false;
	this.initializing = false;
	this.layers = {};
	this.profiles = {};
	this.options = options || {};
	this.uuid = uuid.v4();
	this.close = async.memoize(this.close.bind(this));
};

/** @type {string} */
TileServer.prototype.version = version;

/**
 * Returns how long the server has been up (in ms).
 *
 * @return {Object|null}
 */
TileServer.prototype.uptime = function() {
	if (!this.start_time) return null;
	return {
		duration: Date.now() - this.start_time,
		start: this.start_time
	};
};

/**
 * Registers a layer definition so that it can be served.
 *
 * @throws
 * @param {string} name
 * @param {object} [options]
 * @return {void}
 */
TileServer.prototype.layer = function(name, options) {
	if (this.layers.hasOwnProperty(name)) {
		return this.layers[name];
	}
	var layer = new TileLayer(name, options);
	layer.layer = this.layer.bind(this);
	this.layers[layer.name] = layer;
	return layer;
};

/**
 * Initializes all caches and providers.
 *
 * @param {function} callback
 * @return {void}
 */
TileServer.prototype.initialize = function(callback) {
	var self = this;
	if (self.initialized) return callback();
	if (self.initializing) return callback(new Error('The server is already initializing'));

	self.initializing = true;

	async.each(_.values(this.layers), function(layer, callback) {
		async.each(_.values(layer.routes), function(route, callback) {
			route.handler._initialize(self, callback);
		}, function(err) {
			if (err) err = new Error('Unable to initialize "' + layer.name + '" layer: "' + (err.message || err) + '"');
			callback(err);
		});
	}, function(err) {
		if (!err) {
			self.start_time = Date.now();
			self.initialized = true;
		}
		callback(err);
	});
};

/**
 * Attempts to handle the incoming HTTP request. It will call
 * next() if nothing was found for the URL.
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {function} [next]
 * @return {boolean}
 */
TileServer.prototype._handleRequest = function(req, res, next) {
	if (req.url === '/health') {
		return route_health(req, res, this);
	} else if (req.url === '/profile' || req.url === '/profile?format=json') {
		return route_profile(req, res, this);
	} else if (req.url === '/robots.txt') {
		return route_robots(req, res, this);
	}

	var tilereq = TileRequest.parse(req.url, req.headers, req.method);
	this.serve(tilereq, {req: req, res: res}, function(status, buffer, headers) {
		if (next && status === 404) return next();
		res.writeHead(status, headers);
		res.write(buffer);
		res.end();
	});
};

/**
 * Determines the appropriate TileRequestHandler to handle the request.
 *
 * @param {TileRequest} req
 * @return {TileRequestHandler|undefined}
 */
TileServer.prototype._getTileHandler = function(req) {
	if (!this.layers.hasOwnProperty(req.layer)) return;
	var layer = this.layers[req.layer];
	if (layer.options.minZoom && req.z < layer.options.minZoom) return;
	if (layer.options.maxZoom && req.z > layer.options.maxZoom) return;
	if (!layer._isInBounds(req)) return;

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
 * @param {object} http (raw request, raw response objects)
 * @param {function} callback(status, buffer, headers)
 * @return {void}
 */
TileServer.prototype.serve = function(req, http, callback) {
	var self = this;
	if (!req) return callback(404, BUFFER_NOTFOUND, {});
	var _method = req.method;

	if (req.method === 'HEAD') {
		_method = 'GET';
	}

	var handler = this._getTileHandler(req);
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
			if (!http || !handler.requestHooks.length) return callback();
			async.eachSeries(handler.requestHooks, function(hook, callback) {
				var __profile = self.profile(hook.id, req);
				hook.plugin.reqhook(self, req, http.req, http.res, function(err) {
					__profile(err);
					callback(err);
				});
			}, callback);
		},
		function handleRequest(callback) {
			handler[_method](self, req, function(status, buffer, headers) {
				headers = headers || {};

				headers['X-Powered-By'] = HEADER_XPOWEREDBY;
				if (status === 200) {
					headers['Cache-Control'] = 'max-age=60';
				}

				result = {status: status, buffer: buffer, headers: headers};
				callback();
			});
		},
		function invokeResponseHooks(callback) {
			if (!http || !handler.responseHooks.length) return callback();
			async.eachSeries(handler.responseHooks, function(hook, callback) {
				var __profile = self.profile(hook.id, req);
				hook.plugin.reshook(self, req, http.req, http.res, result, function(err) {
					__profile(err);
					callback(err);
				});
			}, callback);
		},
		function finalizeResult(callback) {
			if (!result.headers) result.headers = {};
			result.headers['Content-Length'] = result.buffer ? result.buffer.length : 0;

			// head request support
			if (req.method === 'HEAD') result.buffer = new Buffer([]);

			callback();
		}
	], function(err) {
		if (err) {
			var buffer = new Buffer(String(err.message || err), 'utf8');
			log.error(null, 'Failed to serve ' + req.filename + ' for "' + req.layer + '" layer {x:' + req.x + ',y:' + req.y + ',z:' + req.z + '}');
			log.error(null, err);
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
 * Returns profiling information in a structured format.
 *
 * @return {array}
 */
TileServer.prototype.getProfileData = function() {
	var self = this;
	var result = {};
	var keys = Object.keys(this.profiles);
	keys.sort();

	function getplugin(key, layer, file) {
		var parts = key.split('#');
		var type = parts[0];
		var handler = self.layer(layer).route(file);
		if (type === 'provider') return handler.provider;
		var index = Number(parts[1].split('.')[0]);
		if (type === 'cache') return handler.caches[index];
		if (type === 'transform') return handler.transforms[index];
		if (type === 'reqhook') return handler.requestHooks[index];
		if (type === 'reshook') return handler.responseHooks[index];
	}

	keys.forEach(function(key) {
		var parts = key.split('::');
		var layer = parts[0];
		var file = parts[1];
		var plugin = parts[2];
		var z = parts[3];
		result[layer] = result[layer] || {};
		result[layer][file] = result[layer][file] || {};
		if (!result[layer][file][plugin]) {
			result[layer][file][plugin] = {
				plugin_name: getplugin(plugin, layer, file).plugin.name || '',
				zooms: {}
			};
		}
		result[layer][file][plugin].zooms[z] = self.profiles[key];
	});

	return result;
};

/**
 * Invokes the user-given `healthy` function to check server health.
 * If not provided, it will assume everything's okay.
 *
 * @param {function} callback
 * @return {void}
 */
TileServer.prototype.checkHealth = function(callback) {
	if (!this.options.healthy) return callback();
	this.options.healthy.call(this, callback);
};

/**
 * Called before invoking a plugin. It returns a function that
 * should be called at completion so that it can track latency.
 *
 * @param {string} plugin_id
 * @param {TileRequest} req
 * @return {function}
 */
TileServer.prototype.profile = function(plugin_id, req) {
	if (!PROFILING_ENABLED) return noop;

	var self = this;
	var start = Date.now();

	return function(err, _data) {
		var dur = Date.now() - start;
		// layer::file.ext::cache#1::z12
		var key = [req.layer, req.filename, plugin_id, 'z'+req.z].join('::');
		if (!self.profiles[key]) self.profiles[key] = {};
		var data = self.profiles[key];

		data.errors = (data.errors || 0) + (err ? 1 : 0);
		data.dur_samples = (data.dur_samples || 0) + 1;
		data.dur_max = typeof data.dur_max === 'undefined' ? dur : Math.max(dur, data.dur_max);
		data.dur_min = typeof data.dur_min === 'undefined' ? dur : Math.min(dur, data.dur_min);
		data.dur_avg = ((data.dur_avg || 0) * (data.dur_samples - 1) + dur) / data.dur_samples;

		if (_data) {
			if (typeof _data.hit === 'boolean') {
				data.hits = (data.hits || 0) + (_data.hit ? 1 : 0);
				data.misses = (data.misses || 0) + (_data.hit ? 0 : 1);
			}
			if (typeof _data.size === 'number') {
				data.size_samples = (data.size_samples || 0) + 1;
				data.size_max = typeof data.size_max === 'undefined' ? _data.size : Math.max(_data.size, data.size_max);
				data.size_min = typeof data.size_min === 'undefined' ? _data.size : Math.min(_data.size, data.size_min);
				data.size_avg = ((data.size_avg || 0) * (data.size_samples - 1) + _data.size) / data.size_samples;
			}
		}
	};
};

/**
 * Builds the layer information to send to the balancer
 * when the node checks in to it.
 *
 * @return {object}
 */
TileServer.prototype._buildBalancerData = function() {
	var self = this;
	return {
		id: this.uuid,
		version: this.version,
		listen_port: this.http_port,
		node_weight: this.options.balancer.node_weight || 1,
		layers: Object.keys(this.layers).map(function(layerName) {
			var layer = self.layer(layerName);
			return {
				name: layerName,
				options: layer.options,
				routes: Object.keys(layer.routes)
			};
		})
	};
};

/**
 * Informs the upstream TileStrata Balancer of this node's existence
 * for the lifetime of process. This should handle balancer restarts.
 *
 * @param {function} callback
 * @return {void}
 */
TileServer.prototype.bindBalancer = function() {
	var self = this;
	var balancer = this.options.balancer;
	if (!balancer) return;
	if (this.balancer) return;

	var recovery = this.balancer = new Recovery({
		'retries': Infinity,
		'min': balancer.register_mindelay || '1000 ms',
		'max': balancer.register_maxdelay || '30 seconds',
		'reconnect timeout': balancer.register_timeout || '30 seconds'
	});

	recovery.on('reconnect', function(opts) {
		log.info('balancer', 'Attempting to register with ' + balancer.host + '...');

		request({
			json: true,
			method: 'POST',
			url: 'http://' + balancer.host + '/nodes',
			timeout: balancer.register_timeout || 30000,
			body: self._buildBalancerData()
		}, function(err, res, body) {
			if (err) {
				var level = err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED' ? 'warn' : 'error';
				log[level]('balancer', 'Registration failed (' + err.message + ')');
				return recovery.reconnected(err);
			} else if (res.statusCode !== 201 && res.statusCode !== 200) {
				log.warn('balancer', 'Registration failed (HTTP ' + res.statusCode + ' ' + HTTPStatus[res.statusCode] + ')');
				return recovery.reconnected(new Error('Non 201 status (' + res.statusCode + ')'));
			} else if (!body || typeof body !== 'object') {
				log.error('balancer', 'Registration failed (invalid body)');
				return recovery.reconnected(new Error('Invalid body from balancer'));
			} else if (!body.token) {
				log.error('balancer', 'Registration failed ("token" not provided)');
				return recovery.reconnected(new Error('Invalid token'));
			} else if (isNaN(body.check_interval)) {
				log.error('balancer', 'Registration failed ("check_interval" not a number or missing)');
				return recovery.reconnected(new Error('Invalid check_interval'));
			}

			log.info('balancer', res.statusCode === 201 ? 'Successfully registered' : 'Already in pool');
			self.balancer_token = body.token;
			self.balancer_check_interval = body.check_interval;
			self.handleBalancerPing();
		    recovery.reconnected();
		});
	});

	recovery.reconnect();
};

/**
 * Invoked from /health route when the incoming request is
 * coming from a valid TileStrata balancer. This is also called
 * when the server is registered.
 *
 * @return {void}
 */
TileServer.prototype.handleBalancerPing = function() {
	var self = this;
	clearTimeout(this.balancer_timeout);
	this.balancer_timeout = setTimeout(function() {
		log.warn('balancer', 'Balancer not checking in, re-notifying of existence...');
		self.balancer.reconnect();
	}, this.balancer_check_interval * 3);
};

/**
 * Starts listening on the specified port / hostname. The arguments
 * to this function are exactly identical to node's
 * http.Server listen() method.
 *
 * @param {int} port
 * @param {string} [hostname]
 * @param {function} [callback]
 * @return {http.Server}
 */
TileServer.prototype.listen = function(port) {
	var callback = function(err) { if (err) throw err; };
	var self = this;
	var args = Array.prototype.slice.call(arguments);
	if (typeof args[args.length - 1] === 'function') {
		callback = args.pop();
	}

	args.push(function(err) {
		if (!err) self.bindBalancer();
		if (callback) callback(err);
	});

	this.http_port = port;
	var server = this.http_server = http.createServer(function(req, res) {
		self._handleRequest(req, res);
	});

	self.initialize(function(err) {
		if (err) return callback(err);
		server.listen.apply(server, args);
	});

	return server;
};

/**
 * Stops listening and disconnects from the balancer (if needed)
 *
 * @param {function} [callback]
 * @return {void}
 */
TileServer.prototype.close = function(callback) {
	var self = this;
	var port_err;
	var done = function(err) {
		self.close = async.memoize(TileServer.prototype.close.bind(self));
		if (callback) callback(err);
	};

	async.parallel([
		function closeBalancer(callback) {
			if (!self.balancer) return callback();
			clearTimeout(self.balancer_timeout);
			self.balancer.destroy();
			self.balancer = null;

			log.info('balancer', 'Server close() called, removing self from balancer...');
			request({
				method: 'DELETE',
				url: 'http://' + self.options.balancer.host + '/nodes/' + self.uuid
			}, function(err, res, body) {
				if (err) {
					log.warn('balancer', 'Unregistration failed (' + err.message + ')');
				} else {
					if (res.statusCode === 200) {
						log.info('balancer', 'Successfully removed from the balancer');
					} else {
						log.warn('balancer', 'Received HTTP ' + res.statusCode + ' ' + HTTPStatus[res.statusCode] + ' when removing node');
					}
				}
				callback();
			});
		},
		function closePort(callback) {
			if (!self.http_server) return callback();
			self.http_server.close(function(err) {
				if (!err) self.http_server = null;
				port_err = err;
				callback();
			});
		},
		function closePlugins(callback) {
			var was_error = false;
			async.each(_.values(self.layers), function(layer, callback) {
				async.each(_.values(layer.routes), function(route, callback) {
					route.handler._destroy(self, callback);
				}, function(err) {
					// errors are logged in _close()
					if (err) was_error = true;
					callback();
				});
			}, function() {
				if (!was_error) {
					self.start_time = null;
					self.initialized = false;
				}
				callback();
			});
		}
	], function(err) {
		done(port_err || err);
	});
};
