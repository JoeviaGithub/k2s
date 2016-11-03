module.exports = (function(){

  var RTCSessionDescription = function (o) {
    this.type = (typeof o.type === 'undefined') ? null : o.type;
    this.sdp = (typeof o.sdp === 'undefined') ? null : o.sdp;
  };

  return RTCSessionDescription;
}());
