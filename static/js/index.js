
var socket = io.connect('http://localhost:3000/');
var videoInput;
var videoOutput;
var webRtcPeer;

const I_CAN_START = 0;
const I_CAN_STOP = 1;
const I_AM_STARTING = 2;


window.onload = function() {
    console.log('Page loaded ...');
    videoInput = document.getElementById('videoInput');
    videoOutput = document.getElementById('videoOutput');
    $('#start').attr('onclick', 'start()');
    $('#stop').attr('onclick', 'stop()');
}

socket.on('client-message',function(message){
    var parsedMessage = JSON.parse(message);
    console.info('Received message: ' + parsedMessage);

    switch(parsedMessage.id){
        case 'startResponse':
            startResponse(parsedMessage);
            break;
        case 'error':
            onError('Error message from server ' +parsedMessage);    
            break;
        case 'iceCandidate':
            webRtcPeer.addIceCandidate(parsedMessage.candidate);
            break;
        default:
            onError('Unrecognized message', parsedMessage);
    };
});




function start(){
    console.log('start');
    var options = {
        localVideo:videoInput,
        remoteVideo:videoOutput,
        onicecandidate:onIceCandidate
    };

    webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendrecv(options,function(err){
        if(err) return onError(err);
        this.generateOffer(onOffer);
    });
}

function stop(){
    console.log('Stopping video call ...');
    webRtcPeer.dispose();
    var message = {
        id : 'stop'
    };
    sendMessage(message);
}

function onError(error) {
	console.log(error);
}


function onOffer(error,offerSdp){
    if(error) return onError(error);
    console.info('Invoking SDP offer callback function ' + location.host);
    var message = {
        id: 'start',
        sdpOffer: offerSdp
    };
    sendMessage(message);
}

function sendMessage(message){
    var jsonMessage = JSON.stringify(message);
    console.log('Senging message: ' + jsonMessage);

   socket.emit('message',jsonMessage);
}

function startResponse(message){
    console.log('SDP answer received from server. Processing ...');
    webRtcPeer.processAnswer(message.sdpAnswer);
}

function onIceCandidate(candidate){
    console.log('Local candidate' + JSON.stringify(candidate));

    var message = {
        id : 'onIceCandidate',
        candidate :candidate
    };
    sendMessage(message);
}


