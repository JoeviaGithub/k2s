
// Quick & dirty Kurento to SIP gateway

// process.env.DEBUG = 'rtcninja*';

var kurento = require('kurento-client');

console.log('Detected ' + getIPAddress() + ' IP');

var kurento_addr = '127.0.0.1';
var kurento_uri = 'ws://' + kurento_addr + ':8888/kurento';
var playfile_uri = "file:///tmp/player.webm";
var kurentoClient = null;
var call_number = require('minimist')(process.argv.slice(2), opts={string: 'call'})['call'];
var wait_for_call = require('minimist')(process.argv.slice(2))['wait'];
var ua;

if (!call_number && !wait_for_call) {
  console.log('Usage: nodejs gw.js [--call phone_number] [--wait]');
  process.exit(0);
}

function CallMediaPipeline() {
    this.pipeline = null;
}

function getKurentoClient(callback) {
    if (kurentoClient !== null) {
        return callback(null, kurentoClient);
    }
    kurento(kurento_uri, function(error, _kurentoClient) {
        if (error) {
            var message = 'Coult not find media server at address ' + kurento_uri;
            return callback(message + ". Exiting with error " + error);
        }
        kurentoClient = _kurentoClient;
        callback(null, kurentoClient);
    });
}

function getIPAddress() {
  var interfaces = require('os').networkInterfaces();
  for (var devName in interfaces) {
    var iface = interfaces[devName];

    for (var i = 0; i < iface.length; i++) {
      var alias = iface[i];
      if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && alias.address !== '172.17.0.1' && !alias.internal)
        return alias.address;
    }
  }
  return '0.0.0.0';
}

function replace_ip(sdp, ip) {
    if (!ip)
      ip = getIPAddress();
    return sdp.replace(new RegExp("IN IP4 .*","g"), "IN IP4 " + ip);
}

CallMediaPipeline.prototype.createPipeline = function(callback) {
    var self = this;
    getKurentoClient(function(error, kurentoClient) {
        if (error) {
            return callback(error);
        }
        kurentoClient.create('MediaPipeline', function(error, pipeline) {
                if (error) {
                    return callback(error);
                }
                self.pipeline = pipeline;
                pipeline.create('PlayerEndpoint', {uri: playfile_uri, useEncodedMedia: false}, function(error, playerEndpoint) {
                    if (error) {
                        return callback(error)
                    }
                    self.pipeline.pe = playerEndpoint;
                    playerEndpoint.on('EndOfStream', function() {
			console.log('*** END OF STREAM');
			self.pipeline.release();
			ua.stop();
			process.exit(0);
		    });
                    // console.log('PlayerEndpoint created');
                    var recordParams = {
                            stopOnEndOfStream: true,
                            mediaProfile: 'WEBM_AUDIO_ONLY',
                            uri: 'file:///tmp/record.webm'
                        };
                    pipeline.create('RecorderEndpoint', recordParams, function(error, recorder) {
                        pipeline.create('RtpEndpoint', function(error, rtpe) {
                            self.pipeline.rtpe = rtpe;
                            self.pipeline.rece = recorder;
                            // connect to myRTPEndpoint (rx to us)
                            rtpe.connect(recorder,function(error) {
                                    // console.log('recorder endpoint connected');
                                });
                            rtpe.on('MediaStateChanged', function (event) {
	    			console.log('MediaStateChanged to ' + event.newState);
	    			if (wait_for_call && (event.oldState !== event.newState && event.newState == "CONNECTED"))
	    			  start_media(pipeline);
                            });
                            rtpe.on('ConnectionStateChanged', function (event) {
				console.log('ConnectionStateChanged to ' + event.newState);
                            });
                            // connect to myRTPEndpoint (tx from us)
                            playerEndpoint.connect(rtpe,function(error) {
                                // console.log('player endpoint connected');
                            });
                            rtpe.generateOffer(function(error, offer) {
				// this is offer for receiving side (recorder.sdp)
				// that we will send to asterisk as local offer
				callback(null, offer);
                            }); // generateOffer
                        }); // create('RtpEndpoint')
                    }); // create('RecorderEndpoint')
                }); // create('PlayerEndpoint')
    }) // create('MediaPipeline')
  }); // getKurentoClient
} // CallMediaPipeline.prototype.createPipeline


var JsSIP = require('jssip');
const NodeWebSocket = require('jssip-node-websocket');
// use local asterisk
var asterisk_addr = '127.0.0.1';
var socket = new NodeWebSocket('ws://' + asterisk_addr + ':8088/ws');
var reg_sip_user = '100';
var reg_sip_user_pass = '100_pass';

var configuration = {
  'uri'		: 'sip:' + reg_sip_user + '@' + asterisk_addr,
  'password' 	: reg_sip_user_pass,
  display_name 	: 'Alice',
  sockets      	: [ socket ]
};

try {
 var ua_ = new JsSIP.UA(configuration);
 ua = ua_;
} catch (e) {
  console.log(e);
  return;
}

function start_media(pipeline)
{
 pipeline.pe.play(function(error)  {
   if (error) {
     reject('play error');
   }
   console.log('Kurento is playing');
 });
 pipeline.rece.record(() => console.log("Kurento is recording"));
}

