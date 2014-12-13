var TileServer = require('../lib/TileServer.js');
var TileRequest = require('../lib/TileRequest.js');
var TileRequestHandler = require('../lib/TileRequestHandler.js');
var assert = require('chai').assert;

describe('TileRequestHandler', function() {
	it('should default cacheFetchMode to "sequential"', function() {
		var handler = new TileRequestHandler();
		assert.equal(handler.cacheFetchMode, 'sequential');
	});
	describe('setCacheFetchMode()', function() {
		it('should set cacheFetchMode property', function() {
			var handler = new TileRequestHandler();
			handler.setCacheFetchMode('race');
			assert.equal(handler.cacheFetchMode, 'race');
		});
		it('should detect invalid values', function() {
			var handler = new TileRequestHandler();
			assert.throws(function() {
				handler.setCacheFetchMode('awawf');
			}, /Invalid cache fetch mode/);
		});
	});
	describe('registerProvider()', function() {
		it('should throw if passed invalid value', function() {
			assert.throws(function() {
				var handler = new TileRequestHandler();
				handler.registerProvider(null);
			}, /Falsy value passed/);
			assert.throws(function() {
				var handler = new TileRequestHandler();
				handler.registerProvider({});
			}, /Attempted to register a provider with no serve/);
		});
		it('should throw if provider already set', function() {
			assert.throws(function() {
				var handler = new TileRequestHandler();
				handler.registerProvider({serve: function() {}});
				handler.registerProvider({serve: function() {}});
			}, /provider already registered/);
		});
		it('should operate normally', function() {
			var handler = new TileRequestHandler();
			var _provider = {serve: function() {}};
			handler.registerProvider(_provider);
			assert.equal(handler.provider, _provider);
		});
	});
	describe('registerCache()', function() {
		it('should throw if passed invalid value', function() {
			assert.throws(function() {
				var handler = new TileRequestHandler();
				handler.registerCache(null);
			}, /Falsy value passed/);
			assert.throws(function() {
				var handler = new TileRequestHandler();
				handler.registerCache({set: function() {}});
			}, /Attempted to register a cache with no get/);
			assert.throws(function() {
				var handler = new TileRequestHandler();
				handler.registerCache({get: function() {}});
			}, /Attempted to register a cache with no set/);
		});
		it('should operate normally', function() {
			var handler = new TileRequestHandler();
			var _cache1 = {get: function() {}, set: function() {}};
			var _cache2 = {get: function() {}, set: function() {}};
			handler.registerCache(_cache1);
			handler.registerCache(_cache2);
			assert.deepEqual(handler.caches, [_cache1, _cache2]);
		});
	});
	describe('initialize()', function() {
		it('should handle no provider / no caches gracefully', function(done) {
			var server = new TileServer();
			var handler = new TileRequestHandler();
			handler.initialize(server, function(err) {
				assert.isNull(err);
				done();
			});
		});
		it('should call init() on provider and caches', function(done) {
			var server = new TileServer();
			var handler = new TileRequestHandler();
			var _cache1_called = false;
			var _cache2_called = false;
			var _provider_called = false;
			handler.registerCache({
				init: function(_server, callback) {
					_cache1_called = true;
					assert.equal(_server, server);
					callback();
				},
				get: function() {},
				set: function() {}
			});
			handler.registerCache({
				init: function(_server, callback) {
					_cache2_called = true;
					assert.equal(_server, server);
					callback();
				},
				get: function() {},
				set: function() {}
			});
			handler.registerProvider({
				init: function(_server, callback) {
					assert.equal(_server, server);
					_provider_called = true;
					callback();
				},
				serve: function() {}
			});
			handler.initialize(server, function(err) {
				assert.isNull(err);
				assert.isTrue(_cache1_called);
				assert.isTrue(_cache2_called);
				assert.isTrue(_provider_called);
				done();
			});
		});
		it('should fail if the provider init fails', function(done) {
			var _err = new Error('It failed');
			var server = new TileServer();
			var handler = new TileRequestHandler();
			handler.registerProvider({init: function(server, callback) { callback(_err); }, serve: function() {}});
			handler.initialize(server, function(err) {
				assert.equal(err, _err);
				done();
			});
		});
		it('should fail if any of the cache inits fail', function(done) {
			var _err = new Error('It failed');
			var server = new TileServer();
			var handler = new TileRequestHandler();
			handler.registerCache({init: function(server, callback) { callback(_err); }, get: function() {}, set: function() {}});
			handler.initialize(server, function(err) {
				assert.equal(err, _err);
				done();
			});
		});
	});
	describe('GET()', function() {
		it('it should hit caches first', function(done) {
			var mockServer = new TileServer();
			var mockRequest = TileRequest.parse('/layer/1/2/3/tile.png');
			var handler = new TileRequestHandler();
			var _cache1_called = false;
			var _cache2_called = false;

			handler.registerCache({
				get: function(server, req, callback) {
					_cache1_called = true;
					assert.equal(server, mockServer);
					assert.equal(req, mockRequest);
					assert.isFalse(_cache2_called, 'Cache 2 shouldn\'t have been called yet');
					callback();
				},
				set: function() {}
			});
			handler.registerCache({
				get: function(server, req, callback) {
					_cache2_called = true;
					assert.equal(server, mockServer);
					assert.isTrue(_cache1_called, 'Cache 1 should have been called first');
					callback(null, new Buffer('success', 'utf8'), {'X-Test-Status': 'success'});
				},
				set: function() {}
			});
			handler.registerProvider({
				serve: function(server, req, callback) {
					throw new Error('Shouldn\'t have been called');
				}
			});

			handler.GET(mockServer, mockRequest, function(status, buffer, headers) {
				assert.isTrue(_cache1_called, 'Cache 1 should have been called');
				assert.isTrue(_cache2_called, 'Cache 2 should have been called');
				assert.equal(status, 200);
				assert.equal(buffer.toString('utf8'), 'success');
				assert.deepEqual(headers, {'X-Test-Status': 'success'});
				done();
			});
		});
		it('should ignore any cache errors and fallback to provider', function(done) {
			var mockServer = new TileServer();
			var mockRequest = TileRequest.parse('/layer/1/2/3/tile.png');
			var handler = new TileRequestHandler();
			var _cache_called = false;

			handler.registerCache({
				get: function(server, req, callback) {
					_cache_called = true;
					callback(new Error('Cache failure'));
				},
				set: function() {}
			});
			handler.registerProvider({
				serve: function(server, req, callback) {
					callback(null, new Buffer('success', 'utf8'), {'X-Test-Status': 'success'});
				}
			});
			handler.GET(mockServer, mockRequest, function(status, buffer, headers) {
				assert.isTrue(_cache_called);
				assert.equal(status, 200);
				assert.equal(buffer.toString('utf8'), 'success');
				assert.deepEqual(headers, {'X-Test-Status': 'success'});
				done();
			});
		});
		it('should skip caching and return 500 status when provider fails', function(done) {
			var mockServer = new TileServer();
			var mockRequest = TileRequest.parse('/layer/1/2/3/tile.png');
			var handler = new TileRequestHandler();

			handler.registerCache({
				get: function(server, req, callback) { callback(); },
				set: function() { throw new Error('Should not have been called') }
			});
			handler.registerProvider({
				serve: function(server, req, callback) {
					callback(new Error('Something went wrong'))
				}
			});
			handler.GET(mockServer, mockRequest, function(status, buffer, headers) {
				assert.equal(status, 500);
				assert.equal(buffer.toString('utf8'), 'Something went wrong');
				assert.deepEqual(headers, {});
				setImmediate(done);
			});
		});
		it('should should acknowledge "race" cacheFetchMode', function(done) {
			var mockServer = new TileServer();
			var mockRequest = TileRequest.parse('/layer/1/2/3/tile.png');
			var handler = new TileRequestHandler();
			var _cache1_called = false;
			var _cache1_finished = false;
			var _cache2_finished = false;

			handler.registerCache({
				get: function(server, req, callback) {
					_cache1_called = true;
					// never call back
				},
				set: function() {}
			});
			handler.registerCache({
				get: function(server, req, callback) {
					assert.isTrue(_cache1_called);
					callback(null, new Buffer('success', 'utf8'), {'X-Test-Status': 'success'});
				},
				set: function() {}
			});
			handler.registerProvider({
				serve: function(server, req, callback) {
					throw new Error('Shouldn\'t have been called');
				}
			});

			handler.setCacheFetchMode('race');
			handler.GET(mockServer, mockRequest, function(status, buffer, headers) {
				assert.isTrue(_cache1_called, 'Cache 1 should have been called');
				assert.equal(status, 200);
				assert.equal(buffer.toString('utf8'), 'success');
				assert.deepEqual(headers, {'X-Test-Status': 'success'});
				done();
			});
		});
		it('should attempt to cache after successful provider result', function(done) {
			var mockServer = new TileServer();
			var mockRequest = TileRequest.parse('/layer/1/2/3/tile.png');
			var handler = new TileRequestHandler();

			var _cache_set_calls = 0;
			var cacheSet = function(server, req, buffer, headers, callback) {
				_cache_set_calls++;
				assert.equal(server, mockServer);
				assert.equal(req, mockRequest);
				assert.equal(buffer.toString('utf8'), 'success');
				assert.deepEqual(headers, {'X-Test-Status': 'success'});
				callback();
				if (_cache_set_calls === 2) {
					setImmediate(done);
				}
			};

			handler.registerCache({
				get: function(server, req, callback) { callback(); },
				set: cacheSet
			});

			handler.registerCache({
				get: function(server, req, callback) { callback(); },
				set: cacheSet
			});

			handler.registerProvider({
				serve: function(server, req, callback) {
					var _buffer = new Buffer('success', 'utf8');
					var _headers = {'X-Test-Status': 'success'};
					callback(null, _buffer, _headers);
				}
			});
			handler.GET(mockServer, mockRequest, function(status, buffer, headers) {
				assert.equal(_cache_set_calls, 0);
				assert.equal(status, 200);
				assert.equal(buffer.toString('utf8'), 'success');
				assert.deepEqual(headers, {'X-Test-Status': 'success'});
			});
		});
		it('should handle no caches fine', function(done) {
			var mockServer = new TileServer();
			var mockRequest = TileRequest.parse('/layer/1/2/3/tile.png');
			var handler = new TileRequestHandler();
			handler.registerProvider({
				serve: function(server, req, callback) {
					assert.equal(server, mockServer);
					assert.equal(req, mockRequest);
					var _buffer = new Buffer('success', 'utf8');
					var _headers = {'X-Test-Status': 'success'};
					callback(null, _buffer, _headers);
				}
			});

			handler.GET(mockServer, mockRequest, function(status, buffer, headers) {
				assert.equal(status, 200);
				assert.equal(buffer.toString('utf8'), 'success');
				assert.deepEqual(headers, {'X-Test-Status': 'success'});
				setImmediate(done);
			});
		});
		it('should return 404 status when no provider configured', function(done) {
			var mockServer = new TileServer();
			var mockRequest = TileRequest.parse('/layer/1/2/3/tile.png');
			var handler = new TileRequestHandler();
			handler.GET(mockServer, mockRequest, function(status, buffer, headers) {
				assert.equal(status, 404);
				assert.equal(buffer.toString('utf8'), 'No provider configured for layer');
				assert.deepEqual(headers, {});
				setImmediate(done);
			});
		});
		it('should batch identical requests while busy fetching', function(done) {
			var mockServer = new TileServer();
			var req1 = TileRequest.parse('/layer/1/2/3/tile.png');
			var req2 = TileRequest.parse('/layer/1/2/3/tile.png');
			var _calls_provider = 0;
			var _responses = 0;

			var handler = new TileRequestHandler();
			handler.registerProvider({
				serve: function(server, req, callback) {
					_calls_provider++;
					setImmediate(function() {
						var _buffer = new Buffer('success', 'utf8');
						var _headers = {'X-Test-Status': 'success'};
						callback(null, _buffer, _headers);
					});
				}
			});

			function handleResponse(status, buffer, headers) {
				_responses++;
				assert.equal(status, 200);
				assert.equal(buffer.toString('utf8'), 'success');
				assert.deepEqual(headers, {'X-Test-Status': 'success'});
				if (_responses === 2) {
					assert.equal(_calls_provider, 1)
					setImmediate(done);
				}
			}

			handler.GET(mockServer, req1, handleResponse);
			handler.GET(mockServer, req2, handleResponse);
		});
	});
});