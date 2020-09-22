var http = require('http');
var async = require('async');
var assert = require('chai').assert;
var fs = require('fs');
var TileServer = require('../lib/TileServer.js');
var TileRequest = require('../lib/TileRequest.js');

describe('profiling', function() {
	it('should operate normally', function(done) {
		this.timeout(5000);
		var server = new TileServer();
		var i = 0;

		var reqs = [
			{
				url: '/mylayer/3/2/1/tile.txt',
				reqhook   : [20, []],
				cacheget  : [20, [new Error('err')]],
				provider  : [20, [null, Buffer.alloc(100), {}]],
				transform : [20, [null, Buffer.alloc(200), {}]],
				cacheset  : [20, []],
				reshook   : [20, []]
			},
			{
				url: '/mylayer/3/2/1/tile.txt',
				reqhook   : [30, []],
				cacheget  : [30, [new Error('err')]],
				provider  : [550, [null, Buffer.alloc(500), {}]],
				transform : [1100, [null, Buffer.alloc(300), {}]],
				cacheset  : [30, []],
				reshook   : [30, []]
			},
			{
				url: '/mylayer/3/2/1/tile.txt',
				reqhook   : [40, []],
				cacheget  : [40, [null, Buffer.alloc(100), {}]],
				provider  : null,
				transform : null,
				cacheset  : null,
				reshook   : [40, []]
			},
			{
				url: '/mylayer2/8/2/1/tile.txt',
				reqhook   : [40, []],
				cacheget  : [40, [null, Buffer.alloc(100), {}]],
				provider  : null,
				transform : null,
				cacheset  : null,
				reshook   : [40, []]
			},
			{
				url: '/mylayer2/8/2/1/tile2.txt',
				reqhook   : [40, []],
				cacheget  : [40, [null, Buffer.alloc(100), {}]],
				provider  : null,
				transform : null,
				cacheset  : null,
				reshook   : [40, []]
			}
		];

		function _call(type, req, args) {
			if (typeof req.__testindex === 'undefined') {
				req.__testindex = i++;
			}
			var cb = args[args.length - 1];
			setTimeout(function() {
				cb.apply(null, reqs[req.__testindex][type][1]);
			}, reqs[req.__testindex][type][0]);
		}


		var plugins = [
			{name: 'plugin-a', reqhook: function(server, tile, callback) { _call('reqhook', tile, arguments); }},
			{name: 'plugin-b', serve: function(server, tile, callback) { _call('provider', tile, arguments); }},
			{transform: function(server, tile, buffer, headers, callback) { _call('transform', tile, arguments); }},
			{name: 'plugin-d', reshook: function(server, tile, req, res, result, callback) { _call('reshook', tile, arguments); }},
			{
				name: 'plugin-e',
				get: function(server, tile, callback) { _call('cacheget', tile, arguments); },
				set: function(server, tile, buffer, headers, callback) { _call('cacheset', tile, arguments); }
			}
		];

		server.layer('mylayer').route('tile.txt').use(plugins);
		server.layer('mylayer2').route('tile.txt').use(plugins);
		server.layer('mylayer2').route('tile2.txt').use(plugins);

		server.listen(8880, function(err) {
			if (err) throw err;

			async.eachSeries(reqs, function(req, callback) {
				var req = TileRequest.parse(req.url);
				server.serve(req, {}, function(status) {
					if (status !== 200) throw new Error('Received ' + status + ' for ' + req.url);
					callback();
				});
			}, function() {
				async.parallel([
					function checkHTML(callback) {
						http.get('http://localhost:8880/profile', function(res) {
							var body = '';
							res.on('data', function(data) { body += data; });
							res.on('end', function() {
								assert.equal(res.statusCode, 200);
								assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
								console.log('\nVERIFY HTML VISUALLY:');
								console.log('./test/profile.html');
								fs.writeFileSync(__dirname + '/profile.html', body);
								callback();
							});
						});
					},
					function checkJSON(callback) {
						http.get('http://localhost:8880/profile?format=json', function(res) {
							var body = '';
							res.on('data', function(data) { body += data; });
							res.on('end', function() {
								assert.equal(res.statusCode, 200);
								assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
								// TODO: check w/tolerance
								console.log('\nVERIFY JSON VISUALLY:');
								console.log(body);
								fs.writeFileSync(__dirname + '/profile.json', body);
								callback();
							});
						});
					}
				], done)
			});
		});
	});
});
