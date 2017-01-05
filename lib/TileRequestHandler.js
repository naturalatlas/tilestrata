var _ = require('lodash');
var async = require('async');
var log = require('npmlog');
var BUFFER_NOPROVIDER = new Buffer('No provider configured for layer', 'utf8');

var TileRequestHandler = module.exports = function(options) {
	options = options || {};
	this.provider = null;
	this.caches = [];
	this.transforms = [];
	this.requestHooks = [];
	this.responseHooks = [];
	this.cacheFetchMode = options.cacheFetchMode || 'sequential';
	this.GET = requestBatcher(this.GET);

	if (this.cacheFetchMode !== 'sequential' && this.cacheFetchMode !== 'race') {
		throw new Error('Invalid cache fetch mode. Expected: "sequential" or "race"');
	}
};

TileRequestHandler.prototype.use = function(plugin) {
	if (!plugin) return this;
	if (Array.isArray(plugin)) {
		plugin.map(this.use.bind(this));
		return this;
	}

	if (plugin.get) return this._registerCache(plugin);
	if (plugin.serve) return this._registerProvider(plugin);
	if (plugin.transform) return this._registerTransform(plugin);
	if (plugin.reqhook) return this._registerRequestHook(plugin);
	if (plugin.reshook) return this._registerResponseHook(plugin);
	throw new Error('Invalid plugin');
};

TileRequestHandler.prototype._registerProvider = function(plugin) {
	if (!plugin) throw new Error('Falsy value passed to registerProvider()');
	if (this.provider) throw new Error('There is a provider already registered to this layer');
	if (typeof plugin.serve !== 'function') throw new Error('Attempted to register a provider with no serve() method');
	this.provider = {id: 'provider#0', plugin: plugin};
	return this;
};

TileRequestHandler.prototype._registerCache = function(plugin) {
	var id = 'cache#' + (this.caches.length);
	if (!plugin) throw new Error('Falsy value passed to registerCache()');
	if (typeof plugin.get !== 'function') throw new Error('Attempted to register a cache with no get() method');
	if (typeof plugin.set !== 'function') throw new Error('Attempted to register a cache with no set() method');
	this.caches.push({id: id, plugin: plugin});
	return this;
};

TileRequestHandler.prototype._registerTransform = function(plugin) {
	var id = 'transform#' + (this.transforms.length);
	if (!plugin) throw new Error('Falsy value passed to registerTransform()');
	if (typeof plugin.transform !== 'function') throw new Error('Attempted to register a transform with no transform() method');
	this.transforms.push({id: id, plugin: plugin});
	return this;
};

TileRequestHandler.prototype._registerRequestHook = function(plugin) {
	var id = 'reqhook#' + (this.requestHooks.length);
	if (!plugin) throw new Error('Falsy value passed to registerRequestHook()');
	if (typeof plugin.reqhook !== 'function') throw new Error('Attempted to register a request hook with no reqhook() method');
	this.requestHooks.push({id: id, plugin: plugin});
	return this;
};

TileRequestHandler.prototype._registerResponseHook = function(plugin) {
	var id = 'reshook#' + (this.responseHooks.length);
	if (!plugin) throw new Error('Falsy value passed to registerResponseHook()');
	if (typeof plugin.reshook !== 'function') throw new Error('Attempted to register a response hook with no reshook() method');
	this.responseHooks.push({id: id, plugin: plugin});
	return this;
};

TileRequestHandler.prototype._invokeLifecycleMethod = function(server, plugin_method, skip_errors, callback) {
	var last_error;
	var wrapcb = function(callback) {
		return function(err) {
			if (err && skip_errors) {
				last_error = err;
				log.warn('plugin', 'Failed to close: "' + err.message + '"');
				return callback(err);
			}
			return callback(err);
		};
	};
	var self = this;
	async.parallel([
		function invokeProvider(callback) {
			if (!self.provider || !self.provider.plugin[plugin_method]) return callback();
			self.provider.plugin[plugin_method](server, wrapcb(callback));
		},
		function invokeCaches(callback) {
			if (!self.caches.length) return callback();
			async.map(self.caches, function(cache, callback) {
				if (!cache.plugin[plugin_method]) return setImmediate(callback);
				cache.plugin[plugin_method](server, wrapcb(callback));
			}, callback);
		},
		function invokeTransforms(callback) {
			if (!self.transforms.length) return callback();
			async.map(self.transforms, function(transform, callback) {
				if (!transform.plugin[plugin_method]) return setImmediate(callback);
				transform.plugin[plugin_method](server, wrapcb(callback));
			}, callback);
		},
		function invokeRequestHooks(callback) {
			if (!self.requestHooks.length) return callback();
			async.map(self.requestHooks, function(hook, callback) {
				if (!hook.plugin[plugin_method]) return setImmediate(callback);
				hook.plugin[plugin_method](server, wrapcb(callback));
			}, callback);
		},
		function invokeResponseHooks(callback) {
			if (!self.responseHooks.length) return callback();
			async.map(self.responseHooks, function(hook, callback) {
				if (!hook.plugin[plugin_method]) return setImmediate(callback);
				hook.plugin[plugin_method](server, wrapcb(callback));
			}, callback);
		}
	], function(err) {
		setImmediate(function() {
			callback(err || last_error || null);
		});
	});
};

