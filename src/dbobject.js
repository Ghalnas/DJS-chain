// Chained objects from browser to sql
// Part One: database object

const sqlite3 = require('sqlite3');
const EventEmitter = require('events');

/**
   @abstract Class for objects representing rows in the database.
   Columns are accessed via properties. Every modification of the
   object is sent to the database (of course, this is costly!)

   @property {Value} X - value held in the X column

   @method {Promise<DBobject>} remove - remove an object

   @example
   db.Person.insert({ nickname: 'Joe', age: 42})
     .then((joe) => {
         console.log(joe.nickname);
         joe.age = 7;
         // will store 7 in the database in background
    });

*/

class DBObject {
    constructor (_table, o) {
        this._table = _table;
        this._o = o;
        for ( let column in o ) {
            let prototype = Object.getPrototypeOf(this);
            if ( Object.getOwnPropertyNames(prototype).indexOf(column) < 0 ) {
                /* jshint loopfunc: true */
                Object.defineProperty(prototype, column, {
                    set: function (newValue) {
                        //console.log(`set ${column} to ${newValue}`);
                        this._modify(column, newValue);
                        this._persist();
                        return newValue;
                    },
                    get: function () {
                        //console.log(`get ${column}`);
                        return this._o[column];
                    }
                });
            }
        }
    }
    /** Delete an object in the database. 

        NOTA: the object itself has all its properties deleted but is
        still an instance of DBObject. Would be better to change its
        class to DeadDBObject.

        @return {Promise<>} - deletion done

    */
    remove () {
        let self = this;
        function generateSQL (selftable, selfid) {
            return new Promise((resolve, reject) => {
                function check (error) {
                    if ( error ) {
                        reject(error);
                    } else {
                        resolve(self);
                    }
                }
                let sql = `delete from "${selftable.name}" where id = ?`;
                //console.log(sql);
                selftable._db.handle.run(sql, [selfid], check);
            });
        }
        if ( self._table ) {
            if ( self._table._db.handle ) {
                let selfid = self.id;
                let selftable = self._table;
                delete self._table._cache[selfid];
                Object.getOwnPropertyNames(self).forEach((property) => {
                    delete self[property];
                });
                // change class of self to DeadDBObject ?
                return selftable._db._enqueue(function () {
                    return generateSQL(selftable, selfid);
                });
            } else {
                // No longer a DBobject (if ever been)!
                return Promise.reject("DB Failure 10");
            }
        } else {
            return Promise.reject("DB Failure 9");
        }
    }
    /** Modify an object but don't persist the modification.
     */
    _modify (name, value) {
        if ( name === 'id' ) {
            throw new Error("DB Failure 7");
        }
        this._o[name] = value;
    }
    /** Persist an object. This generates a SQL operation added to the
        queue of SQL operations to be performed.

        @return {Promise<dbobject>} - end of update operation
     */
    _persist () {
        let self = this;
        function generateSQL () {
            return new Promise((resolve, reject) => {
                function check (error) {
                    if ( error ) {
                        reject(error);
                    } else {
                        resolve(self);
                    }
                }
                let columns = [];
                let values = [];
                let settings = [];
                for ( let columnName in self._table.columns ) {
                    if ( columnName === 'id' ) {
                        continue;
                    }
                    columns.push(columnName);
                    values.push(self._o[columnName]);
                    settings.push(`"${columnName}" = ?`);
                }
                let sql = `update "${self._table.name}" \
                set ${settings.join(', ')} \
                where id = ?`;
                //console.log(sql);
                self._table._db.handle.run(sql, [...values, self.id], check);
            });
        }
        if ( self._table._db.handle ) {
            return self._table._db._enqueue(function () {
                return generateSQL();
            });
        } else {
            return Promise.reject("DB Failure 8");
        }
    }
}

/**
   Class DBTable representing a table in the database. To ensure
   unicity of objects got from the database, a cache is managed at the
   level of the table. Objects corresponding to rows are instances of
   a common class inheriting from DBobject.

   @method {Promise<DBobject>} insert - insert a row
   @method {Promise<DBobject>} get - find a row by id

   Once created, tables appear as direct properties of the database
   @property {string} this.name - name of the table
   @property {record[]} this.columns - hashtable of column descriptors
   @property {record} this.columns.X - column descriptor
   @property {string} this.columns.X.name - column name
   @property {string} this.columns.X.type - column type (num or text)

   @example
       db.createTable('Person', {
               nickname: { type: 'text' },
               age:      { type: 'num' } })
         .then((dbtable) => {
            db.Person.insert({ nickname: 'Joe', age: 42})
              .then((joe) => {
                 console.log(joe.nickname);
                 joe.age = 7;
                 // will store 7 in the database in background
              });
         });

  Attention, new can also be used but it does not return the object
  but a promise yielding that object:

  @example
       new db.Person({ nickname: 'Joe', age: 42})
              .then((joe) => {
                 console.log(joe.nickname);
                 joe.age = 7;
                 // will store 7 in the database in background
              });
 */

