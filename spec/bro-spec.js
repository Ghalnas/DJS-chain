// run with          jasmine spec/web-spec.js

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

function getResponse (response) {
    return new Promise((resolve, reject) => {
        if ( response.statusCode != 200 ) {
            reject(response);
        }
        response.setEncoding('utf8');
        let body = '';
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => {
            resolve(body);
        });
        response.on('error', reject);
    });
}

function getJSONResponse (response) {
    return new Promise((resolve, reject) => {
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
}

function mkServerCloseHandler (done) {
    let faildone = mkfaildone(done);
    return function (error) {
        if ( error ) {
            faildone(error);
        } else {
            done();
        }
    };
}

describe("Browser", function () {
    
    // Create database and start server
    let thedb, server;
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
                            server = web.mkserver(localport, routes);
                            done();
                        });
                });
        });
    });

    let brpersons, joe;
    it("get one person", function (done) {
        let faildone = mkfaildone(done);
        brpersons = new br.BRTable(`${localurlbase}/Persons/`);
        brpersons.get(1)
            .then(bro => {
                expect(bro.nickname).toBe('Joe');
                expect(bro.id).toBe(1);
                joe = bro;
                done();
            }).catch(faildone);
    });
    
    it("get again the same person", function (done) {
        let faildone = mkfaildone(done);
        brpersons.get(1)
            .then(bro => {
                expect(bro).toBe(joe);
                done();
            }).catch(faildone);
    });

    it("get all persons", function (done) {
        let faildone = mkfaildone(done);
        brpersons.all()
            .then(bros => {
                expect(bros.length).toBe(2);
                expect(brpersons._cache[joe.id]).toBe(joe);
                done();
            }).catch(faildone);
    });

    let jr;
    it("create a person named JR", function (done) {
        let faildone = mkfaildone(done);
        brpersons.insert({nickname: 'JR', age: 99})
            .then(bro => {
                expect(bro.nickname).toBe('JR');
                expect(bro.age).toBe(99);
                expect(brpersons._cache[bro._o.id]).toBe(bro);
                jr = bro;
                brpersons.all()
                    .then(bros => {
                        expect(bros.length).toBe(3);
                        done();
                    });
            }).catch(faildone);
    });

    it("remove JR", function (done) {
        let faildone = mkfaildone(done);
        let jrid = jr.id;
        jr.remove().then(() => {
            expect(jr._o).toBeUndefined();
            return brpersons.all()
                .then(bros => {
                    expect(bros.length).toBe(2);
                    expect(brpersons._cache[jrid]).toBeUndefined();
                    done();
                });
        }).catch(faildone);
    });

    it("modifies joe", function (done) {
        let faildone = mkfaildone(done);
        joe.setProperty('nickname', "Josephine")
            .then(bro => {
                expect(bro).toBe(joe);
                delete brpersons._cache[joe.id];
                return brpersons.get(joe.id)
                    .then(bro2 => {
                        expect(bro2).not.toBe(joe);
                        expect(brpersons._cache[joe.id]).toBe(bro2);
                        expect(bro2.nickname).toBe("Josephine");
                        joe = bro2;
                        done();
                    });
            }).catch(faildone);
    });

    let jillid = 2, jill;
    it("refresh jill", function (done) {
        let faildone = mkfaildone(done);
        thedb.Person.get(jillid)
            .then((dbjill) => {
                expect(dbjill.nickname).toBe('Jill');
                expect(dbjill.age).toBe(43);
                return brpersons.get(jillid)
                    .then(brjill => {
                        expect(brjill.nickname).toBe('Jill');
                        expect(brjill.age).toBe(43);
                        jill = brjill;
                        // Alter in database:
                        dbjill.age = 55;
                        return thedb.persistAll()
                            .then(() => {
                                return jill.refresh()
                                    .then(brjill2 => {
                                        expect(brjill2.age).toBe(55);
                                        expect(jill.age).toBe(55);
                                        done();
                                    });
                            });
                    });
            }).catch(faildone);
    });

    // final check
    it("No unexpected failures", function (done) {
        //console.log(thedb.tables.Person._cache.map(o => o._o));
        expect(failures).toBe(0);
        server.close(mkServerCloseHandler(done));
    });

});
