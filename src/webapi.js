// Chained objects from browser to sql
// Part Two: Web server API

/**
 This is an HTTP server that translates requests into operations on
 database objects. It serves the following URLs:

   /persons/              GET all, POST one
   /persons/:id           GET, PUT, DELETE
   /persons/:id/age       GET, PUT age
   /persons/:id/nickname  GET, PUT nickname

JSON bodies look like:

   {id: 1, nickname: 'Joe', age: 42}

Objects extracted from rows of the database are defined by the
ServerObject class. We also use the objects corresponding to the
database and its tables. They implement the following interface:

  db.getTables()    
  dbtable.all()
  dbtable.get(id)
  dbtable.insert(o)
  dbobject.remove()
  dbobject.allFields()
  dbobject.getField('prop')
  dbobject.setField('prop', value)

All invocations return a promise. See {dbobject.js} for an
implementation.

*/

const http = require('http');
const url = require('url');

/** Definition of routes. This is a hashtable indexed by request
    methods (GET, POST, etc.). Every associated value is an array of
    specific routes. 

    @property {string} requestMethod - array of specific routes

    A specific route is an object with two keys: regexp and reaction.
    If the pathname of the request object matches the regexp then 
    the reaction will be called. The reaction is a function taking
    the matches, the request and response object. Its duty is to
    answer the request.
*/

/** Create a server listening on port. The server is programmed with
    a (global) routes table. 

    @param {number} port - port to listen
    @return {http.Server} - listening HTTP server
*/

function mkserver (port, routes) {
    let handler = mkHandler(routes);
    const server = http.createServer(handler);
    server.listen(port);
    return server;
}

/** Default handler for problematic requests. Set error code and
    flushes the response.

    @param {http.Request} request 
    @param {http.Response} response
    @param {int} HTTP return code
    @param {string} error message
*/

function handlerDefault (request, response, code, message) {
    response.statusCode = code;
    response.setHeader('Content-Type', 'text/plain');
    response.end(message);
}

/** Server handler (parameterized with routes) for all requests. 

    @param {Routes} - hashtable of routes
    @return {function (req, res)} - answer an HTTP request
*/

function mkHandler (routes) {
    return function handler (request, response) {
        function choose(routes, pathname) {
            //console.log(`Serving ${pathname}...`);//
            for ( let route of routes ) {
                //console.log(`Trying ${route.regexp}...`);//
                let matches = route.regexp.exec(pathname);
                if ( matches ) {
                    try {
                        //console.log(`React to ${request.method} ${route.regexp}...`);//
                        return route.reaction(matches, request, response);
                    } catch (exc) {
                        return handlerDefault(request, response, 500, exc);
                    }
                }
            }
            //console.log(`No route for ${pathname}`);//
            return handlerDefault(request, response, 400, "No route");
        }
        let req = url.parse(request.url);
        if ( routes[request.method] ) {
            return choose(routes[request.method], req.pathname);
        } else {
            return handlerDefault(request, response, 400, "Unsupported method");
        }
    };
}

/** 
    ServerObject is a facade masking a DBObject.
 */

class ServerObject {
    constructor (dbo) {
        this._dbo = dbo;
    }
    allFields () {
        return this._dbo._o;
    }
    getField (name) {
        return this._dbo[name];
    }
    setField (name, value) {
        this._dbo[name] = value;
        return value;
    }
    remove () {
        return this._dbo.remove();
    }
}

/**
   ServerTable is a facade masking a DBTable.
*/

class ServerTable {
    constructor (dbtable) {
        this._dbtable = dbtable;
        this.name = dbtable.name;
        this.columns = dbtable.columns;
        // Maintain the hash of all tables:
        ServerTable.tables[this.name] = this;
    }
    insert (o) {
        let self = this;
        return self._dbtable.insert(o)
            .then((dbo) => {
                return new ServerObject(dbo);
            });
    }
    get (id) {
        let self = this;
        return self._dbtable.get(id)
            .then((dbo) => {
                if ( dbo ) {
                    return new ServerObject(dbo);
                } else {
                    return undefined;
                }
            });
    }
    all () {
        let self = this;
        return self._dbtable.all()
            .then((dbos) => {
                return dbos.map((dbo) => new ServerObject(dbo));
            });
    }
}
ServerTable.tables = {};

/** 
    Adaptation of the server to the database objects. Create routes
    for the kind of objects stored in the database.

    @return {Promise<routes>} - hashtable of routes
    @param {DB} db - database @see{dbobject.js}
*/

