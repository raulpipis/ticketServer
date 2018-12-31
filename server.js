var http = require('http');
var rxdb = require('rxdb');
var url = require('url');
var path = require('path');
var fs = require('fs');
require('babel-polyfill');
rxdb.plugin(require('pouchdb-adapter-node-websql'));

var extMap = {
    '.ico': 'image/x-icon',
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword'
};

var dbName = 'ticketsdb';
var orgCollName = 'organizers';
var cliCollName = 'clients';
var eventsCollName = 'events';
var db;

var clientSchema = {
    'title' : 'clientSchema',
    'version' : 0,
    'type' : 'object',
    'properties' : {
        'username' : {
            'type' : 'string'
        },
        'password' : {
            'type' : 'string'
        },
        'events' : {
            'type' : 'array',
            'uniqueItems' : true,
            'ref' : eventsCollName,
            'items' : {
                'type' : 'string'
            }
        }
    },
    'required': ['username', 'password', 'events']
};

var eventSchema = {
    'title' : 'eventSchema',
    'version' : 0,
    'type' : 'object',
    'properties' : {
        'organizer' : {
            'ref' : orgCollName,
            'type' : 'string'
        },
        'name' : {
            'type' : 'string'
        },
        'price' : {
            'type' : 'number'
        },
        'location' : {
            'type' : 'string'
        },
        'maxTickets' : {
            'type' : 'integer',
            'min' : 1
        },
        'soldTickets' : {
            'type' : 'integer',
            'default' : 0
        },
        'description' : {
            'type' : 'string'
        }
    },
    'required' : ['name', 'price', 'location', 'maxTickets', 'soldTickets']
};

var staticPath = "./static";

function startServer() {
    /*Create database*/
    rxdb.create({
        'name' : dbName,
        'adapter' : 'websql',
        'queryChangeDetection' : true
    }).then(async function(dbHandler) {
        db = dbHandler;
        await db.collection({
            'name' : eventsCollName,
            'schema' : eventSchema
        });
        await db.collection({
            'name' : orgCollName,
            'schema' : clientSchema
        });
        await db.collection({
            'name' : cliCollName,
            'schema' : clientSchema
        });
        /*Create server*/
        http.createServer(function (req, res) {
            switch(req.method) {
            case 'POST':
                handlePostRequest(req, res);
                break;
            case 'GET':
                handleGetRequest(req, res);
                break;
            case 'DELETE':
                handleDeleteRequest(req, res);
                break;
            case 'OPTIONS':
                handleOptionsRequest(req, res);
                break;
            default:
                res.writeHead(405, {'Content-Type': 'text/html'});
                res.end('405 Method Not Allowed');
            }
        }).listen(80);
        console.log("SERVER STARTED!!!");
    }).catch(function(err){console.log(err + " Error creating database " + dbName)});
}

function handleOptionsRequest(req, res) {
    res.writeHead(200, {
        'Access-Control-Allow-Origin' : '*',
        'Access-Control-Allow-Methods' : 'GET, POST, DELETE',
        'Access-Control-Allow-Headers' : '*'
    });
    res.end();
}

function handleGetRequest(req, res) {
    var parsedUrl = url.parse(req.url);
    var parsedPath = path.parse(parsedUrl.pathname);
    /*if static resource*/
    if (parsedPath.ext || parsedUrl.pathname === '/') {
        /*Add current folder as root*/
        var ext = parsedPath.ext;
        var filePath = parsedUrl.pathname;
        if (filePath === '/') {
            filePath = staticPath + '/index.html';
            ext = '.html';
        } else {
            filePath = staticPath + parsedUrl.pathname;
        }
        /*read file from disk*/
        fs.readFile(filePath, function(err, data) {
            if(err) {
                console.log("File not found " + filePath);
                res.writeHead(404, {'Content-Type': 'text/html'});
                return res.end("404 Not Found");
            }
            res.writeHead(200, {'Content-Type' : extMap[ext]});
            res.write(data);
            return res.end();
        });
    } else {
        var queryData = parsedUrl.query;
        switch(parsedUrl.pathname) {
        case '/api/getEvents':
            getOrganizerEvents(queryData.id, res);
            break;
        case '/api/getEvent':
            getEvent(queryData.id, res);
            break;
        case '/api/getAllEvents':
            getAllEvents(res);
            break;
        case '/api/getClientEvents':
            getClientEvents(queryData.id, res);
            break;
        default:
            console.log("Unknown GET url " + parsedUrl.pathname);
            res.writeHead(404, {'Content-Type': 'text/html'});
            res.end("404 Not Found");
            break;
        }
    }
}

