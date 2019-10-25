var tilestrata = require('tilestrata');
var mapnik = require('tilestrata-mapnik');
var disk = require('tilestrata-disk');
var strata = tilestrata();

strata
	.layer('a')
		.route('tile.png')
			.use(disk.cache({ dir: './.tilecache/a' }))
			.use(mapnik({
				pathname: '/path/to/a.xml',
				scale: 1,
				tileSize: 256
			}))
	.layer('b')
		.route('tile.png')
			.use(disk.cache({ dir: './.tilecache/b' }))
			.use(mapnik({
				pathname: '/path/to/b.xml',
				scale: 1,
				tileSize: 256
			}));

strata.listen(8080, function(err) {
	if (err) throw err;
	console.log('Listening on port 8080...');
});
