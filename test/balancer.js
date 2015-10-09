var http = require('http');
var async = require('async');
var assert = require('chai').assert;
var version = require('../package.json').version;
var tilestrata = require('../index.js');
var noop = function() {};
var balancer, strata;

describe('TileStrata Balancer integration', function() {
	afterEach(function(done) {
		async.parallel([
			function(callback) { if (balancer) { balancer.close(callback); } else { callback(); }},
			function(callback) { if (strata) { strata.close(callback); } else { callback(); }}
		], function(err) { done(); });
	});

	it('should call DELETE /nodes/:id on close()', function(done) {
		var server_uuid = null;
		var registered = false;
		var deleted = false;
		async.series([
			function setupBalancer(callback) {
				balancer = http.createServer(function(req, res) {
					var body = '';
					req.on('data', function (data) { body += data; });
					req.on('end', function () {
						if (req.method === 'POST' && req.url === '/nodes') {
							var data = JSON.parse(body);
							registered = true;
							server_uuid = data.id;
							res.writeHead(201, {'Content-Type': 'application/json'});
							res.end('{"check_interval": 1000, "token": "a"}');
						} else if (req.method === 'DELETE' && /\/nodes\/.+/.test(req.url)) {
							var id = req.url.substring('/nodes/'.length);
							assert.isTrue(registered, 'Registered earlier');
							assert.equal(id, server_uuid);
							deleted = true;
							res.writeHead(200, {'Content-Type': 'application/json'})
							res.end('{}');
						} else {
							throw new Error('Unexpected method/URL');
						}

					});
				});
				balancer.listen(8891, callback);
			},
			function setupTileStrata(callback) {
				strata = tilestrata({
					balancer: {
						node_weight: 5,
						register_mindelay: 10,
						register_maxdelay: 10,
						register_timeout: 100,
						host: '127.0.0.1:8891'
					}
				});
				strata.listen(8892, callback);
			},
			function closeServer(callback) {
				setTimeout(function() {
					assert.isTrue(registered, 'Should have registered by now');
					strata.close(callback);
				}, 100);
			}
		], function(err) {
			if (err) throw err;
			assert.isTrue(deleted);
			strata = null;
			done();
		});
	});

	it('should POST to /nodes until "201 Created" received', function(done) {
		this.timeout(1000);
		var calls = 0;

		async.series([
			function setupBalancer(callback) {
				balancer = http.createServer(function(req, res) {
					var i = ++calls;
					if (i <= 2) return; // timeout for two requests
					assert.equal(req.method, 'POST');
					assert.equal(req.url, '/nodes');
					assert.equal(req.headers['content-type'], 'application/json');

					var body = '';
					req.on('data', function (data) { body += data; });
					req.on('end', function () {
						var parsedBody = JSON.parse(body);

						// unique server identifier
						assert.match(parsedBody.id, /[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}/);
						delete parsedBody.id;

						assert.deepEqual(parsedBody, {
							version: version,
							listen_port: 8892,
							node_weight: 5,
							layers: [
								{name: 'layera', routes: ['tile.a'], options: {minZoom: 1, maxZoom: 3, bbox: [-117.243,36.9924,-102.042,49.0014]}},
								{name: 'layerb', routes: ['tile.b'], options: {}},
							]
						});

						if (i <= 4) { // error for two requests
							res.writeHead(500, {});
							return res.end('err');
						}

						if (i >= 6) throw new Error('Called /nodes too many times');
						res.writeHead(201, {'Content-Type': 'application/json'})
						res.end('{"check_interval": 1000, "token": "a"}');

						// finish up the test
						setTimeout(done, 200);
					});
				});
				balancer.listen(8891, callback);
			},
			function setupTileStrata(callback) {
				strata = tilestrata({
					balancer: {
						node_weight: 5,
						register_mindelay: 10,
						register_maxdelay: 10,
						register_timeout: 100,
						host: '127.0.0.1:8891'
					}
				});
				strata.layer('layera', {minZoom: 1, maxZoom: 3, bbox: [-117.243,36.9924,-102.042,49.0014]})
					.route('tile.a').use({serve: noop});
				strata.layer('layerb', {})
					.route('tile.b').use({serve: noop});
				strata.listen(8892, callback);
			}
		], function(err) {
			if (err) throw err;
		});
	});

	it('should attempt to re-register if /health pings from balancer stop', function(done) {
		var check_interval = 10;

		var reregistered = false;
		var initial_establish = false;
		var initial_response = function(req, res) {
			initial_establish = true;
			res.writeHead(201, {'Content-Type': 'application/json'})
			res.end('{"check_interval": ' + check_interval + ', "token": "a"}');
			cur_response = function() { throw new Error('Unexpected call to /nodes'); }
		};

		var cur_response = initial_response;

		async.series([
			function setupBalancer(callback) {
				balancer = http.createServer(function(req, res) {
					cur_response(req, res);
				});
				balancer.listen(8891, callback);
			},
			function setupTileStrata(callback) {
				strata = tilestrata({
					balancer: {
						register_mindelay: 10,
						register_maxdelay: 10,
						register_timeout: 100,
						host: '127.0.0.1:8891'
					}
				});
				strata.listen(8888, callback);
			},
			function checkInitialStatus(callback) {
				http.get({
					hostname: '127.0.0.1',
					port: 8888,
					path: '/health',
					headers: {'X-TileStrataBalancer-Token': 'a'}
				}, function(res) {
					assert.equal(res.statusCode, 200);
					var body = '';
					res.on('data', function(data) { body += data; });
					res.on('end', function() {
						var parsedBody = JSON.parse(body);
						assert.deepEqual(parsedBody.balancer, {status: 'connecting'});
						callback();
					});
				}).on('error', callback);
			},
			function waitForRegistration(callback) {
				var interval = setInterval(function() {
					if (initial_establish) {
						clearInterval(interval);
						return callback();
					}
				}, 10);
			},
			function issueMockHealthChecks(callback) {
				async.timesSeries(5, function(i, callback) {
					http.get({
						hostname: '127.0.0.1',
						port: 8888,
						path: '/health',
						headers: {'X-TileStrataBalancer-Token': 'a'}
					}, function(res) {
						assert.equal(res.statusCode, 200);
						var body = '';
						res.on('data', function(data) { body += data; });
						res.on('end', function() { setTimeout(callback, check_interval); });
					}).on('error', callback);
				}, callback);
			},
			function waitForReRegistration(callback) {
				cur_response = function(req, res) {
					reregistered = true;
					res.writeHead(201, {'Content-Type': 'application/json'})
					res.end('{"check_interval": 1000, "token": "a"}');
					cur_response = function() { throw new Error('Unexpected call to /nodes'); }
				};
				setTimeout(function() {
					assert.isTrue(reregistered, 'Should have re-registered by 4 x check_interval');
					done();
				}, check_interval*4);
			}
		], function(err) {
			if (err) throw err;
		});
	});

	it('should not recognize /health pings w/o proper X-TileStrataBalancer-Token header', function(done) {
		var reconnects = 0;
		var check_interval = 10;

		async.series([
			function setupBalancer(callback) {
				balancer = http.createServer(function(req, res) {
					reconnects++;
					res.writeHead(201, {'Content-Type': 'application/json'})
					res.end('{"check_interval": ' + check_interval + ', "token": "a"}');
				});
				balancer.listen(8891, callback);
			},
			function setupTileStrata(callback) {
				strata = tilestrata({
					balancer: {
						register_mindelay: 10,
						register_maxdelay: 10,
						register_timeout: 100,
						host: '127.0.0.1:8891'
					}
				});
				strata.listen(8888, callback);
			},
			function waitForRegistration(callback) {
				var interval = setInterval(function() {
					if (reconnects > 0) {
						clearInterval(interval);
						return callback();
					}
				}, 10);
			},
			function issueInvalidHealthChecks(callback) {
				async.timesSeries(5, function(i, callback) {
					http.get({
						hostname: '127.0.0.1',
						port: 8888,
						path: '/health',
						headers: {'X-TileStrataBalancer-Token': 'b'}
					}, function(res) {
						assert.equal(res.statusCode, 200);
						var body = '';
						res.on('data', function(data) { body += data; });
						res.on('end', function() { setTimeout(callback, check_interval); });
					}).on('error', callback);
				}, callback);
			},
			function checkReconnects(callback) {
				setTimeout(function() {
					assert.isAbove(reconnects, 2);
					done();
				}, check_interval * 4);
			}
		], function(err) {
			if (err) throw err;
		});
	});
});
