# TileStrata
[![NPM version](http://img.shields.io/npm/v/tilestrata.svg?style=flat)](https://www.npmjs.org/package/tilestrata)
[![Build Status](http://img.shields.io/travis/naturalatlas/tilestrata/master.svg?style=flat)](https://travis-ci.org/naturalatlas/tilestrata)
[![Coverage Status](http://img.shields.io/codecov/c/github/naturalatlas/tilestrata/master.svg?style=flat)](https://codecov.io/github/naturalatlas/tilestrata)

TileStrata is a pluggable "slippy map" tile server that emphasizes code-as-configuration. It's clean, highly tested, and performant. After using [TileStache](http://tilestache.org/) (excellent) we decided we needed something that more-closely matched our stack: Node.js. The primary goal is painless extendability.

```sh
$ npm install tilestrata --save
```

### Introduction

TileStrata consists of five main actors, usually implemented as plugins:

- [*"provider"*](#writing-providers) – Generates a new tile (e.g mapnik)
- [*"cache"*](#writing-caches) – Persists a tile for later requests (e.g. filesystem)
- [*"transform"*](#writing-tranforms) – Takes a raw tile and transforms it (e.g. image scaling / compression)
- [*"request hook"*](#writing-request-hooks) – Called at the very beginning of a tile request.
- [*"response hook"*](#writing-response-hooks) – Called right before a tile is served to the client.

<img src="https://cdn.rawgit.com/naturalatlas/tilestrata/master/graphics/reqflow.svg" width="760" />

#### List of Plugins

- [tilestrata-mapnik](https://github.com/naturalatlas/tilestrata-mapnik) – Render tiles with [mapnik](http://mapnik.org/).
- [tilestrata-disk](https://github.com/naturalatlas/tilestrata-disk) – Cache map tiles to the filesystem (or serve from it)
- [tilestrata-dependency](https://github.com/naturalatlas/tilestrata-dependency) – Fetch tiles from other layers.
- [tilestrata-sharp](https://github.com/naturalatlas/tilestrata-sharp) – Compress, resize, transcode tiles (jpg, png, webp) using [libvips](https://www.npmjs.com/package/sharp).
- [tilestrata-gm](https://github.com/naturalatlas/tilestrata-gm) – Perform all sorts of image operations on tiles using [GraphicsMagick](https://www.npmjs.com/package/gm).
- [tilestrata-headers](https://github.com/naturalatlas/tilestrata-headers) – Set/override response headers.
- [tilestrata-blend](https://github.com/naturalatlas/tilestrata-blend) – Stack multiple layers together.
- [tilestrata-jsonp](https://github.com/naturalatlas/tilestrata-jsonp) – Serve utfgrids (and other JSON) as JSONP.
- [tilestrata-datadog](https://github.com/naturalatlas/tilestrata-datadog) – Send timing information to [Datadog](https://www.datadoghq.com/).
- [tilestrata-utfmerge](https://github.com/naturalatlas/tilestrata-utfmerge) – Merge UTF interactivity grids from mapnik.
- [tilestrata-vtile](https://github.com/naturalatlas/tilestrata-vtile) – Outputs mapnik vector tiles (protobufs).
- [tilestrata-vtile-raster](https://github.com/naturalatlas/tilestrata-vtile-raster) – Renders mapnik vector tiles into raster images.
- [tilestrata-vtile-composite](https://github.com/naturalatlas/tilestrata-vtile-composite) – Merge multiple vector tiles.
- [tilestrata-proxy](https://github.com/naturalatlas/tilestrata-proxy) – Fetches tiles from other servers

## Configuration

```js
var tilestrata = require('tilestrata');
var disk = require('tilestrata-disk');
var sharp = require('tilestrata-sharp');
var mapnik = require('tilestrata-mapnik');
var dependency = require('tilestrata-dependency');
var strata = tilestrata.createServer();

// define layers
strata.layer('basemap')
    .route('tile@2x.png')
        .use(disk.cache({dir: '/var/lib/tiles/basemap'}))
        .use(mapnik({
            xml: '/path/to/map.xml',
            tileSize: 512,
            scale: 2
        }))
    .route('tile.png')
        .use(disk.cache({dir: '/var/lib/tiles/basemap'}))
        .use(dependency('basemap', 'tile@2x.png'))
        .use(sharp(function(image, sharp) {
            return image.resize(256);
        }));

// start accepting requests
strata.listen(8080);
```

Once configured and started, tiles can be accessed via:

```
/:layer/:z/:x:/:y/:filename
```

### Integrate with [Express.js](http://expressjs.com/) / [Connect](https://github.com/senchalabs/connect)

TileStrata comes with middleware for Express that makes serving tiles from an existing application really simple, eliminating the need to call `listen` on `strata`.

```js
var tilestrata = require('tilestrata');
var strata = tilestrata.createServer();
strata.layer('basemap') /* ... */
strata.layer('contours') /* ... */

app.use(tilestrata.middleware({
    server: strata,
    prefix: '/maps'
}));
```

## Usage Notes

### Rebuilding the Tile Cache

If you update your map styles or data, you'll probably want to update your tiles. Rather than dump of them at once and bring your tile server to a crawl, progressively rebuild the cache by requesting tiles with the `X-TileStrata-SkipCache` header. [TileMantle](https://github.com/naturalatlas/tilemantle) makes this process easy:

```
npm install -g tilemantle
tilemantle http://myhost.com/mylayer/{z}/{x}/{y}/t.png \
    -p 44.9457507,-109.5939822 -b 30mi -z 10-14 \
    -H "X-TileStrata-SkipCache:mylayer/t.png"
```

For the sake of the [tilestrata-dependency](https://github.com/naturalatlas/tilestrata-dependency) plugin, the value of the header is expected to be in the format:

```
X-TileStrata-SkipCache:*
X-TileStrata-SkipCache:[layer]/[file],[layer]/[file],...
```

In advanced use cases, it might be necessary for tiles to not be returned by the server until the cache is actually written (particularly when order matters due to dependencies). To achieve this, use:

```
X-TileStrata-CacheWait:1
```

## Health Checks

TileStrata includes a `/health` endpoint that will return a `200 OK` if it can accept connections. The response will always be JSON. By setting `strata.healthy` to a function that accepts a callback you can take it a step further and control the status and data that it returns.

```js
// not healthy
strata.healthy = function(callback) {
    callback(new Error('CPU is too high'), {loadavg: 3});
};
// healthy
strata.healthy = function(callback) {
    callback(null, {loadavg: 1});
};
```

## API Reference

#### [TileServer](#tileserver)

##### server.listen(port, [hostname], [callback])
Starts accepting requests on the specified port. The arguments to this method are exactly identical to node's http.Server [listen()](http://nodejs.org/api/http.html#http_server_listen_port_hostname_backlog_callback) method.

##### server.layer(name, [opts])
Registers a new layer with the given name and returns its [TileLayer](#tilelayer) instance. If the layer already exists, the existing instance will be returned. Whatever name is used will be the first part of the url that can be used to fetch tiles: `/:layer/...`. The following options can be provided:

  - **bbox**: A bounding box ([GeoJSON "bbox" format](http://geojson.org/geojson-spec.html#bounding-boxes)) that defines the valid extent of the layer. Any requests for tiles outside of this region will result in a 404 Not Found. This option can also be set to an array of bounding boxes for rare cases when a layer is noncontinuous.
  - **minZoom**: The minimum `z` to return tiles for. Anything lesser will return a 404 Not Found.
  - **maxZoom**: The maximum `z` to return tiles for. Anything greater will return a 404 Not Found.

##### server.getTile(layer, filename, x, y, z, callback)
Attempts to retrieve a tile from the specified layer (string). The callback will be invoked with three arguments: `err`, `buffer`, and `headers`.

##### server.version
The version of TileStrata (useful to plugins, mainly).

#### [TileLayer](#tilelayer)

##### layer.route(filename, [options])

Registers a route. Returns a [TileRequestHandler](#tilerequesthandler) instance to be configured. The available options are:

  - **cacheFetchMode**: Defines how cache fetching happens when multiple caches are configured. The mode can be `"sequential"` or `"race"`. If set to `"race"`, TileStrata will fetch from all caches simultaneously and return the first that wins.

#### [TileRequestHandler](#tilerequesthandler)

##### handler.use(plugin)
Registers a plugin, which is either a provider, cache, transform, request hook, response hook, or combination of them. See the READMEs on the prebuilt plugins and/or the ["Writing TileStrata Plugins"](#writing-tilestrata-plugins) section below for more info.

#### [TileRequest](#tilerequest)

A request contains these properties: `x`, `y`, `z`, `layer` (string), `filename`, `method`, `headers`, and `qs`.

##### tile.clone()
Returns an identical copy of the tile request that's safe to mutate.

## Writing TileStrata Plugins

### Writing Request Hooks

A request hook implementation needs one method: `reqhook`. Optionally it can include an `init` method that gets called when the server is initializing. The hook's "req" will be a [http.IncomingMessage](http://nodejs.org/api/http.html#http_http_incomingmessage) and "res" will be the [http.ServerResponse](http://nodejs.org/api/http.html#http_class_http_serverresponse). This makes it possible to respond without even getting to the tile-serving logic (just don't call the callback).

```js
module.exports = function(options) {
    return {
        init: function(server, callback) {
            callback(err);
        },
        reqhook: function(server, tile, req, res, callback) {
            callback();
        }
    };
};
```

### Writing Caches

A cache implementation needs two methods: `get`, `set`. Optionally a cache can declare an `init` method that gets called when the server is initializing. If a cache fails (returns an error to the callback), the server will ignore the error and attempt to serve the tile from the registered provider.

```js
module.exports = function(options) {
    return {
        init: function(server, callback) {
            callback(err);
        },
        get: function(server, tile, callback) {
            callback(err, buffer, headers, /* refresh */);
        },
        set: function(server, tile, buffer, headers, callback) {
            callback(err);
        }
    };
};
```

A special behavior exists for when a cache returns a hit, but wants a new tile to be generated in the background. The use case: you have tile that's old enough it *should* be regenerated, but it's not old enough to warrant making the user wait for a new tile to be rendered. To accomplish this in a plugin, have `get()` return `true` as the fourth argument to the callback.

```js
callback(null, buffer, headers, true);
```

### Writing Providers

Providers are responsible for building tiles. A provider must define a `serve` method and optionally an `init` method that is called when the server starts.

```js
module.exports = function(options) {
    return {
        init: function(server, callback) {
            callback(err);
        },
        serve: function(server, tile, callback) {
            callback(err, buffer, headers);
        }
    };
};
```

### Writing Transforms

Transforms modify the result from a provider before it's served (and cached). A tranform must define a `transform` method and optionally an `init` method.

```js
module.exports = function(options) {
    return {
        init: function(server, callback) {
            callback(err);
        },
        transform: function(server, tile, buffer, headers, callback) {
            callback(err, buffer, headers);
        }
    };
};
```

### Writing Response Hooks

A response hook implementation needs one method: `reshook`. Optionally it can include an `init` method that gets called when the server is initializing. The hook's "req" will be a [http.IncomingMessage](http://nodejs.org/api/http.html#http_http_incomingmessage) and "res" will be the [http.ServerResponse](http://nodejs.org/api/http.html#http_class_http_serverresponse). The "result" argument contains three properties: `headers`, `buffer`, and `status` — each of which can be modified to affect the final response.

```js
module.exports = function(options) {
    return {
        init: function(server, callback) {
            callback(err);
        },
        reshook: function(server, tile, req, res, result, callback) {
            callback();
        }
    };
};
```

### Multi-Function Plugins

Sometimes a plugin must consist of multiple parts. For instance, a plugin tracking response times must register a request hook and response hook. To accomodate this, TileStrata supports arrays:
```js
module.exports = function() {
    return [
        {reqhook: function(...) { /* ... */ }},
        {reshook: function(...) { /* ... */ }}
    ];
};
```

## Contributing

Before submitting pull requests, please update the [tests](test) and make sure they all pass.

```sh
$ npm test
```

## License

Copyright &copy; 2014–2015 [Natural Atlas, Inc.](https://github.com/naturalatlas) & [Contributors](https://github.com/naturalatlas/tilestrata/graphs/contributors)

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at: http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
