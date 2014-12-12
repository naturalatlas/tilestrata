var TileLayer = require('../lib/TileLayer.js');
var TileRequestHandler = require('../lib/TileRequestHandler.js');
var assert = require('chai').assert;

describe('TileLayer', function() {
	describe('setName()', function() {
		it('should set name attribute', function() {
			var layer = new TileLayer();
			layer.setName('map_layer');
			assert.equal(layer.name, 'map_layer');
			layer = new TileLayer();
			layer.setName('map-layer');
			assert.equal(layer.name, 'map-layer');
			layer = new TileLayer();
			layer.setName('map-layer12');
			assert.equal(layer.name, 'map-layer12');
		});
		it('should throw error when invalid', function() {
			assert.throws(function() {
				var layer = new TileLayer();
				layer.setName('name?');
			}, /Invalid layer name/);
		});
	});
	describe('registerRoute()', function() {
		it('should init route and add to "routes" hash', function(done) {
			var _handler;
			var layer = new TileLayer();
			layer.registerRoute('filename.png', function(handler) {
				_handler = handler;
				assert.instanceOf(handler, TileRequestHandler);
				setImmediate(function() {
					assert.deepEqual(layer.routes, {
						'filename.png': {filename: 'filename.png', handler: _handler}
					});
					done();
				});
			});
		});
	});
});