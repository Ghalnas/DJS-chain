
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
let wslocalurlbase = `ws://${localhost}:${localport+1}`;

let failures = 0;
function mkfaildone (done) {
    return function (reason) {
        failures++;
        console.log(`TEST Failure ${util.inspect(reason)}`);
        fail(reason);
        done();
    };
}

describe("WSapi", function () {

    let servers;
    it("create servers", function (done) {
        servers = ws.mkservers(localport, {});
        expect(servers.ws).toBeDefined();
        done();
    });

    it("create one client", function (done) {
        let faildone = mkfaildone(done);
        let client = new WebSocket(wslocalurlbase);
        //client = br.acceptWebSocket(wslocalurlbase, {
        //    update: br.acceptWebSocket.update
        //});
        expect(client).toBeDefined();
        client.on('open', function open () {
            client.on('message', function clientMessageHandler (data) {
                //console.log(`client received ${data}`);//
                expect(servers.ws.clients.size).toBe(1);
                client.close();
                servers.ws.close();
                servers.http.close();
                expect(servers.ws.clients.size).toBe(0);
                done();
            });
            servers.ws.broadcast("hello");
        });
    });

    // Create database 
    let thedb;
    it("Create and fill database, start servers", function (done) {
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

    let wsclient, brpersons, joe;
    it("create a new client", function (done) {
        let faildone = mkfaildone(done);
        br.acceptWebSocket(wslocalurlbase, {
            update: br.acceptWebSocket.update
        }, WebSocket).then((client) => {
            wsclient = client;
            expect(client).toBeDefined();
            brpersons = new br.BRTable(`${localurlbase}/Persons/`);
            brpersons.get(1)
                .then(bro => {
                    expect(bro.nickname).toBe('Joe');
                    expect(bro.id).toBe(1);
                    expect(bro.age).toBe(42);
                    joe = bro;
                    
                    expect(servers.ws.clients.size).toBe(1);

                    client.on('update', function (data) {
                        expect(joe.age).toBe(33);
                        client.close();
                        done();
                    });
                    client.on('error', function (data) {
                        faildone(data);
                    });
                    // simulate a modification to joe:
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
        br.acceptWebSocket(wslocalurlbase, {
            update: br.acceptWebSocket.update
        }, WebSocket).then((client) => {
            expect(client).toBeDefined();
            wsclient = client;
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
                        done();
                    });

                    return joe.setProperty('age', 55);
                }).catch(faildone);
        });
    });
    
    // final check
    it("No unexpected failures", function (done) {
        //console.log(thedb.tables.Person._cache.map(o => o._o));
        expect(failures).toBe(0);
        wsclient.close();
        servers.ws.close();
        servers.http.close();
        done();
    });
});

