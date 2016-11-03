
// Quick & dirty play / record example for Kurento

// use ffplay / ffmpeg to check the things :
// 	play the kurento player stream
// 		ffplay -i player.sdp
// 	stream the file to the kurento:
// 		ffmpeg -re -f lavfi -i aevalsrc="sin(400*2*PI*t)" -c:a libopus -ab 48k \
//              	-f rtp rtp://<record.sdp_ip>:<record.sdp_port>

var kurento = require('kurento-client');

var ws_uri = "ws://localhost:8888/kurento";
var file_uri = "file:///tmp/player.webm";
var kurentoClient = null;

function CallMediaPipeline() {
    this.pipeline = null;
}

function getKurentoClient(callback) {
    if (kurentoClient !== null) {
        return callback(null, kurentoClient);
    }
    kurento(ws_uri, function(error, _kurentoClient) {
        if (error) {
            var message = 'Coult not find media server at address ' + argv.ws_uri;
            return callback(message + ". Exiting with error " + error);
        }

        kurentoClient = _kurentoClient;
        callback(null, kurentoClient);
    });
}

var pipeline = new CallMediaPipeline();

function getIPAddress() {
  var interfaces = require('os').networkInterfaces();
  for (var devName in interfaces) {
    var iface = interfaces[devName];

    for (var i = 0; i < iface.length; i++) {
      var alias = iface[i];
      if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal)
        return alias.address;
    }
  }
  return '0.0.0.0';
}

function replace_ip(sdp) {
    return sdp.replace(new RegExp("IN IP4 .*","g"), "IN IP4 " + getIPAddress());
}

CallMediaPipeline.prototype.createPipeline = function(peer_offer, callback) {
    var self = this;
    getKurentoClient(function(error, kurentoClient) {
        if (error) {
            return callback(error);
        }
        kurentoClient.create('MediaPipeline', function(error, pipeline) {
                if (error) {
                    return callback(error);
                }
                console.log('Pipeline created');
                pipeline.create('PlayerEndpoint', {uri: file_uri, useEncodedMedia: false}, function(error, playerEndpoint) {
                    if (error) {
                        return callback(error)
                    }
                    playerEndpoint.on('EndOfStream', function() {
			console.log('*** END OF STREAM');
			// pipeline.release();
		    });
                    console.log('PlayerEndpoint created');
                    var recordParams = {
                            stopOnEndOfStream: true,
                            mediaProfile: 'WEBM_AUDIO_ONLY',
                            uri: 'file:///tmp/record.webm'
                        };
                    pipeline.create('RecorderEndpoint', recordParams, function(error, recorder) {
                        pipeline.create('RtpEndpoint', function(error, myRtpEndpoint) {
                            console.log('RTPEndpoint created');
                            // connect to myRTPEndpoint (rx to us)
                            myRtpEndpoint.connect(recorder,function(error){
                                    console.log('recorder endpoint connected');
                                });
                            myRtpEndpoint.on('MediaStateChanged', function (event) {
	    			console.log('MediaStateChanged to ' + event.newState);
	    			 if (event.oldState !== event.newState && event.newState == "CONNECTED")
	    			     recorder.record(() => console.log("start recording"));                                 
                            });
                            myRtpEndpoint.on('ConnectionStateChanged', function (event) {
				console.log('ConnectionStateChanged to ' + event.newState);
                            });
                            // connect to myRTPEndpoint (tx from us)
                            playerEndpoint.connect(myRtpEndpoint,function(error) {
                                console.log('player endpoint connected');
                            });
        	            playerEndpoint.play(function(error)  {
	               		if (error) {
					console.log('play error');
					return;
				}
	       			console.log('PlayerEndpoint playing');
                            });
                            myRtpEndpoint.generateOffer(function(error, offer) {
				// this is offer for receiving side (recorder.sdp)
				// that we will send to asterisk as local offer
				// console.log('Kurento RX offer:\n\n' + offer);
				callback(null, offer);
                            }); // generateOffer
                            console.log('Kurento TX offer:\n\n' + peer_offer);
                            myRtpEndpoint.processAnswer(peer_offer, function (error, sdpAnswer) {
                       		if (error) {
                                   	console.log('processAnswer error:', error);
                               		return;
                       		}
	                        console.log('Answered');
                            }); // processAnswer
                        }); // create('RtpEndpoint')
                    }); // create('RecorderEndpoint')
                }); // create('PlayerEndpoint')
    }) // create('MediaPipeline')
  }); // getKurentoClient
} // CallMediaPipeline.prototype.createPipeline


// peer_offer is offer for sending from us (player.sdp)

/*
v=0
o=- 0 0 IN IP4 127.0.0.1
s=No Name
c=IN IP4 <dest ip>
t=0 0
a=tool:libavformat 56.15.102
m=audio 5004 RTP/AVP 96 0 97
a=rtpmap:97 opus/48000/2
a=rtpmap:96 AMR/8000
b=AS:64
*/

var peer_offer = "v=0\no=- 0 0 IN IPV4 127.0.0.1\nt=0 0\ns=No Name\na=tool:libavformat 52.16.0\nc=IN IP4 10.1.1.100\nm=audio 5004 RTP/AVP 96 0 97\na=rtpmap:97 opus/48000/2\na=rtpmap:96 AMR/8000\nb=AS:64";

function s_cb(tx_offer) {
        console.log('Kurento RX offer:\n\n' + tx_offer);
}

pipeline.createPipeline(peer_offer, function(error, tx_offer) {
    if (error) {
        console.log(error);
    } else {
        s_cb(tx_offer);
    }
});
