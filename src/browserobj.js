// Chained objects from browser to sql
// Part Two: Browser API

/**

  Local browsers' objects caching servers' objects.

  new brtable(url)
  brtable.get(id)
  brtable.insert(o)
  brtable.all()
  brobject.refresh()
  brobject.remove()
  brobject.X
  brobject.setProperty('field', value)

*/

const http = require('http');
const modurl = require('url');

// Browsers come with their own WebSocket class:
//const WebSocket = require('ws');
// However, the 'ws' library implements WebSocket as an EventEmitter
// while browsers don't. We adjoin to a WSclient an event emitter so
// we can listen to the incoming updates.
const EventEmitter = require('events');

/**
   Promisify http.get, expect a JSON response and return that JSON object.
   This function is used to get an object from the server.
   
   @param {string} url - url to GET
*/

function httpGETjson (url) {
    return new Promise((resolve, reject) => {
        http.get(url, (response) => {
            if ( response.statusCode >= 300 ) {
                reject(response.statusCode);
            }
            if ( response.headers['content-type'] !== 'application/json' ) {
                reject(response.headers['content-type']);
            }
            if ( response.headers['content-length'] === 0 ) {
                reject(response.headers['content-length']);
            }
            response.setEncoding('utf8');
            let body = '';
            response.on('data', (chunk) => { body += chunk; });
            response.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(e);
                }
            });
            response.on('error', reject);
        });
    });
}

/**
   Promisify http.post, expect a JSON response and return that JSON
   object. This function is used to create a new object on the server
   then transferred back to the browser.

   @param {string} url - url to post
   @param {object} o - object to JSONify and send in the POST body.

*/

function httpPOSTjson (url, o) {
    return new Promise((resolve, reject) => {
        let purl = modurl.parse(url);
        function handleResponse (response) {
            if ( response.statusCode !== 201 ) {
                reject(response.statusCode);
            }
            if ( response.headers['content-type'] !== 'application/json' ) {
                reject(response.headers['content-type']);
            }
            if ( response.headers['content-length'] === 0 ) {
                reject(response.headers['content-length']);
            }
            response.setEncoding('utf8');
            let body = '';
            response.on('data', (chunk) => { body += chunk; });
            response.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(e);
                }
            });
            response.on('error', reject);
        }
        let req = http.request({
            hostname: purl.hostname,
            port: purl.port,
            path: purl.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        }, handleResponse);
        req.on('error', reject);
        req.write(JSON.stringify(o));
        req.end();
    });
}

/**
   Promisify http.put, expect a JSON response and return that JSON
   object. This function is used to modify one field of a server
   object then transferred back the whole object to the browser.

   The body is JSON-encoded in order to not confuse a number and a
   string containing a number.

   @param {string} url - url to PUT
   @param {text} value - json-encoded value to send in the PUT body

*/

function httpPUTjson (url, json) {
    return new Promise((resolve, reject) => {
        let purl = modurl.parse(url);
        function handleResponse (response) {
            if ( response.statusCode !== 200 ) {
                reject(response.statusCode);
            }
            if ( response.headers['content-type'] !== 'application/json' ) {
                reject(response.headers['content-type']);
            }
            if ( response.headers['content-length'] === 0 ) {
                reject(response.headers['content-length']);
            }
            response.setEncoding('utf8');
            let body = '';
            response.on('data', (chunk) => { body += chunk; });
            response.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(e);
                }
            });
            response.on('error', reject);
        }
        let req = http.request({
            hostname: purl.hostname,
            port: purl.port,
            path: purl.pathname,
            method: 'PUT',
            headers: {
                'Content-Type': 'text/plain'
            }
        }, handleResponse);
        req.on('error', reject);
        req.write(JSON.stringify(json));
        req.end();
    });
}

/**
   Promisify http.delete, expect no answer.. This function is used to
   delete a server object.

   @param {string} url - url to DELETE

*/

function httpDELETE (url) {
    return new Promise((resolve, reject) => {
        let purl = modurl.parse(url);
        function handleResponse (response) {
            if ( response.statusCode !== 204 ) {
                reject(response.statusCode);
            }
            response.on('error', reject);
            resolve(true);
        }
        let req = http.request({
            hostname: purl.hostname,
            port: purl.port,
            path: purl.pathname,
            method: 'DELETE'
        }, handleResponse);
        req.on('error', reject);
        req.end();
    });
}

/** 
    Class representing a browser object, the image of a server's
    object. The constructor takes a BRTable and an object representing
    the fields and values of the server's object.
*/