TileRequestHandler.prototype._destroy = function(server, callback) {
	this._invokeLifecycleMethod(server, 'destroy', true, callback);
};

TileRequestHandler.prototype._initialize = function(server, callback) {
	this._invokeLifecycleMethod(server, 'init', false, callback);
};

/**
 * HTTP GET
 *
 * Runs a request through the handler and returns the result
 * to the callback.
 *
 * @param {TileServer} server
 * @param {TileRequest} req
 * @param {function} callback(status, buffer, headers)
 * @return {void}
 */
TileRequestHandler.prototype['GET'] = function(server, req, callback) {
	var self = this;
	var done = _.once(callback);
	var renderedHeaders;
	var renderedBuffer;
	var cacheHeaders;
	var backgroundRefresh = false;
	var waitForCache = req.headers.hasOwnProperty('x-tilestrata-cachewait');

	// process:
	// 1) fetch from caches
	// 2) run provider (if needed)
	// 3) execute transforms
	// 4) invoke callback
	// 5) store in cache (if needed)

	async.series([
		function step_requestCache(callback) {
			var cacheHitBuffer;
			var cacheHitHeaders;
			if (!self.caches.length) return callback();

			// skip the caches if the "x-tilestrata-skipcache" header is present
			// and an item in the list matches the current layer and file. format:
			// "[layer]/[file],[layer]/[file],..." or "*"
			if (req.headers.hasOwnProperty('x-tilestrata-skipcache')) {
				var list = req.headers['x-tilestrata-skipcache'];
				if (list === '*') return callback();
				var key = req.layer + '/' + req.filename;
				if (list.split(',').indexOf(key) > -1) {
					return callback();
				}
			}

			function fetcher(cache, callback) {
				var __profile = server.profile(cache.id+'.get', req);
				cache.plugin.get(server, req, function(err, buffer, headers, refresh) {
					cacheHitBuffer = buffer;
					cacheHitHeaders = headers;
					if (!err && buffer) {
						backgroundRefresh = refresh;
						__profile(null, {hit: true, size: buffer.length});
						return callback('HIT');
					} else {
						__profile(null, {hit: false});
						callback(); // ignore errors
					}
				});
			}

			function complete() {
				if (cacheHitBuffer) {
					var headers = cacheHitHeaders || {};
					headers['X-TileStrata-CacheHit'] = '1';
					done(200, cacheHitBuffer, headers);
					if (backgroundRefresh) callback(); // continue process in background
				} else {
					// fallback to provider
					callback();
				}
			}

			if (self.cacheFetchMode === 'race') {
				async.each(self.caches, fetcher, complete);
			} else {
				async.eachSeries(self.caches, fetcher, complete);
			}
		},
		function step_runProvider(callback) {
			if (!self.provider) {
				return done(404, BUFFER_NOPROVIDER, {});
			}
			var __profile = server.profile(self.provider.id, req);
			self.provider.plugin.serve(server, req, function(err, buffer, headers) {
				if (err) {
					__profile(err);
					return done(err.statusCode || 500, new Buffer(err.message || err, 'utf8'), {});
				}

				renderedHeaders = headers || {};
				renderedBuffer = buffer;
				__profile(null, {size: buffer.length});
				setImmediate(callback);
			});
		},
		function step_applyTransforms(callback) {
			if (!self.transforms.length) return callback();
			async.eachSeries(self.transforms, function(transform, callback) {
				var __profile = server.profile(transform.id, req);
				transform.plugin.transform(server, req, renderedBuffer, renderedHeaders, function(err, buffer, headers) {
					if (err) {
						__profile(err);
						return callback(err);
					}
					renderedBuffer = buffer;
					renderedHeaders = headers || {};
					__profile();
					callback();
				});
			}, function(err) {
				if (err) return done(500, new Buffer(err.message || err, 'utf8'), {});
				callback();
			});
		},
		function step_serveResult(callback) {
			renderedHeaders = renderedHeaders || {};
			// headers can be modified by response hooks, so we need to
			// create a copy to prevent the cache picking up the mutated copy
			cacheHeaders = _.clone(renderedHeaders);
			if (!waitForCache) done(200, renderedBuffer, renderedHeaders);
			callback();
		},
		function step_cacheResult(callback) {
			if (!self.caches.length) return callback();
			async.map(self.caches, function(cache, callback) {
				var __profile = server.profile(cache.id+'.set', req);
				cache.plugin.set(server, req, renderedBuffer, cacheHeaders, function(err) {
					__profile(err);
					callback(); // don't let errors from one cache affect another
				});
			}, function() {
				if (waitForCache) done(200, renderedBuffer, renderedHeaders);
				renderedBuffer = null;
				renderedHeaders = null;
				cacheHeaders = null;
			});
		}
	], function(err) {
		// do nothing
	});
};

function requestBatcher(fn) {
	var callbacks = {};
	return function(server, req, callback) {
		var self = this;
		var key = [req.layer, req.z, req.x, req.y, req.filename, req.headers && req.headers['x-tilestrata-skipcache']].join(':');
		if (callbacks.hasOwnProperty(key)) return callbacks[key].push(callback);

		callbacks[key] = [callback];
		fn.apply(self, [server, req, function() {
			var cbs = callbacks[key];
			delete callbacks[key];
			for (var i = 0, n = cbs.length; i < n; i++) {
				cbs[i].apply(null, arguments);
			}
		}]);
	};
}