function generateRoutes (db) {
    let routes = {
        GET: [],
        PUT: [],
        POST: [],
        DELETE: []
    };
    function generateTableRoutes (table) {
        // get all objects:
        routes.GET.push({
            regexp: new RegExp(`^/${table.name}s/?$`),
            reaction: function (matches, request, response) {
                return table.all()
                    .then(function (sos) {
                        response.statusCode = 200;
                        response.setHeader('Content-Type', 'application/json');
                        let jsos = sos.map(so => so.allFields());
                        let content = JSON.stringify(jsos);
                        response.setHeader('Content-Length', content.length);
                        response.end(content);
                    }).catch(function (reason) {
                        return handlerDefault(request, response, 500, reason);
                    });
            }});
        // get one object:
        routes.GET.push({
            regexp: new RegExp(`^/${table.name}s/(\\d+)/?$`),
            reaction: function (matches, request, response) {
                //console.log(`id: ${parseInt(matches[1])}`);
                return table.get(parseInt(matches[1]))
                    .then(function (so) {
                        if ( so ) {
                            response.statusCode = 200;
                            response.setHeader('Content-Type',
                                               'application/json');
                            let content = JSON.stringify(so.allFields());
                            response.setHeader('Content-Length', content.length);
                            response.end(content);
                        } else {
                            response.statusCode = 404;
                            response.setHeader('Content-Type', 'text/plain');
                            response.setHeader('Content-Length', 0);
                            response.end();
                        }
                    }).catch(function (reason) {
                        return handlerDefault(request, response, 500, reason);
                    });
            }});
        // create an object:
        routes.POST.push({
            regexp: new RegExp(`^/${table.name}s/?$`),
            reaction: function (matches, request, response) {
                let body = '';
                request.on('data', (chunk) => { body += chunk; });
                request.on('end', () => {
                    //console.log(`body: ${body}`);//
                    let newo = JSON.parse(body);
                    table.insert(newo)
                        .then(function (so) {
                            response.statusCode = 201;
                            let sourl = `/${table.name}s/${so.getField('id')}`;
                            response.setHeader('Location', sourl);
                            response.setHeader('Content-Type',
                                               'application/json');
                            let content = JSON.stringify(so.allFields());
                            response.setHeader('Content-Length', content.length);
                            response.end(content);
                        }).catch(function (reason) {
                            return handlerDefault(request, response,
                                                  500, reason);
                        });
                });
            }});
        // replace or create an object:
        routes.PUT.push({
            regexp: new RegExp(`^/${table.name}s/(\\d+)/?$`),
            reaction: function (matches, request, response) {
                let body = '';
                request.on('data', (chunk) => { body += chunk; });
                request.on('end', () => {
                    let id = parseInt(matches[1]);
                    table.get(id)
                        .then(function (so) {
                            let newo = JSON.parse(body);
                            delete newo.id;
                            response.setHeader('Content-Type',
                                               'application/json');
                            if ( so ) {
                                // Replace an existing object:
                                for ( let key in newo ) {
                                    so.setField(key, newo[key]);
                                }
                                response.statusCode = 200;
                                let content = JSON.stringify(so.allFields());
                                response.setHeader('Content-Length',
                                                   content.length);
                                response.end(content);
                            } else {
                                // Create a new object with specified id:
                                newo.id = id;
                                return table.insert(newo)
                                    .then((so2) => {
                                        response.statusCode = 201;
                                        let content =
                                            JSON.stringify(so2.allFields());
                                        response.setHeader('Content-Length',
                                                           content.length);
                                        response.end(content);
                                    });
                            }
                        }).catch(function (reason) {
                            return handlerDefault(request, response,
                                                  500, reason);
                        });
                });
            }});
        // delete an object:
        routes.DELETE.push({
            regexp: new RegExp(`^/${table.name}s/(\\d+)/?$`),
            reaction: function (matches, request, response) {
                let id = parseInt(matches[1]);
                return table.get(id)
                    .then(function (so) {
                        if ( so ) {
                            return so.remove().then(() => {
                                response.statusCode = 204; // No content
                                response.setHeader('Content-Length', 0);
                                response.end();
                            });
                        } else {
                            response.statusCode = 204; // No content
                            response.setHeader('Content-Length', 0);
                            response.end();
                        }
                    });
            }});
    }
    function generateColumnRoutes (table, column) {
        // Get one property of an object:
        routes.GET.push({
            regexp: new RegExp(`^/${table.name}s/(\\d+)/${column.name}/?$`),
            reaction: function (matches, request, response) {
                return table.get(parseInt(matches[1]))
                    .then(function (so) {
                        if ( so ) {
                            response.statusCode = 200;
                            response.setHeader('Content-Type', 'text/plain');
                            let content = so.getField(column.name);
                            response.setHeader('Content-Length', content.length);
                            response.end(content);
                        } else {
                            response.statusCode = 404;
                            response.setHeader('Content-Length', 0);
                            response.end();
                        }
                    }).catch(function (reason) {
                        return handlerDefault(request, response, 500, reason);
                    });
            }});
        // modify one property of an object:
        routes.PUT.push({
            regexp: new RegExp(`^/${table.name}s/(\\d+)/${column.name}/?$`),
            reaction: function (matches, request, response) {
                let body = '';
                request.on('data', (chunk) => { body += chunk; });
                request.on('end', () => {
                    let id = parseInt(matches[1]);
                    table.get(id)
                        .then(function (so) {
                            let newvalue = JSON.parse(body).value;
                            if ( so ) {
                                so.setField(column.name, newvalue);
                                response.statusCode = 200;
                                response.setHeader('Content-Type',
                                                   'application/json');
                                let content = JSON.stringify(so.allFields());
                                response.setHeader('Content-Length',
                                                   content.length);
                                response.end(content);
                            } else {
                                response.statusCode = 404;
                                response.setHeader('Content-Length', 0);
                                response.end();
                            }
                        }).catch(function (reason) {
                            return handlerDefault(request, response, 500, reason);
                        });
                });
            }});
    }
    return db.getTables()
        .then(function (dbtables) {
            for ( let tableName in dbtables ) {
                let table = new ServerTable(dbtables[tableName]);
                generateTableRoutes(table);
                for ( let columnName in table._dbtable.columns ) {
                    let column = table._dbtable.columns[columnName];
                    generateColumnRoutes(table, column);
                }
            }
            return routes;
        });
}

module.exports = {
    mkserver,
    generateRoutes,
    ServerObject,
    ServerTable
};

// end of webapi.js
