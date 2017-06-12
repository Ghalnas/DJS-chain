
             DJS-chain
             =========
             
This code illustrates a chain of linked objects from browsers to a
single database via two servers using HTTP and WebSocket.

# Main Features

This code is part of the
[https://plus.google.com/communities/108273924382799882716](Diffuse Javascript) 
MOOC. It illustrates a chain of objects starting in the browser, linked to
server objects and backed up in an SQL database. When an object is
modified in a browser, an HTTP REST API call propagates the
modification towards the corresponding server object which is
persisted state in a database, the modification is then pushed towards
the various clients of the server via WebSocket so, at the end, all
browsers share the same state.

``` javascript
browserObject.setProperty(propName, newValue)
   ==> HTTP REST request to the server:
       ===> convert HTTP request into javascript code:
            serverObject.setProperty(propName, newValue)
            ===> convert modification into SQL: 
                 update table set propName = newValue
       <==  Broadcast updates to all browser clients via JSON and WebSocket
       {update: propName, value: newValue}
```

The code depends only on the `sqlite3` and `ws` modules, it does not
use elaborate framework for Web, ORM, REST, etc. but just plain
standard Node.js modules: `http`, `url` and `fs`. This keeps code
minimal, simple and disembarrassed of useless features. 

# Files for servers

`dbobject` is a tiny ORM (Object Relational Mapping) converting rows
of SQL tables into Javascript objects. Modifying the Javascript object
runs appropriate SQL commands to update the database.

`webapi` is a tiny HTTP server that offers a REST API mapping HTTP
requests into access to database objects. HTTP methods such as GET,
PUT, POST and DELETE are supported.

`wsapi` is a tiny WebSocket server that pushes modifications of
database objects to all connected clients. `webapi` could also have
been implemented with WebSocket but this separation illustrates the
different aspects of the two protocols.

# Files for clients

`browserobj` is a tiny library that offers objects linked to remote
objects hosted on some server and accessed via an HTTP REST API. A
modification to such an object is translated into an HTTP PUT request.

# Demo

Starts a server (by default on port 18080) with:

``` shell
cd Site
node ../src/chain.js
```

If you prefer another port, you may specify it:

``` shell
export PORT=18080
cd Site
node ../src/chain.js
```

Remember that websocket use the next port (by default 18081).

Once the server is started, fire a browser on
`http://127.0.0.1:18080/`. The served page opens two independent
frames, you may modify objects in one frame and observe the
modifications arriving in the other frame.


# Miscellaneous

## OpenAPI

An OpenAPI description of the HTTP REST API is available in
`Swagger/swagger.json`. You may visualize it on the
[https://app.swaggerhub.com/apis/chq/djs-chain/1.0.0](Swagger site).

## Heroku

...


