var _ = require('lodash');
var fs = require('fs');
var os = require('os');
var path = require('path');
var filesize = require('filesize');
var humanizeDuration = require('humanize-duration');
var auth = require('basic-auth');
var cssfile = path.resolve(__dirname, '../public/profile.css');
var layerimg = 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4NCjwhLS0gR2VuZXJhdG9yOiBBZG9iZSBJbGx1c3RyYXRvciAxOS4xLjAsIFNWRyBFeHBvcnQgUGx1Zy1JbiAuIFNWRyBWZXJzaW9uOiA2LjAwIEJ1aWxkIDApICAtLT4NCjxzdmcgdmVyc2lvbj0iMS4xIiBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgeD0iMHB4IiB5PSIwcHgiDQoJIHdpZHRoPSIzMnB4IiBoZWlnaHQ9IjIycHgiIHZpZXdCb3g9IjAgMCAzMiAyMiIgZW5hYmxlLWJhY2tncm91bmQ9Im5ldyAwIDAgMzIgMjIiIHhtbDpzcGFjZT0icHJlc2VydmUiPg0KPGc+DQoJPGc+DQoJCTxwYXRoIGZpbGw9IiNGRkZGRkYiIGQ9Ik0xNiwybDE0LDUuNUwxNiwxMkwyLDcuNUwxNiwyIE0xNiwwYy0wLjIsMC0wLjUsMC0wLjcsMC4xbC0xNCw1LjVDMC41LDUuOSwwLDYuNywwLDcuNQ0KCQkJYzAsMC44LDAuNiwxLjYsMS40LDEuOGwxNCw0LjVDMTUuNiwxNCwxNS44LDE0LDE2LDE0YzAuMiwwLDAuNCwwLDAuNi0wLjFsMTQtNC41YzAuOC0wLjMsMS40LTEsMS40LTEuOGMwLTAuOC0wLjUtMS42LTEuMy0xLjkNCgkJCWwtMTQtNS41QzE2LjUsMCwxNi4zLDAsMTYsMEwxNiwweiIvPg0KCTwvZz4NCgk8Zz4NCgkJPHBhdGggZmlsbD0iI0ZGRkZGRiIgZD0iTTE2LDE4Yy0wLjEsMC0wLjIsMC0wLjMtMC4xbC0xNS01Yy0wLjUtMC4yLTAuOC0wLjctMC42LTEuM2MwLjItMC41LDAuNy0wLjgsMS4zLTAuNkwxNiwxNmwxNC43LTQuOQ0KCQkJYzAuNS0wLjIsMS4xLDAuMSwxLjMsMC42YzAuMiwwLjUtMC4xLDEuMS0wLjYsMS4zbC0xNSw1QzE2LjIsMTgsMTYuMSwxOCwxNiwxOHoiLz4NCgk8L2c+DQoJPGc+DQoJCTxwYXRoIGZpbGw9IiNGRkZGRkYiIGQ9Ik0xNiwyMmMtMC4xLDAtMC4yLDAtMC4zLTAuMWwtMTUtNWMtMC41LTAuMi0wLjgtMC43LTAuNi0xLjNjMC4yLTAuNSwwLjctMC44LDEuMy0wLjZMMTYsMjBsMTQuNy00LjkNCgkJCWMwLjUtMC4yLDEuMSwwLjEsMS4zLDAuNmMwLjIsMC41LTAuMSwxLjEtMC42LDEuM2wtMTUsNUMxNi4yLDIyLDE2LjEsMjIsMTYsMjJ6Ii8+DQoJPC9nPg0KPC9nPg0KPC9zdmc+DQo=';


