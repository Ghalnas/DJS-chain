This code illustrates a chain of objects from the browser to a
database via two servers (one HTTP and one WebSocket).

This code is part of the
[https://plus.google.com/communities/108273924382799882716](Diffuse
Javascript) MOOC. It illustrates a chain of objects starting in the
browser, linked to server objects, backed up in an SQL database. When
an object is modified in a browser, an HTTP REST API allows to
propagate the modification towards the server which persists that new
state in a database, the modification is then pushed towards the
various clients of the server via WebSocket.
