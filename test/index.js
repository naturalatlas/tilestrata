var TileRequest = require('../lib/TileRequest.js');
var TileRequestHandler = require('../lib/TileRequestHandler.js');
var TileServer = require('../lib/TileServer.js');
var TileLayer = require('../lib/TileLayer.js');
var assert = require('chai').assert;
var tilestrata = require('../index.js');
var version = require('../package.json').version;

describe('require("tilestrata")', function() {
	it('should have "TileServer" property', function() {
		assert.equal(tilestrata.TileServer, TileServer);
	});
	it('should have "TileRequest" property', function() {
		assert.equal(tilestrata.TileRequest, TileRequest);
	});
	it('should have "TileRequestHandler" property', function() {
		assert.equal(tilestrata.TileRequestHandler, TileRequestHandler);
	});
	it('should have "TileLayer" property', function() {
		assert.equal(tilestrata.TileLayer, TileLayer);
	});
	describe('createServer()', function() {
		it('should return TileServer instance', function() {
			assert.instanceOf(tilestrata.createServer(), TileServer);
		});
	});
	describe('middleware()', function() {
		function testMiddleware(middleware, requrl, expect_next, expected_details, callback) {
			var next = function(err) {
				assert.isFalse(!!err);
				if (expect_next) callback();
				else throw new Error('Unexpected "next" call');
			};
			var _write_called = false;
			var _writeHead_called = false;

			var httpReq = {url: requrl, method: 'GET'};
			var httpRes = {
				writeHead: function(status, headers) {
					if (expect_next) throw new Error('Unexpected "writeHead" call');
					_writeHead_called = true;
					assert.equal(status, expected_details.status);
					assert.deepEqual(headers, expected_details.headers);
				},
				write: function(buffer) {
					if (expect_next) throw new Error('Unexpected "write" call');
					_write_called = true;
					assert.isTrue(_writeHead_called);
					assert.instanceOf(buffer, Buffer);
					assert.equal(buffer.toString('utf8'), expected_details.buffer.toString('utf8'));
				},
				end: function() {
					if (expect_next) throw new Error('Unexpected "end" call');
					assert.isTrue(_writeHead_called);
					assert.isTrue(_write_called);
					callback();
				}
			};

			middleware(httpReq, httpRes, next);
		};

		it('should return 200 when tile matches', function(done) {
			var reqhook_called = false;
			var reshook_called = false;

			var expected_headers = {
				'X-Test':'1',
				'X-Powered-By': 'TileStrata/' + version,
				'Content-Length': 4,
				'ETag': '"ExgdjMAeOQv2TJ5LDXp58w=="'
			};

			var server = new TileServer();
			server.registerLayer(function(layer) {
				layer.setName('basemap');
				layer.registerRoute('file.txt', function(handler) {
					handler.registerRequestHook({
						hook: function(_server, _tile, _req, _res, callback) {
							reqhook_called = true;
							assert.equal(_server, server);
							assert.instanceOf(_tile, TileRequest);
							assert.equal(_req.url, '/tiles/basemap/3/2/1/file.txt');
							assert.isFunction(_res.writeHead);
							callback();
						}
					});
					handler.registerResponseHook({
						hook: function(_server, _tile, _req, _res, _headers, _buffer, callback) {
							reshook_called = true;
							assert.equal(_server, server);
							assert.deepEqual(_headers, expected_headers);
							assert.instanceOf(_buffer, Buffer);
							assert.instanceOf(_tile, TileRequest);
							assert.equal(_req.url, '/tiles/basemap/3/2/1/file.txt');
							assert.isFunction(_res.writeHead);
							callback();
						}
					});
					handler.registerProvider({serve: function(server, req, callback) {
						callback(null, new Buffer('tile', 'utf8'), {'X-Test':'1'});
					}});
				});
			});
			var middleware = tilestrata.middleware({server: server, prefix: '/tiles'});
			testMiddleware(middleware, '/tiles/basemap/3/2/1/file.txt', false, {status: 200, headers: expected_headers, buffer: new Buffer('tile', 'utf8')}, function() {
				assert.isTrue(reqhook_called, 'Request hook called');
				assert.isTrue(reshook_called, 'Response hook called');
				done();
			});
		});
		it('should call next() when route url doesn\'t match', function(done) {
			var server = new TileServer();
			server.registerLayer(function(layer) {
				layer.setName('basemap');
				layer.registerRoute('file.txt', function(handler) {
					handler.registerProvider({serve: function(server, req, callback) {
						callback(null, new Buffer('tile', 'utf8'), {'X-Test':'1'});
					}});
				});
			});
			var middleware = tilestrata.middleware({server: server, prefix: '/tiles'});
			testMiddleware(middleware, '/basemap/3/2/1/file.txt', true, null, done);
		});
	});
});