var _ = require('lodash');
var async = require('async');
var BUFFER_NOPROVIDER = new Buffer('No provider configured for layer', 'utf8');

var TileRequestHandler = module.exports = function() {
	this.provider = null;
	this.caches = [];
	this.cacheFetchMode = 'sequential';
};

TileRequestHandler.prototype.setCacheFetchMode = function(mode) {
	if (mode !== 'sequential' && mode !== 'race') {
		throw new Error('Invalid cache fetch mode. Expected: "sequential" or "race"');
	}
	this.cacheFetchMode = mode;
};

TileRequestHandler.prototype.registerProvider = function(provider) {
	if (!provider) throw new Error('Falsy value passed to registerProvider()');
	if (this.provider) throw new Error('There is a provider already registered to this layer');
	if (typeof provider.serve !== 'function') throw new Error('Attempted to register a provider with no serve() method');
	this.provider = provider;
};

TileRequestHandler.prototype.registerCache = function(cache) {
	if (!cache) throw new Error('Falsy value passed to registerCache()');
	if (typeof cache.get !== 'function') throw new Error('Attempted to register a cache with no get() method');
	if (typeof cache.set !== 'function') throw new Error('Attempted to register a cache with no set() method');
	this.caches.push(cache);
};

TileRequestHandler.prototype.initialize = function(server, callback) {
	var self = this;
	async.parallel([
		function initializeProvider(callback) {
			if (!self.provider || !self.provider.init) return callback();
			self.provider.init(server, callback);
		},
		function initializeCaches(callback) {
			if (!self.caches.length) return callback();
			async.map(self.caches, function(cache, callback) {
				if (!cache.init) return setImmediate(callback);
				cache.init(server, callback);
			}, callback);
		}
	], function(err) {
		setImmediate(function() {
			callback(err || null);
		});
	});
};

/**
 * HTTP DELETE
 *
 * Deletes the tile from any caches.
 *
 * @param {TileServer} server
 * @param {TileRequest} req
 * @param {function} callback(status, buffer, headers)
 * @return {void}
 */
TileRequestHandler.prototype['DELETE'] = function(server, req, callback) {
	// process:
	// 1) delete from caches
	// 2) invoke callback
	callback(new Error('Not implemented'));
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
TileRequestHandler.prototype['GET'] = requestBatcher(function(server, req, callback) {
	var self = this;
	var done = _.once(callback);
	var providerHeaders;
	var providerBuffer;

	// process:
	// 1) fetch from caches
	// 2) run provider (if needed)
	// 3) invoke callback
	// 4) store in cache (if needed)

	async.series([
		function step_requestCache(callback) {
			var cacheHitBuffer;
			var cacheHitHeaders;
			if (!self.caches.length) return callback();

			function fetcher(cache, callback) {
				cache.get(server, req, function(err, buffer, headers) {
					cacheHitBuffer = buffer;
					cacheHitHeaders = headers;
					if (!err && buffer) return callback('HIT');
					else callback(); // ignore errors
				});
			}

			function complete() {
				if (cacheHitBuffer) {
					done(200, cacheHitBuffer, cacheHitHeaders || {});
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
			self.provider.serve(server, req, function(err, buffer, headers) {
				if (err) return done(500, new Buffer(err.message || err, 'utf8'), {});
				providerHeaders = headers;
				providerBuffer = buffer;
				done(200, buffer, headers || {});
				setImmediate(callback);
			});
		},
		function step_cacheResult(callback) {
			if (!self.caches.length || !providerBuffer) return callback();
			async.map(self.caches, function(cache, callback) {
				cache.set(server, req, providerBuffer, providerHeaders, callback);
			}, function() {
				providerBuffer = null;
				providerHeaders = null;
			});
		}
	], function(err) {
		// do nothing
	});
});

function requestBatcher(fn) {
	var callbacks = {};
	return function(server, req, callback) {
		var self = this;
		var key = [req.layer, req.z, req.x, req.y, req.filename].join(':');
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