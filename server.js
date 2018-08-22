
var express = require('express');
var session = require('express-session')
var kurento = require('kurento-client');
var path = require('path'); 




var app = express();
var httpServer = require('http').createServer(app);
httpServer.listen(3000);
const io = require('socket.io').listen(httpServer);


var sessionHandler = session({
    secret : 'none',
    rolling : true,
    resave : true,
    saveUninitialized : true
});

app.use(sessionHandler);


var sessions = {};
var candidatesQueue = {};
var kurentoClient = null;
const ws_uri ='ws://localhost:8888/kurento';


/*
 * Server startup{}
 */




/*
 * Management of WebSocket messages
 */
io.on('connection', function(socket) {
    var sessionId = null;
    var request = socket.request;
    var response = {
        writeHead : {}
    };

    sessionHandler(request, response, function(err) {
        sessionId = request.session.id;
        console.log('Connection received with sessionId ' + sessionId);
    });

    socket.on('error', function(error) {
        console.log('Connection ' + sessionId + ' error');
        stop(sessionId);
    });

    socket.on('close', function() {
        console.log('Connection ' + sessionId + ' closed');
        stop(sessionId);
    });

    socket.on('message', function(_message) {
        var message = JSON.parse(_message);
        console.log('Connection ' + sessionId + ' received message ', message);

        switch (message.id) {
        case 'start':
            sessionId = request.session.id;
            start(sessionId, socket, message.sdpOffer, function(error, sdpAnswer) {
                if (error) {
                    return socket.emit('message-client',JSON.stringify({
                        id : 'error',
                        message : error
                    }));
                }
                socket.emit('client-message',JSON.stringify({
                    id : 'startResponse',
                    sdpAnswer : sdpAnswer
                }));
                console.log('sdp answer ' +sdpAnswer);
            });
            break;

        case 'stop':
            stop(sessionId);
            break;

        case 'onIceCandidate':
            onIceCandidate(sessionId, message.candidate);
            break;

        default:
            socket.emit('client-message',JSON.stringify({
                id : 'error',
                message : 'Invalid message ' + message
            }));
            break;
        }

    });
});

/*
 * Definition of functions
 */

// Recover kurentoClient for the first time.
function getKurentoClient(callback) {

    if (kurentoClient !== null) {
        return callback(null, kurentoClient);
    }

    kurento(ws_uri, function(error, _kurentoClient) {
        if (error) {
            console.log("Could not find media server at address " + argv.ws_uri);
            return callback("Could not find media server at address" + argv.ws_uri
                    + ". Exiting with error " + error);
        }
        console.log('get kurento');
        kurentoClient = _kurentoClient;
        callback(null, kurentoClient);
    });
}

function start(sessionId, socket, sdpOffer, callback) {
    if (!sessionId) {
        return callback('Cannot use undefined sessionId');
    }
    

    getKurentoClient(function(error, kurentoClient) {
        if (error) {
            return callback(error);
        }

        kurentoClient.create('MediaPipeline', function(error, pipeline) {
            if (error) {
                return callback(error);
            }

            createMediaElements(pipeline, socket, function(error, webRtcEndpoint) {
                if (error) {
                    pipeline.release();
                    return callback(error);
                }

                if (candidatesQueue[sessionId]) {
                    while(candidatesQueue[sessionId].length) {
                        var candidate = candidatesQueue[sessionId].shift();
                        webRtcEndpoint.addIceCandidate(candidate);
                    }
                }

                connectMediaElements(webRtcEndpoint, function(error) {
                    if (error) {
                        pipeline.release();
                        return callback(error);
                    }

                    webRtcEndpoint.on('OnIceCandidate', function(event) {
                        var candidate = kurento.getComplexType('IceCandidate')(event.candidate);
                        socket.emit('client-message',JSON.stringify({
                            id : 'iceCandidate',
                            candidate : candidate
                        }));
                    });


                    webRtcEndpoint.processOffer(sdpOffer, function(error, sdpAnswer) {
                        if (error) {
                            pipeline.release();
                            return callback(error);
                        }

                        sessions[sessionId] = {
                            'pipeline' : pipeline,
                            'webRtcEndpoint' : webRtcEndpoint
                        }
                        return callback(null, sdpAnswer);
                    });

                    webRtcEndpoint.gatherCandidates(function(error) {
                        if (error) {
                            return callback(error);
                        }
                    });
                });
            });
        });
    });
}

function createMediaElements(pipeline, socket, callback) {
    console.log('create mde');
    pipeline.create('WebRtcEndpoint', function(error, webRtcEndpoint) {
        if (error) {
            return callback(error);
        }

        return callback(null, webRtcEndpoint);
    });
}

function connectMediaElements(webRtcEndpoint, callback) {
    console.log('connect');
    webRtcEndpoint.connect(webRtcEndpoint, function(error) {
        if (error) {
            return callback(error);
        }
        return callback(null);
    });
}

function stop(sessionId) {
    if (sessions[sessionId]) {
        var pipeline = sessions[sessionId].pipeline;
        pipeline.release();

        delete sessions[sessionId];
        delete candidatesQueue[sessionId];
    }
}

function onIceCandidate(sessionId, _candidate) {
    console.log('on ice');
    var candidate = kurento.getComplexType('IceCandidate')(_candidate);

    if (sessions[sessionId]) {
        console.info('Sending candidate');
        var webRtcEndpoint = sessions[sessionId].webRtcEndpoint;
        webRtcEndpoint.addIceCandidate(candidate);
    }
    else {
        console.info('Queueing candidate');
        if (!candidatesQueue[sessionId]) {
            candidatesQueue[sessionId] = [];
        }
        candidatesQueue[sessionId].push(candidate);
    }
}

app.use(express.static(path.join(__dirname, 'static')));
