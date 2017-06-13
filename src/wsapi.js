// Chained objects from browser to sql
// Part Four: WebSocket server API

/** 
    This complements the HTTP server @see{webapi.js} with a WS server
    that will push object modifications to clients.

    The push protocol sends messages to clients to update some object
    from some table. Clients should ignore messages related to objects
    that they don't know of.

    {table: tablename, id: int, field: newvalue, ...}

*/

const WebSocket = require('ws');
const webapi = require('./webapi.js');

let ws;

// The WebSocket server and i, wsclients = [];

/** Create two servers listening on port for http and port+1 for
    WebSocket.

    @param {number} port - port to listen
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
    patchServerObjectClass(webapi.ServerObject);
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

function patchServerObjectClass (klass) {
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
}

module.exports = {
    mkservers
};

// end wsapi.js
