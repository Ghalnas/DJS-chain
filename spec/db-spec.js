// run with      jasmine spec/db-spec.js

const sqlite3 = require('sqlite3');
const dbo = require('../src/dbobject.js');

let failures = 0;
function mkfaildone (done) {
    return function (reason) {
        failures++;
        console.log(`TEST Failure ${reason}`);
        fail(reason);
        done();
    };
}

function mksuccessdone (db, done, faildone) {
    db.close().then(() => {
        expect(db._handle).not.toBeDefined();
        done();
    }).catch(faildone);
}

describe("DB", function () {
    it("create, close db", function (done) {
        let faildone = mkfaildone(done);
        new dbo.DBsqlite3().then((db) => {
            expect(db instanceof dbo.DB).toBeTruthy();
            expect(db._handle).toBeDefined();
            db.close().then(() => {
                expect(db._handle).toBeUndefined();
                done();
            }).catch(faildone);
        }).catch(faildone);
    });
    
    it("create, close empty db again", function (done) {
        let faildone = mkfaildone(done);
        new dbo.DBsqlite3().then((db) => {
            expect(db instanceof dbo.DB).toBeTruthy();
            expect(db._handle).toBeDefined();
            db.close().then(() => {
                expect(db._handle).toBeUndefined();
                done();
            }).catch(faildone);
        }).catch(faildone);
    });

    // sqlite3 does not seem to be able to re-open a new non empty
    // in-memory db so we keep the first one we create.
    let thedb;

    let emittedErrorsCount = 0;
    function handleDBerror (event) {
        emittedErrorsCount++;
        //console.log(`DB EVENT ${event}`);
    }
    
    it("create 1 table and restaure to check", function (done) {
        let faildone = mkfaildone(done);
        new dbo.DBsqlite3().then((db) => {
            expect(db._handle).toBeDefined();
            thedb = db;
            db.on('error', handleDBerror);
            db.createTable('Person',
                      { nickname: { type: 'text' },
                        age:      { type: 'num' } })
                .then((table) => {
                    expect(table).toBeDefined();
                    expect(table instanceof dbo.DBTable).toBeTruthy();
                    expect(table.name).toBe('Person');
                    db.getTables().then((tables) => {
                        expect(tables.Person.name).toBe('Person');
                        expect(tables.Person.columns.id.name).toBe('id');
                        expect(tables.Person.columns.id.type).toBe('integer');
                        expect(tables.Person.columns.nickname.name).toBe('nickname');
                        expect(tables.Person.columns.nickname.type).toBe('text');
                        expect(tables.Person.columns.age.name).toBe('age');
                        expect(tables.Person.columns.age.type).toBe('num');
                        expect(typeof db.Person).toBe('function');
                        done();
                    }).catch(faildone);
                }).catch(faildone);
        }).catch(faildone);
    });

    let joeid;

    it("restaure and create 1 row via table", function (done) {
        let faildone = mkfaildone(done);
        let db = thedb;
        db.getTables()
            .then((tables) => {
                expect(tables).toBeDefined();
                //console.log(tables);
                expect(tables.Person).toBeDefined();
                let table = tables.Person;
                expect(table instanceof dbo.DBTable).toBeTruthy();
                table.insert({nickname: "Joe", age: 42})
                    .then((so) => {
                        //console.log(so.toString());
                        expect(so).toBeDefined();
                        expect(so instanceof dbo.DBObject).toBeTruthy();
                        expect(so.nickname).toBe("Joe");
                        expect(so.age).toBe(42);
                        joeid = so.id;
                        done();
                    }).catch(faildone);
            }).catch(faildone);
    });

    let jillid;
    
    it("create another row via db", function (done) {
        let faildone = mkfaildone(done);
        let db = thedb;
        new db.Person({nickname: 'Jill', age: 43})
            .then((so) => {
                //console.log(so);
                expect(so).toBeDefined();
                expect(so.nickname).toBe('Jill');
                expect(so.age).toBe(43);
                jillid = so.id;
                expect(db.tables.Person._cache[jillid]).toBe(so);
                done();
            }).catch(faildone);
    });

    it("Get cached row for Jill", function (done) {
        let faildone = mkfaildone(done);
        let db = thedb;
        db.Person.get(jillid)
            .then((so) => {
                expect(so).toBeDefined();
                expect(so.nickname).toBe('Jill');
                expect(so.age).toBe(43);
                done();
            }).catch(faildone);
    });

    it("Get Jill again via all()", function (done) {
        let faildone = mkfaildone(done);
        let db = thedb;
        db.Person.get(jillid)
            .then((so) => {
                expect(so).toBeDefined();
                expect(so.nickname).toBe('Jill');
                expect(so.age).toBe(43);
                let jill = so;
                return db.Person.all()
                    .then((sos) => {
                        expect(sos.length).toBe(2);
                        let otherjill = sos[1];
                        expect(otherjill.nickname).toBe('Jill');
                        expect(otherjill.age).toBe(43);
                        expect(jill._o).toEqual(otherjill._o);
                        expect(jill).toBe(otherjill);
                        done();
                    })
            }).catch(faildone);
    });

    let joe;

    it("Get uncached row for Joe", function (done) {
        let faildone = mkfaildone(done);
        let db = thedb;
        delete db.tables.Person._cache[joeid];
        db.Person.get(joeid)
            .then((so) => {
                expect(so).toBeDefined();
                expect(so.nickname).toBe("Joe");
                expect(so.age).toBe(42);
                expect(db.tables.Person._cache[joeid]).toBe(so);
                joe = so;
                done();
            }).catch(faildone);
    });

    it("Get absent row", function (done) {
        let faildone = mkfaildone(done);
        let db = thedb;
        db.Person.get(813)
            .then((so) => {
                expect(so).toBeUndefined();
                done();
            })
            .catch(reason => {
                expect(emittedErrorsCount).toBe(0);
                done();
            });
    });

    let jayid = 123;
    let jay;
    it("create another row with specific id", function (done) {
        let faildone = mkfaildone(done);
        let db = thedb;
        db.Person.insert({nickname: 'Jay', age: 44, id: jayid})
            .then((so) => {
                //console.log(so);
                expect(so).toBeDefined();
                expect(so.id).toBe(jayid);
                expect(so.nickname).toBe('Jay');
                expect(so.age).toBe(44);
                expect(db.tables.Person._cache[123]).toBe(so);
                jay = so;
                done();
            }).catch(faildone);
    });

    it("persist a non-dirty object", function (done) {
        let faildone = mkfaildone(done);
        joe._persist().then((so) => {
            expect(so).toBe(joe);
            done();
        }).catch(faildone);
    });
    
    it("persist a dirty object, uncache and refresh", function (done) {
        let faildone = mkfaildone(done);
        let db = thedb;
        joe._modify('nickname', 'Joseph');
        joe._persist()
            .then((so) => {
                expect(so).toBeDefined();
                expect(so).toBe(joe);
                expect(so.nickname).toBe('Joseph');
                delete db.tables.Person._cache[joeid];
                db.Person.get(joeid)
                    .then((so) => {
                        expect(so).toBeDefined();
                        expect(so.nickname).toBe("Joseph");
                        expect(so.age).toBe(42);
                        done();
                    }).catch(faildone);
            }).catch(faildone);
    });

    it("set object, persist, uncache and refresh", function (done) {
        let faildone = mkfaildone(done);
        let db = thedb;
        joe.age = 2 * joe.age;
        expect(joe.age).toBe(84);
        db.persistAll().then(function () {
            delete db.tables.Person._cache[joeid];
            db.Person.get(joeid)
                .then((so) => {
                    expect(so).toBeDefined();
                    expect(so.nickname).toBe("Joseph");
                    expect(so.age).toBe(84);
                    done();
                }).catch(faildone);
        }).catch(faildone);
    });
    
    it("double set object, persist, uncache and refresh", function (done) {
        let faildone = mkfaildone(done);
        let db = thedb;
        joe.age = 2;
        expect(joe.age).toBe(2);
        joe.age = 3;
        expect(joe.age).toBe(3);
        db.persistAll().then(function () {
            delete db.tables.Person._cache[joeid];
            db.Person.get(joeid)
                .then((so) => {
                    expect(so).toBeDefined();
                    expect(so.nickname).toBe("Joseph");
                    expect(so.age).toBe(3);
                    done();
                }).catch(faildone);
        }).catch(faildone);
    });

    it("Get all persons", function (done) {
        let faildone = mkfaildone(done);
        let db = thedb;
        delete db.tables.Person._cache[joeid];
        delete db.tables.Person._cache[jillid];
        delete db.tables.Person._cache[jayid];
        db.Person.all().then((persons) => {
            expect(persons.length).toBe(3);
            for ( person of persons ) {
                if ( person.id === joeid ) {
                    joe = person;
                }
                if ( person.id === jillid ) {
                    jill = person;
                }
                if ( person.id === jayid ) {
                    jay = person;
                }
            }
            expect(joe.nickname).toBe('Joseph');
            expect(joe.id).toBe(joeid);
            expect(jill.nickname).toBe('Jill');
            expect(jill.id).toBe(jillid);
            expect(jay.nickname).toBe('Jay');
            expect(jay.id).toBe(jayid);
            done();
        }).catch(faildone);
    });

    it("Delete joe", function (done) {
        let faildone = mkfaildone(done);
        let db = thedb;
        joe.remove().then(() => {
            db.Person.all().then((persons) => {
                expect(persons.length).toBe(2);
                expect(persons[0].nickname).toBe('Jill');
                done();
            }).catch(faildone);
        }).catch(faildone);
    });

    it("Delete joe again", function (done) {
        let faildone = mkfaildone(done);
        let db = thedb;
        joe.remove().then(() => {
            faildone();
        }).catch((reason) => {
            done();
        });
    });

    it("Multiple modifications", function (done) {
        let faildone = mkfaildone(done);
        let db = thedb;
        function increment (i) {
            if ( i<100 ) {
                jill.age = i;
                delete db.tables.Person._cache[jillid];
                db.Person.get(jillid).then((so) => {
                    jill = so;
                    expect(jill.age).toBe(i);
                    increment(i+1);
                }).catch(faildone);
            } else {
                expect(jill.age).toBe(99);
                delete db.tables.Person._cache[jillid];
                db.Person.get(jillid).then((so) => {
                    jill = so;
                    expect(jill.age).toBe(99);
                    done();
                }).catch(faildone);
            }
        }
        increment(1);
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
    
    it("Inspect properties", function () {
        let dbkeys = listKeys(thedb);
        //console.log(dbkeys);
        expect(dbkeys[0]).toContain('_queue');
        expect(dbkeys[0]).toContain('tables');
        expect(dbkeys[0]).toContain('Person');
        expect(dbkeys[1]).toContain('close');
        expect(dbkeys[1]).toContain('getTables');
        expect(dbkeys[2]).toContain('createTable');
        expect(dbkeys[2]).toContain('persistAll');

        let dbtablekeys = listKeys(thedb.tables.Person);
        //console.log(dbtablekeys);
        expect(dbtablekeys[0]).toContain('_cache');
        expect(dbtablekeys[0]).toContain('_klass');
        expect(dbtablekeys[1]).toContain('insert');
        expect(dbtablekeys[1]).toContain('get');

        let klasskeys = listKeys(dbtablekeys[0]._klass);
        //console.log(klasskeys);

        let jillkeys = listKeys(jill);
        //console.log(jillkeys);
        expect(jillkeys[0]).toContain('_table');
        expect(jillkeys[0]).toContain('_o');
        expect(jillkeys[0]).not.toContain('nickname');
        expect(jillkeys[1]).toContain('toString');
        expect(jillkeys[1]).toContain('nickname');
        expect(jillkeys[2]).toContain('_persist');
    });

    it("No unexpected failures", function () {
        expect(failures).toBe(0);
        expect(emittedErrorsCount).toBe(0);
    });

});
