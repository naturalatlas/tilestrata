var TileLayer = require('../lib/TileLayer.js');
var TileRequestHandler = require('../lib/TileRequestHandler.js');
var assert = require('chai').assert;

describe('TileLayer', function() {
	describe('constructor', function() {
		it('should require valid name', function() {
			assert.throws(function() {
				new TileLayer('name?');
			}, /Invalid layer name/);
		});
		it('should set name property', function() {
			var layer = new TileLayer('map_layer');
			assert.equal(layer.name, 'map_layer');
			layer = new TileLayer('map-layer');
			assert.equal(layer.name, 'map-layer');
			layer = new TileLayer('map-layer12');
			assert.equal(layer.name, 'map-layer12');
		});
		it('should default options property to {}', function() {
			var layer = new TileLayer('map_layer', null);
			assert.equal(JSON.stringify(layer.options), '{}');
		});
		it('should set options property', function() {
			var opts = {};
			var layer = new TileLayer('map_layer', opts);
			assert.equal(layer.options,opts);
		});
	});
	describe('route()', function() {
		it('should return existing handler if route already registered', function() {
			var layer = new TileLayer('layer');
			var handler = layer.route('filename.png');
			assert.equal(layer.route('filename.png'), handler);
		});
		it('should add to "routes" hash and return handler', function() {
			var layer = new TileLayer('layer');
			var handler = layer.route('filename.png');
			assert.instanceOf(handler, TileRequestHandler)
			assert.deepEqual(layer.routes, {
				'filename.png': {filename: 'filename.png', handler: handler}
			});
		});
		it('should throw if options passed and route already registered', function() {
			var layer = new TileLayer('layer');
			var handler = layer.route('filename.png', {});
			assert.throws(function() {
				layer.route('filename.png', {});
			}, /Cannot pass options when layer is already registered/);
		});
		it('should accept options', function() {
			var layer = new TileLayer('layer');
			var handler = layer.route('filename.png', {});
			assert.equal(handler.cacheFetchMode, 'sequential');
			var handler = layer.route('filename2.png', {cacheFetchMode: 'race'});
			assert.equal(handler.cacheFetchMode, 'race');
		});
		it('should add route() method alias to handler (for chaining)', function() {
			var layer = new TileLayer('layer');
			var handler = layer.route('filename.png', {});
			assert.equal(handler.route('filename.png'), handler);
		});
		it('should add layer() method alias to handler (for chaining)', function() {
			var layer = new TileLayer('layer');
			layer.layer = function() {}; // normally added to TileLayer instance by TileServer's layer() method
			var handler = layer.route('filename.png', {});
			assert.equal(handler.layer, layer.layer);
		});
	});
});
