var crypto = require('crypto');
var Benchmark = require('benchmark');
var TileServer = require('../lib/TileServer.js');
var suite = new Benchmark.Suite();
var server, noop = function() {};
console.log('Generating random buffers...');
var buffer_10mb = crypto.randomBytes(1024*1024*10);
var buffer_1mb = crypto.randomBytes(1024*1024);
var buffer_20kb = crypto.randomBytes(1024*20);
console.log('Running TileStrata benchmarks...');

var noop_provider = function(buffer) {
	return {
		serve: function(server, tile, callback) {
			return callback(null, buffer, {'Content-Type': 'application/octet-stream'});
		}
	};
};
var noop_cache = function() {
	return {
		get: function(server, tile, callback) {
			return callback();
		},
		set: function(server, tile, buffer, headers, callback) {
			setTimeout(function() { return callback(); }, 1000);
		}
	};
};
var noop_transform = function() {
	return {
		transform: function(server, tile, buffer, headers, callback) {
			return callback(null, buffer, headers);
		}
	};
};
var noop_reqhook = function() {
	return {
		reqhook: function(server, tile, req, res, callback) {
			return callback();
		}
	};
};
var noop_reshook = function() {
	return {
		reshook: function(server, tile, req, res, result, callback) {
			return callback();
		}
	};
};


var server = new TileServer();
server.layer('mylayer')
	.route('empty.bin')
		.use(noop_reqhook())
		.use(noop_reqhook())
		.use(noop_cache())
		.use(noop_cache())
		.use(noop_provider(new Buffer(0)))
		.use(noop_reshook())
		.use(noop_reshook())
	.route('10mb.bin')
		.use(noop_reqhook())
		.use(noop_reqhook())
		.use(noop_cache())
		.use(noop_cache())
		.use(noop_provider(buffer_10mb))
		.use(noop_reshook())
		.use(noop_reshook())
	.route('1mb.bin')
		.use(noop_reqhook())
		.use(noop_reqhook())
		.use(noop_cache())
		.use(noop_cache())
		.use(noop_provider(buffer_1mb))
		.use(noop_reshook())
		.use(noop_reshook())
	.route('20kb.bin')
		.use(noop_reqhook())
		.use(noop_reqhook())
		.use(noop_cache())
		.use(noop_cache())
		.use(noop_provider(buffer_20kb))
		.use(noop_reshook())
		.use(noop_reshook());

suite.add('Serve 0 byte tile', {
	defer: true,
	fn: function(deferred) {
		var mockReq = {url: '/mylayer/3/2/2/empty.bin', headers: {}};
		var mockRes = {write: noop, writeHead: noop, end: function() { deferred.resolve(); }};
		server._handleRequest(mockReq, mockRes, function() {
			throw new Error('Not found');
		});
	}
});

suite.add('Serve 20KB tile', {
	defer: true,
	fn: function(deferred) {
		var mockReq = {url: '/mylayer/3/2/2/20kb.bin', headers: {}};
		var mockRes = {write: noop, writeHead: noop, end: function() { deferred.resolve(); }};
		server._handleRequest(mockReq, mockRes, function() {
			throw new Error('Not found');
		});
	}
});

suite.add('Serve 1MB tile', {
	defer: true,
	fn: function(deferred) {
		var mockReq = {url: '/mylayer/3/2/2/1mb.bin', headers: {}};
		var mockRes = {write: noop, writeHead: noop, end: function() { deferred.resolve(); }};
		server._handleRequest(mockReq, mockRes, function() {
			throw new Error('Not found');
		});
	}
});

suite.add('Serve 10MB tile', {
	defer: true,
	fn: function(deferred) {
		var mockReq = {url: '/mylayer/3/2/2/10mb.bin', headers: {}};
		var mockRes = {write: noop, writeHead: noop, end: function() { deferred.resolve(); }};
		server._handleRequest(mockReq, mockRes, function() {
			throw new Error('Not found');
		});
	}
});

suite
	.on('cycle', function(event) {
		console.log(event.target.toString());
	})
	.on('error', function(e) {
		throw e.target.error;
	})
	.run();

