
const WebSocket = require('ws');
const ws = require('../src/wsapi.js');
const br = require('../src/browserobj.js');
const web = require('../src/webapi.js');
const dbo = require('../src/dbobject.js');
const http = require('http');
const util = require('util');

let localport = 8080;
let localhost = '127.0.0.1';
let localurlbase = `http://${localhost}:${localport}`;

let failures = 0;
function mkfaildone (done) {
    return function (reason) {
        failures++;
        console.log(`TEST Failure ${util.inspect(reason)}`);
        fail(reason);
        done();
    };
}

// This function is supposed to run in a browser and decode all WS
// messages coming from the server.

function clientMessageHandler (data) {
    let client = this;
    let json = JSON.parse(data);
    function update (json) {
        let table = br.BRTable.tables[json.table];
        if ( ! table ||
             ! table._cache[json.id] ||
             ! table._cache[json.id][json.field] ) {
            return false;
        }
        table._cache[json.id]._o[json.field] = json.value;
    }
    let routes = { update };
    if ( routes[json.kind] ) {
        try {
            routes[json.kind](json);
            client.emit(json.kind, json);
        } catch (e) {
            throw e;
        }
    } else {
        throw new Error("Unrecognized message " + data);
    }
}

describe("WSapi", function () {

    let servers;
    it("create servers", function (done) {
        servers = ws.mkservers(localport, {});
        expect(servers.ws).toBeDefined();
        done();
    });

    let client;
    it("create one client", function (done) {
        let faildone = mkfaildone(done);
        client = new WebSocket('ws://' + `${localhost}:${localport+1}`);
        expect(client).toBeDefined();
        client.on('open', function open () {
            client.on('message', function clientMessageHandler (data) {
                //console.log(`client received ${data}`);//
                expect(servers.ws.clients.size).toBe(1);
                client.close();
                servers.ws.close();
                servers.http.close();
                done();
            });
            servers.ws.broadcast("hello");
        });
    });

    // Create database 
    let thedb;
    it("Create and fill database, start server", function (done) {
        let faildone = mkfaildone(done);
        new dbo.DBsqlite3().then((db) => {
            expect(db instanceof dbo.DB).toBeTruthy();
            thedb = db;
            return db.createTable('Person',
                                  { nickname: { type: 'text' },
                                    age:      { type: 'num' } })
                .then((table) => {
                    table.insert({nickname: "Joe", age: 42});
                    table.insert({nickname: "Jill", age: 43});
                    web.generateRoutes(db)
                        .then((routes) => {
                            servers = ws.mkservers(localport, routes);
                            done();
                        });
                });
        });
    });

    let brpersons, joe;
    it("create another client", function (done) {
        let faildone = mkfaildone(done);
        client = new WebSocket('ws://' + `${localhost}:${localport+1}`);
        expect(client).toBeDefined();
        client.on('open', function open () {
            client.on('message', clientMessageHandler);
            brpersons = new br.BRTable(`${localurlbase}/Persons/`);
            brpersons.get(1)
                .then(bro => {
                    expect(bro.nickname).toBe('Joe');
                    expect(bro.id).toBe(1);
                    expect(bro.age).toBe(42);
                    joe = bro;

                    client.on('update', function (data) {
                        //console.log(`data`, data);
                        expect(joe.age).toBe(33);
                        client.close();
                        done();
                    });                                            
                    servers.ws.broadcast(JSON.stringify({
                        kind: 'update',
                        table: 'Person',
                        id: joe.id,
                        field: 'age',
                        value: 33
                    }));
                }).catch(faildone);
        });
    });

    function listKeys (o) {
        function listOwnKeys (o, r) {
            if ( o ) {
                r.push(Object.getOwnPropertyNames(o));
                return listOwnKeys(Object.getPrototypeOf(o), r);
            } else {
                return r;
            }
        }
        return listOwnKeys(o, []);
    }
    //console.log(listKeys(web.ServerObject.prototype));///
    
    it("modify an object", function (done) {
        let faildone = mkfaildone(done);
        client = new WebSocket('ws://' + `${localhost}:${localport+1}`);
        expect(client).toBeDefined();
        client.on('open', function open () {
            client.on('message', clientMessageHandler);
            brpersons = new br.BRTable(`${localurlbase}/Persons/`);
            brpersons.get(1)
                .then(bro => {
                    expect(bro.nickname).toBe('Joe');
                    expect(bro.id).toBe(1);
                    expect(bro.age).toBe(42);
                    joe = bro;

                    client.on('update', function (data) {
                        //console.log(`data`, data);
                        expect(joe.age).toBe(55);
                        client.close();
                        done();
                    });

                    return joe.setProperty('age', 55);
                }).catch(faildone);
        });
    });
    
});