class DBTable {
    constructor (db, name, columns) {
        this._db = db;
        this.name = name;
        this.columns = columns;
        this._cache = [];
        let self = this;
        this._klass = class extends DBObject {
            constructor (o) {
                super(self, o);
            }
            toString () {
                return self.name + ' ' +
                    JSON.stringify(this._o);
            }
        };
        // a constructor to be used with new and returning a Promise<DBObject>:
        this._db[name] = function (o) {
            return self.insert(o);
        };
        // some shortcuts:
        this._db[name].get = function (id) {
            return self.get(id);
        };
        this._db[name].insert = function (o) {
            return self.insert(o);
        };
        this._db[name].all = function () {
            return self.all();
        };
    }
    /**
       Insert a new row in the database. Only the values associated to
       column names will be stored.
       
       @param {record} o - content of the row
       @return {Promise<DBobject>} - resulting object

       @example
       db.Person.insert({ nickname: 'Joe', age: 42})
         .then((joe) => {
            console.log(joe.nickname);
            joe.age = 7;
            // will store 7 in the database in background
            db.tables.Person.get(joe.id)
              .then(...);
       });
     */
    insert (o) {
        let self = this;
        function generateSQL (o) {
            // extract only table columns from o:
            let ocolumns = {};
            for ( let columnName in self.columns ) {
                if ( columnName in o ) {
                    ocolumns[columnName] = o[columnName];
                }
            }
            return new Promise((resolve, reject) => {
                function check (error) {
                    if ( error ) {
                        reject(error);
                    } else {
                        /* jshint validthis: true */
                        ocolumns.id = this.lastID;
                        let so = new self._klass(ocolumns);
                        self._cache[ocolumns.id] = so;
                        resolve(so);
                    }
                }
                let columns = [];
                let values = [];
                for ( let columnName in self.columns ) {
                    if ( columnName in ocolumns ) {
                        columns.push(`"${columnName}"`);
                        values.push(ocolumns[columnName]);
                    }
                }
                let sql = `insert into "${self.name}" \
                (${columns.join(', ')}) \
                values(${values.map((/* v */) => '?').join(', ')})`;
                //console.log(sql);
                self._db.handle.run(sql, values, check);
            });
        }
        if ( self._db.handle ) {
            return self._db._enqueue(function () {
                return generateSQL(o);
            });
        } else {
            return Promise.reject("DB Failure 4");
        }
    }
    /**
       Get a row from a table. Rows are identified by a primary key 
       named id. If the row does not exist, undefined is returned.

       @param {integer} id - primary key
       @return {Promise<DBobject>} - resulting object

       @example
       db.Person.get(1)
         .then((joe) => {
            console.log(joe.nickname);
            joe.age = 7;
       });
     */
    get (id) {
        let self = this;
        // NOTA: should check id to be an integer
        function generateSQL (id) {
            return new Promise((resolve, reject) => {
                function check (error, row) {
                    if ( error ) {
                        reject(error);
                    } else if ( row === undefined ) {
                        resolve(undefined);
                    } else {
                        let so = new self._klass(row);
                        self._cache[id] = so;
                        resolve(so);
                    }
                }
                let sql = `select * from "${self.name}" where id = ?`;
                //console.log(sql, id);
                self._db.handle.get(sql, [id], check);
            });
        }
        if ( self._cache[id] ) {
            return Promise.resolve(self._cache[id]);
        } else if ( self._db.handle ) {
            return self._db._enqueue(function () {
                return generateSQL(id);
            });
        } else {
            return Promise.reject("DB Failure 5");
        }
    }
    /** 
        Get all rows from a table

        @return {Promise<DBObject[]>} - resulting array of objects

        @example
        db.Person.all()
          .then((persons) => {
             console.log(persons[0].nickname);
             persons[1].age = 7;
        });
    */
    all () {
        let self = this;
        function generateSQL () {
            return new Promise((resolve, reject) => {
                function check (error, rows) {
                    if ( error ) {
                        reject(error);
                    } else {
                        let sos = rows.map((row) => {
                            let so = new self._klass(row);
                            self._cache[row.id] = so;
                            return so;
                        });
                        resolve(sos);
                    }
                }
                let sql = `select * from "${self.name}"`;
                //console.log(sql);
                self._db.handle.all(sql, [], check);
            });
        }
        if ( self._db.handle ) {
            return self._db._enqueue(function () {
                return generateSQL();
            });
        } else {
            return Promise.reject("DB Failure 6");
        }
    }
}

/** 
    @abstract class to represent a database

    @property {DBTable[]} this.tables - array of tables
    @property {DBTable} this.X - table X

    @method {Promise<DBTable>} createTable - create a table
    @method {Promise<DB>} persistAll - make sure all pending DB operations are done
    @method {Promise<>} close -
    @emits {error} - when a DB operation fails

*/  

