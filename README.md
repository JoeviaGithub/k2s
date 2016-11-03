# k2s

This is dirty example of the Kurento to SIP (Asterisk) gateway. The
brain dead JsSIP lib is used for now. It do not work under nodejs so additional
patches (located at diffs dir) are needed. The already patched node_modules
dir is present too.
 As both Kurento and JsSIP lacks as good docs as examples the test
directory is provided which contains 2 simple tests:

* Console based call example that can be used to connect to Asterisk (call.js)
* Kurento RTPEndpoint example that plays and record to files (kurento.js)

And the example (outgoing.js) can be used to connect Kurento play/rec files to
any external phone using Asterisk trunk. This simple gateway has limited
support of the reINVITE's - the main problem is that Kurento do not support
the RTP negotiation, so the only way is to destroy all the RTPEndpoint and
reconnect it again.

To call 		: nodejs gw.js --call=number

To wait for calls	: nodejs gw.js --wait
