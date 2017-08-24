// run with          jasmine spec/web-spec.js

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
            let contentLength = response.headers['content-length'];
            if ( contentLength ) {
                contentLength = parseInt(contentLength);
                if ( contentLength && body.length > 0 ) {
                    if ( contentLength !== body.length ) {
                        //console.log(contentLength, body.length);//DEBUG
                        reject("Content length mismatch");
                    }
                }
            }
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

describe("Web", function () {
    it("Create server with no routes", function (done) {
        let faildone = mkfaildone(done);
        let server = web.mkserver(localport, {});
        http.get(`${localurlbase}/`, (response) => {
            expect(response.statusCode).toBe(400);
            server.close(mkServerCloseHandler(done));
        });
    });

    let routes = {GET: []};

    it("create server with one /a route", function (done) {
        let faildone = mkfaildone(done);
        routes.GET.push({
            regexp: /^\/a/,
            reaction: function (matches, request, response) {
                response.statusCode = 200;
                response.end('good');
            }});
        let server = web.mkserver(localport, routes);
        // try /a
        http.get(`${localurlbase}/a`, (response) => {
            expect(response.statusCode).toBe(200);
            getResponse(response)
                .then((body) => {
                    expect(body).toBe('good');
                    // try /abc
                    http.get(`${localurlbase}/abc`, (response) => {
                        expect(response.statusCode).toBe(200);
                        getResponse(response)
                            .then((body) => {
                                expect(body).toBe('good');
                                server.close(mkServerCloseHandler(done));
                                done();
                            }).catch(faildone);
                    });
                }).catch(faildone);
        });
    });

    it("Add a route with parenthetized regexp", function (done) {
        let faildone = mkfaildone(done);
        routes.GET.push({
            regexp: /^\/b\/(\d+)/,
            reaction: function (matches, request, response) {
                response.statusCode = 200;
                response.end(matches[1]);
            }});
        let server = web.mkserver(localport, routes);
        // try /b/123
        http.get(`${localurlbase}/b/123`, (response) => {
            expect(response.statusCode).toBe(200);
            getResponse(response)
                .then((body) => {
                    expect(body).toBe('123');
                    server.close(mkServerCloseHandler(done));
                    done();
                }).catch(faildone);
        });
    });

    // Create database
    let thedb, joe, jill;
    it("Create and fill database for tests", function (done) {
        let faildone = mkfaildone(done);
        new dbo.DBsqlite3().then((db) => {
            expect(db instanceof dbo.DB).toBeTruthy();
            thedb = db;
            return db.createTable('Person',
                                  { nickname: { type: 'text' },
                                    age:      { type: 'num' } })
                .then((table) => {
                    return table.insert({nickname: "Joe", age: 42})
                        .then((so) => {
                            joe = so;
                            return table.insert({nickname: "Jill", age: 43})
                                .then((so) => {
                                    jill = so;
                                    done();
                                    return db;
                                });
                        });
                });
        });
    });    

    // Access objects from the database
    
    it("get one person", function (done) {
        let faildone = mkfaildone(done);
        web.generateRoutes(thedb)
            .then((routes) => {
                let server = web.mkserver(localport, routes);
                // try /Persons/1
                http.get(`${localurlbase}/Persons/1`, (response) => {
                    expect(response.statusCode).toBe(200);
                    getJSONResponse(response)
                        .then((o) => {
                            expect(o.id).toBe(1);
                            server.close(mkServerCloseHandler(done));
                            done();
                        }).catch(faildone);
                });
            }).catch(faildone);
    });

    it("get one person nickname", function (done) {
        let faildone = mkfaildone(done);
        web.generateRoutes(thedb)
            .then((routes) => {
                let server = web.mkserver(localport, routes);
                // try /Persons/1/nickname
                http.get(`${localurlbase}/Persons/1/nickname`, (response) => {
                    expect(response.statusCode).toBe(200);
                    getResponse(response)
                        .then((s) => {
                            expect(s).toBe('Joe');
                            server.close(mkServerCloseHandler(done));
                            done();
                        }).catch(faildone);
                });
            }).catch(faildone);
    });

    it("get one absent person", function (done) {
        let faildone = mkfaildone(done);
        web.generateRoutes(thedb)
            .then((routes) => {
                let server = web.mkserver(localport, routes);
                // try /Persons/813
                http.get(`${localurlbase}/Persons/813`, (response) => {
                    expect(response.statusCode).toBe(404);
                    server.close(mkServerCloseHandler(done));
                    done();
                });
            }).catch(faildone);
    });

    it("get all persons", function (done) {
        let faildone = mkfaildone(done);
        web.generateRoutes(thedb)
            .then((routes) => {
                let server = web.mkserver(localport, routes);
                // try /Persons/1
                http.get(`${localurlbase}/Persons/`, (response) => {
                    expect(response.statusCode).toBe(200);
                    getJSONResponse(response)
                        .then((os) => {
                            expect(os.length).toBe(2);
                            server.close(mkServerCloseHandler(done));
                            done();
                        }).catch(faildone);
                });
            }).catch(faildone);
    });

    it("create one person with POST", function (done) {
        let faildone = mkfaildone(done);
        web.generateRoutes(thedb)
            .then((routes) => {
                let server = web.mkserver(localport, routes);
                // try POST /Persons/
                function follow (sourl) {
                    let url = `${localurlbase}${sourl}/nickname`;
                    http.get(url, (response2) => {
                        expect(response2.statusCode).toBe(200);
                        getResponse(response2)
                            .then((s) => {
                                expect(s).toBe('Jay');
                                server.close(mkServerCloseHandler(done));
                                done();
                            }).catch(faildone);
                    });
                }
                function handleResponse (response) {
                    expect(response.statusCode).toBe(201);
                    getJSONResponse(response)
                        .then((o) => {
                            expect(o.nickname).toBe('Jay');
                            expect(o.age).toBe(12);
                            expect(o.id).toBe(3);
                            return follow(response.headers.location);
                        }).catch(faildone);
                }
                let req = http.request({
                    hostname: localhost,
                    port: localport,
                    path: `/Persons/`,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }, handleResponse);
                req.on('error', faildone);
                req.write(JSON.stringify({nickname: "Jay", age: 12}));
                req.end();
            }).catch(faildone);
    });

    it("get all persons again", function (done) {
        let faildone = mkfaildone(done);
        web.generateRoutes(thedb)
            .then((routes) => {
                let server = web.mkserver(localport, routes);
                // try /Persons/1
                http.get(`${localurlbase}/Persons/`, (response) => {
                    expect(response.statusCode).toBe(200);
                    getJSONResponse(response)
                        .then((os) => {
                            expect(os.length).toBe(3);
                            server.close(mkServerCloseHandler(done));
                            done();
                        }).catch(faildone);
                });
            }).catch(faildone);
    });

    it("modify one person with PUT", function (done) {
        let faildone = mkfaildone(done);
        web.generateRoutes(thedb)
            .then((routes) => {
                let server = web.mkserver(localport, routes);
                function handleResponse (response) {
                    expect(response.statusCode).toBe(200);
                    getJSONResponse(response)
                        .then((o) => {
                            expect(o.nickname).toBe('Jean');
                            expect(o.age).toBe(13);
                            expect(o.id).toBe(1);
                            server.close(mkServerCloseHandler(done));
                            done();
                        }).catch(faildone);
                }
                let req = http.request({
                    hostname: localhost,
                    port: localport,
                    path: `/Persons/1`,
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }, handleResponse);
                req.on('error', faildone);
                req.write(JSON.stringify({nickname: "Jean", age: 13}));
                req.end();
            }).catch(faildone);
    });

    it("get all persons again again", function (done) {
        let faildone = mkfaildone(done);
        web.generateRoutes(thedb)
            .then((routes) => {
                let server = web.mkserver(localport, routes);
                // try /Persons/1
                http.get(`${localurlbase}/Persons/`, (response) => {
                    expect(response.statusCode).toBe(200);
                    getJSONResponse(response)
                        .then((os) => {
                            expect(os.length).toBe(3);
                            server.close(mkServerCloseHandler(done));
                            done();
                        }).catch(faildone);
                });
            }).catch(faildone);
    });

    it("create one person with PUT", function (done) {
        let faildone = mkfaildone(done);
        web.generateRoutes(thedb)
            .then((routes) => {
                let server = web.mkserver(localport, routes);
                function handleResponse (response) {
                    expect(response.statusCode).toBe(201);
                    getJSONResponse(response)
                        .then((o) => {
                            expect(o.nickname).toBe('Jean');
                            expect(o.age).toBe(13);
                            expect(o.id).toBe(5);
                            server.close(mkServerCloseHandler(done));
                            done();
                        }).catch(faildone);
                }
                let req = http.request({
                    hostname: localhost,
                    port: localport,
                    path: `/Persons/5`,
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }, handleResponse);
                req.on('error', faildone);
                req.write(JSON.stringify({nickname: "Jean", age: 13}));
                req.end();
            }).catch(faildone);
    });

    it("remove a person with DELETE", function (done) {
        let faildone = mkfaildone(done);
        web.generateRoutes(thedb)
            .then((routes) => {
                let server = web.mkserver(localport, routes);
                function handleResponse (response) {
                    expect(response.statusCode).toBe(204);
                    http.get(`${localurlbase}/Persons/1`, (response2) => {
                        expect(response2.statusCode).toBe(404)
                        server.close(mkServerCloseHandler(done));
                        done();
                    });
                }
                let req = http.request({
                    hostname: localhost,
                    port: localport,
                    path: `/Persons/1`,
                    method: 'DELETE',
                }, handleResponse);
                req.on('error', faildone);
                req.end();
            }).catch(faildone);
    });

    it("remove again a person with DELETE", function (done) {
        let faildone = mkfaildone(done);
        web.generateRoutes(thedb)
            .then((routes) => {
                let server = web.mkserver(localport, routes);
                function handleResponse (response) {
                    expect(response.statusCode).toBe(204);
                    http.get(`${localurlbase}/Persons/1`, (response2) => {
                        expect(response2.statusCode).toBe(404)
                        server.close(mkServerCloseHandler(done));
                        done();
                    });
                }
                let req = http.request({
                    hostname: localhost,
                    port: localport,
                    path: `/Persons/1`,
                    method: 'DELETE',
                }, handleResponse);
                req.on('error', faildone);
                req.end();
            }).catch(faildone);
    });

    it("Modify the name of a person with PUT", function (done) {
        let faildone = mkfaildone(done);
        web.generateRoutes(thedb)
            .then((routes) => {
                let server = web.mkserver(localport, routes);
                function handleResponse (response) {
                    expect(response.statusCode).toBe(200);
                    getJSONResponse(response)
                        .then((o) => {
                            expect(o.nickname).toBe('Jeannette');
                            expect(o.age).toBe(13);
                            expect(o.id).toBe(5);
                            server.close(mkServerCloseHandler(done));
                            done();
                        }).catch(faildone);
                }
                let req = http.request({
                    hostname: localhost,
                    port: localport,
                    path: `/Persons/5/nickname`,
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'text/plain'
                    }
                }, handleResponse);
                req.on('error', faildone);
                req.write('{ "value": "Jeannette" }');
                req.end();
            }).catch(faildone);
    });

    let theserver;
    it("Modify again the name of a person with PUT", function (done) {
        let faildone = mkfaildone(done);
        web.generateRoutes(thedb)
            .then((routes) => {
                let server = theserver = web.mkserver(localport, routes);
                function handleResponse (response) {
                    expect(response.statusCode).toBe(200);
                    getJSONResponse(response)
                        .then((o) => {
                            expect(o.nickname).toBe('Jeannette');
                            expect(o.age).toBe(13);
                            expect(o.id).toBe(5);
                            server.close(mkServerCloseHandler(done));
                            done();
                        }).catch(faildone);
                }
                let req = http.request({
                    hostname: localhost,
                    port: localport,
                    path: `/Persons/5/nickname`,
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'text/plain'
                    }
                }, handleResponse);
                req.on('error', faildone);
                req.write('{ "value": "Jeannette" }');
                req.end();
            }).catch(faildone);
    });

    // final check
    it("No unexpected failures", function () {
        //console.log(thedb.tables.Person._cache.map(o => o._o));
        expect(failures).toBe(0);
        theserver.close();
    });

});
