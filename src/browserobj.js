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
                resolve(JSON.parse(body));
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
                resolve(JSON.parse(body));
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
                resolve(JSON.parse(body));
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
            method: 'DELETE',
        }, handleResponse);
        req.on('error', reject);
        req.end();
    });
}

/**
   Class representing a table. The constructor takes the base URL to
   use when addressing objects of that table. There are three methods
   get, insert and all that all return BRObjects.
*/

class BRTable {
    constructor (url) {
        this._url = url;
        this._cache = {};
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
                return self._cache[id] = new BRObject(self, o);
            });
    }
    insert (o) {
        let self = this;
        let url = self._url;
        return httpPOSTjson(url, o)
            .then(ro => {
                return self._cache[ro.id] = new BRObject(self, ro);
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
                    }
                    return self._cache[o.id];
                });
            });
    }
}
BRTable.tables = {};

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
                Object.defineProperty(prototype, column, {
                    set: function (newValue) {
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
        Remove a server object and make the associated browser object.
    */
    remove () {
        let self = this;
        let url = self._brtable._url + self.id;
        return httpDELETE(url)
            .then(() => {
                delete self._brtable._cache[self.id];
                delete self._o;
                delete self._brtable;
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
                    return self._brtable._cache[self.id]._o = o;
                } else {
                    delete self._brtable._cache[self.id];
                    delete self._o;
                    delete self._brtable;
                }
            });
    }
}

module.exports = {
    BRTable,
    BRObject
};

// end of browserobj.js
