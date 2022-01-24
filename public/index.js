const socket = io.connect(window.location.origin);
const localvideo = document.querySelector("video#localVideo");
const remotevideo = document.querySelector("video#remoteVideo");
let videoSourcesSelect = document.getElementById("vedioSelect");
let audioSourcesSelect = document.getElementById("audioSelect");
let localStream;
var is_broadcasting = false;

const constraints = { //相機限制
    audio: true,
    video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        facingMode: "environment"
    }
};

navigator.mediaDevices
    .getUserMedia(constraints)
    .then(stream => {
        localvideo.srcObject = stream;
        localStream = stream;
        navigator.mediaDevices.enumerateDevices().then((devices) => {
            // Iterate over all the list of devices (InputDeviceInfo and MediaDeviceInfo)
            devices.forEach((device) => {
                let option = new Option();
                option.value = device.deviceId;

                // According to the type of media device
                switch (device.kind) {
                    // Append device to list of Cameras
                    case "videoinput":
                        option.text = device.label;
                        videoSourcesSelect.appendChild(option);
                        break;
                    // Append device to list of Microphone
                    case "audioinput":
                        option.text = device.label;
                        audioSourcesSelect.appendChild(option);
                        break;
                }

                // console.log(device);
            });
        }).catch(function (e) {
            // console.log(e.name + ": " + e.message);
        });
    })
    .catch(error => console.error(error));

// Create Helper to ask for permission and list devices
let MediaStreamHelper = {
    // Property of the object to store the current stream
    _stream: null,
    // This method will return the promise to list the real devices
    getDevices: function () {
        return navigator.mediaDevices.enumerateDevices();
    },
    // Request user permissions to access the camera and video
    requestStream: function () {
        if (this._stream) {
            this._stream.getTracks().forEach(track => {
                track.stop();
            });
        }

        const audioSource = audioSourcesSelect.value;
        const videoSource = videoSourcesSelect.value;
        const constraints = {
            audio: {
                deviceId: audioSource ? { exact: audioSource } : undefined
            },
            video: {
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                deviceId: videoSource ? { exact: videoSource } : undefined
            }
        };

        return navigator.mediaDevices.getUserMedia(constraints);
    }
};

videoSourcesSelect.onchange = function () {
    MediaStreamHelper.requestStream().then(function (stream) {
        MediaStreamHelper._stream = stream;
        localvideo.srcObject = stream;
        localStream = stream;
    });
};

audioSourcesSelect.onchange = function () {
    MediaStreamHelper.requestStream().then(function (stream) {
        MediaStreamHelper._stream = stream;
        localvideo.srcObject = stream;
        localStream = stream;
    });
};

socket.on('test', (user_text) => {
    console.log(user_text);
})

// video fit screen
var browser_width = $(document.body).width();
$("video").css("width", browser_width);
$(window).resize(function () {
    browser_width = $(document.body).width();
    $("video").css("width", browser_width);
});

window.onunload = window.onbeforeunload = () => {
    close_all_peer_connection();
    socket.close();
}

// RTC peer connection
// var signalingChannel = new SignalingChannel();

const configuration = { 'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }] }
let localPeer;
let remotePeer;
const broadcastConns = {};  // broadcaster to watchers
const watchConns = {};  // watcher to broadcasters

function buildPeerConnection(label, configuration) {
    const peer = new RTCPeerConnection(configuration);
    console.log(`Created peer connection object: ${label}`);
    /**
     *  when an RTCIceCandidate has been identified 
     *  and added to the local peer by a call to `RTCPeerConnection.setLocalDescription()`.
     *  言下之意： 當local peer有新的candidate建立時，要交付給remote peers
     */
    peer.onicecandidate = (e) => onIceCandidate(label, e);
    peer.oniceconnectionstatechange = (e) => onIceStateChange(label, e);

    return peer;
}
// broadcaster receive from watcher
socket.on("watcher", id => {
    const peer = new RTCPeerConnection(configuration)
    broadcastConns[id] = peer;
    let stream = localvideo.srcObject;
    stream.getTracks().forEach(track => peer.addTrack(track, stream));
    peer.onicecandidate = event => {
        if (event.candidate) {
            socket.emit("candidate", id, event.candidate, 'watcher');
        }
    }
    peer.createOffer().then(sdp => peer.setLocalDescription(sdp)).then(() => {
        socket.emit("offer", id, peer.localDescription);
    })
})

// watcher receive from broadcaster
socket.on("offer", (id, description) => {
    watchConns[id] = new RTCPeerConnection(configuration);
    watchConns[id]
        .setRemoteDescription(description)
        .then(() => watchConns[id].createAnswer())
        .then(sdp => watchConns[id].setLocalDescription(sdp))
        .then(() => {
            socket.emit("answer", id, watchConns[id].localDescription);
            console.log("Answer from watcher");
        })

    watchConns[id].ontrack = event => {
        console.log(event.streams)
        if (remotevideo.srcObject !== event.streams[0]) {
            remotevideo.srcObject = event.streams[0];
        }

    }
    watchConns[id].onicecandidate = event => {
        if (event.candidate) {
            socket.emit("candidate", id, event.candidate, 'broadcaster');
        }
    };
})

// answer from watcher to broadcaster
socket.on("answer", (id, description) => {
    broadcastConns[id].setRemoteDescription(description);
});
socket.on("candidate", (id, candidate, target) => {
    if (target == 'broadcaster')
        broadcastConns[id].addIceCandidate(new RTCIceCandidate(candidate));
    else if (target == 'watcher')
        watchConns[id].addIceCandidate(new RTCIceCandidate(candidate));
});
socket.on("broadcaster", () => {
    socket.emit("watcher");
});

function close_all_peer_connection() {
    if (is_broadcasting) {
        for (const id in broadcastConns) {
            broadcastConns[id].close();
            delete broadcastConns[id];
        }
        socket.emit("terminate")
    }
    is_broadcasting = false;
    for (const id in watchConns) {
        watchConns[id].close();
        delete watchConns[id];
    }
}
socket.on("disconnected", (id, target) => {
    if (target == "watcher") {
        watchConns[id].close();
        delete watchConns[id];
    }
    else if (target == "broadcaster") {
        broadcastConns[id].close();
        delete broadcastConns[id];
    }
})

$(document).ready(() => {
    /*if (!pc)
        start();*/
    /*$("#btn_broadcaster").click(() => {
        $("#sec_broadcaster").css("visibility", "visible")
        $("#sec_watcher").css("visibility", "visible")
        // socket.emit("watcher");
        // socket.emit("broadcaster");
    })
    $("#btn_watcher").click(() => {
        $("#sec_broadcaster").css("visibility", "visible")
        $("#sec_watcher").css("visibility", "visible")
        // socket.emit("watcher");
    })*/
    $("#btn_start").click(() => {
        socket.emit("broadcaster");
        is_broadcasting = true;
    })
    $("#btn_stop").click(() => {
        if (is_broadcasting) {
            for (const id in broadcastConns) {
                broadcastConns[id].close();
                delete broadcastConns[id];
            }
            socket.emit("terminate")
        }
        is_broadcasting = false;
    })
    $("#btn_mute").click(() => {
        console.log("muted");
        $('#remoteVideo').prop("muted", !$('#remoteVideo').prop("muted"));
    })
})