var TileRequest = require('../lib/TileRequest.js');
var assert = require('chai').assert;

describe('TileRequest', function() {
	describe('parse()', function() {
		it('should operate normally', function() {
			var result;

			// leading slash
			result = TileRequest.parse('/lyr/1/2/3/tile@2x.png');
			assert.instanceOf(result, TileRequest);
			assert.equal(result.layer, 'lyr');
			assert.equal(result.filename, 'tile@2x.png');
			assert.equal(result.z, 1);
			assert.equal(result.x, 2);
			assert.equal(result.y, 3);
			assert.equal(result.method, 'HEAD');
			assert.deepEqual(result.headers, {});

			// no leading slash
			result = TileRequest.parse('lyr/1/2/3/tile@2x.png');
			assert.instanceOf(result, TileRequest);
			assert.equal(result.layer, 'lyr');
			assert.equal(result.filename, 'tile@2x.png');
			assert.equal(result.z, 1);
			assert.equal(result.x, 2);
			assert.equal(result.y, 3);
			assert.equal(result.method, 'HEAD');
			assert.deepEqual(result.headers, {});

			// query string
			result = TileRequest.parse('lyr1/1/2/3/tile@2x.png?query=1&test=2');
			assert.instanceOf(result, TileRequest);
			assert.equal(result.layer, 'lyr1');
			assert.equal(result.filename, 'tile@2x.png');
			assert.equal(result.z, 1);
			assert.equal(result.x, 2);
			assert.equal(result.y, 3);
			assert.equal(result.method, 'HEAD');
			assert.deepEqual(result.headers, {});

			// headers
			result = TileRequest.parse('lyr1/1/2/3/tile@2x.png?query=1&test=2', {'x-tilestrata-skipcache': '1'});
			assert.instanceOf(result, TileRequest);
			assert.deepEqual(result.headers, {'x-tilestrata-skipcache': '1'});

			// method
			result = TileRequest.parse('lyr1/1/2/3/tile@2x.png?query=1&test=2', {'x-tilestrata-skipcache': '1'}, 'GET');
			assert.instanceOf(result, TileRequest);
			assert.equal(result.method, 'GET');
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
	describe('clone()', function() {
		it('should return different, but identical, instance', function() {
			var original = TileRequest.parse('lyr1/1/2/3/tile@2x.png?query=1&test=2', {'x-tilestrata-skipcache': '1'}, 'GET');

			var clone = original.clone();
			assert.instanceOf(clone, TileRequest);
			assert.notEqual(clone, original);
			assert.equal(clone.layer, 'lyr1');
			assert.equal(clone.method, 'GET');
			assert.equal(clone.filename, 'tile@2x.png');
			assert.equal(clone.z, 1),
			assert.equal(clone.x, 2),
			assert.equal(clone.y, 3),

			assert.notEqual(clone.headers, original.headers);
			assert.deepEqual(clone.headers, {'x-tilestrata-skipcache': '1'});
		});
	});
});