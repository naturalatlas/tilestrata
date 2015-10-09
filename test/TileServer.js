var TileServer = require('../lib/TileServer.js');
var TileLayer = require('../lib/TileLayer.js');
var TileRequest = require('../lib/TileRequest.js');
var assert = require('chai').assert;
var http = require('http');
var os = require('os');
var version = require('../package.json').version;

var HEADER_CACHECONTROL = 'max-age=60';
var HEADER_XPOWEREDBY = 'TileStrata/' + version;
var noop_provider = {
	serve: function(server, req, callback) {
		callback(null, new Buffer(''), {});
	}
};

describe('TileServer', function() {
	it('should set "options" property', function() {
		var opts = {};
		var server = new TileServer(opts);
		assert.equal(server.options, opts);
	});
	it('should set "options" property by default', function() {
		var server = new TileServer();
		assert.deepEqual(server.options, {});
	});
	it('should have "version" property', function() {
		var server = new TileServer();
		var pkg = require('../package.json');
		assert.equal(server.version, pkg.version);
	});
	describe('uptime()', function() {
		it('should return null if the server hasn\'t started', function() {
			var server = new TileServer();
			assert.isNull(server.uptime());
		});
		it('should return object with duration and start', function(done) {
			var server = new TileServer();
			var httpserver = server.listen(8888, function(err) {
				if (err) throw err;
				var uptime = server.uptime();
				assert.isObject(uptime);
				assert.isNumber(uptime.start);
				assert.isNumber(uptime.duration);
				httpserver.close(done);
			});
		});
	});
	describe('layer()', function() {
		it('should operate normally', function() {
			var server = new TileServer();
			var opts = {};
			var layer = server.layer('mylayer', opts);
			assert.deepEqual(Object.keys(server.layers), ['mylayer']);
			assert.equal(server.layers['mylayer'], layer);
			assert.equal(layer.options, opts);
		});
		it('should return existing layer if already exists', function() {
			var server = new TileServer();
			var layer = server.layer('mylayer');
			assert.equal(server.layer('mylayer'), layer);
		});
		it('should throw error when layer missing name', function() {
			var server = new TileServer();
			assert.throws(function() {
				server.layer();
			}, /The layer must be given name/);
		});
		it('should add layer() method alias to layer (for chaining)', function() {
			var server = new TileServer();
			var layer = server.layer('mylayer');
			assert.equal(layer.layer('mylayer'), layer);
		});
	});
	describe('serve()', function() {
		it('should invoke request, response hooks', function(done) {
			var reqhook1_called = 0;
			var reqhook2_called = 0;
			var reshook1_called = 0;
			var reshook2_called = 0;
			var mockRes = {};
			var mockReq = {method: 'GET', url: '/layer/1/2/3/tile.png', headers: {}};
			var tile = TileRequest.parse(mockReq.url);

			var server = new TileServer();
			var layer = server.layer('layer');

			layer.route('tile.png')
				.use({
					serve: function(_server, _req, callback) {
						assert.equal(_server, server);
						assert.instanceOf(_req, TileRequest);
						assert.equal(_req.filename, 'tile.png');
						callback(null, new Buffer('response', 'utf8'), {'X-Test': 'hello'});
					}
				})
				.use({reqhook: function(_server, _tile, _req, _res, callback) {
					reqhook1_called++;
					assert.equal(_server, server);
					assert.instanceOf(_tile, TileRequest);
					assert.equal(_req, mockReq);
					assert.equal(_res, mockRes);
					callback();
				}})
				.use({reqhook: function(_server, _tile, _req, _res, callback) {
					reqhook2_called++;
					assert.equal(_server, server);
					assert.instanceOf(_tile, TileRequest);
					assert.equal(_req, mockReq);
					assert.equal(_res, mockRes);
					callback();
				}})
				.use({reshook: function(_server, _tile, _req, _res, _result, callback) {
					reshook1_called++;
					assert.equal(_server, server);
					assert.instanceOf(_tile, TileRequest);
					assert.equal(_req, mockReq);
					assert.equal(_res, mockRes);
					_result.headers['X-Res-Hook-1'] = '1';
					callback();
				}})
				.use({reshook: function(_server, _tile, _req, _res, _result, callback) {
					reshook2_called++;
					assert.equal(_server, server);
					assert.instanceOf(_tile, TileRequest);
					assert.equal(_req, mockReq);
					assert.equal(_res, mockRes);
					assert.instanceOf(_result.buffer, Buffer);
					assert.deepEqual(_result.headers, {
						'X-Powered-By': HEADER_XPOWEREDBY,
						'X-Test': 'hello',
						'X-Res-Hook-1': '1',
						'Cache-Control': HEADER_CACHECONTROL
					});
					_result.headers['X-Res-Hook-2'] = '1';
					_result.buffer = new Buffer(_result.buffer.toString('utf8') + '-modified');
					callback();
				}});

			var http = {req: mockReq, res: mockRes};
			server.serve(tile, http, function(status, buffer, headers) {
				assert.equal(reqhook1_called, 1, 'Request hook 1 called');
				assert.equal(reqhook2_called, 1, 'Request hook 2 called');
				assert.equal(reshook1_called, 1, 'Response hook 1 called');
				assert.equal(reshook2_called, 1, 'Response hook 2 called');

				assert.equal(status, 200, '200 OK');
				assert.equal(buffer.toString('utf8'), 'response-modified');
				assert.deepEqual(headers, {
					'X-Powered-By': HEADER_XPOWEREDBY,
					'X-Test': 'hello',
					'X-Res-Hook-1': '1',
					'X-Res-Hook-2': '1',
					'Content-Length': 17,
					'Cache-Control': HEADER_CACHECONTROL
				});

				done();
			});
		});
		it('should return a 404 status if route not parseable', function(done) {
			var server = new TileServer();
			var req = TileRequest.parse('/index.html', {}, 'GET');
			server.serve(req, false, function(status, buffer, headers) {
				assert.equal(status, 404);
				assert.equal(buffer.toString('utf8'), 'Not found');
				assert.deepEqual(headers, {});
				done();
			});
		});
		it('should return a 404 status is request outside of minZoom', function(done) {
			var server = new TileServer();
			server.layer('layer', {minZoom: 10}).route('tile.png').use(noop_provider);

			var req = TileRequest.parse('/layer/9/781/1469/tile.png', {}, 'GET');
			server.serve(req, false, function(status, buffer, headers) {
				assert.equal(status, 404);
				assert.equal(buffer.toString('utf8'), 'Not found');
				done();
			});
		});
		it('should return a 404 status is request outside of maxZoom', function(done) {
			var server = new TileServer();
			server.layer('layer', {maxZoom: 10}).route('tile.png').use(noop_provider);

			var req = TileRequest.parse('/layer/11/781/1469/tile.png', {}, 'GET');
			server.serve(req, false, function(status, buffer, headers) {
				assert.equal(status, 404);
				assert.equal(buffer.toString('utf8'), 'Not found');
				done();
			});
		});
		it('should return a 200 status is request inside of minZoom,maxZoom', function(done) {
			var server = new TileServer();
			server.layer('layer', {minZoom: 10, maxZoom: 10}).route('tile.png').use(noop_provider);

			var req = TileRequest.parse('/layer/10/781/1469/tile.png', {}, 'GET');
			server.serve(req, false, function(status, buffer, headers) {
				assert.equal(status, 200);
				done();
			});
		});
		it('should return a 404 status is request outside of layer bbox', function(done) {
			var valid_bbox = [
				-111.37390136718749,
				45.3297027614069,
				-111.11228942871094,
				45.47746617959318
			];
			var server = new TileServer();
			server.layer('layer', {bbox: valid_bbox}).route('tile.png').use(noop_provider);

			var tile_outside = '12/781/1469';
			var req = TileRequest.parse('/layer/' + tile_outside + '/tile.png', {}, 'GET');
			server.serve(req, false, function(status, buffer, headers) {
				assert.equal(status, 404);
				assert.equal(buffer.toString('utf8'), 'Not found');
				done();
			});
		});
		it('should return a 404 status is request outside of layer bboxes', function(done) {
			var valid_bbox = [[1,1,-1,1],[
				-111.37390136718749,
				45.3297027614069,
				-111.11228942871094,
				45.47746617959318
			]];
			var server = new TileServer();
			server.layer('layer', {bbox: valid_bbox}).route('tile.png').use(noop_provider);

			var tile_outside = '12/781/1469';
			var req = TileRequest.parse('/layer/' + tile_outside + '/tile.png', {}, 'GET');
			server.serve(req, false, function(status, buffer, headers) {
				assert.equal(status, 404);
				assert.equal(buffer.toString('utf8'), 'Not found');
				done();
			});
		});
		it('should return a 200 status is request inside of layer bbox', function(done) {
			var valid_bbox = [
				-111.37390136718749,
				45.3297027614069,
				-111.11228942871094,
				45.47746617959318
			];
			var server = new TileServer();
			server.layer('layer', {bbox: valid_bbox}).route('tile.png').use({
				serve: function(server, req, callback) {
					callback(null, new Buffer('Valid'), {});
				}
			});

			var tile_inside = '14/3129/5867';
			var req = TileRequest.parse('/layer/' + tile_inside + '/tile.png', {}, 'GET');
			server.serve(req, false, function(status, buffer, headers) {
				assert.equal(status, 200);
				assert.equal(buffer.toString('utf8'), 'Valid');
				done();
			});
		});
		it('should return a 200 status is request inside of layer bboxes', function(done) {
			var valid_bbox = [[1,1,-1,1],[
				-111.37390136718749,
				45.3297027614069,
				-111.11228942871094,
				45.47746617959318
			]];
			var server = new TileServer();
			server.layer('layer', {bbox: valid_bbox}).route('tile.png').use({
				serve: function(server, req, callback) {
					callback(null, new Buffer('Valid'), {});
				}
			});

			var tile_inside = '14/3129/5867';
			var req = TileRequest.parse('/layer/' + tile_inside + '/tile.png', {}, 'GET');
			server.serve(req, false, function(status, buffer, headers) {
				assert.equal(status, 200);
				assert.equal(buffer.toString('utf8'), 'Valid');
				done();
			});
		});
		it('should return a 404 status if no handlers found', function(done) {
			var server = new TileServer();
			var req = TileRequest.parse('/layer/1/2/3/tile.png', {}, 'GET');
			server.serve(req, false, function(status, buffer, headers) {
				assert.equal(status, 404);
				assert.equal(buffer.toString('utf8'), 'Not found');
				assert.deepEqual(headers, {
					'X-Powered-By': HEADER_XPOWEREDBY,
					'Content-Length': 9
				});
				done();
			});
		});
		it('should return a 501 status if no methods match', function(done) {
			var server = new TileServer();
			server.layer('layer').route('tile.png');
			var req = TileRequest.parse('/layer/1/2/3/tile.png', {}, 'INVALID');
			server.serve(req, false, function(status, buffer, headers) {
				assert.equal(status, 501);
				assert.equal(buffer.toString('utf8'), 'Not implemented');
				assert.deepEqual(headers, {
					'X-Powered-By': HEADER_XPOWEREDBY,
					'Content-Length': 15
				});
				done();
			});
		});
		it('should pass through headers to handler', function(done) {
			var server = new TileServer();
			server.layer('layer').route('tile.png').use({
				serve: function(_server, _req, callback) {
					assert.deepEqual(_req.headers, {'x-tilestrata-skipcache':'1'});
					callback(null, new Buffer('response', 'utf8'), {'X-Test': 'hello'});
				}
			});
			var req = TileRequest.parse('/layer/1/2/3/tile.png', {'x-tilestrata-skipcache':'1'}, 'GET');
			server.serve(req, false, function(status, buffer, headers) {
				done();
			});
		});
		it('should return a 200 status if layer handler succeeds', function(done) {
			var server = new TileServer();
			server.layer('layer').route('tile.png').use({
				serve: function(_server, _req, callback) {
					assert.equal(_server, server);
					assert.instanceOf(_req, TileRequest);
					assert.equal(_req.filename, 'tile.png');
					callback(null, new Buffer('response', 'utf8'), {'X-Test': 'hello'});
				}
			});

			var req = TileRequest.parse('/layer/1/2/3/tile.png', {}, 'GET');
			server.serve(req, false, function(status, buffer, headers) {
				assert.equal(status, 200);
				assert.equal(buffer.toString('utf8'), 'response');
				assert.deepEqual(headers, {
					'X-Powered-By': HEADER_XPOWEREDBY,
					'X-Test': 'hello',
					'Content-Length': 8,
					'Cache-Control': HEADER_CACHECONTROL
				});
				done();
			});
		});
		it('should return a 500 status if a hook fails', function(done) {
			var server = new TileServer();
			server.layer('layer').route('tile.png')
				.use({
					serve: function(_server, _req, callback) {
						callback(null, new Buffer('response', 'utf8'), {'X-Test': 'hello'});
					}
				})
				.use({
					reshook: function(server, tile, req, res, result, callback) {
						callback(new Error('The hook failed'));
					}
				});

			var req = TileRequest.parse('/layer/1/2/3/tile.png', {}, 'GET');
			server.serve(req, {req: {}, res: {}}, function(status, buffer, headers) {
				assert.equal(status, 500);
				assert.equal(buffer.toString('utf8'), 'The hook failed');
				assert.deepEqual(headers, {
					'X-Powered-By': HEADER_XPOWEREDBY,
					'Content-Length': buffer.length,
					'Cache-Control': 'no-cache, no-store, must-revalidate',
					'Expires': '0',
					'Pragma': 'no-cache'
				});
				done();
			});
		});
		it('should return a 500 status if layer handler fails', function(done) {
			var server = new TileServer();
			server.layer('layer').route('tile.png').use({
				serve: function(_server, _req, callback) {
					callback(new Error('Something went wrong'));
				}
			});
			var req = TileRequest.parse('/layer/1/2/3/tile.png', {}, 'GET');
			server.serve(req, false, function(status, buffer, headers) {
				assert.equal(status, 500);
				assert.equal(buffer.toString('utf8'), 'Something went wrong');
				assert.deepEqual(headers, {
					'X-Powered-By': HEADER_XPOWEREDBY,
					'Content-Length': buffer.length
				});
				done();
			});
		});
		it('should omit body if a HEAD request', function(done) {
			var server = new TileServer();
			server.layer('layer').route('tile.png').use({
				serve: function(_server, _req, callback) {
					assert.equal(_server, server);
					assert.instanceOf(_req, TileRequest);
					assert.equal(_req.filename, 'tile.png');
					callback(null, new Buffer('response', 'utf8'), {'X-Test': 'hello'});
				}
			});

			var req = TileRequest.parse('/layer/1/2/3/tile.png', {}, 'HEAD');
			server.serve(req, false, function(status, buffer, headers) {
				assert.equal(status, 200);
				assert.equal(buffer.toString('utf8'), '');
				assert.deepEqual(headers, {
					'X-Powered-By': HEADER_XPOWEREDBY,
					'X-Test': 'hello',
					'Content-Length': 8,
					'Cache-Control': HEADER_CACHECONTROL
				});
				done();
			});
		});
	});
	describe('getTile()', function() {
		it('should return error if tile unavailable', function(done) {
			var _served = false;
			var server = new TileServer();
			var layer = server.layer('layer').route('tile.png').use({
				serve: function(_server, _req, callback) {
					_served = true;
					assert.equal(_req.x, 2);
					assert.equal(_req.y, 3);
					assert.equal(_req.z, 1);
					callback(new Error('It didn\'t work'));
				}
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
			server.layer('layer').route('tile.png').use({
				serve: function(_server, _req, callback) {
					_served = true;
					assert.equal(_req.x, 2);
					assert.equal(_req.y, 3);
					assert.equal(_req.z, 1);
					callback(null, new Buffer('result', 'utf8'), {'X-Test': 'hello'});
				}
			});

			server.getTile('layer', 'tile.png', 2, 3, 1, function(err, buffer, headers) {
				assert.isTrue(_served);
				assert.isNull(err);
				assert.instanceOf(buffer, Buffer);
				assert.equal(buffer.toString('utf8'), 'result');
				assert.deepEqual(headers, {
					'X-Powered-By': HEADER_XPOWEREDBY,
					'X-Test': 'hello',
					'Content-Length': 6,
					'Cache-Control': HEADER_CACHECONTROL
				});
				done();
			});
		});
	});
	describe('initialize()', function() {
		it('should initialize each layer provider', function(done) {
			var _layer1_provider1 = false;
			var _layer1_provider2 = false;
			var _layer2_provider1 = false;

			var server = new TileServer();

			server.layer('layer1')
				.route('tile.png').use({
					init: function(_server, callback) {
						_layer1_provider1 = true;
						assert.equal(_server, server);
						callback();
					},
					serve: function() {}
				})
				.route('tile2.png').use({
					init: function(_server, callback) {
						_layer1_provider2 = true;
						assert.equal(_server, server);
						callback();
					},
					serve: function() {}
				});

			server.layer('layer2')
				.route('tile.png').use({
					init: function(_server, callback) {
						_layer2_provider1 = true;
						assert.equal(_server, server);
						callback();
					},
					serve: function() {}
				})
				.route('tile2.png').use({
					serve: function() {}
				});

			server.initialize(function(err) {
				assert.isFalse(!!err);
				assert.isTrue(_layer1_provider1);
				assert.isTrue(_layer1_provider2);
				assert.isTrue(_layer2_provider1);
				done();
			});
		});
		it('should initialize each layer transform', function(done) {
			var _layer1_transform1 = false;
			var _layer1_transform2 = false;
			var _layer2_transform1 = false;

			var server = new TileServer();
			server.layer('layer1')
				.route('tile.png')
					.use({serve: function() {}})
					.use({
						init: function(_server, callback) {
							_layer1_transform1 = true;
							assert.equal(_server, server);
							callback();
						},
						transform: function() {}
					})
				.route('tile2.png')
					.use({serve: function() {}})
					.use({
						init: function(_server, callback) {
							_layer1_transform2 = true;
							assert.equal(_server, server);
							callback();
						},
						transform: function() {}
					});

			server.layer('layer2')
				.route('tile.png')
					.use({serve: function() {}})
					.use({
						init: function(_server, callback) {
							_layer2_transform1 = true;
							assert.equal(_server, server);
							callback();
						},
						transform: function() {}
					})
				.route('tile2.png')
					.use({serve: function() {}});

			server.initialize(function(err) {
				assert.isFalse(!!err);
				assert.isTrue(_layer1_transform1);
				assert.isTrue(_layer1_transform2);
				assert.isTrue(_layer2_transform1);
				done();
			});
		});
		it('should initialize each layer cache', function(done) {
			var _layer1_cache1 = false;
			var _layer1_cache2 = false;
			var _layer2_cache1 = false;

			var server = new TileServer();
			server.layer('layer1')
				.route('tile.png')
					.use({serve: function() {}})
					.use({
						init: function(_server, callback) {
							_layer1_cache1 = true;
							assert.equal(_server, server);
							callback();
						},
						get: function() {},
						set: function() {}
					})
				.route('tile2.png')
					.use({serve: function() {}})
					.use({
						init: function(_server, callback) {
							_layer1_cache2 = true;
							assert.equal(_server, server);
							callback();
						},
						get: function() {},
						set: function() {}
					});

			server.layer('layer2')
				.route('tile.png')
					.use({serve: function() {}})
					.use({
						init: function(_server, callback) {
							_layer2_cache1 = true;
							assert.equal(_server, server);
							callback();
						},
						get: function() {},
						set: function() {}
					})
				.route('tile2.png')
					.use({serve: function() {}});

			server.initialize(function(err) {
				assert.isFalse(!!err);
				assert.isTrue(_layer1_cache1);
				assert.isTrue(_layer1_cache2);
				assert.isTrue(_layer2_cache1);
				done();
			});
		});
	});
	describe('listen()', function() {
		it('should start server on specified port', function(done) {
			var server = new TileServer();

			server.layer('mylayer').route('tile.txt').use({serve: function(server, req, callback) {
				var message = 'hello x: ' + req.x + ' y: ' + req.y + ' z: ' + req.z;
				callback(null, new Buffer(message, 'utf8'), {
					'Content-Type': 'text/plain',
					'X-Header': 'test'
				})
			}});

			var result = server.listen(8889, function(err) {
				if (err) throw err;
				http.get('http://localhost:8889/mylayer/3/2/1/tile.txt', function(res) {
					var body = '';
					res.on('data', function(data) { body += data; });
					res.on('end', function() {
						assert.equal(res.statusCode, 200);
						assert.equal(body, 'hello x: 2 y: 1 z: 3');
						assert.equal(res.headers['content-type'], 'text/plain');
						assert.equal(res.headers['content-length'], 'hello x: 2 y: 1 z: 3'.length);
						assert.equal(res.headers['x-header'], 'test');
						assert.equal(res.headers['x-powered-by'], HEADER_XPOWEREDBY);
						done();
					});
				});
			});

			assert.instanceOf(result, http.Server);
		});
		describe('/robots.txt', function() {
			it('should disallow indexing', function(done) {
				var server = new TileServer();

				server.listen(8887, function(err) {
					if (err) throw err;
					http.get('http://localhost:8887/robots.txt', function(res) {
						var body = '';
						res.on('data', function(data) { body += data; });
						res.on('end', function() {
							assert.equal(res.statusCode, 200);
							var expected = 'User-agent: *\nDisallow: /\n';
							assert.equal(body, expected);
							assert.equal(res.headers['content-type'], 'text/plain');
							assert.equal(res.headers['content-length'], expected.length);
							done();
						});
					});
				});
			});
		});
		describe('/health', function() {
			var pkg = require('../package.json');
			it('should return a 200 OK normally', function(done) {
				var server = new TileServer();
				server.listen(8888, function(err) {
					if (err) throw err;
					http.get('http://localhost:8888/health', function(res) {
						var body = '';
						res.on('data', function(data) { body += data; });
						res.on('end', function() {
							assert.equal(res.statusCode, 200);
							var expected = {ok: true, version: pkg.version, host: os.hostname()};
							var parsedBody = JSON.parse(body);
							assert.match(parsedBody.uptime, /^\d+(\.\d+)? seconds$/);
							delete parsedBody.uptime;
							assert.deepEqual(parsedBody, expected);
							assert.equal(res.headers['content-type'], 'application/json');
							server.close(done);
						});
					});
				});
			});
			it('should include data from "healthy" user function if set', function(done) {
				var server = new TileServer({
					healthy: function(callback) {
						return callback(null, {'host': '(overridden)', 'commit': 000000, 'message': '"Hello"'});
					}
				});
				server.listen(8888, function(err) {
					if (err) throw err;
					http.get('http://localhost:8888/health', function(res) {
						var body = '';
						res.on('data', function(data) { body += data; });
						res.on('end', function() {
							var parsedBody = JSON.parse(body);
							delete parsedBody.uptime;
							assert.equal(res.statusCode, 200);
							assert.deepEqual(parsedBody, {
								ok: true,
								version: pkg.version,
								host: '(overridden)',
								commit: 000000,
								message: '"Hello"'
							});
							server.close(done);
						});
					});
				});
			});
			it('should return 500 if "healthy" user function returns an error', function(done) {
				var now = Date.now();
				var server = new TileServer({
					healthy: function(callback) {
						callback(new Error('CPU usage too high'))
					}
				});
				server.listen(8888, function(err) {
					if (err) throw err;
					http.get('http://localhost:8888/health', function(res) {
						var body = '';
						res.on('data', function(data) { body += data; });
						res.on('end', function() {
							var parsedBody = JSON.parse(body);
							delete parsedBody.uptime;
							assert.equal(res.statusCode, 500);
							assert.deepEqual(parsedBody, {
								ok: false,
								version: pkg.version,
								host: os.hostname(),
								message: 'CPU usage too high'
							});
							server.close(done);
						});
					});
				});
			});
			it('should not expose hostname if TILESTRATA_HIDEHOSTNAME=1', function(done) {
				process.env.TILESTRATA_HIDEHOSTNAME = '1';
				var server = new TileServer();
				server.listen(8888, function(err) {
					if (err) throw err;
					http.get('http://localhost:8888/health', function(res) {
						var body = '';
						res.on('data', function(data) { body += data; });
						res.on('end', function() {
							assert.equal(res.statusCode, 200);
							var expected = {ok: true, version: pkg.version, host: '(hidden)'};
							var parsedBody = JSON.parse(body);
							delete parsedBody.uptime;
							assert.deepEqual(parsedBody, expected);
							server.close(done);
						});
					});
				});
			});
		});
	});
});
