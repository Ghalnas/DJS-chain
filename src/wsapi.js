// Chained objects from browser to sql
// Part Four: WebSocket server API

/** 
    This complements the HTTP server @see{webapi.js} with a WS server
    that will push object modifications to clients.

    The push protocol sends messages to clients to update some object
    from some table. Clients should ignore messages related to objects
    that they don't know of.


    WS messages are JSON objects with various properties:
    {kind: 'kind', table: tablename, id: int, field: newvalue, ...}

    kind is the type of the message (update for now)
    table is the name of the table
    id is the identifier of the object within the table

    For an 'update' message, properties 'field' and 'newvalue' tells
    to modify which 'field' to be 'newvalue'.

*/

const WebSocket = require('ws');
const webapi = require('./webapi.js');

let ws;

// The WebSocket server and i, wsclients = [];

/** Create two servers listening on port for http and port+1 for
    WebSocket.

    @param {number} port - port to listen
    @param {object} routes - hashtable of routes for HTTP
    @return {http.Server,ws.Server} - listening servers
*/

function mkservers (port, routes) {
    ws = new WebSocket.Server({ port: port+1 });
    function mkmessageHandler (/* client */) {
        return function (/* data */) {
            // ignore all messages coming from clients
            return;
        };
    }
    ws.broadcast = broadcast;
    ws.on('connection', function connection (client) {
        client.on('message', mkmessageHandler(client));
    });
    patch2ServerObjectClass(webapi.ServerObject);
    return { ws, http: webapi.mkserver(port, routes) };
}

/**
   Broadcast some information to all clients

   @param {string} data - JSON data to be sent

*/
function broadcast (data) {
    ws.clients.forEach(function each (client) {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

/**
   Modify webapi.ServerObject.setField to broadcast modifications to
   all clients.
 */

function patch2ServerObjectClass (klass) {
    klass.prototype.setField = function (name, value) {
        let patch = { kind: 'update',
            table: this._dbo._table.name,
            id: this._dbo.id,
            field: name,
            value: value };
        broadcast(JSON.stringify(patch));
        this._dbo[name] = value;
        return value;
    };
    klass.prototype.remove = function () {
        let patch = { kind: 'remove',
            table: this._dbo._table.name,
            id: this._dbo.id
        };
        broadcast(JSON.stringify(patch));
        return this._dbo.remove();
    };
}

module.exports = {
    mkservers,
    broadcast
};

// end wsapi.js
