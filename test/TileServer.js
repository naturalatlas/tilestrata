var TileServer = require('../lib/TileServer.js');
var TileLayer = require('../lib/TileLayer.js');
var TileRequest = require('../lib/TileRequest.js');
var assert = require('chai').assert;

describe('TileServer', function() {
	it('should have "version" property', function() {
		var server = new TileServer();
		var pkg = require('../package.json');
		assert.equal(server.version, pkg.version);
	});
	describe('registerLayer()', function() {
		it('should operate normally', function() {
			var _layer;
			var server = new TileServer();
			server.registerLayer(function(layer) {
				_layer = layer;
				assert.instanceOf(layer, TileLayer);
				layer.setName('mylayer');
			});
			assert.deepEqual(Object.keys(server.layers), ['mylayer']);
			assert.equal(server.layers['mylayer'], _layer);
		});
		it('should throw error when layer missing name', function() {
			var server = new TileServer();
			assert.throws(function() {
				server.registerLayer(function(layer) {});
			}, /Layer definition missing name/);
		});
		it('should throw error when layer init throws', function() {
			var server = new TileServer();
			assert.throws(function() {
				server.registerLayer(function(layer) {
					throw new Error('test');
				});
			}, /Error initializing layer: "test"/);
		});
	});
	describe('serve()', function() {
		it('should return a 404 status if route not parseable', function(done) {
			var server = new TileServer();
			server.serve('GET', '/index.html', function(status, buffer, headers) {
				assert.equal(status, 404);
				assert.equal(buffer.toString('utf8'), 'Not found');
				assert.deepEqual(headers, {});
				done();
			});
		});
		it('should return a 404 status if no handlers found', function(done) {
			var server = new TileServer();
			server.serve('GET', '/layer/1/2/3/tile.png', function(status, buffer, headers) {
				assert.equal(status, 404);
				assert.equal(buffer.toString('utf8'), 'Not found');
				assert.deepEqual(headers, {});
				done();
			});
		});
		it('should return a 501 status if no methods match', function(done) {
			var server = new TileServer();
			server.registerLayer(function(layer) {
				layer.setName('layer');
				layer.registerRoute('tile.png', function(handler) {});
			});
			server.serve('INVALID', '/layer/1/2/3/tile.png', function(status, buffer, headers) {
				assert.equal(status, 501);
				assert.equal(buffer.toString('utf8'), 'Not implemented');
				assert.deepEqual(headers, {});
				done();
			});
		});
		it('should return a 200 status if layer handler succeeds', function(done) {
			var server = new TileServer();
			server.registerLayer(function(layer) {
				layer.setName('layer');
				layer.registerRoute('tile.png', function(handler) {
					handler.registerProvider({
						serve: function(_server, _req, callback) {
							assert.equal(_server, server);
							assert.instanceOf(_req, TileRequest);
							assert.equal(_req.filename, 'tile.png');
							callback(null, new Buffer('response', 'utf8'), {'X-Test': 'hello'});
						}
					});
				});
			});
			server.serve('GET', '/layer/1/2/3/tile.png', function(status, buffer, headers) {
				assert.equal(status, 200);
				assert.equal(buffer.toString('utf8'), 'response');
				assert.deepEqual(headers, {'X-Test': 'hello'});
				done();
			});
		});
		it('should return a 500 status if layer handler fails', function(done) {
			var server = new TileServer();
			server.registerLayer(function(layer) {
				layer.setName('layer');
				layer.registerRoute('tile.png', function(handler) {
					handler.registerProvider({
						serve: function(_server, _req, callback) {
							callback(new Error('Something went wrong'));
						}
					});
				});
			});
			server.serve('GET', '/layer/1/2/3/tile.png', function(status, buffer, headers) {
				assert.equal(status, 500);
				assert.equal(buffer.toString('utf8'), 'Something went wrong');
				assert.deepEqual(headers, {});
				done();
			});
		});
	});
	describe('getTile()', function() {
		it('should return error if tile unavailable', function(done) {
			var _served = false;
			var server = new TileServer();
			server.registerLayer(function(layer) {
				layer.setName('layer');
				layer.registerRoute('tile.png', function(handler) {
					handler.registerProvider({
						serve: function(_server, _req, callback) {
							_served = true;
							assert.equal(_req.x, 2);
							assert.equal(_req.y, 3);
							assert.equal(_req.z, 1);
							callback(new Error('It didn\'t work'));
						}
					});
				});
			});
			server.getTile('layer', 'tile.png', 2, 3, 1, function(err, buffer, headers) {
				assert.isTrue(_served);
				assert.instanceOf(err, Error);
				assert.equal(err.message, 'It didn\'t work');
				assert.isUndefined(buffer);
				assert.isUndefined(headers);
				done();
			});
		});
		it('should return tile if available', function(done) {
			var _served = false;
			var server = new TileServer();
			server.registerLayer(function(layer) {
				layer.setName('layer');
				layer.registerRoute('tile.png', function(handler) {
					handler.registerProvider({
						serve: function(_server, _req, callback) {
							_served = true;
							assert.equal(_req.x, 2);
							assert.equal(_req.y, 3);
							assert.equal(_req.z, 1);
							callback(null, new Buffer('result', 'utf8'), {'X-Test': 'hello'});
						}
					});
				});
			});
			server.getTile('layer', 'tile.png', 2, 3, 1, function(err, buffer, headers) {
				assert.isTrue(_served);
				assert.isNull(err);
				assert.instanceOf(buffer, Buffer);
				assert.equal(buffer.toString('utf8'), 'result');
				assert.deepEqual(headers, {'X-Test': 'hello'});
				done();
			});
		});
	});
});