var call_eventHandlers = {
  'progress':   function(data) { console.log('call in progress'); },
  'confirmed':  function(data) {
      console.log('call confirmed');
      start_media(call_options.pipeline);
  }
};

var call_options = {
  'eventHandlers': call_eventHandlers,
  'extraHeaders': [ 'X-Foo: foo', 'X-Bar: bar' ],
  'mediaConstraints': {'audio': true, 'video': false },
};

ua.on('registered', function(e) {
    console.log('registered');
    if (call_number) {
      // create new Kurento pipeline for call
      createPipeline(call_options).then(
        result => {
          console.log('outgoing call pipeline created');
          console.log('initiated call');
          ua.call('sip:' + call_number + '@' + asterisk_addr, call_options);
        },
        reject => {
          console.log('Error creating pipeline');
          call.terminate();
          return;
        }
      );
    }
});
ua.on('registrationFailed', function(err) {
    console.log('registrationFailed: ' + err.cause);
});
ua.on('connecting', function() {
    console.log('connecting to SIP server');
});
ua.on('connected', function() {
    console.log('connected to SIP server');
});
ua.on('disconnected', function() {
    console.log('disconnected from SIP server');
});
ua.on('newMessage', function() {
    console.log('newMessage');
});

function createPipeline(call) {
  return new Promise(function(resolve, reject) {
    var pipeline = new CallMediaPipeline();
    pipeline.createPipeline(function(error, kurento_offer) {
      if (error) {
       reject(error);
      } else {
       call.pipeline = pipeline.pipeline;
       call.pipeline.kurento_offer = replace_ip(kurento_offer, kurento_addr);
       resolve(kurento_offer);
      }
    });
  });
}

function send_answer_to_kurento(pipeline) {
  return new Promise(function(resolve, reject) {
    pipeline.rtpe.processAnswer(pipeline.sip_offer, function (error, sdpAnswer) {
      if (error) {
        reject('Kurento processAnswer error:' + error);
      }
      resolve();
    }); // processAnswer
  });
}

var outgoing = false;

ua.on('newRTCSession', function(data) {
    console.log('new ' + (data.originator == 'remote' ? 'incoming' : 'outgoing') + ' call');
    var call = data.session;
    if (data.originator == 'remote') { // incoming call
      console.log('Call from: ' + call.request.headers.From[0].parsed.uri.toAor());
      // create new Kurento pipeline for call
      createPipeline(call).then(
        result => {
          console.log('incoming call pipeline created');
          console.log('answering incoming call');
          call.answer();
        },
        reject => {
          console.log('Error creating pipeline');
          call.terminate();
          return;
        }
      );
    } else {
      console.log('Call to: ' + call.request.headers.To[0]);
      call.pipeline = call_options.pipeline;
      call_options.call = call;
      outgoing = true;
    }
    call.on('ended', function(data) {
      if (call.pipeline)
        call.pipeline.release();
      console.log('Call ended: ' + data.cause);
      if (outgoing) {
        ua.stop();
        process.exit(0);
      }
    });
    call.on('failed', function(data) {
      console.log('Call failed: ' + data.cause);
      if (call.pipeline)
        call.pipeline.release();
      console.log('Call ended: ' + data.cause);
      if (outgoing) {
        ua.stop();
        process.exit(0);
      }
    });
    call.on('reinvite', function(data) {
      console.log('Got SIP reINVITE');
    });
    call.on('update', function(data) {
      console.log('Got SIP UPDATE');
    });
    call.on('sdp', function(data) {
      if (data.originator == 'remote') {
        if (call.pipeline.sip_offer) {
          call.pipeline.sip_offer = null;
          console.log('Renegotiate requested');
          // recreate the RTPEndpoint, attach recorder to it and start media again
          call_options.pipeline.rece.stop();
          call_options.pipeline.pe.stop();
          call_options.pipeline.rtpe.release();
          call_options.pipeline.create('RtpEndpoint', function(error, rtpe) {
            call_options.pipeline.rtpe = rtpe;
            rtpe.connect(call_options.pipeline.rece, function(error) {
              rtpe.on('MediaStateChanged', function (event) {
                console.log('reINVITE: MediaStateChanged to ' + event.newState);
                if (event.oldState !== event.newState && event.newState == "CONNECTED")
                  start_media(call.pipeline);
              });
              rtpe.on('ConnectionStateChanged', function (event) {
                console.log('reINVITE: ConnectionStateChanged to ' + event.newState);
              });
              call_options.pipeline.pe.connect(rtpe);
              rtpe.generateOffer(function(error, kurento_offer) {
                call.pipeline.kurento_offer = replace_ip(kurento_offer, kurento_addr);
                call.renegotiate();
              });
            });
          });
          return;
        }
        // console.log('first remote sdp: ' + data.sdp);
        call.pipeline.sip_offer = data.sdp;
        send_answer_to_kurento(call.pipeline).then(
          result => {
            console.log('Answer to Kurento sent');
          },
          reject => {
            console.log('Error sending answer to Kurento');
            call.terminate();
            return;
          }
        );
      }
      if (data.originator == 'local') {
        data.sdp = call.pipeline.kurento_offer;
        // console.log('local sdp: ' + data.sdp);
      }
    });
});

ua.start();
