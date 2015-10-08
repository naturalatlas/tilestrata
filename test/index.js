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
	it('should be a function that returns a TileServer instance w/options', function() {
		var opts = {};
		var result = tilestrata(opts);
		assert.instanceOf(result, TileServer);
		assert.equal(result.options, opts);
	});
	describe('middleware()', function() {
		function testMiddleware(middleware, requrl, expect_next, expected_details, callback) {
			var next = function(err) {
				if (err) throw err;
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
					assert.isTrue(_writeHead_called, 'writeHead called by end');
					assert.isTrue(_write_called, 'write called by end');
					callback();
				}
			};

			middleware(httpReq, httpRes, next);
		}

		it('should return 200 for /health', function(done) {
			var server = new TileServer();
			var middleware = tilestrata.middleware({server: server, prefix: '/tiles'});
			var expected_headers = {'Content-Type': 'application/json', 'Content-Length': 47};
			var expected_body = JSON.stringify({ok: true, version: version, host: '(hidden)'});
			process.env.TILESTRATA_HIDEHOSTNAME = '1';
			testMiddleware(middleware, '/tiles/health', false, {status: 200, headers: expected_headers, buffer: new Buffer(expected_body, 'utf8')}, done);
		});

		it('should return 200 when tile matches', function(done) {
			var reqhook_called = false;
			var reshook_called = false;

			var expected_headers = {
				'X-Test':'1',
				'X-Powered-By': 'TileStrata/' + version,
				'Content-Length': 4,
				'Cache-Control': 'max-age=60'
			};

			var server = new TileServer();
			server.layer('basemap').route('file.txt')
				.use({
					reqhook: function(_server, _tile, _req, _res, callback) {
						reqhook_called = true;
						assert.equal(_server, server);
						assert.instanceOf(_tile, TileRequest);
						assert.equal(_req.url, '/basemap/3/2/1/file.txt');
						assert.isFunction(_res.writeHead);
						callback();
					}
				})
				.use({
					reshook: function(_server, _tile, _req, _res, _result, callback) {
						reshook_called = true;
						assert.equal(_server, server);
						assert.deepEqual(_result.headers, {
							'X-Test':'1',
							'X-Powered-By': 'TileStrata/' + version,
							'Cache-Control': 'max-age=60'
						});
						assert.instanceOf(_result.buffer, Buffer);
						assert.instanceOf(_tile, TileRequest);
						assert.equal(_req.url, '/basemap/3/2/1/file.txt');
						assert.isFunction(_res.writeHead);
						callback();
					}
				})
				.use({serve: function(server, req, callback) {
					callback(null, new Buffer('tile', 'utf8'), {'X-Test':'1'});
				}});

			var middleware = tilestrata.middleware({server: server, prefix: '/tiles'});
			testMiddleware(middleware, '/tiles/basemap/3/2/1/file.txt', false, {status: 200, headers: expected_headers, buffer: new Buffer('tile', 'utf8')}, function() {
				assert.isTrue(reqhook_called, 'Request hook called');
				assert.isTrue(reshook_called, 'Response hook called');
				done();
			});
		});
		it('should should initialize plugins', function(done) {
			var reqhook_called = false;
			var reshook_called = false;

			var expected_headers = {
				'X-Powered-By': 'TileStrata/' + version,
				'Content-Length': 4,
				'Cache-Control': 'max-age=60'
			};

			var initCalled = false;

			var server = new TileServer();
			server.layer('basemap').route('file.txt')
				.use({
					init: function(server, callback) {
						setTimeout(function() {
							initCalled = true;
							callback();
						}, 100);
					},
					serve: function(server, req, callback) {
						callback(null, new Buffer(String(initCalled), 'utf8'), {});
					}
				});

			var middleware = tilestrata.middleware({server: server, prefix: '/tiles'});
			testMiddleware(middleware, '/tiles/basemap/3/2/1/file.txt', false, {
				status: 200,
				headers: expected_headers,
				buffer: new Buffer('true', 'utf8')
			}, function() {
				done();
			});
		});
		it('should call next() when route url doesn\'t match', function(done) {
			var server = new TileServer();
			server.layer('basemap').route('file.txt').use({serve: function(server, req, callback) {
				callback(null, new Buffer('tile', 'utf8'), {'X-Test':'1'});
			}});
			var middleware = tilestrata.middleware({server: server, prefix: '/tiles'});
			testMiddleware(middleware, '/basemap/3/2/1/file.txt', true, null, done);
		});
	});
});
