
// process.env.DEBUG = 'rtcninja*';

var JsSIP = require('jssip');
const NodeWebSocket = require('jssip-node-websocket');
var socket = new NodeWebSocket('ws://10.1.1.208:8123/ws');

var configuration = {
  'uri'		: 'sip:100@10.1.1.208',
  'password' 	: '100_pass',
  display_name 	: 'Alice',
  sockets      	: [ socket ]
};

var ua;

try {
 var ua_ = new JsSIP.UA(configuration);
 ua = ua_;
} catch (e) {
  console.log(e);
  return;
}

var to_kurento_sdp = "v=0\
o=- 0 0 IN IP4 127.0.0.1\n\
s=No Name\n\
c=IN IP4 10.1.1.208\n\
t=0 0\n\
a=tool:libavformat 56.15.102\n\
m=audio 5004 RTP/AVP 96 0 97\n\
a=rtpmap:97 opus/48000/2\n\
a=rtpmap:96 AMR/8000\n\
b=AS:64";

var call_eventHandlers = {
  'progress':   function(data){ console.log('progress'); },
  'failed':     function(data){ console.log('failed'); console.dir(data); },
  'confirmed':  function(data){ console.log('confirmed'); },
  'ended':      function(data){ console.log('ended'); },
  'sdp':	function(data){
    console.log('TX *** ' + data.originator + ' sdp:');
      console.dir(data.sdp);
      if (data.originator == 'local')
        data.sdp = to_kurento_sdp;
  }
};

var call_options = {
  'eventHandlers': call_eventHandlers,
  'extraHeaders': [ 'X-Foo: foo', 'X-Bar: bar' ],
  'mediaConstraints': {'audio': true, 'video': false },
};

ua.on('registered', function(e) {
    console.log('registered');
    // console.dir(e);
    ua.call('sip:110@10.1.1.208', call_options);
});
ua.on('registrationFailed', function(err) {
    console.log('registrationFailed: ' + err.cause);
});
ua.on('connecting', function() {
    console.log('connecting');
});
ua.on('connected', function() {
    console.log('connected');
});
ua.on('disconnected', function() {
    console.log('disconnected');
});
ua.on('newMessage', function() {
    console.log('newMessage');
});
ua.on('newRTCSession', function(data) {
    console.log('newRTCSession from ' + data.originator);
    if (data.originator == 'remote') { // incoming call
      // console.dir(data);
      var call = data.session;
      call.on('ended', function(data) {
        console.log('RX: ended');
      });
      call.on('failed', function(data) {
        console.log('RX: failed');
      });
      call.on('sdp', function(data) {
        console.log('RX *** ' + data.originator + ' sdp:');
        console.dir(data.sdp);
        if (data.originator == 'local')
          data.sdp = to_kurento_sdp;
      });
      console.log('answering to incoming call');
      call.answer();
    }
});

ua.start();