function handlePostRequest(req, res) {
    let body = '';
    var parsedUrl = url.parse(req.url);
    req.on('data', function(chunk) {
        body += chunk;
    });
    req.on('end', function(){
        var postData = JSON.parse(body);
        if (!postData) {
            res.writeHead(400);
            return res.end('400 Bad Request');
        }
        switch(parsedUrl.pathname) {
        case '/api/addOrganizer':
            addOrganizer(postData, res);
            break;
        case '/api/addClient':
            addClient(postData, res)
            break;
        case '/api/login':
            loginClient(postData, res);
            break;
        case '/api/addEvent':
            addEvent(postData, res);
            break;
        case '/api/editEvent':
            editEvent(postData, res);
            break;
        case '/api/buyTicket':
            buyTicket(postData, res);
            break;
        default:
            res.writeHead(404, {'Content-Type': 'text/html'});
            res.end("404 Not Found");
            break;
        }
    });
}

function handleDeleteRequest(req, res) {
    var parsedUrl = url.parse(req.url);
    var queryData = parsedUrl.query;
    switch(parsedUrl.pathname) {
    case '/api/deleteEvent':
        deleteEvent(queryData.id, res);
        break;
    default:
        console.log("Unknown DELETE url " + parsedUrl.pathname);
        res.writeHead(404, {'Content-Type': 'text/html'});
        res.end("404 Not Found");
        break;
    }
}

function addOrganizer(postData, res) {
    addUserGeneric(postData, res, db[orgCollName], 'organizer');
}

function addClient(postData, res) {
    addUserGeneric(postData, res, db[cliCollName], 'client');
}

function addUserGeneric(postData, res, coll, status) {
    var dataInsert = {
        'username' : postData.username,
        'password' : postData.password,
        'events' : []
    };
    /*Find if user exists*/
    coll.findOne().where('username').eq(postData.username).exec().then(function(result) {
        if (!result) {
            coll.insert(dataInsert).then(function (document) {
                res.writeHead(200, {'Content-Type' : 'application/json', 'Access-Control-Allow-Origin' : '*'});
                var identifier = status + 'Id';
                var id = {};
                id[identifier] = document._dataSync$._value._id;
                res.write(JSON.stringify(id));
                res.end();
            }).catch(function(err) {
                res.writeHead(500, {'Content-Type': 'text/html'});
                res.write(err);
                res.end();
            });
        } else {
            res.writeHead(403, {'Content-Type': 'text/html'});
            res.write(status + " already exists: " + postData.username);
            res.end();
        }
    }).catch(function(err) {
        res.writeHead(500, {'Content-Type': 'text/html'});
        res.write(err);
        res.end();
    });
}

function loginClient(postData, res) {
    var coll;
    var status;
    if (postData.accountType == 0) {
        coll = db[orgCollName];
        status = 'organizer';
    } else {
        coll = db[cliCollName];
        status = 'client';
    }
    coll.findOne().where('username').eq(postData.username).where('password').eq(postData.password).exec().then(function(document) {
        if (document) {
            res.writeHead(200, {'Content-Type' : 'application/json', 'Access-Control-Allow-Origin' : '*'});
            var identifier = status + 'Id';
            var id = {};
            id[identifier] = document._dataSync$._value._id;
            res.write(JSON.stringify(id));
            res.end();
        } else {
            res.writeHead(404, {'Content-Type': 'text/html'});
            res.end("404 Not Found " + status + ": " + postData.username);
        }
    }).catch(function(err) {
        res.writeHead(500, {'Content-Type': 'text/html'});
        res.write(err);
        res.end();
    });
}