class BRObject {
    constructor (brtable, o) {
        this._brtable = brtable;
        this._o = o;
        for ( let column in o ) {
            let prototype = Object.getPrototypeOf(this);
            if ( Object.getOwnPropertyNames(prototype).indexOf(column) < 0 ) {
                /*jshint loopfunc: true */
                Object.defineProperty(prototype, column, {
                    set: function (/* newValue */) {
                        throw new Error("Use setProperty instead!");
                    },
                    get: function () {
                        if ( this._o ) {
                            return this._o[column];
                        } else {
                            throw new Error("No such field " + column);
                        }
                    }
                });
            }
        }
    }
    setProperty (name, value) {
        let self = this;
        let url = self._brtable._url + self.id + '/' + name;
        self._o[name] = value;
        let update = { value };
        return httpPUTjson(url, update)
            .then(o => {
                self._brtable._cache[self.id]._o = o;
                return self;
            });
    }
    /** 
        Remove a server object and remove the associated browser object.
    */
    remove () {
        let self = this;
        let url = self._brtable._url + self.id;
        delete self._brtable._cache[self.id];
        delete self._o;
        return httpDELETE(url)
            .then(() => {
                return undefined;
            });
    }
    /**
       When multiple browsers share the same server object, use
       the refresh method to refresh the browser object.
    */
    refresh () {
        let self = this;
        let url = self._brtable._url + self.id;
        return httpGETjson(url)
            .then(o => {
                if ( o ) {
                    self._brtable._cache[self.id]._o = o;
                    return self;
                } else {
                    delete self._brtable._cache[self.id];
                    delete self._o;
                    return undefined;
                }
            });
    }
}

/**
   Class representing a table. The constructor takes the base URL to
   use when addressing objects of that table. There are three methods
   get, insert and all that all return BRObjects.
*/

class BRTable {
    constructor (url) {
        this._url = url;
        this._cache = [];
        let name = url.replace(/^.*\/(\w+)s\/$/, '$1');
        BRTable.tables[name] = this;
    }
    get (id) {
        let self = this;
        let url = self._url + id;
        if ( self._cache[id] ) {
            return Promise.resolve(self._cache[id]);
        }
        return httpGETjson(url)
            .then(o => {
                self._cache[id] = new BRObject(self, o);
                return self._cache[id];
            });
    }
    insert (o) {
        let self = this;
        let url = self._url;
        return httpPOSTjson(url, o)
            .then(ro => {
                self._cache[ro.id] = new BRObject(self, ro);
                return self._cache[ro.id];
            });
    }
    all () {
        let self = this;
        let url = self._url;
        return httpGETjson(url)
            .then(os => {
                return os.map(o => {
                    if ( ! self._cache[o.id] ) {
                        self._cache[o.id] = new BRObject(self, o);
                    } else {
                        self._cache[o.id]._o = o;
                    }
                    return self._cache[o.id];
                });
            });
    }
}
BRTable.tables = {};

/** 
    This function is supposed to run in a browser and decode all WS
    messages coming from the server.

    @param {string} wsurl - the URL of the websocket server
    @param {object} routes - actions to process WS messages
    @param {WebSocket} - Class of WebSocket client (optional)
    @return {Promise<WebSocket>}

    Whenever a browserobject is modified, the WebSocket client is
    signalled by an 'update' event with the JSON description of the
    patch that was performed. 

    CAUTION: WebSocket in browser and in node.js (ws module) have
    somewhat different characteristics.
    -- A WebSocket in a browser is not an EventEmitter.
    -- Handlers are set on a browser WebSocket with 'onopen', 'onXXX'
    methods. Moreover handlers take an event with a data property.
    -- Handlers in node take directly the data string.

    Therefore, if you want to have isomorphic code, your WebSocket
    client handlers must take an event with a data property. 
*/

// See http://stackoverflow.com/questions/17575790/environment-detection-node-js-or-browser
function _checkIsNode () {
  /*jshint -W054 */
  var code = "try {return this===global;}catch(e){return false;}";
  var f = new Function(code);
  return f();
}

function acceptWebSocket (wsurl, routes, ws) {
    if ( ws ) { var WebSocket = ws; }
    let wsclient = new WebSocket(wsurl);
    function clientMessageHandler (data) {
        try {
            let json = JSON.parse(data);
            if ( routes[json.kind] ) {
                routes[json.kind](json);
                wsclient.eventEmitter.emit(json.kind, json);
            } else {
                wsclient.eventEmitter.emit('error',
                    `Unrecognized message ${data}`);
            }
        } catch (e) {
            wsclient.eventEmitter.emit('error', {e, data});
        }
    }
    return new Promise(function (resolve /* , reject */) {
        if ( _checkIsNode() ) {
            // Assume WebSocket to be provided by the 'ws' module
            wsclient.on('open', function (/* data */) {
                wsclient.on('message', clientMessageHandler);
                resolve(wsclient);
            });
            wsclient.eventEmitter = wsclient;
            
        } else {
            // Assume WebSocket to be provided by the browser
            wsclient.eventEmitter = new EventEmitter();
            wsclient.on = function (name, handler) {
                wsclient.eventEmitter.on(name, function (event) {
                    return handler.bind(wsclient)(event.data);
                });
            };
            wsclient.onopen = function open (/* event */) {
                wsclient.onmessage = function (event) {
                    return clientMessageHandler(event.data);
                };
                resolve(wsclient);
            };
        }
    });
}

/** 
    This function processes an 'update' message that is, modify one
    property of one object if locally known. This function is exported
    as a property of the exported function acceptWebSocket.
    
 */

acceptWebSocket.update = function (json) {
    let table = BRTable.tables[json.table];
    if ( ! table ||
         ! table._cache[json.id] ||
         ! table._cache[json.id][json.field] ) {
        return false;
    }
    table._cache[json.id]._o[json.field] = json.value;
};

module.exports = {
    BRTable,
    BRObject,
    acceptWebSocket
};

// end of browserobj.js
