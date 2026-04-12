const { ipcRenderer } = require("electron")

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const roomIdLabel = document.getElementById("roomIdLabel");
const videoEle = document.getElementById("videoPlayer");

let config = {
    iceServers: [
         { urls: "stun:stun.l.google.com:19302" },
    ]
}

async function generateCreds() {

    const response = await fetch("https://pctopc.sigmasigmaonthewallwhoisthe2.workers.dev/turn-creds") // this could break in the future if it becomes deprecated.
    const creds = await response.json()

    config = {
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            {
                urls: creds.urls,
                username: creds.username,
                credential: creds.credential
            }
        ]
    }

}

generateCreds();

let pConn = new RTCPeerConnection(config);

let started = false;
let currentCapture;
let fps = 60;

async function startCapture() {

    try {

        const roomId = crypto.randomUUID();
        const serverSocket = new WebSocket(`wss://pctopc.sigmasigmaonthewallwhoisthe2.workers.dev?room=${roomId}`); // change this to your own if you are forking or it wont work

        await new Promise(resolve => serverSocket.onopen = resolve);

        roomIdLabel.textContent = "Room Id: " + roomId;

        const sources = await ipcRenderer.invoke("source");
        const source = sources[0];

        const capture = await navigator.mediaDevices.getUserMedia({ 
        video: {
            mandatory: {
                chromeMediaSource: "desktop",
                chromeMediaSourceId: source.id,
                minFrameRate: 60,
                maxFrameRate: 60
            }
        }})

        currentCapture = capture;

        videoEle.srcObject = capture;

        //toggleCapture(capture, false);

        capture.getVideoTracks()[0].onended = () => {
           
            stopCapture();
            
        };

        capture.getTracks().forEach(track => pConn.addTrack(track, capture))
        
        const inputChannel = pConn.createDataChannel("input")
        
        inputChannel.onmessage = msg => {
            
            const data = JSON.parse(msg.data);

            if (data) {

                console.log("sent data")

                ipcRenderer.send("input", data)

            }

        }

        const offer = await pConn.createOffer();
        await pConn.setLocalDescription(offer);
    
        serverSocket.send(JSON.stringify({type: "offer", actualData: offer}));

        serverSocket.onmessage = msg => {

            const data = JSON.parse(msg.data);
            if (data.type && data.actualData) {

                if ( data.type == "answer") {

                    pConn.setRemoteDescription(data.actualData);

                } else if (data.type == "ICE") {
                    
                    pConn.addIceCandidate(data.actualData)

                }

            }

        };

        pConn.onicecandidate = iceCandidate => {

            if (iceCandidate.candidate) {
            
                serverSocket.send(JSON.stringify({type: "ICE", actualData: iceCandidate.candidate}));

            }

        };


    } catch (err) {

        console.log(err);
    
    }

}

function toggleCapture(capture, toggle) {

    if (toggle == false) {

        capture.getTracks().forEach(function(track){

            track.enabled = false;
                    
        });

    } else {

        capture.getTracks().forEach(function(track){

            track.enabled = true;
                    
        });

    }

}

function stopCapture() {
    
    if (currentCapture) {

        if (pConn) {

            pConn.close();
            pConn = new RTCPeerConnection(config)

        }

        currentCapture.getTracks().forEach(function(track){
                
            track.stop();
                    
        });

        videoEle.srcObject = null;

    }

}

startBtn.addEventListener("click", function(){
    
    if (started == false) {

        startCapture();
        started = true;
    
    }

});

stopBtn.addEventListener("click", function(){
    
    if (started == true) {

        stopCapture();
        started = false;
    
    }

});