function addEvent(postData, res) {
    var orgColl = db[orgCollName];
    var eventColl = db[eventsCollName];
    var insertData = {
        'organizer' : postData.organizerId,
        'name' : postData.name,
        'location' : postData.location,
        'maxTickets' : parseInt(postData.ticketsNumber),
        'soldTickets' : 0,
        'description' : postData.description,
        'price' : parseInt(postData.price)
    }
    eventColl.insert(insertData).then(function(eventDoc) {
        var eventId = eventDoc._dataSync$._value._id
        var updateQuery = {
            '$push' : {
                'events' : eventId
            }
        };
        orgColl.findOne().where('_id').eq(postData.organizerId).update(updateQuery).then(function(orgDocument){
            res.writeHead(200, {'Content-Type' : 'application/json', 'Access-Control-Allow-Origin' : '*'});
            var id = {
                'eventId' : eventId
            };
            res.write(JSON.stringify(id));
            res.end();
        });
    }).catch(function(err) {
        console.log(err);
        res.writeHead(500, {'Content-Type': 'text/html'});
        res.write(err);
        res.end();
    });
}

function editEvent(postData, res) {
    var eventColl = db[eventsCollName];
    var updateData = {
        '$set' : {
            'name' : postData.name,
            'location' : postData.location,
            'maxTickets' : parseInt(postData.ticketsNumber),
            'description' : postData.description,
            'price' : parseInt(postData.price)
        }
    };
    eventColl.findOne().where('_id').eq(postData.eventId).update(updateData).then(function(document) {
        if (document) {
            res.writeHead(200, {'Content-Type' : 'application/json', 'Access-Control-Allow-Origin' : '*'});
            var id = {
                'eventId' : postData.eventId
            };
            res.write(JSON.stringify(id));
            res.end();
        } else {
            res.writeHead(404, {'Content-Type': 'text/html'});
            res.end("404 Not Found event: " + postData.eventId);
        }
    }).catch(function(err) {
        console.log(err);
        res.writeHead(500, {'Content-Type': 'text/html'});
        res.write(err);
        res.end();
    });
}

function buyTicket(postData, res) {
    var eventColl = db[eventsCollName];
    var cliColl = db[cliCollName];

    eventColl.findOne().where('_id').eq(postData.eventId).exec().then(function(eventDoc) {
        var docValue = eventDoc._dataSync$._value;
        if (docValue.soldTickets >= docValue.maxTickets) {
            res.writeHead(403, {'Content-Type': 'text/html'});
            res.end("403 Forbidden max ticket number for event " + postData.eventId);
            return;
        }
        var updateQuery = {
            '$inc' : {
                'soldTickets' : 1
            }
        };
        eventDoc.update(updateQuery).then(function(eventDoc) {
            var cliUpdate = {
                '$push' : {
                    'events' : postData.eventId
                }
            };
            cliColl.findOne().where('_id').eq(postData.clientId).update(cliUpdate).then(function(cliDoc) {
                res.writeHead(200, {'Content-Type' : 'application/json', 'Access-Control-Allow-Origin' : '*'});
                var id = {
                    'eventId' : postData.eventId
                };
                res.write(JSON.stringify(id));
                res.end();
            });
        });
    }).catch(function(err) {
        console.log(err);
        res.writeHead(500, {'Content-Type': 'text/html'});
        res.write(err);
        res.end();
    });
}

function getOrganizerEvents(orgId, res) {
    var orgColl = db[orgCollName];
    orgColl.findOne().where('_id').eq(orgId).exec().then(async function(document) {
        if (document) {
            var orgEvents = await document.populate('events');
            var response = [];
            for (var index in orgEvents) {
                var eventData = orgEvents[index]._dataSync$._value;
                var event = {
                    'eventId' : eventData._id,
                    'name' : eventData.name,
                    'price' : eventData.price,
                    'location' : eventData.location,
                    'ticketsAvailable' : eventData.maxTickets - eventData.soldTickets,
                    'ticketsSold' : eventData.soldTickets,
                    'descrption' : eventData.description
                };
                response.push(event);
            }
            res.writeHead(200, {'Content-Type' : 'application/json', 'Access-Control-Allow-Origin' : '*'});
            res.write(JSON.stringify(response));
            res.end();
        } else {
            res.writeHead(404, {'Content-Type': 'text/html'});
            res.end("404 Not Found event: " + postData.eventId);
        }
    }).catch(function(err) {
        console.log(err);
        res.writeHead(500, {'Content-Type': 'text/html'});
        res.write(err);
        res.end();
    });
}

