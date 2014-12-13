# TileStrata
[![NPM version](http://img.shields.io/npm/v/tilestrata.svg?style=flat)](https://www.npmjs.org/package/tilestrata)
[![Build Status](http://img.shields.io/travis/naturalatlas/tilestrata/master.svg?style=flat)](https://travis-ci.org/naturalatlas/tilestrata)
[![Coverage Status](http://img.shields.io/coveralls/naturalatlas/tilestrata/master.svg?style=flat)](https://coveralls.io/r/naturalatlas/tilestrata)

TileStrata is a pluggable slippy map tile server that emphasizes code-as-configuration. It's clean, highly tested, and performant. After using [TileStache](http://tilestache.org/) (excellent) we decided we needed something that more-closely matched our stack: Node.js.

```sh
$ npm install tilestrata --save
```

### Introduction

TileStrata consists of three main actors, usually implemented as plugins:

- *"provider"* – Generates a new tile (e.g mapnik)
- *"cache"* – Persists a tile for later requests (e.g. filesystem)
- *"transform"* – Takes a raw tile and transforms it (e.g. image scaling / compression)

#### List of Plugins

- [tilestrata-mapnik](https://github.com/naturalatlas/tilestrata-mapnik) – Render tiles with [mapnik](http://mapnik.org/).
- [tilestrata-filesystem](https://github.com/naturalatlas/tilestrata-filesystem) – Cache map tiles to disk.
- [tilestrata-dependency](https://github.com/naturalatlas/tilestrata-dependency) – Fetch tiles from other layers.
- [tilestrata-libvips](https://github.com/naturalatlas/tilestrata-libvips) – Compress, resize, transcode tiles (jpg, png, webp) using [libvips](https://www.npmjs.com/package/sharp).

## Configuration

```js
var tilestrata = require('tilestrata');
var strata = tilestrata.createServer();
strata.registerLayer(require('./layers/basemap.js'));
strata.listen(8080);
```

With a layer file looking like:

```js
var filesystem = require('tilestrata-filesystem');
var mapnik = require('tilestrata-mapnik');
var libvips = require('tilestrata-libvips');

module.exports = function(layer) {
    layer.setName('basemap');
    layer.registerRoute('tile.png', function(handler) {
        handler.registerCache(filesystem({dir: '/var/lib/tiles/basemap'}));
        handler.registerProvider(mapnik({xml: '/path/to/map.xml', scale: 1}));
    });
    layer.registerRoute('tile@2x.png', function(handler) {
        handler.registerCache(filesystem({dir: '/var/lib/tiles/basemap'}));
        handler.registerTransform(gm({width: 256, height: 256}));
    });
};
```

Once configured and started, tiles can be accessed via:

```
/:layer/:z/:x:/:y/:filename
```

### Integrate with [Express.js](http://expressjs.com/) / [Connect](https://github.com/senchalabs/connect)

TileStrata comes with middleware for Express that makes serving tiles from an existing application really simple, eliminating the need to call `listen` on `tileserver`.

```js
var tilestrata = require('tilestrata');
var strata = tilestrata.createServer();
strata.registerLayer(require('./layers/basemap.js'));
strata.registerLayer(require('./layers/contours.js'));
app.use(tilestrata.middleware({
    server: strata,
    prefix: '/maps'
}));
```

## API Reference

#### [TileServer](#tileserver)

##### server.listen(port, [callback])
Starts accepting requests on the specified port.

##### server.registerLayer(init)
The `init` function will be called immediately with a blank [TileLayer](#tilelayer) instance to be configured.

##### server.getTile(layer, filename, x, y, z, callback)
Attempts to retrieve a tile from the specified layer (string). The callback will be invoked with three arguments: `err`, `buffer`, and `headers`.

##### server.version
The version of TileStrata (useful to plugins, mainly).

#### [TileLayer](#tilelayer)

##### layer.setName(name)
Sets the name of the layer. Whatever name is used will be the first part of the url that can be used to fetch tiles: `/:layer/...`

##### layer.registerRoute(filename, init)

The `init` function will be called immediately with a blank [TileRequestHandler](#tilerequesthandler) instance to be configured.

#### [TileRequestHandler](#tilerequesthandler)

##### handler.setCacheFetchMode(mode)
Defines how cache fetching happens. The mode can be `"sequential"` or `"race"`. If set to `"race"`, TileStrata will fetch from both caches simultaneously and return the first that wins.

##### handler.registerProvider(provider)
Registers a provider that serves as the source of the layer. See ["Writing Providers"](#writing-providers) for more info.

##### handler.registerCache(cache)
Registers a cache that can be used to fetch/persist the tile file. See ["Writing Caches"](#writing-caches) for more info. The cache fetch order will be the order in which caches were registered (unless when `"race"` mode is enabled).

##### handler.registerTransform(transform)
Registers a transform that takes a buffer and set of headers and returns a new buffer + headers. See ["Writing Transforms"](#writing-transforms) for more info. The transforms will be in the same order as they were registered.

#### [TileRequest](#tilerequest)

A request contains these properties: `x`, `y`, `z`, `layer` (string), and `filename`.

## Extending TileStrata

### Writing Caches

The `registerCache` method expects an object with two methods: `get`, `set`. Optionally a cache can declare an `init` method that gets called when the server is initializing. If a cache fails (returns an error to the callback), the server will log and ignore the error and attempt to serve the tile from the registered provider.

```js
module.exports = function(options) {
    return {
        init: function(server, callback) {
            callback(err);
        },
        get: function(server, req, callback) {
            callback(err, buffer, headers);
        },
        set: function(server, req, buffer, headers, callback) {
            callback(err);
        }
    };
};
```

### Writing Providers

Providers are responsible for building tiles. The `registerProvider` method expects an object containing a `serve` method, and optionally an `init` method.

```js
module.exports = function(options) {
    return {
        init: function(server, callback) {
            callback(err);
        },
        serve: function(server, req, callback) {
            callback(err, buffer, headers);
        }
    };
};
```

### Writing Transforms

Transforms modify the result from a provider before it's served (and cached). The `registerTransform` method expects an object containing a `transform` method, and optionally an `init` method.

```js
module.exports = function(options) {
    return {
        init: function(server, callback) {
            callback(err);
        },
        transform: function(server, req, buffer, headers, callback) {
            callback(err, buffer, headers);
        }
    };
};
```

## Contributing

Before submitting pull requests, please update the [tests](test) and make sure they all pass.

```sh
$ npm test
```

## License

Copyright &copy; 2014 [Brian Reavis](https://github.com/brianreavis) & [Contributors](https://github.com/naturalatlas/tilestrata/graphs/contributors)

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at: http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
