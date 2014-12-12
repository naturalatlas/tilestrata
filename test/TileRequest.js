var TileRequest = require('../lib/TileRequest.js');
var assert = require('chai').assert;

describe('TileRequest', function() {
	describe('parse()', function() {
		it('should operate normally', function() {
			var result;

			result = TileRequest.parse('/lyr/1/2/3/tile@2x.png');
			assert.instanceOf(result, TileRequest);
			assert.deepEqual(result, {
				layer: 'lyr',
				filename: 'tile@2x.png',
				z: 1, x: 2, y: 3
			});

			result = TileRequest.parse('lyr/1/2/3/tile@2x.png');
			assert.instanceOf(result, TileRequest);
			assert.deepEqual(result, {
				layer: 'lyr',
				filename: 'tile@2x.png',
				z: 1, x: 2, y: 3
			});

			result = TileRequest.parse('lyr1/1/2/3/tile@2x.png?query=1&test=2');
			assert.instanceOf(result, TileRequest);
			assert.deepEqual(result, {
				layer: 'lyr1',
				filename: 'tile@2x.png',
				z: 1, x: 2, y: 3
			});
		});
		it('should return undefined when unable to parse', function() {
			assert.isUndefined(TileRequest.parse());
			assert.isUndefined(TileRequest.parse('/a/b/c/d/t.png'));
			assert.isUndefined(TileRequest.parse('/a/1/2.png'));
			assert.isUndefined(TileRequest.parse('/a/1/2/3.2/t.png'));
			assert.isUndefined(TileRequest.parse('/a/1.2/2/3/t.png'));
			assert.isUndefined(TileRequest.parse('/a/1/2.4/3/t.png'));
		});
	});
});