function getClientEvents(clientId, res) {
    var cliColl = db[cliCollName];
    cliColl.findOne().where('_id').eq(clientId).exec().then(async function(document) {
        if (document) {
            var cliEvents = await document.populate('events');
            var response = [];
            for (var index in cliEvents) {
                var eventData = cliEvents[index]._dataSync$._value;
                var event = {
                    'eventId' : eventData._id,
                    'name' : eventData.name,
                    'price' : eventData.price,
                    'location' : eventData.location,
                    'descrption' : eventData.description
                };
                response.push(event);
            }
            res.writeHead(200, {'Content-Type' : 'application/json', 'Access-Control-Allow-Origin' : '*'});
            res.write(JSON.stringify(response));
            res.end();
        } else {
            res.writeHead(404, {'Content-Type': 'text/html'});
            res.end("404 Not Found event: " + postData.eventId);
        }
    }).catch(function(err) {
        console.log(err);
        res.writeHead(500, {'Content-Type': 'text/html'});
        res.write(err);
        res.end();
    });
}

function getEvent(eventId, res) {
    var eventColl = db[eventsCollName];
    eventColl.findOne().where('_id').eq(eventId).exec().then(function(document){
        if (document) {
            var eventData = document._dataSync$._value;
            var event = {
                'eventId' : eventData._id,
                'name' : eventData.name,
                'price' : eventData.price,
                'location' : eventData.location,
                'descrption' : eventData.description
            };
            res.writeHead(200, {'Content-Type' : 'application/json', 'Access-Control-Allow-Origin' : '*'});
            res.write(JSON.stringify(event));
            res.end();
        } else {
            res.writeHead(404, {'Content-Type': 'text/html'});
            res.end("404 Not Found event: " + postData.eventId);
        }
    }).catch(function(err) {
        console.log(err);
        res.writeHead(500, {'Content-Type': 'text/html'});
        res.write(err);
        res.end();
    });
}

function getAllEvents(res) {
    var eventColl = db[eventsCollName];
    eventColl.find().exec().then(function(documents){
        if (documents) {
            var response = [];
            for(var index in documents) {
                var eventData = documents[index]._dataSync$._value;
                var event = {
                    'eventId' : eventData._id,
                    'name' : eventData.name,
                    'price' : eventData.price,
                    'ticketsAvailable' : eventData.maxTickets - eventData.soldTickets,
                    'location' : eventData.location,
                    'descrption' : eventData.description
                };
                response.push(event);
            }
            res.writeHead(200, {'Content-Type' : 'application/json', 'Access-Control-Allow-Origin' : '*'});
            res.write(JSON.stringify(response));
            res.end();
        } else {
            res.writeHead(404, {'Content-Type': 'text/html'});
            res.end("404 Not Found event: " + postData.eventId);
        }
    }).catch(function(err) {
        console.log(err);
        res.writeHead(500, {'Content-Type': 'text/html'});
        res.write(err);
        res.end();
    });
}

function deleteEvent(eventId, res) {
    var eventColl = db[eventsCollName];
    eventColl.findOne().where('_id').eq(eventId).remove().then(function(document) {
        res.writeHead(200, {'Content-Type' : 'application/json', 'Access-Control-Allow-Origin' : '*'});
        if (document) {
            res.write('Success');
        } else {
            res.write('Failed');
        }
        res.end();
    }).catch(function(err) {
        console.log(err);
        res.writeHead(500, {'Content-Type': 'text/html'});
        res.write(err);
        res.end();
    });
}

startServer();