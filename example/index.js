var tilestrata = require('tilestrata');
var disk = require('tilestrata-disk');
var strata = tilestrata();

strata
	.layer('a')
		.route('tile.png')
			.use(disk({dir: './.tilecache/a'}))
			.use(mapnik({
				xml: '/path/to/a.xml',
				scale: 1,
				tileSize: 256
			})
	.layer('a')
		.route('tile.png')
			.use(disk({dir: './.tilecache/b'}))
			.use(mapnik({
				xml: '/path/to/b.xml',
				scale: 1,
				tileSize: 256
			})

strata.listen(8080, function() {
	console.log('Listening on 8080...');
})

process.on('SIGTERM', function() {
	strata.close(function() {
		process.exit(0);
	});
})