module.exports = function(req, res, server) {
	if (process.env.TILESTRATA_PASSWORD) {
		var credentials = auth(req);
		if (!credentials || credentials.pass !== process.env.TILESTRATA_PASSWORD) {
			res.writeHead(401, {'WWW-Authenticate': 'Basic realm="tilestrata"'});
			res.write('Access denied');
			return res.end();
		}
	}


	var data = server.getProfileData();
	var zooms = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25];
	var stageorder = {
		'reqhook': 1,
		'cache.get': 2,
		'provider': 3,
		'transform': 4,
		'reshook': 5,
		'cache.set': 6
	};

	if (/format=json/.test(req.url)) {
		var buffer = new Buffer(JSON.stringify(data), 'utf8');
		res.writeHead(200, {'Content-Length': buffer.length, 'Content-Type': 'application/json; charset=utf-8'});
		res.write(buffer);
		res.end();
	} else {
		fs.readFile(cssfile, 'utf8', function(err, css) {
			if (err) throw err;
			var html = [
				'<style type="text/css">' + css + '</style>',
				'<h1>',
					'<img src="' + layerimg + '" width="20" /> TileStrata Profile Data ',
					'<span class="hostinfo">(',
						'<strong>Host:</strong> ' + _.escape(os.hostname()) + ', ',
						'<strong>Uptime:</strong> ' + humanizeDuration(server.uptime().duration) + ', ',
						'<strong>Now:</strong> ' + (new Date()).toISOString() + ')',
					'</span>',
				'</h1>'
			];
			var layers = Object.keys(data);
			layers.sort();

			layers.forEach(function(layer) {
				html.push('<h2>'+layer+'</h2>');
				var routes = Object.keys(data[layer]);
				routes.sort();
				html.push('<table cellspacing="0" cellpadding="0" border="1">');
				routes.forEach(function(route) {
					html.push('<tr class="route-heading"><th colspan="2"><em>'+route+'</em></th>');
					zooms.forEach(function(z) {
						html.push('<td width="40"><em>z'+z+'</em></td>');
					});
					html.push('</tr>');

					var plugins = Object.keys(data[layer][route]);
					plugins.sort(function(a,b) {
						var stage_a = stageorder[a.replace(/#\d+/,'')];
						var stage_b = stageorder[b.replace(/#\d+/,'')];
						return stage_a - stage_b;
					});
					plugins.forEach(function(plugin) {
						var plugin_name = data[layer][route][plugin].plugin_name;
						var plugin_type = plugin.replace(/#\d+/,'').replace(/\./, '-');
						var fields_available = [];
						if (plugin_name) plugin_name = '<br><span class="plugin-name">' + _.escape(plugin_name) + '</span>';
						Object.keys(data[layer][route][plugin].zooms).forEach(function(z) {
							fields_available = _.union(Object.keys(data[layer][route][plugin].zooms[z]));
						});

						fields_available.forEach(function(field, i) {
							html.push('<tr class="plugin ' + plugin_type + (i === 0 ? ' plugin-start' : '') + '">');
							if (i === 0) html.push('<td rowspan="' + fields_available.length + '"><strong><code>'+plugin+plugin_name+'</code></strong></td>');
							html.push('<td class="field"><code>'+field+'</code></td>');
							var strong_start = /avg/.test(field) ? '<strong>' : '';
							var strong_end = /avg/.test(field) ? '</strong>' : '';
							zooms.forEach(function(z) {
								try {
									var class_attr = '';
									var val = Math.round(data[layer][route][plugin].zooms['z'+z][field]*10)/10;
									if (isNaN(val)) throw new Error('Not a number');
									if (/size/.test(field) && !/samples/.test(field)) val = filesize(val).replace(' ', '');
									if (field === 'dur_avg') {
										if (val > 500) class_attr = ' class="warn"';
										if (val > 1000) class_attr = ' class="critical"';
									}
									html.push('<td'+class_attr+'>'+strong_start+val+strong_end+'</td>');
								}
								catch(e) { html.push('<td></td>'); }
							});
							html.push('</tr>');
						});
					});
				});
				html.push('</table>');
			});

			var buffer = new Buffer(html.join(''), 'utf8');
			res.writeHead(200, {'Content-Length': buffer.length, 'Content-Type': 'text/html; charset=utf-8'});
			res.write(buffer);
			res.end();
		});
	}
};