class DB extends EventEmitter {
    /** 
        @param {object} handle - DB implementation @see{DBsqlite3} below
     */
    constructor () {
        super();
        this._queue = Promise.resolve(this);
    }
    /** 
        Enqueue a new operation to be performed on the database. This
        is to ensure a proper sequentialization (to avoid, for instance,
        a modification on a non yet created object).

        this._queue should always point to a successful promise that
        is, a promise to which you may add .then(f) and have f
        invoked. However the newly enqueued promise (the promise
        yielded by fpromise()) must be returned so the invoker may add
        its own sequels (.then or .catch).

        @param {function (): Promise} fpromise - Thunk returning a promise encapsulating a DB operation
        @return {Promise} - result of the DB operation
     */
    _enqueue (fpromise) {
        let self = this;
        self._queue = self._queue.then(function () {
            let promise = fpromise();
            // Here, the body of promise is run and initiates the DB operation.
            self._queue = promise.catch(function (reason) {
                self.emit('error', reason);
            });
            return promise;
        });
        return self._queue;
    }
    /**
       Make sure all scheduled write operations are done.
    */
    persistAll () {
        return this._queue;
    }
    /**
       Create a table in the database.

       @param {string} name - name of the table
       @param {record} columns - hashtable of columns
       @param {string} columns.X - description of a column named X
       @param {string} columns.X.type - type can be 'text' or 'num'
       @return {Promise<DBTable>} - result of the creation of the table

       @example 
       db.createTable('Person', {
               nickname: { type: 'text' },
               age:      { type: 'num' } })
         .then((dbtable) => {...});
     */
    createTable (name, columns) {
        // create a table:
        let self = this;
        function generateSQL (name, columns) {
            for ( let columnName in columns ) {
                // NOTA check columns[columnName].type
                columns[columnName].name = columnName;
            }
            return new Promise((resolve, reject) => {
                function check (error) {
                    if ( error ) {
                        reject(error);
                    } else {
                        let dbtable = new DBTable(self, name, columns);
                        self.tables[name] = dbtable;
                        resolve(dbtable);
                    }
                }
                // NOTA: check name to be an acceptable table identifier
                // NOTA: check column.name to be an acceptable column identifier
                // NOTA: check column.name not to be 'id'
                // NOTA: check whether table already exists
                let stringcolumns = [];
                for ( let columnName in columns ) {
                    let column = columns[columnName];
                    stringcolumns.push(`"${column.name}" "${column.type}"`);
                }
                // NOTA: integer primary key asc means that id === rowid
                let sql = `create table "${name}" ("id" integer primary key asc, ${stringcolumns.join(', ')})`;
                //console.log(sql);
                self.handle.run(sql, [], check);
            });
        }
        if ( self.handle ) {
            return self._enqueue(function () {
                return generateSQL(name, columns);
            });
        } else {
            return Promise.reject("DB Failure 1");
        }
    }
}

/**
   Sqlite3 implementation
*/

class DBsqlite3 extends DB {
    constructor (handle) {
        super();
        let self = this;
        function check (error) {
            if ( error ) {
                self.handle = null;
            }
        }
        if ( handle ) {
            self.handle = handle;
            return self.getTables()
                .then((tables) => {
                    self.tables = tables;
                    return Promise.resolve(self);
                });
        } else {
            self.handle = new sqlite3.Database(':memory:', check);
            self.tables = {};
            return Promise.resolve(self);
        }
    }
    /** 
        Close a database.

        @return {Promise<db>} - end of close operation
    */
    close () {
        let self = this;
        if ( self.handle ) {
            return new Promise((resolve, reject) => {
                self.handle.close((error) => {
                    if ( error ) {
                        self.tables = undefined;
                        reject(error);
                    } else {
                        self.handle = self.tables = undefined;
                        resolve(self);
                    }
                });
            });
        } else {
            return Promise.reject("DB Failure 2");
        }        
    }
    /**
       Reconstruct DBTables objects from an already existing SQLite database

       @return {Promise<DBTables>} - hashtable of DBTables
    */
    getTables () {
        let self = this;
        if ( self.handle ) {
            return new Promise((resolve, reject) => {
                function check (error, rows) {
                    if ( error ) {
                        reject(error);
                    } else {
                        let columns = {};
                        rows.forEach((table) => {
                            table.sql
                                .replace(/^.*\((.*)\)/, "$1")
                                .split(/,\s+/)
                                .map((nametype) => {
                                    let words = nametype.split(/ +/);
                                    let name = words[0].replace(/"/g, '');
                                    let type = words[1].replace(/"/g, '');
                                    columns[name] = {name, type};
                                });
                            let dbtable = new DBTable(self, table.name, columns);
                            self.tables[table.name] = dbtable;
                        });
                        resolve(self.tables);
                    }
                }
                let sql = `SELECT * FROM sqlite_master WHERE type='table'`;
                //console.log(sql);
                self.handle.all(sql, [], check);
            });
        } else {
            return Promise.reject("DB Failure 3");
        }
    }
}

module.exports = {
    DB,
    DBsqlite3,
    DBTable,
    DBObject
};

// end of dbobject.js
